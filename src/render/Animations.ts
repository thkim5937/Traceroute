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

/**
 * Detects a click that purely appended one or more cells to a color's path
 * (extension) -- as opposed to trim or bounce-back (no state change). Used
 * to trigger `playPathGrowthAnimation` instead of an instant snap-in
 * (flagged Section 3.6 QA item, addressed Section 9). Requires an existing
 * tail in `prevState` to animate from -- planting the very first cell of an
 * untouched color has no prior point to draw a line from, so that case is
 * intentionally left to the instant static render.
 */
export function detectPathGrowth(
  prevState: GameState,
  level: LevelData,
  clickCell: Coord,
  newState: GameState,
): { colorId: string; from: Coord; addedCells: Coord[] } | null {
  const colorId = resolveColorIdForClick(prevState, level, clickCell);
  if (colorId === undefined) {
    return null;
  }

  const prevPath = prevState.paths.get(colorId)?.path;
  if (prevPath === undefined || prevPath.length === 0) {
    return null;
  }

  const newPath = newState.paths.get(colorId)?.path;
  if (newPath === undefined || newPath.length <= prevPath.length) {
    return null;
  }
  for (let i = 0; i < prevPath.length; i++) {
    const a = prevPath[i]!;
    const b = newPath[i]!;
    if (a.row !== b.row || a.col !== b.col) {
      return null;
    }
  }

  return {
    colorId,
    from: prevPath[prevPath.length - 1]!,
    addedCells: newPath.slice(prevPath.length),
  };
}

const LEG_DURATION_MS = 275;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

function runLeg(
  drawStaticScene: () => void,
  drawStub: (x: number, y: number) => void,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  durationMs: number,
  onDone: () => void,
): void {
  const legStart = performance.now();

  function frame(now: number): void {
    const rawT = Math.min(Math.max((now - legStart) / durationMs, 0), 1);
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

  runLeg(drawStaticScene, drawStub, tailX, tailY, targetX, targetY, LEG_DURATION_MS, () => {
    runLeg(
      drawStaticScene,
      drawStub,
      targetX,
      targetY,
      tailX,
      tailY,
      LEG_DURATION_MS,
      drawStaticScene,
    );
  });
}

/**
 * Animates a single color's path growing from `from` to the last cell in
 * `addedCells` as one continuous eased sweep -- addedCells always comes from
 * PathEngine's walkStraightSegment(), which only ever produces a single
 * straight line, so there's no need to animate cell-by-cell. Duration scales
 * with addedCells.length so perceived speed stays constant regardless of how
 * many cells were appended by one click. `onDone` fires once the leg
 * completes, and is responsible for the caller's normal post-move render
 * (control bar state, etc.) since this function does not re-render from the
 * final (post-extension) state itself.
 */
export function playPathGrowthAnimation(
  ctx: CanvasRenderingContext2D,
  priorState: GameState,
  level: LevelData,
  cellSize: number,
  palette: Record<string, string>,
  colorId: string,
  from: Coord,
  addedCells: Coord[],
  onDone: () => void,
): void {
  const paletteColor = palette[colorId];
  if (paletteColor === undefined) {
    throw new Error(`No palette color found for colorId "${colorId}"`);
  }
  const color: string = paletteColor;

  const to = addedCells[addedCells.length - 1]!;

  const fromX = from.col * cellSize + cellSize / 2;
  const fromY = from.row * cellSize + cellSize / 2;
  const toX = to.col * cellSize + cellSize / 2;
  const toY = to.row * cellSize + cellSize / 2;

  function drawStaticScene(): void {
    renderGrid(ctx, level.gridSize, cellSize);
    renderBlockedCells(ctx, level.obstacles?.blockedCells, cellSize);
    renderDots(ctx, level.colors, cellSize, palette);
    renderPaths(ctx, priorState, level, cellSize, palette);
  }

  function drawStub(x: number, y: number): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = cellSize * 0.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  runLeg(
    drawStaticScene,
    drawStub,
    fromX,
    fromY,
    toX,
    toY,
    LEG_DURATION_MS * addedCells.length,
    onDone,
  );
}
