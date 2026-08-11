import type { GameState, ColorPathState } from './GameState';
import type { Coord, LevelData } from '../data/LevelSchema';

function isAdjacent(a: Coord, b: Coord): boolean {
  const dRow = Math.abs(a.row - b.row);
  const dCol = Math.abs(a.col - b.col);
  return (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
}

function sameCell(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function isColorComplete(
  colorState: ColorPathState,
  colorDef: { colorId: string; endpoints: Coord[] },
): boolean {
  const { path } = colorState;
  if (path.length < 2) {
    return false;
  }
  const allEndpointsReached = colorDef.endpoints.every((endpoint) =>
    path.some((cell) => sameCell(cell, endpoint)),
  );
  if (!allEndpointsReached) {
    return false;
  }
  for (let i = 1; i < path.length; i++) {
    if (!isAdjacent(path[i - 1]!, path[i]!)) {
      return false;
    }
  }
  return true;
}

export function updateCompletionStatus(state: GameState, level: LevelData): GameState {
  let changed = false;
  const newPaths = new Map(state.paths);
  for (const colorDef of level.colors) {
    const colorState = state.paths.get(colorDef.colorId);
    const complete = colorState !== undefined && isColorComplete(colorState, colorDef);
    if (colorState !== undefined && colorState.completed !== complete) {
      changed = true;
      newPaths.set(colorDef.colorId, { ...colorState, completed: complete });
    }
  }
  if (!changed) {
    return state;
  }
  return { ...state, paths: newPaths };
}

export function isBoardClear(state: GameState, level: LevelData): boolean {
  for (const colorDef of level.colors) {
    const colorState = state.paths.get(colorDef.colorId);
    if (colorState === undefined || !isColorComplete(colorState, colorDef)) {
      return false;
    }
  }
  return true;
}

/**
 * TRD §5.9: total edge count vs. minTotalEdgeLength determines the base
 * efficiency rating (1-3); each hint used then deducts 0.25, floored at 1.0.
 */
export function computeStarRating(
  state: GameState,
  level: LevelData,
  hintUseCount: number,
): number {
  let totalEdgeCount = 0;
  for (const colorDef of level.colors) {
    const colorState = state.paths.get(colorDef.colorId);
    totalEdgeCount += (colorState?.path.length ?? 1) - 1;
  }
  let efficiencyStars: 1 | 2 | 3;
  if (totalEdgeCount <= level.minTotalEdgeLength * 1.0) efficiencyStars = 3;
  else if (totalEdgeCount <= level.minTotalEdgeLength * 1.3) efficiencyStars = 2;
  else efficiencyStars = 1;

  const finalStars = Math.max(1.0, efficiencyStars - hintUseCount * 0.25);
  return Math.round(finalStars * 100) / 100;
}
