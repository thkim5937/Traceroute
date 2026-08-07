import { describe, it, expect } from 'vitest';
import { solve } from '../src/solver/Solver';
import type { Coord } from '../src/data/LevelSchema';

function isAdjacent(a: Coord, b: Coord): boolean {
  const rowDiff = Math.abs(a.row - b.row);
  const colDiff = Math.abs(a.col - b.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

function coordKey(cell: Coord): string {
  return `${cell.row},${cell.col}`;
}

// Test-only instrumentation copy of solve(), mirroring the *current*
// production dfs() exactly (verified against solve() for parity across all
// scenarios used below), extended only to observe execution order:
//   - `events` logs each forced move / reject / branch / done step, so
//     tests can assert *which color* acted *in what order*, not just the
//     final result.
//   - `deadEndCalls` counts flood-fill invocations, so tests can assert the
//     expensive check was (or wasn't) actually run.
//   - `skipZeroReject` ablates the 0-legal-moves fast path, letting the same
//     state fall through to the flood-fill instead, to prove the fast path
//     is actually short-circuiting a check that otherwise would have run.
type TraceEvent =
  | { kind: 'forced'; colorIndex: number; next: Coord }
  | { kind: 'reject' }
  | { kind: 'branch'; colorIndex: number }
  | { kind: 'done' };

function traceSolve(
  gridSize: { rows: number; cols: number },
  endpoints: [Coord, Coord][],
  options: { skipZeroReject?: boolean } = {},
): { solved: boolean; nodeCount: number; deadEndCalls: number; events: TraceEvent[] } {
  const colorCount = endpoints.length;
  const DIRECTIONS: Coord[] = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  const coordEquals = (a: Coord, b: Coord): boolean => a.row === b.row && a.col === b.col;
  const neighborsOf = (cell: Coord): Coord[] => {
    const result: Coord[] = [];
    for (const dir of DIRECTIONS) {
      const row = cell.row + dir.row;
      const col = cell.col + dir.col;
      if (row >= 0 && row < gridSize.rows && col >= 0 && col < gridSize.cols) {
        result.push({ row, col });
      }
    }
    return result;
  };

  const occupied: (number | undefined)[][] = Array.from({ length: gridSize.rows }, () =>
    new Array<number | undefined>(gridSize.cols).fill(undefined),
  );
  const setOwner = (cell: Coord, colorIndex: number | undefined): void => {
    const row = occupied[cell.row];
    if (row === undefined) return;
    row[cell.col] = colorIndex;
  };
  const ownerOf = (cell: Coord): number | undefined => occupied[cell.row]?.[cell.col];

  const paths: Coord[][] = endpoints.map(([start], colorIndex) => {
    setOwner(start, colorIndex);
    return [start];
  });
  const done = new Array<boolean>(colorCount).fill(false);
  let nodeCount = 0;
  let deadEndCalls = 0;
  const events: TraceEvent[] = [];

  const openNeighbors = (cell: Coord): Coord[] =>
    neighborsOf(cell).filter((n) => ownerOf(n) === undefined);

  function pickUnsolvedColor(): number {
    let best = -1;
    let bestCount = Infinity;
    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
      if (done[colorIndex]) continue;
      const tail = paths[colorIndex]?.at(-1);
      if (tail === undefined) continue;
      const count = openNeighbors(tail).length;
      if (count < bestCount) {
        bestCount = count;
        best = colorIndex;
      }
    }
    return best;
  }

  type Scan =
    { kind: 'reject' } | { kind: 'forced'; colorIndex: number; next: Coord } | { kind: 'stable' };

  function scanUnsolvedColors(): Scan {
    let forcedCandidate: { colorIndex: number; next: Coord } | undefined;
    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
      if (done[colorIndex]) continue;
      const tail = paths[colorIndex]?.at(-1);
      if (tail === undefined) continue;
      const opts = openNeighbors(tail);
      if (opts.length === 0 && !options.skipZeroReject) {
        return { kind: 'reject' };
      }
      if (opts.length === 1 && forcedCandidate === undefined) {
        const next = opts[0];
        if (next !== undefined) {
          forcedCandidate = { colorIndex, next };
        }
      }
    }
    return forcedCandidate !== undefined
      ? { kind: 'forced', colorIndex: forcedCandidate.colorIndex, next: forcedCandidate.next }
      : { kind: 'stable' };
  }

  function canReach(colorIndex: number, from: Coord, to: Coord): boolean {
    const visited = new Set<string>([coordKey(from)]);
    const stack: Coord[] = [from];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      if (coordEquals(current, to)) return true;
      for (const next of neighborsOf(current)) {
        const key = coordKey(next);
        if (visited.has(key)) continue;
        const owner = ownerOf(next);
        if (owner !== undefined && owner !== colorIndex) continue;
        visited.add(key);
        stack.push(next);
      }
    }
    return false;
  }

  function hasDeadEnd(): boolean {
    deadEndCalls++;
    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
      if (done[colorIndex]) continue;
      const tail = paths[colorIndex]?.at(-1);
      const target = endpoints[colorIndex]?.[1];
      if (tail === undefined || target === undefined) continue;
      if (!canReach(colorIndex, tail, target)) return true;
    }
    return false;
  }

  function applyMoveAndRecurse(colorIndex: number, next: Coord): boolean {
    const path = paths[colorIndex];
    const target = endpoints[colorIndex]?.[1];
    if (path === undefined || target === undefined) return false;

    path.push(next);
    setOwner(next, colorIndex);
    const reachedTarget = coordEquals(next, target);
    if (reachedTarget) done[colorIndex] = true;

    const success = dfs();

    if (!success) {
      if (reachedTarget) done[colorIndex] = false;
      setOwner(next, undefined);
      path.pop();
    }
    return success;
  }

  function dfs(): boolean {
    const scan = scanUnsolvedColors();

    if (scan.kind === 'reject') {
      events.push({ kind: 'reject' });
      return false;
    }

    if (scan.kind === 'forced') {
      events.push({ kind: 'forced', colorIndex: scan.colorIndex, next: scan.next });
      return applyMoveAndRecurse(scan.colorIndex, scan.next);
    }

    if (done.every(Boolean)) {
      events.push({ kind: 'done' });
      return true;
    }

    if (hasDeadEnd()) {
      return false;
    }

    nodeCount++;
    const colorIndex = pickUnsolvedColor();
    if (colorIndex === -1) return true;
    events.push({ kind: 'branch', colorIndex });

    const tail = paths[colorIndex]?.at(-1);
    if (tail === undefined) return false;

    for (const next of openNeighbors(tail)) {
      if (applyMoveAndRecurse(colorIndex, next)) return true;
    }
    return false;
  }

  const solved = dfs();
  return { solved, nodeCount, deadEndCalls, events };
}

describe('solve', () => {
  it('solves a trivial 2x2 grid with one color pair at opposite corners', () => {
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ],
    ];

    const result = solve({ rows: 2, cols: 2 }, endpoints);

    expect(result.status).toBe('solved');
    expect(result.searchFullyCompleted).toBe(true);
    // The corner start has 2 legal next cells (a genuine branch point,
    // nodeCount=1); whichever of the two is tried first is then forced the
    // rest of the way to the opposite corner, so nodeCount stays at 1.
    expect(result.nodeCount).toBe(1);
    const path = result.solution?.[0];
    expect(path?.[0]).toEqual(endpoints[0]?.[0]);
    expect(path?.[path.length - 1]).toEqual(endpoints[0]?.[1]);
  });

  it('returns unsolved for endpoints structurally blocked by a second color', () => {
    // 2x2 grid, both colors need the diagonal, but the only two connecting
    // cells are exactly the other color's endpoints -- no valid routing exists.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ],
      [
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
    ];

    const result = solve({ rows: 2, cols: 2 }, endpoints);

    expect(result.status).toBe('unsolved');
    expect(result.searchFullyCompleted).toBe(true);
    expect(result.solution).toBeUndefined();
    // Under the revised TRD §5.5 counting rules, nodeCount only reflects
    // genuine branch points (2+ legal next cells). This puzzle never
    // reaches one: color 0's forced march around the grid eventually
    // leaves color 1 with 0 legal next cells, which is an immediate local
    // reject, not a branch.
    expect(result.nodeCount).toBe(0);
  });

  it('tracks a growing nodeCount as grid complexity increases', () => {
    // nodeCount now counts genuine branch points only (TRD §5.5), not
    // every cell visited -- still expected to grow with grid size, since
    // a bigger open grid gives the single color more than one legal next
    // cell at more points along its route.
    const trivial = solve({ rows: 2, cols: 2 }, [
      [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ],
    ]);

    const larger = solve({ rows: 4, cols: 4 }, [
      [
        { row: 0, col: 0 },
        { row: 3, col: 3 },
      ],
    ]);

    expect(trivial.nodeCount).toBeGreaterThan(0);
    expect(larger.nodeCount).toBeGreaterThan(0);
    expect(larger.nodeCount).toBeGreaterThanOrEqual(trivial.nodeCount);
  });

  it('returns geometrically valid, non-overlapping paths for a multi-color grid', () => {
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ],
      [
        { row: 1, col: 0 },
        { row: 1, col: 2 },
      ],
    ];

    const result = solve({ rows: 2, cols: 3 }, endpoints);

    expect(result.status).toBe('solved');
    const solution = result.solution;
    expect(solution).toBeDefined();
    if (solution === undefined) return;

    const seen = new Set<string>();
    solution.forEach((path, colorIndex) => {
      const [start, end] = endpoints[colorIndex] ?? [];
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);

      for (let i = 0; i < path.length; i++) {
        const cell = path[i];
        if (cell === undefined) continue;
        const key = coordKey(cell);
        expect(seen.has(key)).toBe(false);
        seen.add(key);

        if (i > 0) {
          const prev = path[i - 1];
          if (prev !== undefined) {
            expect(isAdjacent(prev, cell)).toBe(true);
          }
        }
      }
    });
  });
});

describe('search heuristics (TRD §5.5)', () => {
  it('auto-extends a single-option tail (forced move) without incrementing nodeCount', () => {
    // 2x3 grid: color 0's start (1,0) and color 1's start (1,1) are both
    // corner-adjacent-style constrained from the very first cell, so every
    // step of the search is forced end to end -- confirmed by trace below:
    // color 0 marches (1,0)->(0,0)->(0,1)->(0,2), color 1 marches
    // (1,1)->(1,2). No genuine branch point ever occurs.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 1, col: 0 },
        { row: 0, col: 2 },
      ],
      [
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
    ];

    const trace = traceSolve({ rows: 2, cols: 3 }, endpoints);

    expect(trace.solved).toBe(true);
    expect(trace.nodeCount).toBe(0);
    expect(trace.events.some((e) => e.kind === 'branch')).toBe(false);
    expect(trace.events.filter((e) => e.kind === 'forced').length).toBeGreaterThan(0);

    // Cross-check against the real solve(), not just the trace copy.
    const result = solve({ rows: 2, cols: 3 }, endpoints);
    expect(result.status).toBe('solved');
    expect(result.nodeCount).toBe(0);
  });

  it('propagates forced moves to a fixed point: one color unlocks a forced move for another before any branch', () => {
    // Same grid as above. Color 1's start (1,1) has 2 open neighbors at
    // first -- (0,1) and (1,2) -- so it is *not* forced initially. Only
    // once color 0's own forced march passes through (0,1) does color 1
    // drop to exactly 1 option and become forced too. Both must be applied
    // (in that order) before the fixed point is reached.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 1, col: 0 },
        { row: 0, col: 2 },
      ],
      [
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
    ];

    const trace = traceSolve({ rows: 2, cols: 3 }, endpoints);

    const forcedColorOrder = trace.events
      .filter((e): e is Extract<TraceEvent, { kind: 'forced' }> => e.kind === 'forced')
      .map((e) => e.colorIndex);

    expect(forcedColorOrder).toContain(0);
    expect(forcedColorOrder).toContain(1);
    // Color 1 can only appear after color 0 has already taken the step
    // that unlocks it.
    expect(forcedColorOrder.indexOf(1)).toBeGreaterThan(forcedColorOrder.indexOf(0));
    // The whole cascade -- both colors -- resolves with zero branch points.
    expect(trace.nodeCount).toBe(0);
  });

  it('rejects a color with 0 legal next cells immediately, without invoking the flood-fill check', () => {
    // 2x2 grid, structurally blocked (same puzzle as the "solve" suite's
    // equivalent case): color 0's forced march eventually leaves color 1
    // with 0 open neighbors while color 1 hasn't reached its target yet.
    // Every node in this puzzle is either forced or a 0-option reject, so
    // hasDeadEnd should never run at all.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ],
      [
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
    ];

    const withShortcut = traceSolve({ rows: 2, cols: 2 }, endpoints);
    expect(withShortcut.solved).toBe(false);
    expect(withShortcut.events.some((e) => e.kind === 'reject')).toBe(true);
    expect(withShortcut.deadEndCalls).toBe(0);

    // Ablation: disable the 0-option fast path so the same state instead
    // falls through to the flood-fill check, proving the fast path is
    // actually short-circuiting a real check (not just coincidentally
    // unused) -- the flood-fill correctly reaches the same conclusion, just
    // via the more expensive route.
    const withoutShortcut = traceSolve({ rows: 2, cols: 2 }, endpoints, {
      skipZeroReject: true,
    });
    expect(withoutShortcut.solved).toBe(false);
    expect(withoutShortcut.deadEndCalls).toBeGreaterThan(0);
  });

  it('dead-end flood-fill still backtracks once a color becomes structurally unreachable', () => {
    // 5x5, two colors, structurally unsolvable. Unlike the 2x2 cases above,
    // this puzzle does reach genuinely "stable" states (every unsolved
    // color has 2+ options) along the way, so the flood-fill actually has
    // to run and catch the eventual block.
    const grid = { rows: 5, cols: 5 };
    const endpoints: [Coord, Coord][] = [
      [
        { row: 1, col: 0 },
        { row: 4, col: 4 },
      ],
      [
        { row: 0, col: 0 },
        { row: 4, col: 0 },
      ],
    ];

    const result = solve(grid, endpoints);
    const trace = traceSolve(grid, endpoints);

    expect(result.status).toBe('unsolved');
    expect(trace.solved).toBe(false);
    expect(trace.deadEndCalls).toBeGreaterThan(0);
  });

  it('nodeCount reflects only genuine branch points, not the number of cells filled', () => {
    // 1x8 strip, single color, corner to corner. With only 1 row, every
    // cell has exactly 1 open neighbor at every step (no room to detour),
    // so the entire 8-cell path is one long forced-move chain with no real
    // decision anywhere -- despite filling most of the grid.
    const result = solve({ rows: 1, cols: 8 }, [
      [
        { row: 0, col: 0 },
        { row: 0, col: 7 },
      ],
    ]);

    expect(result.status).toBe('solved');
    expect(result.solution?.[0]).toHaveLength(8);
    expect(result.nodeCount).toBe(0);
  });
});

describe('termination and simplest-solution selection (TRD §5.5)', () => {
  it('selects the minimum-total-length solution when multiple solutions exist', () => {
    // 2x2 grid, single color, adjacent corners (0,0)-(0,1). The start cell
    // has 2 open neighbors -- (1,0) and (0,1) -- a genuine branch point.
    // Taking (0,1) directly gives a length-2 solution; taking (1,0) forces
    // a longer length-4 loop around through (1,1) back to (0,1). Both are
    // valid, non-overlapping solutions, so the search must try both and
    // keep the shorter one rather than stopping at whichever is found first.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    ];

    const result = solve({ rows: 2, cols: 2 }, endpoints);

    expect(result.status).toBe('solved');
    expect(result.searchFullyCompleted).toBe(true);
    expect(result.solution?.[0]).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
  });

  it('returns unresolved with searchFullyCompleted false when the node limit is hit before the search space is exhausted', () => {
    // Same branching 2x2 puzzle as above, but with an injected node limit
    // of 1 -- the very first genuine branch point hits the limit before any
    // candidate move is tried, so the search aborts having found nothing yet.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    ];

    const result = solve({ rows: 2, cols: 2 }, endpoints, { nodeLimit: 1 });

    expect(result.status).toBe('unresolved');
    expect(result.searchFullyCompleted).toBe(false);
    expect(result.nodeCount).toBe(1);
    expect(result.solution).toBeUndefined();
    expect(result.hasSolution).toBe(false);
  });

  it('returns hasSolution true with the best-found candidate when the node limit is hit AFTER a solution was already found', () => {
    // 2x3 grid, single color (0,0)->(1,2). The first branch point (nodeCount
    // 0->1) picks between two routes; the down-first route hits a second
    // branch point (nodeCount 1->2) deep inside it where both a length-6 and
    // a shorter length-4 solution are found and recorded (keeping the
    // length-4 one as bestSolution). Backtracking to the right-first route at
    // the top level opens a third branch point, which is where nodeLimit=3
    // aborts the search -- with the length-4 candidate already in hand.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 1, col: 2 },
      ],
    ];

    const result = solve({ rows: 2, cols: 3 }, endpoints, { nodeLimit: 3 });

    expect(result.status).toBe('unresolved');
    expect(result.searchFullyCompleted).toBe(false);
    expect(result.hasSolution).toBe(true);
    expect(result.solution?.[0]).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
  });
});

describe('zero-length colors (start === end)', () => {
  it('marks a color with identical start/end as done at initialization, without blocking an otherwise-solvable board', () => {
    // 2x2 grid: color 0 is a trivial single-cell color at (1,1), color 1
    // needs the remaining three cells in a simple path. Without the fix,
    // color 0 is left "not done" and the solver tries to find a move out of
    // a cell it already fully occupies, misreporting the board unsolvable.
    const endpoints: [Coord, Coord][] = [
      [
        { row: 1, col: 1 },
        { row: 1, col: 1 },
      ],
      [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ],
    ];

    const result = solve({ rows: 2, cols: 2 }, endpoints);

    expect(result.status).toBe('solved');
    expect(result.solution?.[0]).toEqual([{ row: 1, col: 1 }]);
  });
});

describe('blockedCells (TRD §5.14)', () => {
  it('routes around blockedCells to reach the target, never entering one', () => {
    // 3x3 grid, single color from (0,0) to (2,0). The direct straight-down
    // route through (1,0) is blocked, so the only solution must detour via
    // column 1: (0,0)->(0,1)->(1,1)->(2,1)->(2,0).
    const blockedCells: Coord[] = [{ row: 1, col: 0 }];
    const endpoints: [Coord, Coord][] = [
      [
        { row: 0, col: 0 },
        { row: 2, col: 0 },
      ],
    ];

    const result = solve({ rows: 3, cols: 3 }, endpoints, {}, blockedCells);

    expect(result.status).toBe('solved');
    const path = result.solution?.[0] ?? [];
    expect(path[0]).toEqual({ row: 0, col: 0 });
    expect(path[path.length - 1]).toEqual({ row: 2, col: 0 });
    for (const blocked of blockedCells) {
      expect(path.some((c) => c.row === blocked.row && c.col === blocked.col)).toBe(false);
    }
  });
});
