// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  loadSaveData,
  saveSaveData,
  applyBestStars,
  type SaveData,
} from '../src/engine/ProgressStore.ts';

const KEY = 'numberlink:save:v1';

describe('ProgressStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadSaveData', () => {
    it('returns the default when the key is missing', () => {
      expect(loadSaveData()).toEqual({ version: 1, clearedLevelIds: [], bestStars: {} });
    });

    it('returns the default when the stored value is not valid JSON', () => {
      localStorage.setItem(KEY, 'not json{');
      expect(loadSaveData()).toEqual({ version: 1, clearedLevelIds: [], bestStars: {} });
    });

    it('returns the default when the version is wrong', () => {
      localStorage.setItem(KEY, JSON.stringify({ version: 2, clearedLevelIds: [], bestStars: {} }));
      expect(loadSaveData()).toEqual({ version: 1, clearedLevelIds: [], bestStars: {} });
    });

    it('returns the default when clearedLevelIds is not an array', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, clearedLevelIds: 'nope', bestStars: {} }),
      );
      expect(loadSaveData()).toEqual({ version: 1, clearedLevelIds: [], bestStars: {} });
    });

    it('returns the parsed data when valid', () => {
      const data: SaveData = {
        version: 1,
        clearedLevelIds: ['level-1', 'level-2'],
        bestStars: { 'level-1': 3 },
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      expect(loadSaveData()).toEqual(data);
    });
  });

  describe('saveSaveData', () => {
    it('round-trips data through loadSaveData', () => {
      const data: SaveData = {
        version: 1,
        clearedLevelIds: ['level-1'],
        bestStars: { 'level-1': 2 },
      };
      saveSaveData(data);
      expect(loadSaveData()).toEqual(data);
    });

    it('does not throw when localStorage.setItem throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => saveSaveData({ version: 1, clearedLevelIds: [], bestStars: {} })).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('applyBestStars', () => {
    it('records a rating for a level with no prior best', () => {
      expect(applyBestStars({}, 'level-1', 2)).toEqual({ 'level-1': 2 });
    });

    it('overwrites when the new rating is higher', () => {
      expect(applyBestStars({ 'level-1': 1 }, 'level-1', 3)).toEqual({ 'level-1': 3 });
    });

    it('does not downgrade when a worse rating is recorded afterward', () => {
      expect(applyBestStars({ 'level-1': 3 }, 'level-1', 1)).toEqual({ 'level-1': 3 });
    });

    it('leaves an equal rating unchanged', () => {
      const bestStars = { 'level-1': 2 as const };
      expect(applyBestStars(bestStars, 'level-1', 2)).toEqual({ 'level-1': 2 });
    });

    it('does not affect other levels', () => {
      expect(applyBestStars({ 'level-1': 3 }, 'level-2', 1)).toEqual({
        'level-1': 3,
        'level-2': 1,
      });
    });

    it('compares fractional star ratings correctly (hint-penalized values)', () => {
      expect(applyBestStars({ 'level-1': 2.25 }, 'level-1', 2.5)).toEqual({ 'level-1': 2.5 });
      expect(applyBestStars({ 'level-1': 2.5 }, 'level-1', 2.25)).toEqual({ 'level-1': 2.5 });
    });
  });

  describe('old-format saves', () => {
    it('loads a stored SaveData with integer bestStars values (pre-hint-penalty format)', () => {
      const oldData = {
        version: 1,
        clearedLevelIds: ['level-1', 'level-2'],
        bestStars: { 'level-1': 3, 'level-2': 1 },
      };
      localStorage.setItem(KEY, JSON.stringify(oldData));
      expect(loadSaveData()).toEqual(oldData);
    });
  });
});
