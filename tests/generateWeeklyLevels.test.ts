import { describe, it, expect, vi } from 'vitest';
import {
  WEEKLY_LEVELS_PER_RUN,
  AI_REVIEW_RETRY_LIMIT,
  NOTHING_TO_SUBMIT_EXIT_CODE,
  pickTierForSlot,
  summarizeSameTierLevels,
  buildReviewPrompt,
  reviewLevel,
  generateCandidateLevel,
  runSlot,
  runWeeklyGeneration,
  nextGeneratedId,
  formatSummary,
} from '../scripts/generate-weekly-levels';
import { TIER_DEFINITIONS } from '../scripts/generate-levels';
import type { LevelData, LevelIndex } from '../src/data/LevelSchema';
import type { BoardResult } from '../src/generator/BoardGenerator';
import type { SolverResult } from '../src/solver/Solver';

function fakeGenerateSolvableBoard(gridSize: { rows: number; cols: number }, colorCount: number) {
  const endpoints: BoardResult['endpoints'] = Array.from({ length: colorCount }, (_, i) => [
    { row: 0, col: i },
    { row: 1, col: i },
  ]);
  const solverResult: SolverResult = {
    status: 'solved',
    solution: endpoints.map(([start, end]) => [start, end]),
    nodeCount: 5,
    searchFullyCompleted: true,
  };
  return {
    status: 'success' as const,
    boardResult: { success: true, endpoints, attemptsUsed: 1 },
    solverResult,
    totalAttemptsUsed: 1,
  };
}

function fakeLevel(overrides: Partial<LevelData> = {}): LevelData {
  return {
    id: 'gen-0044',
    gridSize: TIER_DEFINITIONS[0]!.gridSize,
    colors: Array.from({ length: TIER_DEFINITIONS[0]!.colorCount }, (_, i) => ({
      colorId: `c${i}`,
      endpoints: [
        { row: 0, col: i },
        { row: 1, col: i },
      ],
    })),
    origin: 'generated',
    difficultyTag: 'medium',
    difficultyScore: 50,
    solution: [],
    minTotalEdgeLength: 10,
    ...overrides,
  };
}

describe('pickTierForSlot', () => {
  it('round-robins through TIER_DEFINITIONS', () => {
    for (let i = 0; i < TIER_DEFINITIONS.length; i++) {
      expect(pickTierForSlot(i)).toEqual(TIER_DEFINITIONS[i]);
    }
    expect(pickTierForSlot(TIER_DEFINITIONS.length)).toEqual(TIER_DEFINITIONS[0]);
  });
});

describe('summarizeSameTierLevels', () => {
  it('includes only levels matching the tier gridSize and colorCount', () => {
    const tier = TIER_DEFINITIONS[0]!;
    const matching = fakeLevel({ id: 'gen-A' });
    const nonMatching = fakeLevel({ id: 'gen-B', gridSize: TIER_DEFINITIONS[1]!.gridSize });
    const summary = summarizeSameTierLevels(tier, [matching, nonMatching]);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toEqual({
      gridSize: tier.gridSize,
      colorCount: tier.colorCount,
      blockedCellCount: 0,
      totalEdgeLength: 10,
      difficultyScore: 50,
    });
  });

  it('counts blockedCells when present', () => {
    const tier = TIER_DEFINITIONS[0]!;
    const withObstacles = fakeLevel({
      obstacles: {
        blockedCells: [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
        blockedEdges: [],
      },
    });
    const summary = summarizeSameTierLevels(tier, [withObstacles]);
    expect(summary[0]?.blockedCellCount).toBe(2);
  });
});

describe('buildReviewPrompt', () => {
  it('mentions all four review criteria and the candidate/summary data', () => {
    const level = fakeLevel();
    const prompt = buildReviewPrompt(level, [
      {
        gridSize: level.gridSize,
        colorCount: 5,
        blockedCellCount: 0,
        totalEdgeLength: 8,
        difficultyScore: 40,
      },
    ]);
    expect(prompt).toContain('duplicative');
    expect(prompt).toContain('fun');
    expect(prompt).toContain('difficultyTag actually match');
    expect(prompt).toContain('"medium" or "hard"');
    expect(prompt).toContain('difficultyScore');
    expect(prompt).toContain('approved');
    expect(prompt).toContain('reasoning');
  });
});

describe('reviewLevel', () => {
  it('calls callReviewApi with the built prompt and returns its result', async () => {
    const callReviewApi = vi.fn().mockResolvedValue({ approved: true, reasoning: 'looks good' });
    const level = fakeLevel();
    const result = await reviewLevel(level, [], { callReviewApi });

    expect(callReviewApi).toHaveBeenCalledTimes(1);
    expect(callReviewApi.mock.calls[0]![0]).toContain(String(level.difficultyScore));
    expect(result).toEqual({ approved: true, reasoning: 'looks good' });
  });
});

describe('generateCandidateLevel', () => {
  it('builds a LevelData with a difficultyScore when generation succeeds', () => {
    const tier = TIER_DEFINITIONS[0]!;
    const level = generateCandidateLevel(tier, 'pending', {
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
    });
    expect(level).toBeDefined();
    expect(level?.gridSize).toEqual(tier.gridSize);
    expect(level?.colors).toHaveLength(tier.colorCount);
    expect(typeof level?.difficultyScore).toBe('number');
  });

  it('returns undefined when generateSolvableBoard fails', () => {
    const tier = TIER_DEFINITIONS[0]!;
    const level = generateCandidateLevel(tier, 'pending', {
      generateSolvableBoard: vi.fn(() => ({ status: 'failed' as const, totalAttemptsUsed: 200 })),
    });
    expect(level).toBeUndefined();
  });
});

describe('runSlot', () => {
  it('returns approvedLevel on first approval without exhausting retries', async () => {
    const callReviewApi = vi.fn().mockResolvedValue({ approved: true, reasoning: 'great level' });
    const outcome = await runSlot(0, [], {
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      callReviewApi,
    });
    expect(outcome.approvedLevel).toBeDefined();
    expect(outcome.attempts).toHaveLength(1);
    expect(callReviewApi).toHaveBeenCalledTimes(1);
  });

  it('retries up to AI_REVIEW_RETRY_LIMIT and returns no approvedLevel when always rejected', async () => {
    const callReviewApi = vi.fn().mockResolvedValue({ approved: false, reasoning: 'too easy' });
    const outcome = await runSlot(0, [], {
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      callReviewApi,
    });
    expect(outcome.approvedLevel).toBeUndefined();
    expect(outcome.attempts).toHaveLength(AI_REVIEW_RETRY_LIMIT);
    expect(callReviewApi).toHaveBeenCalledTimes(AI_REVIEW_RETRY_LIMIT);
  });

  it('records a generation-failure attempt without calling callReviewApi, then keeps retrying', async () => {
    const generateSolvableBoard = vi
      .fn()
      .mockReturnValueOnce({ status: 'failed' as const, totalAttemptsUsed: 200 })
      .mockImplementation(fakeGenerateSolvableBoard);
    const callReviewApi = vi.fn().mockResolvedValue({ approved: true, reasoning: 'ok' });

    const outcome = await runSlot(0, [], { generateSolvableBoard, callReviewApi });

    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0]?.approved).toBe(false);
    expect(outcome.approvedLevel).toBeDefined();
    expect(callReviewApi).toHaveBeenCalledTimes(1);
  });
});

describe('nextGeneratedId', () => {
  it('continues sequentially from the current max gen- id in the index, offset by 1', () => {
    const index: LevelIndex = [
      { id: 'gen-0043', difficultyScore: 10, origin: 'generated' },
      { id: 'hand-06', difficultyScore: 10, origin: 'hand' },
    ];
    expect(nextGeneratedId(index, 1)).toBe('gen-0044');
    expect(nextGeneratedId(index, 2)).toBe('gen-0045');
  });

  it('starts at gen-0001 when the index has no generated levels', () => {
    expect(nextGeneratedId([], 1)).toBe('gen-0001');
  });
});

describe('runWeeklyGeneration', () => {
  it('assigns sequential ids only to approved levels, continuing after the existing max', async () => {
    const existingIndex: LevelIndex = [
      { id: 'gen-0043', difficultyScore: 10, origin: 'generated' },
    ];
    // slot 1 (index 1) always rejected, all others approved on first try.
    const callReviewApi = vi.fn((prompt: string) => {
      const rejectSlot1 = prompt.includes(
        `${TIER_DEFINITIONS[1]!.gridSize.rows}x${TIER_DEFINITIONS[1]!.gridSize.cols}`,
      );
      return Promise.resolve(
        rejectSlot1
          ? { approved: false, reasoning: 'nope' }
          : { approved: true, reasoning: 'good' },
      );
    });

    const { approvedLevels, slotResults } = await runWeeklyGeneration(existingIndex, [], {
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      callReviewApi,
    });

    expect(slotResults).toHaveLength(WEEKLY_LEVELS_PER_RUN);
    expect(approvedLevels.length).toBeLessThan(WEEKLY_LEVELS_PER_RUN);
    const ids = approvedLevels.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    for (const id of ids) {
      expect(id.startsWith('gen-')).toBe(true);
    }
  });
});

describe('formatSummary', () => {
  it('reports approved/rejected counts and per-slot reasoning', () => {
    const summary = formatSummary([
      {
        slotIndex: 0,
        tier: TIER_DEFINITIONS[0]!,
        approvedLevel: fakeLevel({ id: 'gen-0044' }),
        attempts: [{ attempt: 1, approved: true, reasoning: 'good' }],
      },
      {
        slotIndex: 1,
        tier: TIER_DEFINITIONS[1]!,
        attempts: [{ attempt: 1, approved: false, reasoning: 'too similar' }],
      },
    ]);
    expect(summary).toContain('1 approved');
    expect(summary).toContain('1 rejected');
    expect(summary).toContain('gen-0044');
    expect(summary).toContain('too similar');
  });
});

describe('NOTHING_TO_SUBMIT_EXIT_CODE', () => {
  it('is a distinct non-zero exit code', () => {
    expect(NOTHING_TO_SUBMIT_EXIT_CODE).not.toBe(0);
    expect(NOTHING_TO_SUBMIT_EXIT_CODE).not.toBe(1);
  });
});
