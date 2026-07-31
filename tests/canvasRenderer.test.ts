// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderPaths } from '../src/render/CanvasRenderer';
import type { GameState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

const cellSize = 60;

const level: LevelData = {
  id: 'render-paths-test',
  gridSize: { rows: 3, cols: 3 },
  colors: [
    {
      colorId: 'a',
      endpoints: [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [],
  minTotalEdgeLength: 0,
};

const palette = { a: '#123456' };

function makeMockCtx() {
  return {
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
}

describe('renderPaths', () => {
  it('strokes a line through each cell center for a drawn path', () => {
    const ctx = makeMockCtx();
    const gameState: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
              { row: 0, col: 2 },
            ],
            completed: false,
          },
        ],
      ]),
      activeColorId: 'a',
    };

    renderPaths(ctx as unknown as CanvasRenderingContext2D, gameState, level, cellSize, palette);

    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(30, 30);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 90, 30);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 150, 30);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.strokeStyle).toBe('#123456');
  });

  it('skips colors with an empty path', () => {
    const ctx = makeMockCtx();
    const gameState: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [], completed: false }]]),
      activeColorId: null,
    };

    renderPaths(ctx as unknown as CanvasRenderingContext2D, gameState, level, cellSize, palette);

    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
