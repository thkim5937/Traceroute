import { resolveColorIdForClick } from '../engine/PathEngine.ts';
import { renderGrid, renderDots, renderPaths, renderBlockedCells } from './CanvasRenderer.ts';
import type { GameState } from '../engine/GameState.ts';
import type { Coord, LevelData } from '../data/LevelSchema.ts';

export function detectBounceBackTarget(
  prevState: GameState,
  level: LevelData,
  clickCell: Coord,
): { colorId: string; tail: Coord } | null {
  const colorId = resolveColorIdForClick(prevState, level, clickCell);
  if (colorId === undefined) {
    return null;
  }

  const colorState = prevState.paths.get(colorId);
  if (colorState?.completed === true) {
    return null;
  }

  const path = colorState?.path;
  const tail = path?.[path.length - 1];

  if (tail === undefined) {
    return null;
  }

  if (tail.row === clickCell.row || tail.col === clickCell.col) {
    return { colorId, tail };
  }

  return null;
}

const LEG_DURATION_MS = 275;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

export function playBounceBackAnimation(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  level: LevelData,
  cellSize: number,
  palette: Record<string, string>,
  colorId: string,
  tail: Coord,
  clickCell: Coord,
): void {
  const paletteColor = palette[colorId];
  if (paletteColor === undefined) {
    throw new Error(`No palette color found for colorId "${colorId}"`);
  }
  const color: string = paletteColor;

  const tailX = tail.col * cellSize + cellSize / 2;
  const tailY = tail.row * cellSize + cellSize / 2;
  const targetX = clickCell.col * cellSize + cellSize / 2;
  const targetY = clickCell.row * cellSize + cellSize / 2;

  function drawStaticScene(): void {
    renderGrid(ctx, level.gridSize, cellSize);
    renderBlockedCells(ctx, level.obstacles?.blockedCells, cellSize);
    renderDots(ctx, level.colors, cellSize, palette);
    renderPaths(ctx, gameState, level, cellSize, palette);
  }

  function drawStub(x: number, y: number): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = cellSize * 0.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function runLeg(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    onDone: () => void,
  ): void {
    const legStart = performance.now();

    function frame(now: number): void {
      const rawT = Math.min(Math.max((now - legStart) / LEG_DURATION_MS, 0), 1);
      const t = easeOut(rawT);

      drawStaticScene();
      drawStub(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);

      if (rawT < 1) {
        requestAnimationFrame(frame);
      } else {
        onDone();
      }
    }

    requestAnimationFrame(frame);
  }

  runLeg(tailX, tailY, targetX, targetY, () => {
    runLeg(targetX, targetY, tailX, tailY, drawStaticScene);
  });
}
