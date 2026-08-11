import type { GameState } from '../engine/GameState.ts';
import type { Coord, LevelData } from '../data/LevelSchema.ts';

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  gridSize: { rows: number; cols: number },
  cellSize: number,
): void {
  const width = gridSize.cols * cellSize;
  const height = gridSize.rows * cellSize;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 0; col <= gridSize.cols; col++) {
    const x = col === gridSize.cols ? width - 0.5 : col * cellSize + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let row = 0; row <= gridSize.rows; row++) {
    const y = row === gridSize.rows ? height - 0.5 : row * cellSize + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

export function renderBlockedCells(
  ctx: CanvasRenderingContext2D,
  blockedCells: Coord[] | undefined,
  cellSize: number,
): void {
  if (blockedCells === undefined) {
    return;
  }

  ctx.fillStyle = '#444';
  for (const { row, col } of blockedCells) {
    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
  }
}

export function renderPaths(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  level: LevelData,
  cellSize: number,
  palette: Record<string, string>,
): void {
  ctx.lineWidth = cellSize * 0.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const levelColorIds = new Set(level.colors.map((color) => color.colorId));

  function strokePath(cells: Coord[], color: string): void {
    const first = cells[0];
    if (first === undefined) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(first.col * cellSize + cellSize / 2, first.row * cellSize + cellSize / 2);
    for (const cell of cells.slice(1)) {
      ctx.lineTo(cell.col * cellSize + cellSize / 2, cell.row * cellSize + cellSize / 2);
    }
    ctx.stroke();
  }

  for (const { colorId, path } of gameState.paths.values()) {
    if (!levelColorIds.has(colorId)) {
      continue;
    }

    const color = palette[colorId];
    if (color === undefined) {
      throw new Error(`No palette color found for colorId "${colorId}"`);
    }

    if (path.length > 0) {
      strokePath(path, color);
    }
  }
}

export function renderDots(
  ctx: CanvasRenderingContext2D,
  colors: {
    colorId: string;
    endpoints: { row: number; col: number }[];
  }[],
  cellSize: number,
  palette: Record<string, string>,
): void {
  const radius = cellSize * 0.35;

  for (const { colorId, endpoints } of colors) {
    const color = palette[colorId];
    if (color === undefined) {
      throw new Error(`No palette color found for colorId "${colorId}"`);
    }

    ctx.fillStyle = color;
    for (const { row, col } of endpoints) {
      const x = col * cellSize + cellSize / 2;
      const y = row * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
