import { describe, it, expect } from 'vitest';
import { detectBounceBackTarget } from '../src/render/Animations';
import type { GameState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

const level: LevelData = {
  id: 'bounce-test',
  gridSize: { rows: 4, cols: 4 },
  colors: [
    {
      colorId: 'a',
      endpoints: [
        { row: 1, col: 1 },
        { row: 0, col: 3 },
      ],
    },
    {
      colorId: 'b',
      endpoints: [
        { row: 3, col: 0 },
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

describe('detectBounceBackTarget', () => {
  it('returns the color and tail when a started color is clicked along a self-intersecting column', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 1, col: 1 },
              { row: 1, col: 3 },
              { row: 3, col: 3 },
              { row: 3, col: 1 },
            ],
            completed: false,
          },
        ],
      ]),
      activeColorId: 'a',
    };

    const result = detectBounceBackTarget(state, level, { row: 0, col: 1 });

    expect(result).toEqual({ colorId: 'a', tail: { row: 3, col: 1 } });
  });

  it('returns null for a genuine diagonal click', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([['a', { colorId: 'a', path: [{ row: 1, col: 1 }], completed: false }]]),
      activeColorId: 'a',
    };

    const result = detectBounceBackTarget(state, level, { row: 2, col: 2 });

    expect(result).toBeNull();
  });

  it('returns null for a click on a completed color, even when not aligned with the tail (silent no-op, not a bounce)', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 1, col: 1 },
              { row: 1, col: 3 },
              { row: 3, col: 3 },
              { row: 3, col: 1 },
            ],
            completed: true,
          },
        ],
      ]),
      activeColorId: 'a',
    };

    // (1,2) is a mid-path cell on the completed color, and shares neither
    // row nor col with the tail (3,1) — a completed color's click is always
    // a silent no-op, never a bounce-back target.
    const result = detectBounceBackTarget(state, level, { row: 1, col: 2 });

    expect(result).toBeNull();
  });

  it('returns null for a click on a completed color that IS aligned with the tail (still a silent no-op, not a bounce)', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map([
        [
          'a',
          {
            colorId: 'a',
            path: [
              { row: 1, col: 1 },
              { row: 1, col: 3 },
              { row: 3, col: 3 },
              { row: 3, col: 1 },
            ],
            completed: true,
          },
        ],
      ]),
      activeColorId: 'a',
    };

    // (0,1) shares column 1 with the tail (3,1) — the same click that would
    // trigger a bounce-back for an incomplete color must stay silent here.
    const result = detectBounceBackTarget(state, level, { row: 0, col: 1 });

    expect(result).toBeNull();
  });

  it('returns null when the targeted color has not been started yet', () => {
    const state: GameState = {
      levelId: level.id,
      paths: new Map(),
      activeColorId: null,
    };

    const result = detectBounceBackTarget(state, level, { row: 3, col: 0 }); // b's endpoint, unstarted

    expect(result).toBeNull();
  });
});
