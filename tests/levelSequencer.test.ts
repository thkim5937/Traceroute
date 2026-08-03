import { describe, it, expect } from 'vitest';
import { getFirstLevelId, getNextLevelId } from '../src/engine/LevelSequencer';

describe('getFirstLevelId', () => {
  it('returns the first level in the temporary (declared) order', () => {
    expect(getFirstLevelId()).toBe('hand-01');
  });
});

describe('getNextLevelId', () => {
  it('returns the next level id for a middle level', () => {
    expect(getNextLevelId('hand-03')).toBe('hand-04');
  });

  it('returns null for the last level in the sequence', () => {
    expect(getNextLevelId('hand-06')).toBeNull();
  });

  it('returns null for an unrecognized level id', () => {
    expect(getNextLevelId('does-not-exist')).toBeNull();
  });
});
