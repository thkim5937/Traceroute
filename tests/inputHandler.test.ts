// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { pixelToCell, attachInputHandler } from '../src/render/InputHandler';
import type { GameState } from '../src/engine/GameState';
import type { Coord, LevelData } from '../src/data/LevelSchema';

const cellSize = 60;

const level: LevelData = {
  id: 'input-test',
  gridSize: { rows: 6, cols: 6 },
  colors: [
    {
      colorId: 'a',
      endpoints: [
        { row: 0, col: 0 },
        { row: 5, col: 5 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [],
  minTotalEdgeLength: 0,
};

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = level.gridSize.cols * cellSize;
  canvas.height = level.gridSize.rows * cellSize;
  // jsdom doesn't lay out elements, so getBoundingClientRect must be mocked
  // to reflect the canvas's own pixel dimensions.
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: canvas.width,
      bottom: canvas.height,
      width: canvas.width,
      height: canvas.height,
      x: 0,
      y: 0,
      toJSON: () => '',
    }) as DOMRect;
  return canvas;
}

function dispatchPointerDown(canvas: HTMLCanvasElement, clientX: number, clientY: number): void {
  const event =
    typeof PointerEvent === 'function'
      ? new PointerEvent('pointerdown', { clientX, clientY, bubbles: true })
      : new MouseEvent('pointerdown', { clientX, clientY, bubbles: true });
  canvas.dispatchEvent(event);
}

describe('pixelToCell', () => {
  it('returns the correct cell for a click in the center of a known cell', () => {
    const canvas = makeCanvas();

    const result = pixelToCell(canvas, level, 3 * cellSize + 30, 2 * cellSize + 30);

    expect(result).toEqual({ row: 2, col: 3 });
  });

  it('returns null for coordinates outside the grid bounds', () => {
    const canvas = makeCanvas();

    const result = pixelToCell(canvas, level, canvas.width + 10, 30);

    expect(result).toBeNull();
  });
});

describe('attachInputHandler', () => {
  it('calls onClick with the clicked cell, prevState, and a new GameState when landing on an endpoint', () => {
    const canvas = makeCanvas();
    const state: GameState = { levelId: level.id, paths: new Map(), activeColorId: null };
    const onClick = vi.fn();

    attachInputHandler(canvas, () => level, () => state, onClick);
    dispatchPointerDown(canvas, 30, 30); // center of cell (row 0, col 0)

    expect(onClick).toHaveBeenCalledTimes(1);
    const [clickCell, prevState, newState] = onClick.mock.calls[0] as [Coord, GameState, GameState];
    expect(clickCell).toEqual({ row: 0, col: 0 });
    expect(prevState).toBe(state);
    expect(newState).not.toBe(state);
    expect(newState.paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
  });

  it('calls onClick with newState === prevState for a no-op (diagonal) click', () => {
    const canvas = makeCanvas();
    let state: GameState = { levelId: level.id, paths: new Map(), activeColorId: null };
    const onClick = vi.fn((_clickCell: Coord, _prevState: GameState, newState: GameState) => {
      state = newState;
    });

    attachInputHandler(canvas, () => level, () => state, onClick);
    dispatchPointerDown(canvas, 30, 30); // start path at (row 0, col 0)
    dispatchPointerDown(canvas, 3 * cellSize + 30, 2 * cellSize + 30); // diagonal click at (row 2, col 3)

    expect(onClick).toHaveBeenCalledTimes(2);
    const [secondClickCell, secondPrevState, secondNewState] = onClick.mock.calls[1] as [
      Coord,
      GameState,
      GameState,
    ];
    expect(secondClickCell).toEqual({ row: 2, col: 3 });
    expect(secondNewState).toBe(secondPrevState);
  });

  it('does not call onClick when the pointerdown lands outside the grid', () => {
    const canvas = makeCanvas();
    const state: GameState = { levelId: level.id, paths: new Map(), activeColorId: null };
    const onClick = vi.fn();

    attachInputHandler(canvas, () => level, () => state, onClick);
    dispatchPointerDown(canvas, canvas.width + 10, 30);

    expect(onClick).not.toHaveBeenCalled();
  });
});
