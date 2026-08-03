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
}

export function createGameController(
  level: LevelData,
  render: () => void,
  showOverlay: () => void,
  hideOverlay: () => void,
): GameController {
  let state = createFreshState(level);
  let clear = false;

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
    hideOverlay();
    render();
  }

  return {
    getState: () => state,
    isClear: () => clear,
    handleClickResult,
    resetLevel,
  };
}
