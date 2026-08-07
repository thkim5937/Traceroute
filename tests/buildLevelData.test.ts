import { describe, it, expect } from 'vitest';
import { buildLevelData } from '../src/data/buildLevelData';
import type { BoardResult } from '../src/generator/BoardGenerator';
import type { SolverResult } from '../src/solver/Solver';
import type { Coord } from '../src/data/LevelSchema';

function coord(row: number, col: number): Coord {
  return { row, col };
}

describe('buildLevelData', () => {
  const validBoardResult: BoardResult = {
    success: true,
    endpoints: [
      [coord(0, 0), coord(0, 2)],
      [coord(1, 0), coord(2, 2)],
    ],
    attemptsUsed: 1,
  };

  const validSolverResult: SolverResult = {
    status: 'solved',
    solution: [
      [coord(0, 0), coord(0, 1), coord(0, 2)], // 3 cells, 2 edges
      [coord(1, 0), coord(1, 1), coord(2, 1), coord(2, 2)], // 4 cells, 3 edges
    ],
    nodeCount: 5,
    searchFullyCompleted: true,
  };

  const difficultyResult = { difficultyScore: 42, difficultyTag: 'medium' as const };
  const gridSize = { rows: 3, cols: 3 };

  const colorIds = ['orange', 'blue'];

  it('assembles a correct, schema-matching LevelData with colors/solution zipped by colorId', () => {
    const level = buildLevelData(
      validBoardResult,
      validSolverResult,
      difficultyResult,
      gridSize,
      colorIds,
      'generated',
      'level-001',
    );

    expect(level.id).toBe('level-001');
    expect(level.gridSize).toEqual(gridSize);
    expect(level.origin).toBe('generated');
    expect(level.difficultyScore).toBe(42);
    expect(level.difficultyTag).toBe('medium');
    expect(level.handDraftOrder).toBeUndefined();
    expect(level.obstacles).toBeUndefined();

    expect(level.colors).toEqual([
      { colorId: 'orange', endpoints: validBoardResult.endpoints![0] },
      { colorId: 'blue', endpoints: validBoardResult.endpoints![1] },
    ]);
    expect(level.solution).toEqual([
      { colorId: 'orange', path: validSolverResult.solution![0] },
      { colorId: 'blue', path: validSolverResult.solution![1] },
    ]);
  });

  it('uses the given colorIds order verbatim instead of reassigning from the palette', () => {
    const level = buildLevelData(
      validBoardResult,
      validSolverResult,
      difficultyResult,
      gridSize,
      ['pink', 'teal'],
      'hand',
      'level-hand-order',
    );
    expect(level.colors.map((c) => c.colorId)).toEqual(['pink', 'teal']);
    expect(level.solution.map((s) => s.colorId)).toEqual(['pink', 'teal']);
  });

  it('passes through handDraftOrder when provided', () => {
    const level = buildLevelData(
      validBoardResult,
      validSolverResult,
      difficultyResult,
      gridSize,
      colorIds,
      'hand',
      'level-hand-001',
      7,
    );
    expect(level.handDraftOrder).toBe(7);
    expect(level.origin).toBe('hand');
  });

  it('throws when boardResult.success is false', () => {
    const failedBoard: BoardResult = { success: false, attemptsUsed: 200 };
    expect(() =>
      buildLevelData(
        failedBoard,
        validSolverResult,
        difficultyResult,
        gridSize,
        colorIds,
        'generated',
        'x',
      ),
    ).toThrow();
  });

  it("throws when solverResult.status is not 'solved'", () => {
    const unsolved: SolverResult = {
      status: 'unsolved',
      nodeCount: 10,
      searchFullyCompleted: true,
    };
    expect(() =>
      buildLevelData(
        validBoardResult,
        unsolved,
        difficultyResult,
        gridSize,
        colorIds,
        'generated',
        'x',
      ),
    ).toThrow();

    const unresolved: SolverResult = {
      status: 'unresolved',
      solution: validSolverResult.solution,
      nodeCount: 200_000,
      searchFullyCompleted: false,
    };
    expect(() =>
      buildLevelData(
        validBoardResult,
        unresolved,
        difficultyResult,
        gridSize,
        colorIds,
        'generated',
        'x',
      ),
    ).toThrow();
  });

  it('throws when endpoints.length and solution.length mismatch (colorCount mismatch)', () => {
    const mismatchedSolver: SolverResult = {
      status: 'solved',
      solution: [validSolverResult.solution![0]!],
      nodeCount: 1,
      searchFullyCompleted: true,
    };
    expect(() =>
      buildLevelData(
        validBoardResult,
        mismatchedSolver,
        difficultyResult,
        gridSize,
        ['orange'],
        'generated',
        'x',
      ),
    ).toThrow();
  });

  it('sets obstacles.blockedCells (with empty blockedEdges) when blockedCells is provided', () => {
    const blockedCells = [coord(1, 1), coord(2, 0)];
    const level = buildLevelData(
      validBoardResult,
      validSolverResult,
      difficultyResult,
      gridSize,
      colorIds,
      'generated',
      'level-obstacles',
      undefined,
      blockedCells,
    );
    expect(level.obstacles).toEqual({ blockedCells, blockedEdges: [] });
  });

  it('computes minTotalEdgeLength as sum of (path.length - 1) across colors, not cell count', () => {
    // color A: 3 cells -> 2 edges; color B: 4 cells -> 3 edges. Total edges = 5.
    // If cell-count were used instead, the (wrong) total would be 3 + 4 = 7.
    const level = buildLevelData(
      validBoardResult,
      validSolverResult,
      difficultyResult,
      gridSize,
      colorIds,
      'generated',
      'level-edges',
    );
    expect(level.minTotalEdgeLength).toBe(5);
    expect(level.minTotalEdgeLength).not.toBe(7);
  });
});
