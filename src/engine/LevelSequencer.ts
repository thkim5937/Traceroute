import type { LevelIndex } from '../data/LevelSchema.ts';

let levelIndex: LevelIndex = [];

/** Injects the level index the sequencer orders by; call once at startup. */
export function initLevelSequencer(index: LevelIndex): void {
  levelIndex = index;
}

export function getOrderedLevelIds(): string[] {
  return [...levelIndex]
    .sort((a, b) => a.difficultyScore - b.difficultyScore || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

export function getFirstLevelId(): string {
  const [first] = getOrderedLevelIds();
  if (first === undefined) {
    throw new Error('No levels found in the level index');
  }
  return first;
}

/** First not-yet-cleared level in order; if everything is cleared, the last level. */
export function getResumeLevelId(clearedLevelIds: ReadonlySet<string>): string {
  const ids = getOrderedLevelIds();
  const firstUncleared = ids.find((id) => !clearedLevelIds.has(id));
  if (firstUncleared !== undefined) return firstUncleared;
  const last = ids[ids.length - 1];
  if (last === undefined) {
    throw new Error('No levels found in the level index');
  }
  return last;
}

export function getNextLevelId(currentLevelId: string): string | null {
  const ids = getOrderedLevelIds();
  const index = ids.indexOf(currentLevelId);
  if (index === -1 || index === ids.length - 1) {
    return null;
  }
  return ids[index + 1] ?? null;
}
