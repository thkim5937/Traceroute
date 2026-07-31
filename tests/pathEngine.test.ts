import { describe, it, expect } from 'vitest';
import { handleCellClick, handleGridClick, resolveColorIdForClick } from '../src/engine/PathEngine';
import type { GameState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

const fakeLevel: LevelData = {
  id: 'test-level',
  gridSize: { rows: 6, cols: 6 },
  colors: [
    {
      colorId: 'test',
      endpoints: [
        { row: 0, col: 0 },
        { row: 0, col: 3 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [],
  minTotalEdgeLength: 0,
};

describe('handleCellClick', () => {
  it('starts a path when clicking a colors endpoint', () => {
    const state: GameState = {
      levelId: 'test',
      paths: new Map(),
      activeColorId: null,
    };

    const result = handleCellClick(state, fakeLevel, 'test', { row: 0, col: 0 });

    expect(result.paths.get('test')?.path).toEqual([{ row: 0, col: 0 }]);
  });

  it('extends the path in a straight line to the clicked cell', () => {
    const state: GameState = {
      levelId: 'test',
      paths: new Map(),
      activeColorId: null,
    };

    const afterStart = handleCellClick(state, fakeLevel, 'test', { row: 0, col: 0 });
    const afterExtend = handleCellClick(afterStart, fakeLevel, 'test', { row: 0, col: 3 });

    expect(afterExtend.paths.get('test')?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
  });
  it('ignores diagonal clicks without changing state', () => {
    const level: LevelData = {
      id: 'test-level',
      gridSize: { rows: 6, cols: 6 },
      colors: [
        {
          colorId: 'test',
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

    let state: GameState = {
      levelId: 'test-level',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'test', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'test', { row: 2, col: 2 });

    const colorState = state.paths.get('test');
    expect(colorState?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.activeColorId).toBe('test');
  });
  it("blocks extension into another color's endpoint dot, with no partial change", () => {
    const level: LevelData = {
      id: 'test-level-block-dot',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 0, col: 1 },
            { row: 2, col: 1 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-block-dot',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.activeColorId).toBe('a');
  });

  it("blocks extension into another color's already-drawn path, with no partial change", () => {
    const level: LevelData = {
      id: 'test-level-block-path',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 1, col: 1 },
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

    let state: GameState = {
      levelId: 'test-level-block-path',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'b', { row: 1, col: 1 });
    state = handleCellClick(state, level, 'b', { row: 0, col: 1 });

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.activeColorId).toBe('a');
  });
  it('blocks self-intersecting extension, with no partial change', () => {
    const level: LevelData = {
      id: 'test-level-self-intersect',
      gridSize: { rows: 4, cols: 4 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 1, col: 1 },
            { row: 0, col: 3 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-self-intersect',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 1, col: 1 });
    state = handleCellClick(state, level, 'a', { row: 1, col: 3 });
    state = handleCellClick(state, level, 'a', { row: 3, col: 3 });
    state = handleCellClick(state, level, 'a', { row: 3, col: 1 });

    const beforeAttempt = state.paths.get('a')?.path;
    state = handleCellClick(state, level, 'a', { row: 0, col: 1 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual(beforeAttempt);
    expect(state.activeColorId).toBe('a');
  });
  it('trims the path back to the clicked coordinate', () => {
    const level: LevelData = {
      id: 'test-level-trim',
      gridSize: { rows: 1, cols: 4 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 3 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-trim',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 3 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 1 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('trimming to the current tail leaves the path unchanged', () => {
    const level: LevelData = {
      id: 'test-level-trim-tail',
      gridSize: { rows: 1, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-trim-tail',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('trim reverts a completed color back to incomplete', () => {
    const level: LevelData = {
      id: 'test-level-trim-completed',
      gridSize: { rows: 1, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-trim-completed',
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
            completed: true,
          },
        ],
      ]),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 1 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(colorStateA?.completed).toBe(false);
    expect(state.activeColorId).toBe('a');
  });

  it('trim takes priority over the diagonal no-op rule', () => {
    const level: LevelData = {
      id: 'test-level-trim-diagonal-priority',
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

    let state: GameState = {
      levelId: 'test-level-trim-diagonal-priority',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });
    state = handleCellClick(state, level, 'a', { row: 2, col: 2 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 1 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('starts a new color via endpoint click while another color is active', () => {
    const level: LevelData = {
      id: 'test-level-focus-start',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 2, col: 0 },
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

    let state: GameState = {
      levelId: 'test-level-focus-start',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleGridClick(state, level, { row: 0, col: 0 });
    state = handleGridClick(state, level, { row: 2, col: 0 });

    expect(state.paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.paths.get('b')?.path).toEqual([{ row: 2, col: 0 }]);
    expect(state.activeColorId).toBe('b');
  });

  it('switches focus to another color by clicking its current active tail', () => {
    const level: LevelData = {
      id: 'test-level-focus-switch',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 2, col: 0 },
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

    let state: GameState = {
      levelId: 'test-level-focus-switch',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleGridClick(state, level, { row: 0, col: 0 });
    state = handleGridClick(state, level, { row: 2, col: 0 });
    state = handleGridClick(state, level, { row: 0, col: 0 });

    expect(state.paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.paths.get('b')?.path).toEqual([{ row: 2, col: 0 }]);
    expect(state.activeColorId).toBe('a');
  });

  it('does not switch focus when clicking a non-tail cell of another color, and treats it as blocked instead', () => {
    const level: LevelData = {
      id: 'test-level-focus-blocked',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 1, col: 0 },
            { row: 1, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-focus-blocked',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleGridClick(state, level, { row: 0, col: 0 });
    state = handleGridClick(state, level, { row: 1, col: 0 });
    state = handleGridClick(state, level, { row: 1, col: 2 });
    state = handleGridClick(state, level, { row: 0, col: 0 });

    state = handleGridClick(state, level, { row: 1, col: 0 });

    expect(state.paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);
    expect(state.paths.get('b')?.path).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('is a no-op when the colorId does not exist in level.colors at all', () => {
    const state: GameState = {
      levelId: 'test',
      paths: new Map(),
      activeColorId: null,
    };

    const result = handleCellClick(state, fakeLevel, 'not-a-real-color', { row: 0, col: 0 });

    expect(result.paths.size).toBe(0);
    expect(result.activeColorId).toBeNull();
  });

  it('is a no-op when starting a fresh path on a cell that is not either endpoint', () => {
    const state: GameState = {
      levelId: 'test',
      paths: new Map(),
      activeColorId: null,
    };

    const result = handleCellClick(state, fakeLevel, 'test', { row: 2, col: 2 });

    expect(result.paths.size).toBe(0);
    expect(result.activeColorId).toBeNull();
  });

  it('blocks a horizontal move that self-intersects an earlier segment of its own path', () => {
    const level: LevelData = {
      id: 'test-level-self-intersect-horizontal',
      gridSize: { rows: 4, cols: 6 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 3, col: 5 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-self-intersect-horizontal',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 4 });
    state = handleCellClick(state, level, 'a', { row: 3, col: 4 });
    state = handleCellClick(state, level, 'a', { row: 3, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 2, col: 0 });

    const beforeAttempt = state.paths.get('a')?.path;
    state = handleCellClick(state, level, 'a', { row: 2, col: 5 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual(beforeAttempt);
    expect(state.activeColorId).toBe('a');
  });

  it("blocks extension through another color's already-drawn non-endpoint path cell", () => {
    const level: LevelData = {
      id: 'test-level-block-middle-path',
      gridSize: { rows: 4, cols: 4 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 1 },
            { row: 3, col: 1 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 2, col: 0 },
            { row: 2, col: 3 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    let state: GameState = {
      levelId: 'test-level-block-middle-path',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'b', { row: 2, col: 0 });
    state = handleCellClick(state, level, 'b', { row: 2, col: 3 });

    state = handleCellClick(state, level, 'a', { row: 0, col: 1 });
    state = handleCellClick(state, level, 'a', { row: 3, col: 1 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 1 }]);
    expect(state.activeColorId).toBe('a');
  });
});

describe('handleGridClick', () => {
  it('is a true no-op when there is no active color and the click matches no endpoint or tail', () => {
    const level: LevelData = {
      id: 'test-level-grid-noop',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    const state: GameState = {
      levelId: 'test-level-grid-noop',
      paths: new Map(),
      activeColorId: null,
    };

    const result = handleGridClick(state, level, { row: 1, col: 1 });

    expect(result).toBe(state);
    expect(resolveColorIdForClick(state, level, { row: 1, col: 1 })).toBeUndefined();
  });
});
