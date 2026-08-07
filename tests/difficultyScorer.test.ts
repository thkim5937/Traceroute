import { describe, it, expect } from 'vitest';
import {
  computeRawScore,
  countTurns,
  scoreDifficulty,
  calibrateBatch,
  meetsMinRawScore,
  TURN_WEIGHT,
} from '../src/solver/DifficultyScorer';
import type { Coord } from '../src/data/LevelSchema';

describe('countTurns', () => {
  it('counts 0 turns for a straight path', () => {
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ];
    expect(countTurns(path)).toBe(0);
  });

  it('counts 1 turn for an L-shaped path', () => {
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ];
    expect(countTurns(path)).toBe(1);
  });

  it('counts multiple turns for a zigzag path', () => {
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ];
    expect(countTurns(path)).toBe(3);
  });

  it('returns 0 for paths shorter than 3 coords', () => {
    expect(countTurns([{ row: 0, col: 0 }])).toBe(0);
    expect(
      countTurns([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ]),
    ).toBe(0);
  });
});

describe('computeRawScore', () => {
  it('sums edge count for a single straight-path color', () => {
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ];
    // edgeCount = 2, turns = 0
    expect(computeRawScore([path])).toBe(2);
  });

  it('adds TURN_WEIGHT * turns on top of edge count', () => {
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
    ];
    // edgeCount = 3, turns = 1
    expect(computeRawScore([path])).toBe(3 + TURN_WEIGHT * 1);
  });

  it('sums contributions across multiple colors', () => {
    const straight: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ];
    const lShaped: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ];
    const zigzag: Coord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ];
    const expected =
      2 + // straight: edges=2, turns=0
      (2 + TURN_WEIGHT * 1) + // lShaped: edges=2, turns=1
      (4 + TURN_WEIGHT * 3); // zigzag: edges=4, turns=3
    expect(computeRawScore([straight, lShaped, zigzag])).toBe(expected);
  });
});

describe('scoreDifficulty', () => {
  it('produces exact expected difficultyScore/difficultyTag for hand-computed cases', () => {
    // normalized = 0 -> round(0*99)+1 = 1 -> easy
    expect(scoreDifficulty(0, 0, 10)).toEqual({ difficultyScore: 1, difficultyTag: 'easy' });
    // normalized = 1 -> round(1*99)+1 = 100 -> hard
    expect(scoreDifficulty(10, 0, 10)).toEqual({ difficultyScore: 100, difficultyTag: 'hard' });
    // normalized = 0.5 -> round(0.5*99)+1 = round(49.5)+1 = 50+1 = 51 -> medium (51 <= 66)
    expect(scoreDifficulty(5, 0, 10)).toEqual({ difficultyScore: 51, difficultyTag: 'medium' });
  });

  it('keeps difficultyScore clamped to 1-100 even for rawScore outside the observed range', () => {
    expect(scoreDifficulty(-100, 0, 10)).toEqual({ difficultyScore: 1, difficultyTag: 'easy' });
    expect(scoreDifficulty(1000, 0, 10)).toEqual({ difficultyScore: 100, difficultyTag: 'hard' });
  });

  it('has correct tag boundaries exactly at difficultyScore 33, 34, 66, 67', () => {
    // difficultyScore = round(normalized*99)+1 => normalized = (difficultyScore-1)/99
    const scoreFor = (difficultyScore: number) => (difficultyScore - 1) / 99;

    expect(scoreDifficulty(scoreFor(33), 0, 1)).toEqual({
      difficultyScore: 33,
      difficultyTag: 'easy',
    });
    expect(scoreDifficulty(scoreFor(34), 0, 1)).toEqual({
      difficultyScore: 34,
      difficultyTag: 'medium',
    });
    expect(scoreDifficulty(scoreFor(66), 0, 1)).toEqual({
      difficultyScore: 66,
      difficultyTag: 'medium',
    });
    expect(scoreDifficulty(scoreFor(67), 0, 1)).toEqual({
      difficultyScore: 67,
      difficultyTag: 'hard',
    });
  });

  it('does not throw when observedMax === observedMin, and treats normalized as 0', () => {
    expect(() => scoreDifficulty(5, 5, 5)).not.toThrow();
    // normalized treated as 0 -> round(0*99)+1 = 1 -> easy
    expect(scoreDifficulty(5, 5, 5)).toEqual({ difficultyScore: 1, difficultyTag: 'easy' });
    expect(scoreDifficulty(0, 0, 0)).toEqual({ difficultyScore: 1, difficultyTag: 'easy' });
  });
});

describe('meetsMinRawScore', () => {
  it('rejects a rawScore below the threshold', () => {
    expect(meetsMinRawScore(47, 48)).toBe(false);
  });

  it('accepts a rawScore exactly at the threshold', () => {
    expect(meetsMinRawScore(48, 48)).toBe(true);
  });

  it('accepts a rawScore above the threshold', () => {
    expect(meetsMinRawScore(49, 48)).toBe(true);
  });
});

describe('calibrateBatch', () => {
  it('returns the min and max of a sample array', () => {
    expect(calibrateBatch([3, 1, 4, 1, 5, 9, 2, 6])).toEqual({ observedMin: 1, observedMax: 9 });
  });

  it('handles a single-element array (min === max)', () => {
    expect(calibrateBatch([7])).toEqual({ observedMin: 7, observedMax: 7 });
  });

  it('handles negative rawScores, which are mathematically possible since Math.log10(x) < 0 for 0 < x < 1', () => {
    // computeRawScore(nodeCount) = log10(nodeCount + 1) is >= 0 for all integer nodeCount >= 0,
    // but calibrateBatch itself must still work correctly on any raw score array, including
    // ones containing negative values (e.g. from a differently-scaled raw score in future use).
    expect(calibrateBatch([-2.5, 0, 3.1, -10])).toEqual({ observedMin: -10, observedMax: 3.1 });
  });
});
