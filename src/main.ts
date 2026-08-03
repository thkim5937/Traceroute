import './style.css';
import { renderGrid, renderDots, renderPaths } from './render/CanvasRenderer.ts';
import { attachInputHandler } from './render/InputHandler.ts';
import { detectBounceBackTarget, playBounceBackAnimation } from './render/Animations.ts';
import { PALETTE } from './palette/palette.ts';
import { loadLevelById } from './data/LevelLoader.ts';
import { createGameController, type GameController } from './engine/GameController.ts';
import { getFirstLevelId, getNextLevelId } from './engine/LevelSequencer.ts';
import {
  createInitialSessionState,
  markLevelCleared,
  type SessionState,
} from './engine/SessionState.ts';
import {
  createClearOverlay,
  showClearOverlay,
  hideClearOverlay,
  setClearOverlayContent,
} from './ui/ClearOverlay.ts';
import type { LevelData } from './data/LevelSchema.ts';

const cellSize = 60;

const board = document.getElementById('board') as HTMLElement;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let level: LevelData;
let controller: GameController;
let session: SessionState = createInitialSessionState();

function render(): void {
  renderGrid(ctx, level.gridSize, cellSize);
  renderDots(ctx, level.colors, cellSize, PALETTE);
  renderPaths(ctx, controller.getState(), level, cellSize, PALETTE);
}

function showLevelClearOverlay(): void {
  session = markLevelCleared(session, level.id);
  console.log('Cleared levels this session:', Array.from(session.clearedLevelIds));

  const isLastLevel = getNextLevelId(level.id) === null;
  setClearOverlayContent(
    overlay,
    isLastLevel
      ? { message: 'All levels complete!', showButton: false }
      : { message: 'Clear!', showButton: true },
  );
  showClearOverlay(overlay);
}

function loadLevel(id: string): void {
  level = loadLevelById(id);
  canvas.width = level.gridSize.cols * cellSize;
  canvas.height = level.gridSize.rows * cellSize;
  controller = createGameController(level, render, showLevelClearOverlay, () =>
    hideClearOverlay(overlay),
  );
  hideClearOverlay(overlay);
  render();
}

function goToNextLevel(): void {
  const nextLevelId = getNextLevelId(level.id);
  if (nextLevelId !== null) {
    loadLevel(nextLevelId);
  }
}

const overlay = createClearOverlay(goToNextLevel);
board.appendChild(overlay);

loadLevel(getFirstLevelId());

attachInputHandler(
  canvas,
  () => level,
  () => controller.getState(),
  (clickCell, prevState, newState) => {
    controller.handleClickResult(prevState, newState, () => {
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
    });
  },
);
