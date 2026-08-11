// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  isLevelReached,
  buildLevelListEntries,
  formatStars,
  createLevelListScreen,
  showLevelListScreen,
  hideLevelListScreen,
  isLevelListScreenVisible,
  renderLevelListScreen,
} from '../src/ui/LevelListScreen';
import { getResumeLevelId, initLevelSequencer } from '../src/engine/LevelSequencer';
import type { LevelIndex } from '../src/data/LevelSchema';

describe('isLevelReached', () => {
  it('is true for a cleared level', () => {
    expect(isLevelReached('a', new Set(['a']), 'b')).toBe(true);
  });

  it('is true for the currently-loaded level even if not cleared', () => {
    expect(isLevelReached('b', new Set(['a']), 'b')).toBe(true);
  });

  it('is false for a level that is neither cleared nor current', () => {
    expect(isLevelReached('c', new Set(['a']), 'b')).toBe(false);
  });
});

describe('buildLevelListEntries', () => {
  const orderedIds = ['a', 'b', 'c'];
  const cleared = new Set(['a']);
  const bestStars = { a: 2.75 };

  it('marks reached, current, and star fields per level', () => {
    expect(buildLevelListEntries(orderedIds, cleared, 'b', bestStars)).toEqual([
      { id: 'a', reached: true, current: false, stars: 2.75 },
      { id: 'b', reached: true, current: true, stars: null },
      { id: 'c', reached: false, current: false, stars: null },
    ]);
  });
});

describe('formatStars', () => {
  it('rounds to the nearest 0.5', () => {
    expect(formatStars(2.75)).toBe('★ 3');
    expect(formatStars(2.4)).toBe('★ 2.5');
    expect(formatStars(1)).toBe('★ 1');
  });
});

describe('LevelListScreen overlay', () => {
  it('is not visible right after creation', () => {
    const overlay = createLevelListScreen(() => {});
    expect(isLevelListScreenVisible(overlay)).toBe(false);
  });

  it('becomes visible after showLevelListScreen and hidden again after hideLevelListScreen', () => {
    const overlay = createLevelListScreen(() => {});
    showLevelListScreen(overlay);
    expect(isLevelListScreenVisible(overlay)).toBe(true);
    hideLevelListScreen(overlay);
    expect(isLevelListScreenVisible(overlay)).toBe(false);
  });

  it('renders one item per level, disabling unreached levels', () => {
    const overlay = createLevelListScreen(() => {});
    renderLevelListScreen(overlay, ['a', 'b', 'c'], new Set(['a']), 'b', { a: 2 });

    const items = overlay.querySelectorAll<HTMLButtonElement>('.level-list-overlay__item');
    expect(items).toHaveLength(3);
    expect(items[0].disabled).toBe(false);
    expect(items[1].disabled).toBe(false);
    expect(items[2].disabled).toBe(true);
    expect(items[0].querySelector('.level-list-overlay__stars')?.textContent).toBe('★ 2');
    expect(items[1].querySelector('.level-list-overlay__stars')).toBeNull();
  });

  it('re-populates on each render call, reflecting updated cleared/star state', () => {
    const overlay = createLevelListScreen(() => {});
    renderLevelListScreen(overlay, ['a', 'b'], new Set(), 'a', {});
    expect(
      overlay.querySelectorAll<HTMLButtonElement>('.level-list-overlay__item')[1].disabled,
    ).toBe(true);

    renderLevelListScreen(overlay, ['a', 'b'], new Set(['a']), 'b', { a: 3 });
    const items = overlay.querySelectorAll<HTMLButtonElement>('.level-list-overlay__item');
    expect(items).toHaveLength(2);
    expect(items[1].disabled).toBe(false);
  });

  it('invokes onSelectLevel with the clicked reached level id and not for disabled levels', () => {
    const onSelectLevel = vi.fn();
    const overlay = createLevelListScreen(onSelectLevel);
    renderLevelListScreen(overlay, ['a', 'b'], new Set(['a']), 'a', {});

    const items = overlay.querySelectorAll<HTMLButtonElement>('.level-list-overlay__item');
    items[1].click();
    expect(onSelectLevel).not.toHaveBeenCalled();

    items[0].click();
    expect(onSelectLevel).toHaveBeenCalledWith('a');
  });
});

describe('resume-on-reload reached state', () => {
  const fixture: LevelIndex = [
    { id: 'a', difficultyScore: 1, origin: 'hand' },
    { id: 'b', difficultyScore: 2, origin: 'hand' },
    { id: 'c', difficultyScore: 3, origin: 'hand' },
    { id: 'd', difficultyScore: 4, origin: 'hand' },
  ];

  it('marks the resumed level and everything before it as reached after a simulated reload', () => {
    initLevelSequencer(fixture);
    const clearedLevelIds = new Set(['a', 'b']);
    const resumedLevelId = getResumeLevelId(clearedLevelIds);
    expect(resumedLevelId).toBe('c');

    const orderedIds = ['a', 'b', 'c', 'd'];
    const entries = buildLevelListEntries(orderedIds, clearedLevelIds, resumedLevelId, {});
    expect(entries).toEqual([
      { id: 'a', reached: true, current: false, stars: null },
      { id: 'b', reached: true, current: false, stars: null },
      { id: 'c', reached: true, current: true, stars: null },
      { id: 'd', reached: false, current: false, stars: null },
    ]);
  });
});
