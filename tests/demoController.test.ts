import { describe, it, expect } from 'vitest';
import { buildDemoLevelData, planPlayback } from '../src/ui/DemoController';
import type { BoardResult } from '../src/generator/BoardGenerator';
import type { SolverResult } from '../src/solver/Solver';

describe('planPlayback (TRD §5.10: cap solve-visualization playback to a target duration)', () => {
  it('returns no steps for zero events', () => {
    const plan = planPlayback(0, 3000, 150);
    expect(plan.indices).toEqual([]);
    expect(plan.stepDelayMs).toBe(0);
  });

  it('draws every event and spreads them across the full target duration when under the cap', () => {
    const plan = planPlayback(5, 3000, 150);
    expect(plan.indices).toEqual([0, 1, 2, 3, 4]);
    expect(plan.stepDelayMs).toBe(600);
  });

  it('samples down to maxSteps and keeps total playback time at the target duration when over the cap', () => {
    const plan = planPlayback(10_000, 3000, 150);
    expect(plan.indices).toHaveLength(150);
    expect(plan.indices[0]).toBe(0);
    expect(plan.indices.at(-1)).toBeLessThan(10_000);
    expect(plan.stepDelayMs).toBe(20);
    for (let i = 1; i < plan.indices.length; i++) {
      expect(plan.indices[i]!).toBeGreaterThan(plan.indices[i - 1]!);
    }
  });
});

describe('buildDemoLevelData (TRD §5.10/§5.11: dev demo level assembly)', () => {
  it('assembles a playable LevelData from a successful board + solve result', () => {
    const boardResult: BoardResult = {
      success: true,
      endpoints: [
        [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
        [
          { row: 0, col: 1 },
          { row: 1, col: 0 },
        ],
      ],
      attemptsUsed: 1,
    };
    const solverResult: SolverResult = {
      status: 'solved',
      hasSolution: true,
      nodeCount: 1,
      searchFullyCompleted: true,
      solution: [
        [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 1, col: 1 },
        ],
        [{ row: 0, col: 1 }],
      ],
    };

    const level = buildDemoLevelData({ rows: 2, cols: 2 }, boardResult, solverResult);

    expect(level.gridSize).toEqual({ rows: 2, cols: 2 });
    expect(level.colors).toHaveLength(2);
    // Reuses the same color-index-to-colorId assignment as the offline pipeline
    // (assignColorIds), not ad hoc demo-only ids.
    expect(level.colors[0]!.colorId).not.toBe('');
    expect(level.colors[0]!.endpoints).toEqual(boardResult.endpoints![0]);
    expect(level.solution).toHaveLength(2);
    expect(typeof level.difficultyScore).toBe('number');
    expect(['easy', 'medium', 'hard']).toContain(level.difficultyTag);
  });

  it('throws when boardResult failed', () => {
    const boardResult: BoardResult = { success: false, attemptsUsed: 5000 };
    const solverResult: SolverResult = {
      status: 'unsolved',
      hasSolution: false,
      nodeCount: 0,
      searchFullyCompleted: true,
    };

    expect(() => buildDemoLevelData({ rows: 6, cols: 6 }, boardResult, solverResult)).toThrow();
  });

  it('throws when solverResult has no solution', () => {
    const boardResult: BoardResult = {
      success: true,
      endpoints: [
        [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
      ],
      attemptsUsed: 1,
    };
    const solverResult: SolverResult = {
      status: 'unresolved',
      hasSolution: false,
      nodeCount: 0,
      searchFullyCompleted: false,
    };

    expect(() => buildDemoLevelData({ rows: 6, cols: 6 }, boardResult, solverResult)).toThrow();
  });
});
