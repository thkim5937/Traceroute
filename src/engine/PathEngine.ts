import type { GameState, ColorPathState } from './GameState';
import type { Coord, LevelData } from '../data/LevelSchema';

function sameCell(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function commit(state: GameState, colorId: string, colorState: ColorPathState): GameState {
  const newPaths = new Map(state.paths);
  newPaths.set(colorId, colorState);
  return { ...state, paths: newPaths, activeColorId: colorId };
}

export function handleCellClick(
  state: GameState,
  level: LevelData,
  colorId: string,
  clickCell: Coord,
): GameState {
  const existingColorState = state.paths.get(colorId);
  if (existingColorState?.completed === true) {
    return state;
  }
  if (existingColorState === undefined || existingColorState.path.length === 0) {
    let color;
    for (const n of level.colors) {
      if (n.colorId === colorId) {
        color = n;
      }
    }
    if (color === undefined) {
      return state;
    }
    if (color.endpoints.some((e) => e.row === clickCell.row && e.col === clickCell.col)) {
      return commit(state, colorId, {
        colorId,
        path: [clickCell],
        completed: false,
      });
    } else {
      return state;
    }
  } else {
    const path = existingColorState.path;

    const trimIndex = path.findIndex((cell) => sameCell(cell, clickCell));
    if (trimIndex !== -1) {
      const newPath = path.slice(0, trimIndex + 1);
      return commit(state, colorId, { colorId, path: newPath, completed: false });
    }

    const primaryTail = path[path.length - 1];
    if (primaryTail === undefined) {
      return state;
    }

    const primaryAligned = clickCell.row === primaryTail.row || clickCell.col === primaryTail.col;
    if (primaryAligned) {
      const segment = walkStraightSegment(state, level, colorId, path, primaryTail, clickCell);
      if (segment.blocked) {
        return state;
      }
      const updatedPath = [...path, ...segment.cells];
      return commit(state, colorId, { colorId, path: updatedPath, completed: false });
    }

    return state;
  }
}

export function isOccupiedByOtherColor(
  state: GameState,
  level: LevelData,
  colorId: string,
  cell: Coord,
): boolean {
  for (const n of level.colors) {
    if (
      n.colorId !== colorId &&
      n.endpoints.some((e) => e.row === cell.row && e.col === cell.col)
    ) {
      return true;
    }
  }

  for (const [otherColorId, otherColorState] of state.paths) {
    for (const m of otherColorState.path) {
      if (otherColorId != colorId && m.row === cell.row && m.col === cell.col) {
        return true;
      }
    }
  }
  return false;
}

export function isBlockedCell(level: LevelData, cell: Coord): boolean {
  const blockedCells = level.obstacles?.blockedCells;
  if (blockedCells === undefined) {
    return false;
  }
  return blockedCells.some((b) => b.row === cell.row && b.col === cell.col);
}

function isOnOwnPath(path: Coord[], cell: Coord): boolean {
  for (const n of path) {
    if (n.col === cell.col && n.row === cell.row) {
      return true;
    }
  }
  return false;
}

function walkStraightSegment(
  state: GameState,
  level: LevelData,
  colorId: string,
  existingPath: Coord[],
  tail: Coord,
  clickCell: Coord,
): { blocked: boolean; cells: Coord[] } {
  const rowStep = Math.sign(clickCell.row - tail.row);
  const colStep = Math.sign(clickCell.col - tail.col);
  const cells: Coord[] = [];
  let cursor = tail;

  while (cursor.row !== clickCell.row || cursor.col !== clickCell.col) {
    cursor = { row: cursor.row + rowStep, col: cursor.col + colStep };

    if (isOccupiedByOtherColor(state, level, colorId, cursor) || isBlockedCell(level, cursor)) {
      return { blocked: true, cells: [] };
    }

    const isDestination = cursor.row === clickCell.row && cursor.col === clickCell.col;
    if (!isDestination) {
      if (isOnOwnPath(existingPath, cursor)) {
        return { blocked: true, cells: [] };
      }
      if (isUnreachedOwnEndpoint(level, colorId, existingPath, cursor)) {
        cells.push(cursor);
        return { blocked: false, cells };
      }
    }

    cells.push(cursor);
  }

  return { blocked: false, cells };
}

function isUnreachedOwnEndpoint(
  level: LevelData,
  colorId: string,
  path: Coord[],
  cell: Coord,
): boolean {
  const color = level.colors.find((n) => n.colorId === colorId);
  const start = path[0];
  if (color === undefined || start === undefined) {
    return false;
  }
  for (const endpoint of color.endpoints) {
    if (endpoint.row === start.row && endpoint.col === start.col) {
      continue;
    }
    if (endpoint.row === cell.row && endpoint.col === cell.col && !isOnOwnPath(path, endpoint)) {
      return true;
    }
  }
  return false;
}

export function resolveColorIdForClick(
  state: GameState,
  level: LevelData,
  clickCell: Coord,
): string | undefined {
  for (const color of level.colors) {
    if (
      state.paths.get(color.colorId) === undefined &&
      color.endpoints.some((e) => e.col === clickCell.col && e.row === clickCell.row)
    ) {
      return color.colorId;
    }
  }
  for (const [colorId, colorState] of state.paths) {
    const path = colorState.path;
    const tail = path[path.length - 1];
    if (
      colorId !== state.activeColorId &&
      path.length > 0 &&
      tail !== undefined &&
      tail.col === clickCell.col &&
      tail.row === clickCell.row
    ) {
      return colorId;
    }
  }
  return state.activeColorId ?? undefined;
}

export function handleGridClick(state: GameState, level: LevelData, clickCell: Coord): GameState {
  const id = resolveColorIdForClick(state, level, clickCell);
  if (id === undefined) {
    return state;
  } else {
    return handleCellClick(state, level, id, clickCell);
  }
}
