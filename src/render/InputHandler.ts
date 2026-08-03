import { handleGridClick } from '../engine/PathEngine.ts';
import type { GameState } from '../engine/GameState.ts';
import type { Coord, LevelData } from '../data/LevelSchema.ts';

export function pixelToCell(
  canvas: HTMLCanvasElement,
  level: LevelData,
  clientX: number,
  clientY: number,
): Coord | null {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);

  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return null;
  }

  const cellWidth = canvas.width / level.gridSize.cols;
  const cellHeight = canvas.height / level.gridSize.rows;
  const col = Math.floor(x / cellWidth);
  const row = Math.floor(y / cellHeight);

  if (row < 0 || row >= level.gridSize.rows || col < 0 || col >= level.gridSize.cols) {
    return null;
  }

  return { row, col };
}

export function attachInputHandler(
  canvas: HTMLCanvasElement,
  getLevel: () => LevelData,
  getState: () => GameState,
  onClick: (clickCell: Coord, prevState: GameState, newState: GameState) => void,
): void {
  canvas.addEventListener('pointerdown', (event) => {
    const level = getLevel();
    const cell = pixelToCell(canvas, level, event.clientX, event.clientY);
    if (cell === null) {
      return;
    }

    const state = getState();
    const newState = handleGridClick(state, level, cell);
    onClick(cell, state, newState);
  });
}
