import type { Coord, LevelData } from '../data/LevelSchema';
import type { GameState } from './GameState';
import { solve, HINT_SOLVER_NODE_LIMIT, HINT_SOLVER_TIME_LIMIT_MS } from '../solver/Solver';

export type HintResult =
  { status: 'revealed'; newPath: Coord[] } | { status: 'noop' } | { status: 'stuck' };

function coordEq(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function stepAxis(from: Coord, to: Coord): 'row' | 'col' {
  return from.row !== to.row ? 'row' : 'col';
}

/**
 * How many steps of `path` (starting from index 0) stay in the same direction.
 * Returns the index of the last cell in the straight segment (inclusive), relative
 * to path. Caller appends path[1..steps] to the prefix.
 */
function straightSegmentSteps(path: Coord[]): number {
  if (path.length < 2) return 0;
  const initAxis = stepAxis(path[0]!, path[1]!);
  let i = 1;
  while (i + 1 < path.length && stepAxis(path[i]!, path[i + 1]!) === initAxis) {
    i++;
  }
  return i;
}

function currentPathFor(level: LevelData, colorId: string, state: GameState): Coord[] {
  const colorDef = level.colors.find((c) => c.colorId === colorId)!;
  const stored = state.paths.get(colorId);
  return stored !== undefined && stored.path.length > 0 ? stored.path : [colorDef.endpoints[0]!];
}

/**
 * Endpoints of `colorDef` not yet present anywhere in `path` -- order-free,
 * mirrors ClearDetector.isColorComplete's membership check (TRD §5.15 Phase
 * 2). A color is fully visited once this is empty, regardless of how many
 * endpoints it has (2, 3, or 4) or the order they were reached in.
 */
function unvisitedEndpoints(colorDef: { endpoints: Coord[] }, path: Coord[]): Coord[] {
  return colorDef.endpoints.filter((endpoint) => !path.some((cell) => coordEq(cell, endpoint)));
}

/**
 * True when every color's live path (if any) is an exact cell-for-cell
 * prefix of `level.solution`. When this holds, the stored solution is still
 * valid for every color, so a hint can be resolved by reading it directly
 * instead of re-solving.
 */
function boardMatchesStoredSolution(level: LevelData, state: GameState): boolean {
  for (const colorDef of level.colors) {
    const path = state.paths.get(colorDef.colorId)?.path ?? [];
    if (path.length === 0) continue;
    const solutionPath = level.solution.find((s) => s.colorId === colorDef.colorId)?.path;
    if (solutionPath === undefined) return false;
    for (let i = 0; i < path.length; i++) {
      if (!coordEq(path[i]!, solutionPath[i]!)) return false;
    }
  }
  return true;
}

/**
 * `fullPath` must have `currentPath` as an exact prefix (fullPath[tailIndex]
 * is currentPath's tail). Reveals the next straight segment beyond the tail.
 */
function revealFromFullPath(fullPath: Coord[], currentPath: Coord[]): HintResult {
  const tailIndex = currentPath.length - 1;
  const remaining = fullPath.slice(tailIndex);
  const steps = straightSegmentSteps(remaining);
  if (steps === 0) return { status: 'noop' };
  return { status: 'revealed', newPath: [...currentPath, ...remaining.slice(1, steps + 1)] };
}

/**
 * Compute the next hint for `colorId` given the live board state.
 *
 * Feasibility is checked for the WHOLE board, not just the hinted color:
 * completing one color via a route that diverges from `level.solution` can
 * strand a different, not-yet-touched color even though the hinted color's
 * own tail could still reach its own target (TRD §5.8).
 *
 * Fast path: if every color's drawn path is still an exact prefix of
 * `level.solution`, the stored solution remains valid for everyone, so the
 * next segment is read directly off it — no solver call, resolves instantly.
 *
 * Slow path: if any color has diverged, a fresh solve() runs from the live
 * board (completed colors' paths as permanent obstacles, other not-completed
 * colors seeded from their current paths) to prove the whole board is still
 * completable before revealing anything.
 *
 * Returns:
 * - `{ status: 'revealed', newPath }` — extends by one straight segment.
 * - `{ status: 'noop' }` — color has already visited all of its endpoints
 *   (2-4, any order — TRD §5.15 Phase 2).
 * - `{ status: 'stuck' }` — board is not provably still completable (or the
 *   solver's interactive budget ran out without finding a candidate);
 *   caller should nudge the player toward Undo. Path is NOT modified.
 */
export function applyHint(level: LevelData, colorId: string, state: GameState): HintResult {
  const colorDef = level.colors.find((c) => c.colorId === colorId);
  if (colorDef === undefined) return { status: 'noop' };

  const currentPath = currentPathFor(level, colorId, state);
  if (unvisitedEndpoints(colorDef, currentPath).length === 0) return { status: 'noop' };

  if (boardMatchesStoredSolution(level, state)) {
    const solutionPath = level.solution.find((s) => s.colorId === colorId)?.path;
    if (solutionPath === undefined) return { status: 'noop' };
    return revealFromFullPath(solutionPath, currentPath);
  }

  const notCompleted = level.colors.filter((c) => state.paths.get(c.colorId)?.completed !== true);
  const completedPathCells = level.colors
    .filter((c) => state.paths.get(c.colorId)?.completed === true)
    .flatMap((c) => state.paths.get(c.colorId)!.path);
  const blockedCells = [...(level.obstacles?.blockedCells ?? []), ...completedPathCells];

  // TRD §5.15 Phase 2: pass every one of this color's endpoints (2-4), not
  // just "the other one" -- solve() already tracks per-color remaining-
  // endpoint sets internally (see Solver.ts) and just needs the full set.
  const endpoints: Coord[][] = [];
  const initialPaths: (Coord[] | undefined)[] = [];
  let hintedIndex = -1;
  for (const c of notCompleted) {
    const path = currentPathFor(level, c.colorId, state);
    endpoints.push(c.endpoints);
    initialPaths.push(path);
    if (c.colorId === colorId) hintedIndex = endpoints.length - 1;
  }

  const result = solve(
    level.gridSize,
    endpoints,
    { nodeLimit: HINT_SOLVER_NODE_LIMIT, timeLimitMs: HINT_SOLVER_TIME_LIMIT_MS },
    blockedCells,
    initialPaths,
  );

  if (result.hasSolution !== true || hintedIndex === -1) return { status: 'stuck' };
  const solvedPath = result.solution?.[hintedIndex];
  if (solvedPath === undefined) return { status: 'stuck' };

  return revealFromFullPath(solvedPath, currentPath);
}
