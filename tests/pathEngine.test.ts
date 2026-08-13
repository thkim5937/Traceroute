import { describe, it, expect } from 'vitest';
import {
  handleCellClick,
  handleGridClick,
  resolveColorIdForClick,
  isOccupiedByOtherColor,
} from '../src/engine/PathEngine';
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
  it('restarts at the other endpoint when a blocked extension targets it, since only the lone starting dot is placed', () => {
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

    // The straight extension is blocked by b's endpoint dot at (0,1), but
    // (0,2) is one of a's own endpoints and no edge has been drawn yet, so
    // this restarts the path there instead of no-op'ing (Fix 3).
    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 2 }]);
    expect(state.activeColorId).toBe('a');
  });

  it("restarts at the other endpoint when another color's already-drawn path blocks the extension", () => {
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

    // Blocked by b's drawn path at (0,1), but (0,2) is a's own endpoint and
    // no edge has been drawn yet, so this restarts there instead (Fix 3).
    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 2 }]);
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

  it('freezes a completed color: clicking a point that used to be a valid trim now leaves GameState completely unchanged', () => {
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

    const state: GameState = {
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

    const result = handleCellClick(state, level, 'a', { row: 0, col: 1 });

    expect(result).toBe(state);
    expect(result.paths.get('a')).toBe(state.paths.get('a'));
    expect(result.paths.get('a')?.completed).toBe(true);
  });

  it('freezes a completed color: attempting to extend it further leaves GameState completely unchanged', () => {
    const level: LevelData = {
      id: 'test-level-extend-completed',
      gridSize: { rows: 1, cols: 5 },
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
      levelId: 'test-level-extend-completed',
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
      activeColorId: 'a',
    };

    const result = handleCellClick(state, level, 'a', { row: 0, col: 4 });

    expect(result).toBe(state);
    expect(result.paths.get('a')).toBe(state.paths.get('a'));
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

  it('extends normally when the existing path state has no matching color definition in level.colors', () => {
    const level: LevelData = {
      id: 'test-level-no-color-def',
      gridSize: { rows: 3, cols: 3 },
      colors: [],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };

    const state: GameState = {
      levelId: 'test-level-no-color-def',
      paths: new Map([
        ['ghost', { colorId: 'ghost', path: [{ row: 0, col: 0 }], completed: false }],
      ]),
      activeColorId: 'ghost',
    };

    const result = handleCellClick(state, level, 'ghost', { row: 0, col: 2 });

    expect(result.paths.get('ghost')?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
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

  it("restarts at the other endpoint when another color's non-endpoint path cell blocks the extension", () => {
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

    // Blocked by b's non-endpoint path cell at (2,1), but (3,1) is a's own
    // endpoint and no edge has been drawn yet, so this restarts there (Fix 3).
    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 3, col: 1 }]);
    expect(state.activeColorId).toBe('a');
  });

  it('completes the path when clicking exactly on its own remaining endpoint in a straight line', () => {
    const level: LevelData = {
      id: 'test-level-own-endpoint-exact',
      gridSize: { rows: 4, cols: 6 },
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
      levelId: 'test-level-own-endpoint-exact',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 3 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('stops exactly at its own remaining endpoint when the click overshoots past it, in the same direction', () => {
    const level: LevelData = {
      id: 'test-level-own-endpoint-overshoot',
      gridSize: { rows: 4, cols: 6 },
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
      levelId: 'test-level-own-endpoint-overshoot',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 5 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('stops exactly at its own remaining endpoint when the click overshoots past it, vertically', () => {
    const level: LevelData = {
      id: 'test-level-own-endpoint-overshoot-vertical',
      gridSize: { rows: 6, cols: 4 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 3, col: 0 },
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
      levelId: 'test-level-own-endpoint-overshoot-vertical',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 5, col: 0 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
    ]);
    expect(state.activeColorId).toBe('a');
  });

  it('does not block ordinary multi-segment extension away from the starting endpoint', () => {
    const level: LevelData = {
      id: 'test-level-own-start-no-false-block',
      gridSize: { rows: 4, cols: 4 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 3, col: 3 },
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
      levelId: 'test-level-own-start-no-false-block',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 2 });
    state = handleCellClick(state, level, 'a', { row: 2, col: 2 });

    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]);
    expect(state.activeColorId).toBe('a');
  });
});

describe('obstacles.blockedCells', () => {
  it('restarts at the other endpoint when a blocked cell obstructs the extension', () => {
    const level: LevelData = {
      id: 'test-level-blocked-cell',
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
      obstacles: { blockedCells: [{ row: 0, col: 2 }], blockedEdges: [] },
    };

    let state: GameState = {
      levelId: 'test-level-blocked-cell',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, level, 'a', { row: 0, col: 0 });
    state = handleCellClick(state, level, 'a', { row: 0, col: 3 });

    // Blocked by the obstacle at (0,2), but (0,3) is a's own endpoint and no
    // edge has been drawn yet, so this restarts there instead (Fix 3).
    const colorStateA = state.paths.get('a');
    expect(colorStateA?.path).toEqual([{ row: 0, col: 3 }]);
    expect(state.activeColorId).toBe('a');
  });

  it('leaves non-obstacle levels (no obstacles field) unaffected', () => {
    let state: GameState = {
      levelId: 'test',
      paths: new Map(),
      activeColorId: null,
    };

    state = handleCellClick(state, fakeLevel, 'test', { row: 0, col: 0 });
    state = handleCellClick(state, fakeLevel, 'test', { row: 0, col: 3 });

    expect(state.paths.get('test')?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
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

describe('multi-endpoint colors (TRD §5.15)', () => {
  const multiEndpointLevel: LevelData = {
    id: 'test-level-multi-endpoint',
    gridSize: { rows: 3, cols: 3 },
    colors: [
      {
        colorId: 'a',
        endpoints: [
          { row: 0, col: 0 },
          { row: 0, col: 2 },
          { row: 2, col: 0 },
        ],
      },
    ],
    origin: 'hand',
    difficultyTag: 'easy',
    difficultyScore: 0,
    solution: [],
    minTotalEdgeLength: 0,
  };

  it('handleCellClick starts a new path when clicking the third endpoint of an unstarted color', () => {
    const state: GameState = {
      levelId: 'test-level-multi-endpoint',
      paths: new Map(),
      activeColorId: null,
    };

    const result = handleCellClick(state, multiEndpointLevel, 'a', { row: 2, col: 0 });

    expect(result.paths.get('a')?.path).toEqual([{ row: 2, col: 0 }]);
    expect(result.activeColorId).toBe('a');
  });

  it("isOccupiedByOtherColor returns true when a cell matches another color's third endpoint", () => {
    const level: LevelData = {
      id: 'test-level-multi-endpoint-occupied',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'a',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
            { row: 2, col: 0 },
          ],
        },
        {
          colorId: 'b',
          endpoints: [
            { row: 1, col: 1 },
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

    const state: GameState = {
      levelId: 'test-level-multi-endpoint-occupied',
      paths: new Map(),
      activeColorId: null,
    };

    expect(isOccupiedByOtherColor(state, level, 'b', { row: 2, col: 0 })).toBe(true);
  });

  it('resolveColorIdForClick resolves to an unstarted color when the click lands on its third endpoint', () => {
    const state: GameState = {
      levelId: 'test-level-multi-endpoint',
      paths: new Map(),
      activeColorId: null,
    };

    expect(resolveColorIdForClick(state, multiEndpointLevel, { row: 2, col: 0 })).toBe('a');
  });

  const switchStartLevel: LevelData = {
    id: 'test-level-switch-start',
    gridSize: { rows: 3, cols: 3 },
    colors: [
      {
        colorId: 'a',
        endpoints: [
          { row: 0, col: 0 },
          { row: 2, col: 1 },
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

  it('handleCellClick restarts at a different own endpoint when only the lone starting dot is placed', () => {
    const state: GameState = {
      levelId: 'test-level-switch-start',
      paths: new Map(),
      activeColorId: null,
    };

    const afterA = handleCellClick(state, switchStartLevel, 'a', { row: 0, col: 0 });
    expect(afterA.paths.get('a')?.path).toEqual([{ row: 0, col: 0 }]);

    // (2,1) is neither row- nor col-aligned with (0,0) -- not aligned, so
    // this would normally no-op.
    const afterB = handleCellClick(afterA, switchStartLevel, 'a', { row: 2, col: 1 });
    expect(afterB.paths.get('a')?.path).toEqual([{ row: 2, col: 1 }]);
  });

  it('handleCellClick does NOT restart at a different own endpoint once a real edge is drawn', () => {
    const state: GameState = {
      levelId: 'test-level-switch-start',
      paths: new Map(),
      activeColorId: null,
    };

    const afterA = handleCellClick(state, switchStartLevel, 'a', { row: 0, col: 0 });
    const afterExtend = handleCellClick(afterA, switchStartLevel, 'a', { row: 0, col: 2 });
    expect(afterExtend.paths.get('a')?.path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);

    // (2,1) is neither row- nor col-aligned with the tail (0,2) -- not
    // aligned, and a real edge already exists, so this must bounce (no-op),
    // not restart the path.
    const afterAttempt = handleCellClick(afterExtend, switchStartLevel, 'a', { row: 2, col: 1 });
    expect(afterAttempt).toBe(afterExtend);
  });
});
