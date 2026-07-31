import type { LevelData, LevelIndex } from './LevelSchema.ts';
import indexData from '../levels/index.json';

const levelModules = import.meta.glob<LevelData>(
  ['../levels/hand/*.json', '../levels/generated/*.json'],
  { eager: true, import: 'default' },
);

const levelsById = new Map<string, LevelData>();
for (const level of Object.values(levelModules)) {
  levelsById.set(level.id, level);
}

export function loadLevelIndex(): LevelIndex {
  return indexData as LevelIndex;
}

export function loadLevelById(id: string): LevelData {
  const level = levelsById.get(id);
  if (level === undefined) {
    throw new Error(`Level not found: ${id}`);
  }
  return level;
}
