import type { LevelIndex } from '../data/LevelSchema.ts';

let levelIndex: LevelIndex = [];

/** Injects the level index the sequencer orders by; call once at startup. */
export function initLevelSequencer(index: LevelIndex): void {
  levelIndex = index;
}

function getOrderedLevelIds(): string[] {
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

export function getNextLevelId(currentLevelId: string): string | null {
  const ids = getOrderedLevelIds();
  const index = ids.indexOf(currentLevelId);
  if (index === -1 || index === ids.length - 1) {
    return null;
  }
  return ids[index + 1] ?? null;
}
