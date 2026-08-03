export interface SessionState {
  clearedLevelIds: Set<string>;
}

export function createInitialSessionState(): SessionState {
  return { clearedLevelIds: new Set() };
}

export function markLevelCleared(session: SessionState, levelId: string): SessionState {
  if (session.clearedLevelIds.has(levelId)) {
    return session;
  }
  return { clearedLevelIds: new Set(session.clearedLevelIds).add(levelId) };
}

export function isLevelCleared(session: SessionState, levelId: string): boolean {
  return session.clearedLevelIds.has(levelId);
}
