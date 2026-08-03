import { describe, it, expect } from 'vitest';
import {
  createInitialSessionState,
  markLevelCleared,
  isLevelCleared,
} from '../src/engine/SessionState';

describe('createInitialSessionState', () => {
  it('starts with an empty clearedLevelIds set', () => {
    const session = createInitialSessionState();
    expect(session.clearedLevelIds.size).toBe(0);
  });
});

describe('markLevelCleared', () => {
  it('adds a new level id and returns a new reference', () => {
    const session = createInitialSessionState();

    const result = markLevelCleared(session, 'hand-01');

    expect(result).not.toBe(session);
    expect(result.clearedLevelIds.has('hand-01')).toBe(true);
    expect(session.clearedLevelIds.has('hand-01')).toBe(false);
  });

  it('returns the exact same reference when the level is already cleared', () => {
    const session = createInitialSessionState();
    const afterFirstMark = markLevelCleared(session, 'hand-01');

    const afterSecondMark = markLevelCleared(afterFirstMark, 'hand-01');

    expect(afterSecondMark).toBe(afterFirstMark);
  });
});

describe('isLevelCleared', () => {
  it('returns false for a level that has not been cleared', () => {
    const session = createInitialSessionState();
    expect(isLevelCleared(session, 'hand-01')).toBe(false);
  });

  it('returns true for a level that has been cleared', () => {
    const session = markLevelCleared(createInitialSessionState(), 'hand-01');
    expect(isLevelCleared(session, 'hand-01')).toBe(true);
  });
});
