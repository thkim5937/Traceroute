import { updateCompletionStatus, isBoardClear } from './ClearDetector.ts';
import type { GameState } from './GameState.ts';
import type { LevelData } from '../data/LevelSchema.ts';

export function createFreshState(level: LevelData): GameState {
  return { levelId: level.id, paths: new Map(), activeColorId: null };
}

export interface GameController {
  getState: () => GameState;
  isClear: () => boolean;
  handleClickResult: (prevState: GameState, newState: GameState, onNoOpClick?: () => void) => void;
  resetLevel: () => void;
  undo: () => void;
  redo: () => void;
  clearBoard: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function createGameController(
  level: LevelData,
  render: () => void,
  showOverlay: () => void,
  hideOverlay: () => void,
): GameController {
  let state = createFreshState(level);
  let clear = false;
  let past: GameState[] = [];
  let future: GameState[] = [];

  function syncClearStatus(): void {
    clear = isBoardClear(state, level);
    if (clear) {
      showOverlay();
    } else {
      hideOverlay();
    }
  }

  function handleClickResult(
    prevState: GameState,
    newState: GameState,
    onNoOpClick?: () => void,
  ): void {
    if (clear) {
      return;
    }
    if (newState === prevState) {
      onNoOpClick?.();
      return;
    }
    past.push(state);
    future = [];
    state = updateCompletionStatus(newState, level);
    render();
    if (isBoardClear(state, level)) {
      clear = true;
      showOverlay();
    }
  }

  function resetLevel(): void {
    state = createFreshState(level);
    clear = false;
    past = [];
    future = [];
    hideOverlay();
    render();
  }

  function undo(): void {
    const prevState = past.pop();
    if (prevState === undefined) {
      return;
    }
    future.push(state);
    state = prevState;
    syncClearStatus();
    render();
  }

  function redo(): void {
    const nextState = future.pop();
    if (nextState === undefined) {
      return;
    }
    past.push(state);
    state = nextState;
    syncClearStatus();
    render();
  }

  function clearBoard(): void {
    past.push(state);
    future = [];
    state = createFreshState(level);
    clear = false;
    hideOverlay();
    render();
  }

  return {
    getState: () => state,
    isClear: () => clear,
    handleClickResult,
    resetLevel,
    undo,
    redo,
    clearBoard,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
