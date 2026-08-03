import { loadLevelIndex } from '../data/LevelLoader.ts';

/**
 * Temporary placeholder ordering: the declared order of the level index
 * (src/levels/index.json). Section 6.4 will replace this with real
 * difficulty-based ordering once the solver/scorer exists.
 */
export function getOrderedLevelIds(): string[] {
  return loadLevelIndex().map((entry) => entry.id);
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
