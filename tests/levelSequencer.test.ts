import { describe, it, expect, beforeEach } from 'vitest';
import { getFirstLevelId, getNextLevelId, initLevelSequencer } from '../src/engine/LevelSequencer';
import type { LevelIndex } from '../src/data/LevelSchema';

const fixture: LevelIndex = [
  { id: 'gen-0003', difficultyScore: 5, origin: 'generated' },
  { id: 'hand-01', difficultyScore: 1, origin: 'hand' },
  { id: 'hand-02', difficultyScore: 1, origin: 'hand' },
  { id: 'gen-0001', difficultyScore: 3, origin: 'generated' },
];

beforeEach(() => {
  initLevelSequencer(fixture);
});

describe('getFirstLevelId', () => {
  it('returns the lowest-difficulty level, tie-broken by id', () => {
    expect(getFirstLevelId()).toBe('hand-01');
  });
});

describe('getNextLevelId', () => {
  it('returns the next level in ascending difficulty order', () => {
    expect(getNextLevelId('hand-01')).toBe('hand-02');
  });

  it('tie-breaks equal difficulty scores by id, lexicographically', () => {
    expect(getNextLevelId('hand-02')).toBe('gen-0001');
  });

  it('returns null for the hardest level in the sequence', () => {
    expect(getNextLevelId('gen-0003')).toBeNull();
  });

  it('returns null for an unrecognized level id', () => {
    expect(getNextLevelId('does-not-exist')).toBeNull();
  });
});
