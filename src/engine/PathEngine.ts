import type { GameState } from './GameState';
import type { Coord, LevelData } from '../data/LevelSchema';

export function handleCellClick(
  state: GameState,
  level: LevelData,
  colorId: string,
  clickCell: Coord,
): GameState {
  const existingColorState = state.paths.get(colorId);
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
    if (
      (clickCell.col === color.endpoints[0].col && clickCell.row === color.endpoints[0].row) ||
      (clickCell.col === color.endpoints[1].col && clickCell.row === color.endpoints[1].row)
    ) {
      const newPaths = new Map(state.paths);
      newPaths.set(colorId, { colorId, path: [clickCell], completed: false });
      return { ...state, paths: newPaths, activeColorId: colorId };
    } else {
      return state;
    }
  } else {
    const path = existingColorState.path;
    const trimIndex = existingColorState.path.findIndex(
      (cell) => cell.row === clickCell.row && cell.col === clickCell.col,
    );
    if (trimIndex !== -1) {
      const newPath = existingColorState.path.slice(0, trimIndex + 1);
      const newColorState = { colorId, path: newPath, completed: false };
      const newPaths = new Map(state.paths);
      newPaths.set(colorId, newColorState);
      return { ...state, paths: newPaths, activeColorId: colorId };
    }
    const tail = path[path.length - 1];
    if (tail === undefined) {
      return state;
    }
    if (clickCell.row !== tail.row && clickCell.col !== tail.col) {
      return state;
    }
    const newCells: Coord[] = [];
    if (clickCell.row === tail.row && clickCell.col !== tail.col) {
      let cursor = { row: tail.row, col: tail.col };

      while (clickCell.col > cursor.col) {
        cursor = { row: cursor.row, col: cursor.col + 1 };
        newCells.push(cursor);
      }
      while (clickCell.col < cursor.col) {
        cursor = { row: cursor.row, col: cursor.col - 1 };
        newCells.push(cursor);
      }
      for (const cell of newCells) {
        if (isOccupiedByOtherColor(state, level, colorId, cell)) {
          return state;
        }
      }

      for (const cell2 of newCells.slice(0, -1)) {
        if (isOnOwnPath(existingColorState.path, cell2)) {
          return state;
        }
      }
    }

    if (clickCell.row !== tail.row && clickCell.col === tail.col) {
      let cursor = { row: tail.row, col: tail.col };

      while (clickCell.row > cursor.row) {
        cursor = { row: cursor.row + 1, col: cursor.col };
        newCells.push(cursor);
      }
      while (clickCell.row < cursor.row) {
        cursor = { row: cursor.row - 1, col: cursor.col };
        newCells.push(cursor);
      }
      for (const cell of newCells) {
        if (isOccupiedByOtherColor(state, level, colorId, cell)) {
          return state;
        }
      }

      for (const cell2 of newCells.slice(0, -1)) {
        if (isOnOwnPath(existingColorState.path, cell2)) {
          return state;
        }
      }
    }
    const updatedPath = [...existingColorState.path, ...newCells];
    const newColorState = { colorId, path: updatedPath, completed: existingColorState.completed };
    const newPaths = new Map(state.paths);
    newPaths.set(colorId, newColorState);
    return { ...state, paths: newPaths, activeColorId: colorId };
  }
}

function isOccupiedByOtherColor(
  state: GameState,
  level: LevelData,
  colorId: string,
  cell: Coord,
): boolean {
  for (const n of level.colors) {
    if (
      n.colorId !== colorId &&
      ((n.endpoints[0].row === cell.row && n.endpoints[0].col === cell.col) ||
        (n.endpoints[1].row === cell.row && n.endpoints[1].col === cell.col))
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

function isOnOwnPath(path: Coord[], cell: Coord): boolean {
  for (const n of path) {
    if (n.col === cell.col && n.row === cell.row) {
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
      ((color.endpoints[0].col === clickCell.col && color.endpoints[0].row === clickCell.row) ||
        (color.endpoints[1].col === clickCell.col && color.endpoints[1].row === clickCell.row))
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
