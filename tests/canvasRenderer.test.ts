// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderPaths, renderBlockedCells, renderGrid } from '../src/render/CanvasRenderer';
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
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
  };
}

describe('renderGrid', () => {
  it('draws border lines at the right and bottom edges, not just left and top', () => {
    const ctx = makeMockCtx();
    const gridSize = { rows: 3, cols: 3 };

    renderGrid(ctx as unknown as CanvasRenderingContext2D, gridSize, cellSize);

    const width = gridSize.cols * cellSize;
    const height = gridSize.rows * cellSize;

    const allCalls = [...ctx.moveTo.mock.calls, ...ctx.lineTo.mock.calls];
    const maxX = Math.max(...allCalls.map((call) => call[0] as number));
    const maxY = Math.max(...allCalls.map((call) => call[1] as number));

    expect(maxX).toBeLessThanOrEqual(width);
    expect(maxY).toBeLessThanOrEqual(height);
    expect(maxX).toBeGreaterThan(width - 1);
    expect(maxY).toBeGreaterThan(height - 1);
  });
});

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

describe('renderBlockedCells', () => {
  it('fills a square for each blocked cell when present', () => {
    const ctx = makeMockCtx();

    renderBlockedCells(
      ctx as unknown as CanvasRenderingContext2D,
      [
        { row: 0, col: 1 },
        { row: 2, col: 0 },
      ],
      cellSize,
    );

    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 60, 0, 60, 60);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 120, 60, 60);
  });

  it('draws nothing extra when a level has no obstacles field (blockedCells undefined)', () => {
    const ctx = makeMockCtx();

    renderBlockedCells(ctx as unknown as CanvasRenderingContext2D, undefined, cellSize);

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws every cell of a multi-cell rectangular obstacle, forming a visually contiguous block', () => {
    const ctx = makeMockCtx();
    // A 2x3 rectangle at top-left (1,1).
    const rectangle = [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ];

    renderBlockedCells(ctx as unknown as CanvasRenderingContext2D, rectangle, cellSize);

    expect(ctx.fillRect).toHaveBeenCalledTimes(rectangle.length);
    for (const { row, col } of rectangle) {
      expect(ctx.fillRect).toHaveBeenCalledWith(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  });
});
