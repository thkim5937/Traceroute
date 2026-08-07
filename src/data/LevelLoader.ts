import type { LevelData, LevelIndex } from './LevelSchema.ts';
import indexData from '../levels/index.json';

const levelModules = import.meta.glob<LevelData>(
  ['../levels/hand/*.json', '../levels/generated/*.json'],
  { eager: true, import: 'default' },
);

export function loadLevelIndex(): LevelIndex {
  return indexData as LevelIndex;
}

export function loadLevelById(id: string): LevelData {
  const entry = loadLevelIndex().find((e) => e.id === id);
  if (entry === undefined) {
    throw new Error(`Level not found: ${id}`);
  }
  const level = levelModules[`../levels/${entry.origin}/${id}.json`];
  if (level === undefined) {
    throw new Error(`Level not found: ${id}`);
  }
  return level;
}
