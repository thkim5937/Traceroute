// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createClearOverlay,
  showClearOverlay,
  hideClearOverlay,
  isClearOverlayVisible,
  setClearOverlayContent,
} from '../src/ui/ClearOverlay';
import { createGameController } from '../src/engine/GameController';
import type { GameState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

const level: LevelData = {
  id: 'controller-test',
  gridSize: { rows: 2, cols: 2 },
  colors: [
    {
      colorId: 'a',
      endpoints: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [],
  minTotalEdgeLength: 0,
};

const emptyState: GameState = { levelId: level.id, paths: new Map(), activeColorId: null };

describe('ClearOverlay', () => {
  it('is not visible right after creation', () => {
    const overlay = createClearOverlay(() => {});
    expect(isClearOverlayVisible(overlay)).toBe(false);
  });

  it('becomes visible after showClearOverlay and hidden again after hideClearOverlay', () => {
    const overlay = createClearOverlay(() => {});
    showClearOverlay(overlay);
    expect(isClearOverlayVisible(overlay)).toBe(true);
    hideClearOverlay(overlay);
    expect(isClearOverlayVisible(overlay)).toBe(false);
  });

  it('invokes the passed-in callback when the Next Level button is clicked', () => {
    const onNextLevel = vi.fn();
    const overlay = createClearOverlay(onNextLevel);
    const button = overlay.querySelector('button');
    expect(button).not.toBeNull();

    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onNextLevel).toHaveBeenCalledTimes(1);
  });

  it('shows the message and button by default', () => {
    const overlay = createClearOverlay(() => {});
    expect(overlay.querySelector('.clear-overlay__message')?.textContent).toBe('Clear!');
    expect((overlay.querySelector('.clear-overlay__button') as HTMLElement).hidden).toBe(false);
  });

  it('setClearOverlayContent updates the message and can hide the button', () => {
    const overlay = createClearOverlay(() => {});

    setClearOverlayContent(overlay, { message: 'All levels complete!', showButton: false });

    expect(overlay.querySelector('.clear-overlay__message')?.textContent).toBe(
      'All levels complete!',
    );
    expect((overlay.querySelector('.clear-overlay__button') as HTMLElement).hidden).toBe(true);
  });

  it('setClearOverlayContent can show the button again for a normal clear', () => {
    const overlay = createClearOverlay(() => {});

    setClearOverlayContent(overlay, { message: 'All levels complete!', showButton: false });
    setClearOverlayContent(overlay, { message: 'Clear!', showButton: true });

    expect(overlay.querySelector('.clear-overlay__message')?.textContent).toBe('Clear!');
    expect((overlay.querySelector('.clear-overlay__button') as HTMLElement).hidden).toBe(false);
  });
});

describe('createGameController', () => {
  it('does not show the overlay while the board is not clear', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);

    const afterStart: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [{ row: 0, col: 0 }], completed: false }]]),
      activeColorId: 'a',
    };

    controller.handleClickResult(emptyState, afterStart);

    expect(showOverlay).not.toHaveBeenCalled();
    expect(controller.isClear()).toBe(false);
  });

  it('shows the overlay immediately once the state update completes the board', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);

    const afterStart: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [{ row: 0, col: 0 }], completed: false }]]),
      activeColorId: 'a',
    };
    controller.handleClickResult(emptyState, afterStart);

    const afterComplete: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
            completed: false,
          },
        ],
      ]),
      activeColorId: 'a',
    };
    controller.handleClickResult(afterStart, afterComplete);

    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(controller.isClear()).toBe(true);
    expect(controller.getState().paths.get('a')?.completed).toBe(true);
  });

  it('ignores further clicks (no state change, no render) once the board is clear', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);

    const afterComplete: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
            completed: false,
          },
        ],
      ]),
      activeColorId: 'a',
    };
    controller.handleClickResult(emptyState, afterComplete);
    expect(controller.isClear()).toBe(true);
    const renderCallsAfterClear = render.mock.calls.length;
    const stateAfterClear = controller.getState();

    const attemptedEdit: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [{ row: 0, col: 0 }], completed: false }]]),
      activeColorId: 'a',
    };
    controller.handleClickResult(afterComplete, attemptedEdit);

    expect(render.mock.calls.length).toBe(renderCallsAfterClear);
    expect(controller.getState()).toBe(stateAfterClear);
    expect(showOverlay).toHaveBeenCalledTimes(1);
  });

  it('resets to a fresh, unclear state and hides the overlay on resetLevel', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);

    const afterComplete: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
            completed: false,
          },
        ],
      ]),
      activeColorId: 'a',
    };
    controller.handleClickResult(emptyState, afterComplete);
    expect(controller.isClear()).toBe(true);

    controller.resetLevel();

    expect(controller.isClear()).toBe(false);
    expect(controller.getState().paths.size).toBe(0);
    expect(hideOverlay).toHaveBeenCalledTimes(1);
  });

  const afterStart: GameState = {
    levelId: level.id,
    paths: new Map([['a', { colorId: 'a', path: [{ row: 0, col: 0 }], completed: false }]]),
    activeColorId: 'a',
  };
  const afterComplete: GameState = {
    levelId: level.id,
    paths: new Map([
      [
        'a',
        {
          colorId: 'a',
          path: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
          ],
          completed: false,
        },
      ],
    ]),
    activeColorId: 'a',
  };

  it('undo reverts the last committed click and redo re-applies it', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);
    controller.handleClickResult(emptyState, afterStart);

    expect(controller.canUndo()).toBe(true);
    controller.undo();
    expect(controller.getState().paths.size).toBe(0);
    expect(controller.canUndo()).toBe(false);
    expect(controller.canRedo()).toBe(true);

    controller.redo();
    expect(controller.getState().paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
    expect(controller.canRedo()).toBe(false);
  });

  it('a new committed click after undo clears the redo future', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);
    controller.handleClickResult(emptyState, afterStart);
    controller.handleClickResult(afterStart, afterComplete);
    controller.undo();
    expect(controller.canRedo()).toBe(true);

    const differentClick: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [], completed: false }]]),
      activeColorId: null,
    };
    controller.handleClickResult(controller.getState(), differentClick);

    expect(controller.canRedo()).toBe(false);
  });

  it('clearBoard resets to the initial empty state and is itself undoable', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);
    controller.handleClickResult(emptyState, afterStart);

    controller.clearBoard();
    expect(controller.getState().paths.size).toBe(0);
    expect(controller.isClear()).toBe(false);
    expect(hideOverlay).toHaveBeenCalled();

    expect(controller.canUndo()).toBe(true);
    controller.undo();
    expect(controller.getState().paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
  });

  it('undo un-freezes a color that was completed before the reverted click (§5.1 rule 0)', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const showOverlay = vi.fn();
    const hideOverlay = vi.fn();
    const controller = createGameController(level, render, showOverlay, hideOverlay);
    controller.handleClickResult(emptyState, afterStart);
    controller.handleClickResult(afterStart, afterComplete);
    expect(controller.isClear()).toBe(true);

    controller.undo();

    expect(controller.isClear()).toBe(false);
    expect(controller.getState().paths.get('a')?.completed).toBe(false);

    // Freeze check in PathEngine reads state.paths.get(colorId).completed; confirm
    // a click against the now-reverted state is no longer treated as frozen.
    const clickAgain: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [{ row: 0, col: 0 }], completed: false }]]),
      activeColorId: 'a',
    };
    controller.handleClickResult(controller.getState(), clickAgain);
    expect(controller.getState().paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
  });

  it('canUndo/canRedo report false with empty history', () => {
    const render = vi.fn((onSettled?: () => void) => onSettled?.());
    const controller = createGameController(level, render, vi.fn(), vi.fn());
    expect(controller.canUndo()).toBe(false);
    expect(controller.canRedo()).toBe(false);
  });
});
