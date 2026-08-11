import type { Coord } from '../data/LevelSchema.ts';

export interface SolverResult {
  status: 'solved' | 'unsolved' | 'unresolved';
  solution?: Coord[][];
  hasSolution?: boolean;
  nodeCount: number;
  searchFullyCompleted: boolean;
}

export const SOLVER_NODE_LIMIT = 200_000;
export const SOLVER_TIME_LIMIT_MS = 5000;

export const HINT_SOLVER_NODE_LIMIT = 500_000;
export const HINT_SOLVER_TIME_LIMIT_MS = 2000;

export interface SolverLimits {
  nodeLimit?: number;
  timeLimitMs?: number;
}

/** TRD §5.10 live demo: per-step visualization hook, fired on every move applied/undone
 * during search -- including forced moves -- independent of the nodeCount used for
 * difficulty scoring (which only counts genuine branch points, see dfs() below). */
export type SolverNodeEvent =
  | { type: 'visit'; colorIndex: number; cell: Coord }
  | { type: 'backtrack'; colorIndex: number; cell: Coord };

const DIRECTIONS: Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

function coordEquals(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function coordKey(cell: Coord): string {
  return `${cell.row},${cell.col}`;
}

function neighbors(gridSize: { rows: number; cols: number }, cell: Coord): Coord[] {
  const result: Coord[] = [];
  for (const dir of DIRECTIONS) {
    const row = cell.row + dir.row;
    const col = cell.col + dir.col;
    if (row >= 0 && row < gridSize.rows && col >= 0 && col < gridSize.cols) {
      result.push({ row, col });
    }
  }
  return result;
}

function cellOwner(occupied: (number | undefined)[][], cell: Coord): number | undefined {
  return occupied[cell.row]?.[cell.col];
}

function setCellOwner(
  occupied: (number | undefined)[][],
  cell: Coord,
  colorIndex: number | undefined,
): void {
  const row = occupied[cell.row];
  if (row === undefined) {
    return;
  }
  row[cell.col] = colorIndex;
}

type ColorScan =
  { kind: 'reject' } | { kind: 'forced'; colorIndex: number; next: Coord } | { kind: 'stable' };

/**
 * Backtracking DFS with search ordering and pruning heuristics layered on
 * top of the plain search from the earlier TRD §5.5 subsection. Each node
 * (`dfs()` call) evaluates, in order:
 *
 * 1. `scanUnsolvedColors` -- cheap, local, per-color checks only:
 *    - any unsolved color whose tail has 0 legal next cells (and hasn't
 *      reached its target) means this branch is dead; reject immediately.
 *      This is cheap and conclusive on its own -- no need for the flood
 *      fill below to know it.
 *    - otherwise, any unsolved color whose tail has exactly 1 legal next
 *      cell is a forced move: not a real decision, so it's taken directly
 *      and does NOT count as a search node. Applying it can change another
 *      color's legal-move count, so the caller loops this scan to a fixed
 *      point (`dfs()` re-scans from scratch on every recursive call) before
 *      doing anything else.
 * 2. Once the scan is stable (no rejects, no forced moves left; every
 *    remaining unsolved color has 2+ options), and not every color is done,
 *    `hasDeadEnd` runs the (more expensive) flood-fill reachability check --
 *    only now, since running it before the fixed point would repeat work
 *    the cheap local checks already cover.
 * 3. Only past both of those does a genuine branch point exist: the most-
 *    constrained unsolved color (fewest legal next cells, all >= 2 at this
 *    point) is chosen via `pickUnsolvedColor`, and `nodeCount` is
 *    incremented exactly once for this decision -- not once per candidate
 *    tried, and not for the forced/rejected nodes above, since those
 *    involve no actual search choice.
 *
 * There is no unique-solution requirement: finding a complete solution does
 * not stop the search. Instead it's recorded as a candidate (replacing the
 * previous candidate if its total path length is shorter) and the search
 * backtracks to look for others. The genuine-branch-point check above is
 * also where SOLVER_NODE_LIMIT / SOLVER_TIME_LIMIT_MS are enforced -- if hit,
 * the search aborts immediately with whatever candidate (if any) it has so
 * far, rather than exploring further.
 */
export function solve(
  gridSize: { rows: number; cols: number },
  endpoints: [Coord, Coord][],
  limits: SolverLimits = {},
  blockedCells: Coord[] = [],
  initialPaths?: (Coord[] | undefined)[],
  onNode?: (event: SolverNodeEvent) => void,
): SolverResult {
  const nodeLimit = limits.nodeLimit ?? SOLVER_NODE_LIMIT;
  const timeLimitMs = limits.timeLimitMs ?? SOLVER_TIME_LIMIT_MS;
  const startTime = Date.now();
  const colorCount = endpoints.length;
  const occupied: (number | undefined)[][] = Array.from({ length: gridSize.rows }, () =>
    new Array<number | undefined>(gridSize.cols).fill(undefined),
  );
  for (const cell of blockedCells) {
    setCellOwner(occupied, cell, -1);
  }
  const paths: Coord[][] = endpoints.map(([start], colorIndex) => {
    const initialPath = initialPaths?.[colorIndex];
    if (initialPath !== undefined && initialPath.length > 0) {
      for (const cell of initialPath) {
        setCellOwner(occupied, cell, colorIndex);
      }
      return initialPath.slice();
    }
    setCellOwner(occupied, start, colorIndex);
    return [start];
  });
  const done = new Array<boolean>(colorCount).fill(false);
  for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
    const [start, end] = endpoints[colorIndex] ?? [];
    if (start !== undefined && end !== undefined && coordEquals(start, end)) {
      done[colorIndex] = true;
      continue;
    }
    const tail = paths[colorIndex]?.at(-1);
    if (tail !== undefined && end !== undefined && coordEquals(tail, end)) {
      done[colorIndex] = true;
    }
  }

  let nodeCount = 0;
  let bestSolution: Coord[][] | undefined;
  let bestLength = Infinity;

  function openNeighbors(cell: Coord): Coord[] {
    return neighbors(gridSize, cell).filter((n) => cellOwner(occupied, n) === undefined);
  }

  function pickUnsolvedColor(): number {
    let best = -1;
    let bestOptionCount = Infinity;
    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
      if (done[colorIndex]) continue;
      const tail = paths[colorIndex]?.at(-1);
      if (tail === undefined) continue;
      const optionCount = openNeighbors(tail).length;
      if (optionCount < bestOptionCount) {
        bestOptionCount = optionCount;
        best = colorIndex;
      }
    }
    return best;
  }

  function scanUnsolvedColors(): ColorScan {
    let forcedCandidate: { colorIndex: number; next: Coord } | undefined;
    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
      if (done[colorIndex]) continue;
      const tail = paths[colorIndex]?.at(-1);
      if (tail === undefined) continue;
      const options = openNeighbors(tail);
      if (options.length === 0) {
        return { kind: 'reject' };
      }
      if (options.length === 1 && forcedCandidate === undefined) {
        const next = options[0];
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
      for (const next of neighbors(gridSize, current)) {
        const key = coordKey(next);
        if (visited.has(key)) continue;
        const owner = cellOwner(occupied, next);
        if (owner !== undefined && owner !== colorIndex) continue;
        visited.add(key);
        stack.push(next);
      }
    }
    return false;
  }

  function hasDeadEnd(): boolean {
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
    if (path === undefined || target === undefined) {
      return false;
    }

    path.push(next);
    setCellOwner(occupied, next, colorIndex);
    onNode?.({ type: 'visit', colorIndex, cell: next });
    const reachedTarget = coordEquals(next, target);
    if (reachedTarget) {
      done[colorIndex] = true;
    }

    const abort = dfs();

    if (reachedTarget) {
      done[colorIndex] = false;
    }
    setCellOwner(occupied, next, undefined);
    path.pop();
    onNode?.({ type: 'backtrack', colorIndex, cell: next });

    return abort;
  }

  // Returns whether the search was aborted by a limit (true) as opposed to
  // exhausting this branch normally (false) -- it is no longer "found a
  // solution", since a found solution keeps searching for a simpler one.
  function dfs(): boolean {
    const scan = scanUnsolvedColors();

    if (scan.kind === 'reject') {
      return false;
    }

    if (scan.kind === 'forced') {
      return applyMoveAndRecurse(scan.colorIndex, scan.next);
    }

    if (done.every(Boolean)) {
      const totalLength = paths.reduce((sum, path) => sum + path.length, 0);
      if (bestSolution === undefined || totalLength < bestLength) {
        bestSolution = paths.map((path) => path.slice());
        bestLength = totalLength;
      }
      return false;
    }

    if (hasDeadEnd()) {
      return false;
    }

    nodeCount++;
    if (nodeCount >= nodeLimit || Date.now() - startTime >= timeLimitMs) {
      return true;
    }

    const colorIndex = pickUnsolvedColor();
    if (colorIndex === -1) {
      return false;
    }

    const tail = paths[colorIndex]?.at(-1);
    if (tail === undefined) {
      return false;
    }

    for (const next of openNeighbors(tail)) {
      if (applyMoveAndRecurse(colorIndex, next)) {
        return true;
      }
    }

    return false;
  }

  const aborted = dfs();

  if (aborted) {
    return {
      status: 'unresolved',
      solution: bestSolution,
      hasSolution: bestSolution !== undefined,
      nodeCount,
      searchFullyCompleted: false,
    };
  }
  if (bestSolution !== undefined) {
    return {
      status: 'solved',
      solution: bestSolution,
      hasSolution: true,
      nodeCount,
      searchFullyCompleted: true,
    };
  }
  return { status: 'unsolved', hasSolution: false, nodeCount, searchFullyCompleted: true };
}
