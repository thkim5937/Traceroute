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
  colorDef: { colorId: string; endpoints: [Coord, Coord] },
): boolean {
  const { path } = colorState;
  if (path.length < 2) {
    return false;
  }
  const first = path[0]!;
  const last = path[path.length - 1]!;
  const [endA, endB] = colorDef.endpoints;
  const endpointsMatch =
    (sameCell(first, endA) && sameCell(last, endB)) ||
    (sameCell(first, endB) && sameCell(last, endA));
  if (!endpointsMatch) {
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
