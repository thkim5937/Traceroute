import { updateCompletionStatus, isBoardClear } from './ClearDetector.ts';
import { applyHint } from './HintEngine.ts';
import type { HintResult } from './HintEngine.ts';
import type { GameState } from './GameState.ts';
import type { LevelData } from '../data/LevelSchema.ts';

export function createFreshState(level: LevelData): GameState {
  return { levelId: level.id, paths: new Map(), activeColorId: null };
}

/**
 * Resolves which color should receive the next hint.
 * - If `state.activeColorId` is set and not completed, return it.
 * - Otherwise return the first color in `level.colors` order that is not completed
 *   (a color with no path entry counts as not completed).
 * - If every color is completed, return null.
 */
export function resolveHintTargetColorId(state: GameState, level: LevelData): string | null {
  const active = state.activeColorId;
  if (active !== null && state.paths.get(active)?.completed !== true) {
    return active;
  }
  for (const colorDef of level.colors) {
    if (state.paths.get(colorDef.colorId)?.completed !== true) {
      return colorDef.colorId;
    }
  }
  return null;
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
  useHint: (colorId?: string) => void;
  getHintUseCount: () => number;
}

export function createGameController(
  level: LevelData,
  render: () => void,
  showOverlay: () => void,
  hideOverlay: () => void,
  nudgeUndo: () => void = () => {},
): GameController {
  let state = createFreshState(level);
  let clear = false;
  let past: GameState[] = [];
  let future: GameState[] = [];
  let hintUseCount = 0;

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
    hintUseCount = 0;
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

  function useHint(colorId?: string): void {
    if (clear) return;
    const resolved = colorId ?? resolveHintTargetColorId(state, level);
    if (resolved === null) return;
    const colorPathState = state.paths.get(resolved);
    // No-op for completed colors (TRD §5.1 rule 1 / PRD item 10.5).
    if (colorPathState?.completed === true) return;

    const result: HintResult = applyHint(level, resolved, state);
    if (result.status === 'noop') return;
    if (result.status === 'stuck') {
      nudgeUndo();
      return; // no state change, no render, no undo-stack push
    }

    const newPaths = new Map(state.paths);
    newPaths.set(resolved, { colorId: resolved, path: result.newPath, completed: false });
    const nextState: GameState = { ...state, paths: newPaths, activeColorId: resolved };

    hintUseCount += 1;
    past.push(state);
    future = [];
    state = updateCompletionStatus(nextState, level);
    render();
    if (isBoardClear(state, level)) {
      clear = true;
      showOverlay();
    }
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
    useHint,
    getHintUseCount: () => hintUseCount,
  };
}
