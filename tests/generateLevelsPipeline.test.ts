import { describe, it, expect, vi } from 'vitest';
import {
  collectLevelResults,
  collectGeneratedRecord,
  GENERATED_LEVEL_SPECS,
  OBSTACLE_BLOCKED_CELLS_REROLL_LIMIT,
  PIPELINE_SOLVER_NODE_LIMIT,
  PIPELINE_SOLVER_TIME_LIMIT_MS,
  assembleLevelBatch,
  buildLevelIndex,
  randomObstacleRectangle,
  randomObstacleBlockedCells,
  randomMultiEndpointRequests,
  classifySolverResult,
  type LevelSpecRecord,
} from '../scripts/generate-levels';
import { scoreDifficulty } from '../src/solver/DifficultyScorer';
import type { BoardResult } from '../src/generator/BoardGenerator';
import type { SolverResult } from '../src/solver/Solver';

function obstacleRange(start: number, end: number, count: number): [string, number][] {
  const entries: [string, number][] = [];
  for (let n = start; n <= end; n++) entries.push([`gen-${String(n).padStart(4, '0')}`, count]);
  return entries;
}

const OBSTACLE_SPEC_COUNTS: Record<string, number> = Object.fromEntries([
  ...obstacleRange(12, 14, 3),
  ...obstacleRange(15, 22, 5),
  ...obstacleRange(23, 33, 6),
  ...obstacleRange(34, 37, 7),
  ...obstacleRange(38, 41, 8),
  ...obstacleRange(42, 44, 9),
]);

const HAND_IDS = ['hand-01', 'hand-02', 'hand-03', 'hand-04', 'hand-05', 'hand-06'];

function fakeSolve(
  _gridSize: { rows: number; cols: number },
  endpoints: [unknown, unknown][],
): SolverResult {
  return {
    status: 'solved',
    solution: endpoints.map(([start, end]) => [start, end]) as SolverResult['solution'],
    nodeCount: 5,
    searchFullyCompleted: true,
  };
}

function fakeGenerateSolvableBoard(_gridSize: { rows: number; cols: number }, colorCount: number) {
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

function expectedGeneratedTier(id: string): {
  gridSize: { rows: number; cols: number };
  colorCount: number;
} {
  const num = Number(id.slice('gen-'.length));
  if (num <= 11) return { gridSize: { rows: 5, cols: 5 }, colorCount: 5 };
  if (num <= 22) return { gridSize: { rows: 6, cols: 6 }, colorCount: 6 };
  if (num <= 33) return { gridSize: { rows: 7, cols: 7 }, colorCount: 7 };
  return { gridSize: { rows: 8, cols: 8 }, colorCount: 8 };
}

describe('collectLevelResults (Phase 1: Collect)', () => {
  it('returns exactly 50 records', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: vi.fn(fakeSolve),
    });
    expect(records).toHaveLength(50);
  });

  it('includes all 6 hand ids with status "ok"', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: vi.fn(fakeSolve),
    });
    for (const id of HAND_IDS) {
      const record = records.find((r) => r.id === id);
      expect(record).toBeDefined();
      expect(record?.origin).toBe('hand');
      expect(record?.status).toBe('ok');
    }
  });

  it('maps every generated-tier id to its §5.13 gridSize/colorCount', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: vi.fn(fakeSolve),
    });
    const generatedRecords = records.filter((r) => r.origin === 'generated');
    expect(generatedRecords).toHaveLength(44);
    for (const record of generatedRecords) {
      const expected = expectedGeneratedTier(record.id);
      expect(record.gridSize).toEqual(expected.gridSize);
    }
  });

  it('marks a generated spec as "generation-failed" when the shared retry budget is exhausted', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(() => ({ status: 'failed' as const, totalAttemptsUsed: 200 })),
      solve: vi.fn(fakeSolve),
    });
    const generatedRecords = records.filter((r) => r.origin === 'generated');
    expect(generatedRecords.every((r) => r.status === 'generation-failed')).toBe(true);
    expect(generatedRecords.every((r) => r.rawScore === undefined)).toBe(true);
  });

  it('computes rawScore = computeRawScore(solution) for every solved record', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: vi.fn(fakeSolve),
    });
    const generatedRecords = records.filter((r) => r.origin === 'generated');
    for (const record of generatedRecords) {
      // fakeGenerateSolvableBoard's paths are each [start, end]: edgeCount=1, turns=0 per color.
      const expected = expectedGeneratedTier(record.id).colorCount;
      expect(record.rawScore).toBe(expected);
    }
  });
});

describe('GENERATED_LEVEL_SPECS obstacle wiring (TRD §5.14 addendum)', () => {
  // Section 6 v2: one slot per spec is upgraded to a multi-cell rectangle (4 or 6
  // cells), so the total blockedCells length is (count - 1) singles + rectangle
  // size, not the flat `count` from the spec table.
  it('assigns blockedCells totalling (count - 1) singles plus one multi-cell rectangle', () => {
    for (const [id, count] of Object.entries(OBSTACLE_SPEC_COUNTS)) {
      const spec = GENERATED_LEVEL_SPECS.find((s) => s.id === id);
      expect(spec).toBeDefined();
      expect([count - 1 + 4, count - 1 + 6]).toContain(spec?.blockedCells?.length);
    }
  });

  it('keeps obstacle-spec blockedCells in-bounds and mutually distinct', () => {
    for (const id of Object.keys(OBSTACLE_SPEC_COUNTS)) {
      const spec = GENERATED_LEVEL_SPECS.find((s) => s.id === id);
      const blockedCells = spec?.blockedCells ?? [];
      for (const cell of blockedCells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(spec!.gridSize.rows);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(spec!.gridSize.cols);
      }
      const seen = new Set(blockedCells.map((c) => `${c.row},${c.col}`));
      expect(seen.size).toBe(blockedCells.length);
    }
  });

  it('leaves blockedCells unset for the other 11 generated specs', () => {
    const otherSpecs = GENERATED_LEVEL_SPECS.filter((s) => !(s.id in OBSTACLE_SPEC_COUNTS));
    expect(otherSpecs).toHaveLength(11);
    for (const spec of otherSpecs) {
      expect(spec.blockedCells).toBeUndefined();
    }
  });

  it('leaves blockedCells unset for all 6 hand specs', () => {
    const records = collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: vi.fn(fakeSolve),
    });
    for (const id of HAND_IDS) {
      const record = records.find((r) => r.id === id);
      expect(record).toBeDefined();
      expect((record as { blockedCells?: unknown })?.blockedCells).toBeUndefined();
    }
  });

  it('forwards blockedCells through to generateSolvableBoard for all obstacle specs', () => {
    const generateSolvableBoardMock = vi.fn(fakeGenerateSolvableBoard);
    collectLevelResults({
      generateSolvableBoard: generateSolvableBoardMock,
      solve: vi.fn(fakeSolve),
    });

    for (const id of Object.keys(OBSTACLE_SPEC_COUNTS)) {
      const specIndex = GENERATED_LEVEL_SPECS.findIndex((s) => s.id === id);
      const spec = GENERATED_LEVEL_SPECS[specIndex];
      const call = generateSolvableBoardMock.mock.calls[specIndex];
      expect(call[4]).toEqual(spec.blockedCells);
    }
  });
});

describe('randomObstacleRectangle (Section 6 multi-cell obstacles v2)', () => {
  const gridSize = { rows: 8, cols: 8 };

  it('produces cells fully within grid bounds', () => {
    for (let i = 0; i < 50; i++) {
      const cells = randomObstacleRectangle(gridSize);
      for (const cell of cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(gridSize.rows);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(gridSize.cols);
      }
    }
  });

  it('always produces a contiguous rectangle of one of the three valid shapes (2x2, 2x3, 3x2)', () => {
    const seenShapes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const cells = randomObstacleRectangle(gridSize);
      const rowSpan = new Set(cells.map((c) => c.row)).size;
      const colSpan = new Set(cells.map((c) => c.col)).size;
      // Full rectangle: cell count equals rowSpan * colSpan (no gaps).
      expect(cells.length).toBe(rowSpan * colSpan);
      expect([
        [2, 2],
        [2, 3],
        [3, 2],
      ]).toContainEqual([rowSpan, colSpan]);
      seenShapes.add(`${rowSpan}x${colSpan}`);
    }
    // Across enough draws, more than one of the three shapes should appear.
    expect(seenShapes.size).toBeGreaterThan(1);
  });
});

describe('randomObstacleBlockedCells (Section 6 multi-cell obstacles v2)', () => {
  const gridSize = { rows: 8, cols: 8 };

  it('total length equals (count - 1) singles plus the rectangle cell count', () => {
    for (let i = 0; i < 50; i++) {
      const count = 9;
      const cells = randomObstacleBlockedCells(gridSize, count);
      expect([count - 1 + 4, count - 1 + 6]).toContain(cells.length);
    }
  });

  it('keeps every cell in-bounds with no overlap between the rectangle and the single cells', () => {
    for (let i = 0; i < 50; i++) {
      const cells = randomObstacleBlockedCells(gridSize, 9);
      for (const cell of cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(gridSize.rows);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(gridSize.cols);
      }
      const seen = new Set(cells.map((c) => `${c.row},${c.col}`));
      expect(seen.size).toBe(cells.length);
    }
  });
});

describe('pipeline solver limit override (TRD §5.5 2026-08-05 update)', () => {
  const pipelineLimits = {
    nodeLimit: PIPELINE_SOLVER_NODE_LIMIT,
    timeLimitMs: PIPELINE_SOLVER_TIME_LIMIT_MS,
  };

  it('calls solve() with the pipeline override for every hand record, not library defaults', () => {
    const solveMock = vi.fn(fakeSolve);
    collectLevelResults({
      generateSolvableBoard: vi.fn(fakeGenerateSolvableBoard),
      solve: solveMock,
    });

    for (const call of solveMock.mock.calls) {
      expect(call[2]).toEqual(pipelineLimits);
    }
    expect(solveMock).toHaveBeenCalledTimes(HAND_IDS.length);
  });

  it('calls generateSolvableBoard() with the pipeline override for every generated spec', () => {
    const generateSolvableBoardMock = vi.fn(fakeGenerateSolvableBoard);
    collectLevelResults({
      generateSolvableBoard: generateSolvableBoardMock,
      solve: vi.fn(fakeSolve),
    });

    for (const call of generateSolvableBoardMock.mock.calls) {
      expect(call[5]).toEqual(pipelineLimits);
    }
  });

  it('threads the pipeline override through every reroll draw in the obstacle-tier loop', () => {
    const gen0040 = GENERATED_LEVEL_SPECS.find((s) => s.id === 'gen-0040')!;
    const generateSolvableBoard = vi
      .fn()
      .mockReturnValueOnce({ status: 'failed' as const, totalAttemptsUsed: 200 })
      .mockReturnValueOnce(fakeGenerateSolvableBoard(gen0040.gridSize, gen0040.colorCount));

    collectGeneratedRecord(gen0040, { generateSolvableBoard, solve: vi.fn(fakeSolve) });

    expect(generateSolvableBoard).toHaveBeenCalledTimes(2);
    for (const call of generateSolvableBoard.mock.calls) {
      expect(call[5]).toEqual(pipelineLimits);
    }
  });
});

describe('collectGeneratedRecord blockedCells reroll (TRD §5.14 2026-08-05 update)', () => {
  const gen0040 = GENERATED_LEVEL_SPECS.find((s) => s.id === 'gen-0040')!;
  const gen0001 = GENERATED_LEVEL_SPECS.find((s) => s.id === 'gen-0001')!; // non-obstacle spec

  it('rerolls blockedCells and accepts the level as "ok" once a later draw succeeds', () => {
    const generateSolvableBoard = vi
      .fn()
      .mockReturnValueOnce({ status: 'failed' as const, totalAttemptsUsed: 200 })
      .mockReturnValueOnce({ status: 'failed' as const, totalAttemptsUsed: 200 })
      .mockReturnValueOnce(fakeGenerateSolvableBoard(gen0040.gridSize, gen0040.colorCount));

    const record = collectGeneratedRecord(gen0040, {
      generateSolvableBoard,
      solve: vi.fn(fakeSolve),
    });

    expect(generateSolvableBoard).toHaveBeenCalledTimes(3);
    expect(record.status).toBe('ok');
    // Each retry draws a fresh blockedCells set: (8 - 1) singles + a 4- or 6-cell rectangle.
    const blockedCellsArgs = generateSolvableBoard.mock.calls.map((call) => call[4]);
    expect(
      blockedCellsArgs.every((cells: unknown[]) => [8 - 1 + 4, 8 - 1 + 6].includes(cells.length)),
    ).toBe(true);
  });

  it('classifies as "generation-failed" after exhausting all reroll draws, without looping forever', () => {
    const generateSolvableBoard = vi.fn(() => ({
      status: 'failed' as const,
      totalAttemptsUsed: 200,
    }));

    const record = collectGeneratedRecord(gen0040, {
      generateSolvableBoard,
      solve: vi.fn(fakeSolve),
    });

    expect(generateSolvableBoard).toHaveBeenCalledTimes(OBSTACLE_BLOCKED_CELLS_REROLL_LIMIT);
    expect(record.status).toBe('generation-failed');
  });

  it('does not reroll for non-obstacle specs (single draw, no blockedCells)', () => {
    const generateSolvableBoard = vi.fn(() => ({
      status: 'failed' as const,
      totalAttemptsUsed: 200,
    }));

    const record = collectGeneratedRecord(gen0001, {
      generateSolvableBoard,
      solve: vi.fn(fakeSolve),
    });

    expect(generateSolvableBoard).toHaveBeenCalledTimes(1);
    expect(record.status).toBe('generation-failed');
  });
});

describe('assembleLevelBatch (Phase 2: Normalize + assemble)', () => {
  function solverResultFor(nodeCount: number, solution: SolverResult['solution']): SolverResult {
    return { status: 'solved', solution, nodeCount, searchFullyCompleted: true };
  }

  // rawScore = log10(nodeCount + 1): 9 -> 1, 99 -> 2.
  const genLow: LevelSpecRecord = {
    id: 'gen-A',
    origin: 'generated',
    gridSize: { rows: 3, cols: 3 },
    endpoints: [
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ],
    ],
    solverResult: solverResultFor(9, [
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
    ]),
    rawScore: Math.log10(10),
    status: 'ok',
  };
  const genHigh: LevelSpecRecord = {
    id: 'gen-B',
    origin: 'generated',
    gridSize: { rows: 3, cols: 3 },
    endpoints: [
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ],
      [
        { row: 1, col: 0 },
        { row: 1, col: 2 },
      ],
    ],
    solverResult: solverResultFor(99, [
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
    ]),
    rawScore: Math.log10(100),
    status: 'ok',
  };
  // Hand record: authored colorIds order is ['sky'], deliberately not the first
  // palette entry ('orange'), so a fresh assignColorIds() call would be caught.
  const handOk: LevelSpecRecord = {
    id: 'hand-01',
    origin: 'hand',
    gridSize: { rows: 3, cols: 3 },
    endpoints: [
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ],
    ],
    colorIds: ['sky'],
    solverResult: solverResultFor(9, [
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
    ]),
    rawScore: Math.log10(10),
    status: 'ok',
  };
  const failed: LevelSpecRecord = {
    id: 'gen-D',
    origin: 'generated',
    gridSize: { rows: 3, cols: 3 },
    status: 'unsolvable',
  };

  const fixtureRecords = [genLow, genHigh, handOk, failed];

  it('computes observedMin/observedMax across only "ok" records', () => {
    const result = assembleLevelBatch(fixtureRecords);
    expect(result.observedMin).toBe(Math.log10(10));
    expect(result.observedMax).toBe(Math.log10(100));
  });

  it('excludes failed-status records from the output batch but returns them for logging', () => {
    const result = assembleLevelBatch(fixtureRecords);
    expect(result.levels.map((l) => l.id).sort()).toEqual(['gen-A', 'gen-B', 'hand-01']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe('gen-D');
  });

  it("computes each level's difficultyScore/difficultyTag via scoreDifficulty's own logic", () => {
    const result = assembleLevelBatch(fixtureRecords);
    for (const record of [genLow, genHigh, handOk]) {
      const level = result.levels.find((l) => l.id === record.id)!;
      const expected = scoreDifficulty(record.rawScore!, result.observedMin, result.observedMax);
      expect(level.difficultyScore).toBe(expected.difficultyScore);
      expect(level.difficultyTag).toBe(expected.difficultyTag);
    }
  });

  it("uses the hand level's original authored colorIds order, not a fresh assignColorIds assignment", () => {
    const result = assembleLevelBatch(fixtureRecords);
    const level = result.levels.find((l) => l.id === 'hand-01')!;
    expect(level.colors.map((c) => c.colorId)).toEqual(['sky']);
  });

  it('assigns fresh colorIds for generated-origin records', () => {
    const result = assembleLevelBatch(fixtureRecords);
    const level = result.levels.find((l) => l.id === 'gen-A')!;
    expect(level.colors.map((c) => c.colorId)).toEqual(['orange']);
  });

  // Section 6.19 regression: buildLevelData previously never received blockedCells
  // from assembleLevelBatch, so no shipped level ever got obstacle data.
  it('forwards blockedCells through to the built LevelData for obstacle-tier specs (gen-0040-gen-0044)', () => {
    const obstacleBlockedCells = [
      { row: 1, col: 1 },
      { row: 2, col: 0 },
      { row: 3, col: 3 },
    ];
    const genObstacle: LevelSpecRecord = {
      ...genLow,
      id: 'gen-0040',
      blockedCells: obstacleBlockedCells,
    };
    const result = assembleLevelBatch([genObstacle, genLow]);

    const obstacleLevel = result.levels.find((l) => l.id === 'gen-0040')!;
    expect(obstacleLevel.obstacles).toEqual({
      blockedCells: obstacleBlockedCells,
      blockedEdges: [],
    });

    const nonObstacleLevel = result.levels.find((l) => l.id === 'gen-A')!;
    expect(nonObstacleLevel.obstacles).toBeUndefined();
  });
});

describe('multi-endpoint pipeline wiring (TRD §5.15)', () => {
  it('randomMultiEndpointRequests() always returns 1-2 entries, each 3 or 4', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomMultiEndpointRequests();
      expect([1, 2]).toContain(result.length);
      for (const entry of result) {
        expect([3, 4]).toContain(entry);
      }
    }
  });

  it('classifySolverResult returns unsolvable/0 when solution is undefined, regardless of status', () => {
    const statuses: SolverResult['status'][] = ['solved', 'unresolved', 'unsolvable'];
    for (const status of statuses) {
      const result = classifySolverResult({
        status,
        solution: undefined,
        nodeCount: 5,
        searchFullyCompleted: true,
      } as SolverResult);
      expect(result).toEqual({ status: 'unsolvable', rawScore: 0 });
    }
  });

  it('attaches multiEndpointRequests only to tier 3-4 specs (gen-0023 and above)', () => {
    for (const spec of GENERATED_LEVEL_SPECS) {
      const num = Number(spec.id.slice('gen-'.length));
      if (num < 23) {
        expect(spec.multiEndpointRequests).toBeUndefined();
      } else {
        expect(Array.isArray(spec.multiEndpointRequests)).toBe(true);
        expect(spec.multiEndpointRequests!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildLevelIndex', () => {
  it('produces { id, difficultyScore, origin } entries matching TRD §4 exactly', () => {
    const levels = [
      {
        id: 'gen-A',
        gridSize: { rows: 3, cols: 3 },
        colors: [],
        origin: 'generated' as const,
        difficultyTag: 'easy' as const,
        difficultyScore: 10,
        solution: [],
        minTotalEdgeLength: 0,
      },
      {
        id: 'hand-01',
        gridSize: { rows: 3, cols: 3 },
        colors: [],
        origin: 'hand' as const,
        difficultyTag: 'hard' as const,
        difficultyScore: 90,
        solution: [],
        minTotalEdgeLength: 0,
      },
    ];
    const index = buildLevelIndex(levels);
    expect(index).toEqual([
      { id: 'gen-A', difficultyScore: 10, origin: 'generated' },
      { id: 'hand-01', difficultyScore: 90, origin: 'hand' },
    ]);
    for (const entry of index) {
      expect(Object.keys(entry).sort()).toEqual(['difficultyScore', 'id', 'origin']);
    }
  });
});
