import './style.css';
import { renderGrid, renderDots, renderPaths } from './render/CanvasRenderer.ts';
import { attachInputHandler } from './render/InputHandler.ts';
import { detectBounceBackTarget, playBounceBackAnimation } from './render/Animations.ts';
import { PALETTE } from './palette/palette.ts';
import { loadLevelById } from './data/LevelLoader.ts';
import type { GameState } from './engine/GameState.ts';

const cellSize = 60;
const level = loadLevelById('hand-01');

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
canvas.width = level.gridSize.cols * cellSize;
canvas.height = level.gridSize.rows * cellSize;

const ctx = canvas.getContext('2d')!;

let gameState: GameState = { levelId: level.id, paths: new Map(), activeColorId: null };

function render(): void {
  renderGrid(ctx, level.gridSize, cellSize);
  renderDots(ctx, level.colors, cellSize, PALETTE);
  renderPaths(ctx, gameState, level, cellSize, PALETTE);
}

render();

attachInputHandler(
  canvas,
  level,
  () => gameState,
  (clickCell, prevState, newState) => {
    if (newState !== prevState) {
      gameState = newState;
      render();
      return;
    }

    const bounceTarget = detectBounceBackTarget(prevState, level, clickCell);
    if (bounceTarget !== null) {
      playBounceBackAnimation(
        ctx,
        prevState,
        level,
        cellSize,
        PALETTE,
        bounceTarget.colorId,
        bounceTarget.tail,
        clickCell,
      );
    }
  },
);
