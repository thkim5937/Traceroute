import './style.css';
import {
  renderGrid,
  renderDots,
  renderPaths,
  renderBlockedCells,
} from './render/CanvasRenderer.ts';
import { attachInputHandler } from './render/InputHandler.ts';
import {
  detectBounceBackTarget,
  detectPathGrowth,
  playBounceBackAnimation,
  playPathGrowthAnimation,
} from './render/Animations.ts';
import { PALETTE } from './palette/palette.ts';
import { loadLevelById, loadLevelIndex } from './data/LevelLoader.ts';
import { createGameController, type GameController } from './engine/GameController.ts';
import {
  getNextLevelId,
  getOrderedLevelIds,
  getResumeLevelId,
  initLevelSequencer,
} from './engine/LevelSequencer.ts';
import {
  createInitialSessionState,
  markLevelCleared,
  type SessionState,
} from './engine/SessionState.ts';
import { loadSaveData, saveSaveData, applyBestStars } from './engine/ProgressStore.ts';
import { computeStarRating } from './engine/ClearDetector.ts';
import {
  createClearOverlay,
  showClearOverlay,
  hideClearOverlay,
  setClearOverlayContent,
} from './ui/ClearOverlay.ts';
import { createControlBar, setControlBarState, pulseUndoButton } from './ui/ControlBar.ts';
import { createHintButton } from './ui/HintButton.ts';
import { createListButton, setListButtonOpen } from './ui/ListButton.ts';
import {
  createLevelListScreen,
  renderLevelListScreen,
  showLevelListScreen,
  hideLevelListScreen,
  isLevelListScreenVisible,
} from './ui/LevelListScreen.ts';
import type { Coord, LevelData } from './data/LevelSchema.ts';
import type { GameState } from './engine/GameState.ts';

const cellSize = 60;

const appHeader = document.getElementById('app-header') as HTMLElement;
const board = document.getElementById('board') as HTMLElement;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let level: LevelData;
let controller: GameController;
const saveData = loadSaveData();
let session: SessionState = saveData.clearedLevelIds.reduce(
  markLevelCleared,
  createInitialSessionState(),
);

// Set immediately before a click's `controller.handleClickResult()` call
// when that click was a pure single-cell path extension (see
// `detectPathGrowth`), so the very next `render()` call -- fired
// synchronously inside `handleClickResult` -- plays a growth animation
// instead of snapping the new segment in instantly (Section 9 polish item).
let pendingGrowth: {
  colorId: string;
  from: Coord;
  addedCells: Coord[];
  priorState: GameState;
} | null = null;

function drawBoard(state: GameState): void {
  renderGrid(ctx, level.gridSize, cellSize);
  renderBlockedCells(ctx, level.obstacles?.blockedCells, cellSize);
  renderDots(ctx, level.colors, cellSize, PALETTE);
  renderPaths(ctx, state, level, cellSize, PALETTE);
}

function syncControlBar(): void {
  setControlBarState(controlBar, { canUndo: controller.canUndo(), canRedo: controller.canRedo() });
}

function render(): void {
  if (pendingGrowth !== null) {
    const growth = pendingGrowth;
    pendingGrowth = null;
    playPathGrowthAnimation(
      ctx,
      growth.priorState,
      level,
      cellSize,
      PALETTE,
      growth.colorId,
      growth.from,
      growth.addedCells,
      () => {
        drawBoard(controller.getState());
        syncControlBar();
      },
    );
    return;
  }
  drawBoard(controller.getState());
  syncControlBar();
}

function showLevelClearOverlay(): void {
  session = markLevelCleared(session, level.id);
  console.log('Cleared levels this session:', Array.from(session.clearedLevelIds));

  const newStars = computeStarRating(controller.getState(), level, controller.getHintUseCount());
  saveData.bestStars = applyBestStars(saveData.bestStars, level.id, newStars);

  saveSaveData({
    version: 1,
    clearedLevelIds: Array.from(session.clearedLevelIds),
    bestStars: saveData.bestStars,
  });

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
  controller = createGameController(
    level,
    render,
    showLevelClearOverlay,
    () => hideClearOverlay(overlay),
    () => pulseUndoButton(controlBar),
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

function openLevelList(): void {
  renderLevelListScreen(
    levelListOverlay,
    getOrderedLevelIds(),
    session.clearedLevelIds,
    level.id,
    saveData.bestStars,
  );
  showLevelListScreen(levelListOverlay);
  setListButtonOpen(listButton, true);
}

function closeLevelList(): void {
  hideLevelListScreen(levelListOverlay);
  setListButtonOpen(listButton, false);
}

function toggleLevelList(): void {
  if (isLevelListScreenVisible(levelListOverlay)) {
    closeLevelList();
  } else {
    openLevelList();
  }
}

const overlay = createClearOverlay(goToNextLevel);
board.appendChild(overlay);

const levelListOverlay = createLevelListScreen((id) => {
  loadLevel(id);
  closeLevelList();
});
board.appendChild(levelListOverlay);

const controlBar = createControlBar({
  onUndo: () => controller.undo(),
  onRedo: () => controller.redo(),
  onClear: () => controller.clearBoard(),
});
board.appendChild(controlBar);

const hintButton = createHintButton(() => controller);
board.appendChild(hintButton);

const listButton = createListButton(toggleLevelList);
appHeader.appendChild(listButton);

initLevelSequencer(loadLevelIndex());
loadLevel(getResumeLevelId(session.clearedLevelIds));

attachInputHandler(
  canvas,
  () => level,
  () => controller.getState(),
  (clickCell, prevState, newState) => {
    const growth = detectPathGrowth(prevState, level, clickCell, newState);
    if (growth !== null) {
      pendingGrowth = { ...growth, priorState: prevState };
      controller.handleClickResult(prevState, newState);
      return;
    }
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
