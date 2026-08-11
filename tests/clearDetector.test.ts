import { describe, it, expect } from 'vitest';
import {
  isColorComplete,
  updateCompletionStatus,
  isBoardClear,
  computeStarRating,
} from '../src/engine/ClearDetector';
import type { GameState, ColorPathState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

const level: LevelData = {
  id: 'test-level',
  gridSize: { rows: 6, cols: 6 },
  colors: [
    {
      colorId: 'red',
      endpoints: [
        { row: 0, col: 0 },
        { row: 0, col: 3 },
      ],
    },
    {
      colorId: 'blue',
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

const redComplete: ColorPathState = {
  colorId: 'red',
  path: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
  ],
  completed: false,
};

const blueComplete: ColorPathState = {
  colorId: 'blue',
  path: [
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ],
  completed: false,
};

describe('isColorComplete', () => {
  it('is true when the path fully connects both endpoints with adjacent cells', () => {
    expect(isColorComplete(redComplete, level.colors[0])).toBe(true);
  });

  it('is false when the path has not yet reached the second endpoint', () => {
    const midPath: ColorPathState = {
      colorId: 'red',
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      completed: false,
    };
    expect(isColorComplete(midPath, level.colors[0])).toBe(false);
  });
});

describe('isBoardClear', () => {
  it('is true only when every color is complete', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        ['red', redComplete],
        ['blue', blueComplete],
      ]),
      activeColorId: null,
    };
    expect(isBoardClear(state, level)).toBe(true);
  });

  it('is false when even one color is incomplete', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        ['red', redComplete],
        [
          'blue',
          {
            colorId: 'blue',
            path: [{ row: 1, col: 0 }],
            completed: false,
          },
        ],
      ]),
      activeColorId: null,
    };
    expect(isBoardClear(state, level)).toBe(false);
  });
});

describe('updateCompletionStatus', () => {
  it('returns the same state reference when nothing changed', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        ['red', { ...redComplete, completed: true }],
        ['blue', { ...blueComplete, completed: true }],
      ]),
      activeColorId: null,
    };
    const result = updateCompletionStatus(state, level);
    expect(result).toBe(state);
  });

  it('marks a fully connected color as completed', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        ['red', redComplete],
        ['blue', blueComplete],
      ]),
      activeColorId: null,
    };
    const result = updateCompletionStatus(state, level);
    expect(result.paths.get('red')?.completed).toBe(true);
    expect(result.paths.get('blue')?.completed).toBe(true);
  });

  it('re-evaluates a trimmed, previously-complete color back to false', () => {
    const trimmedState: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'red',
          {
            colorId: 'red',
            path: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
            completed: true,
          },
        ],
        ['blue', blueComplete],
      ]),
      activeColorId: null,
    };

    expect(isColorComplete(trimmedState.paths.get('red')!, level.colors[0])).toBe(false);

    const result = updateCompletionStatus(trimmedState, level);
    expect(result.paths.get('red')?.completed).toBe(false);
  });
});

describe('computeStarRating', () => {
  // redComplete has 4 cells (3 edges), blueComplete has 3 cells (2 edges): total edge count 5.
  const clearedState: GameState = {
    levelId: level.id,
    paths: new Map([
      ['red', redComplete],
      ['blue', blueComplete],
    ]),
    activeColorId: null,
  };

  it('sums edge counts (cells - 1) across all colors, not raw cell counts', () => {
    const result = computeStarRating(clearedState, { ...level, minTotalEdgeLength: 5 }, 0);
    expect(result).toBe(3);
  });

  it('awards 3 stars exactly at the ×1.0 threshold', () => {
    expect(computeStarRating(clearedState, { ...level, minTotalEdgeLength: 5 }, 0)).toBe(3);
  });

  it('awards 2 stars between the ×1.0 and ×1.3 thresholds', () => {
    // min=4: ×1.0 = 4, ×1.3 = 5.2; total edge count 5 falls strictly between.
    expect(computeStarRating(clearedState, { ...level, minTotalEdgeLength: 4 }, 0)).toBe(2);
  });

  it('awards 1 star above the ×1.3 threshold', () => {
    // min=3: ×1.3 = 3.9; total edge count 5 exceeds it.
    expect(computeStarRating(clearedState, { ...level, minTotalEdgeLength: 3 }, 0)).toBe(1);
  });
});

describe('computeStarRating hint penalty', () => {
  // Same shape as the clearedState above: total edge count 5, efficiencyStars 3.
  const clearedState: GameState = {
    levelId: level.id,
    paths: new Map([
      ['red', redComplete],
      ['blue', blueComplete],
    ]),
    activeColorId: null,
  };
  const perfectLevel = { ...level, minTotalEdgeLength: 5 };

  it('0 hints leaves the efficiency-based rating unchanged', () => {
    expect(computeStarRating(clearedState, perfectLevel, 0)).toBe(3);
  });

  it('deducts 0.25 per hint at several hint counts', () => {
    expect(computeStarRating(clearedState, perfectLevel, 1)).toBe(2.75);
    expect(computeStarRating(clearedState, perfectLevel, 2)).toBe(2.5);
    expect(computeStarRating(clearedState, perfectLevel, 3)).toBe(2.25);
    expect(computeStarRating(clearedState, perfectLevel, 4)).toBe(2);
  });

  it('never drops below the 1.0 floor', () => {
    expect(computeStarRating(clearedState, perfectLevel, 8)).toBe(1);
    expect(computeStarRating(clearedState, perfectLevel, 100)).toBe(1);
  });
});
