import { describe, it, expect } from 'vitest';
import { growSnakes, absorbLeftoverCells } from '../src/generator/BoardGenerator';
import type { SnakeGrowthResult } from '../src/generator/BoardGenerator';
import type { Coord } from '../src/data/LevelSchema';

function coordKey(cell: Coord): string {
  return `${cell.row},${cell.col}`;
}

describe('growSnakes', () => {
  it('never gives a color a path of only 1 cell (TRD §5.4: first move is never subject to p_stop)', () => {
    // Start cells are now only chosen from cells that have at least one free
    // neighbor, so the first move is always available and always taken.
    const gridsAndCounts: [{ rows: number; cols: number }, number][] = [
      [{ rows: 10, cols: 10 }, 4],
      [{ rows: 6, cols: 6 }, 6],
      [{ rows: 4, cols: 4 }, 6],
      [{ rows: 3, cols: 3 }, 6],
      [{ rows: 2, cols: 2 }, 3],
    ];
    for (const [gridSize, colorCount] of gridsAndCounts) {
      for (let i = 0; i < 200; i++) {
        const result = growSnakes(gridSize, colorCount);
        for (const path of result.colorPaths) {
          if (path.length === 0) continue; // color got no cells at all -- not a single-cell color
          const start = path[0];
          const end = path[path.length - 1];
          const sameCell = start.row === end.row && start.col === end.col;
          expect(sameCell).toBe(false);
          expect(path.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("never overlaps two colors' paths, and matches the occupied grid", () => {
    for (let i = 0; i < 20; i++) {
      const gridSize = { rows: 8, cols: 8 };
      const result = growSnakes(gridSize, 5);

      const seen = new Set<string>();
      for (const path of result.colorPaths) {
        for (const cell of path) {
          const key = coordKey(cell);
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }

      for (let row = 0; row < gridSize.rows; row++) {
        for (let col = 0; col < gridSize.cols; col++) {
          expect(result.occupied[row][col]).toBe(seen.has(coordKey({ row, col })));
        }
      }
    }
  });

  it('leftoverCells equals every grid cell not present in any colorPaths entry', () => {
    for (let i = 0; i < 20; i++) {
      const gridSize = { rows: 6, cols: 6 };
      const result = growSnakes(gridSize, 3);

      const pathCells = new Set<string>();
      for (const path of result.colorPaths) {
        for (const cell of path) {
          pathCells.add(coordKey(cell));
        }
      }

      const expectedLeftovers = new Set<string>();
      for (let row = 0; row < gridSize.rows; row++) {
        for (let col = 0; col < gridSize.cols; col++) {
          const key = coordKey({ row, col });
          if (!pathCells.has(key)) {
            expectedLeftovers.add(key);
          }
        }
      }

      const actualLeftovers = new Set(result.leftoverCells.map(coordKey));
      expect(actualLeftovers).toEqual(expectedLeftovers);
      expect(actualLeftovers.size + pathCells.size).toBe(gridSize.rows * gridSize.cols);
    }
  });

  it('keeps every path fully self-adjacent (each step differs by 1 in exactly one axis)', () => {
    for (let i = 0; i < 20; i++) {
      const result = growSnakes({ rows: 9, cols: 9 }, 4);
      for (const path of result.colorPaths) {
        for (let j = 1; j < path.length; j++) {
          const prev = path[j - 1];
          const curr = path[j];
          const rowDiff = Math.abs(curr.row - prev.row);
          const colDiff = Math.abs(curr.col - prev.col);
          const isAdjacent = (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
          expect(isAdjacent).toBe(true);
        }
      }
    }
  });

  it('does not throw on a small grid with a color count that can run out of cells', () => {
    for (let i = 0; i < 20; i++) {
      expect(() => growSnakes({ rows: 3, cols: 3 }, 6)).not.toThrow();
    }
  });

  it('leaves leftoverCells non-empty when growth cannot fill the whole grid', () => {
    const result = growSnakes({ rows: 3, cols: 3 }, 6);
    expect(result.leftoverCells.length + result.colorPaths.flat().length).toBe(9);
  });

  it('never grows a snake into a blocked cell (TRD §5.14)', () => {
    const gridSize = { rows: 4, cols: 4 };
    const blockedCells: Coord[] = [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ];

    for (let i = 0; i < 10; i++) {
      const result = growSnakes(gridSize, 3, undefined, blockedCells);
      const pathCells = new Set(result.colorPaths.flat().map(coordKey));
      for (const cell of blockedCells) {
        expect(pathCells.has(coordKey(cell))).toBe(false);
        expect(result.occupied[cell.row]?.[cell.col]).toBe(true);
      }
    }
  });

  it('never lists a blocked cell in leftoverCells, so absorption can never claim it (TRD §5.14)', () => {
    const gridSize = { rows: 4, cols: 4 };
    const blockedCells: Coord[] = [
      { row: 0, col: 0 },
      { row: 3, col: 3 },
    ];

    const result = growSnakes(gridSize, 2, undefined, blockedCells);
    const leftoverKeys = new Set(result.leftoverCells.map(coordKey));
    for (const cell of blockedCells) {
      expect(leftoverKeys.has(coordKey(cell))).toBe(false);
    }
  });
});

describe('absorbLeftoverCells', () => {
  it('absorbs a leftover cell adjacent to exactly one color endpoint', () => {
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 1, cols: 2 },
      colorPaths: [[{ row: 0, col: 0 }]],
      occupied: [[true, false]],
      leftoverCells: [{ row: 0, col: 1 }],
    };

    const events: { colorIndex: number; cell: Coord }[] = [];
    const result = absorbLeftoverCells(growth, (event) =>
      events.push({ colorIndex: event.colorIndex, cell: event.cell }),
    );

    expect(result.success).toBe(true);
    expect(result.remainingLeftover).toEqual([]);
    expect(result.colorPaths[0]).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(result.occupied).toEqual([[true, true]]);
    expect(events).toEqual([{ colorIndex: 0, cell: { row: 0, col: 1 } }]);
  });

  it('absorbs a chain of leftover cells across multiple passes', () => {
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 1, cols: 4 },
      colorPaths: [[{ row: 0, col: 0 }]],
      occupied: [[true, false, false, false]],
      leftoverCells: [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 0, col: 3 },
      ],
    };

    const result = absorbLeftoverCells(growth);

    expect(result.success).toBe(true);
    expect(result.remainingLeftover).toEqual([]);
    expect(result.colorPaths[0]).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
  });

  it('leaves a cell adjacent to two colors ambiguous until absorption elsewhere resolves it to one', () => {
    // Grid:
    //   (0,0)=A  (0,1)=ambiguous  (0,2)=B
    //   (1,0)=leftover, adjacent only to A   (1,1)/(1,2)=pre-filled filler
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 2, cols: 3 },
      colorPaths: [[{ row: 0, col: 0 }], [{ row: 0, col: 2 }]],
      occupied: [
        [true, false, true],
        [false, true, true],
      ],
      leftoverCells: [
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
    };

    const result = absorbLeftoverCells(growth);

    expect(result.success).toBe(true);
    expect(result.remainingLeftover).toEqual([]);
    // Color A absorbed (1,0) first (unambiguous), which moved its endpoint away from (0,0),
    // resolving (0,1) to be adjacent to only color B, which then absorbed it.
    expect(result.colorPaths[0]).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ]);
    expect(result.colorPaths[1]).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 1 },
    ]);
  });

  it('leaves an isolated leftover cell (zero adjacent endpoints) in remainingLeftover with success: false', () => {
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 3, cols: 3 },
      colorPaths: [[{ row: 0, col: 0 }]],
      occupied: [
        [true, true, true],
        [true, true, true],
        [true, true, false],
      ],
      leftoverCells: [{ row: 2, col: 2 }],
    };

    const result = absorbLeftoverCells(growth);

    expect(result.success).toBe(false);
    expect(result.remainingLeftover).toEqual([{ row: 2, col: 2 }]);
    expect(result.colorPaths[0]).toEqual([{ row: 0, col: 0 }]);
  });

  it('returns success: true immediately, unchanged, when there are zero leftover cells', () => {
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 1, cols: 2 },
      colorPaths: [
        [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
        ],
      ],
      occupied: [[true, true]],
      leftoverCells: [],
    };

    const result = absorbLeftoverCells(growth);

    expect(result.success).toBe(true);
    expect(result.remainingLeftover).toEqual([]);
    expect(result.colorPaths).toEqual(growth.colorPaths);
    expect(result.occupied).toEqual(growth.occupied);
  });

  it('reports failure when a color ends up with zero cells, even though every cell is filled (regression, TRD §5.14)', () => {
    // Reproduces the Section 6.1 smoke-test bug: grid is fully occupied
    // (remainingLeftover would be empty), but color 1 never got a starting
    // cell during growth, so its path is empty. The old check only looked
    // at remainingLeftover and would report this as success.
    const growth: SnakeGrowthResult = {
      gridSize: { rows: 1, cols: 1 },
      colorPaths: [[{ row: 0, col: 0 }], []],
      occupied: [[true]],
      leftoverCells: [],
    };

    const result = absorbLeftoverCells(growth);

    expect(result.success).toBe(false);
    expect(result.remainingLeftover).toEqual([]);
    expect(result.colorPaths[1]).toEqual([]);
  });
});
