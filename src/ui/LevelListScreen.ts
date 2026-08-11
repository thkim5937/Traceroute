const VISIBLE_CLASS = 'level-list-overlay--visible';

export interface LevelListEntry {
  id: string;
  reached: boolean;
  current: boolean;
  stars: number | null;
}

/** A level is reached (clickable) once cleared or if it's the level currently loaded. */
export function isLevelReached(
  levelId: string,
  clearedLevelIds: ReadonlySet<string>,
  currentLevelId: string,
): boolean {
  return clearedLevelIds.has(levelId) || levelId === currentLevelId;
}

export function buildLevelListEntries(
  orderedLevelIds: string[],
  clearedLevelIds: ReadonlySet<string>,
  currentLevelId: string,
  bestStars: Record<string, number>,
): LevelListEntry[] {
  return orderedLevelIds.map((id) => ({
    id,
    reached: isLevelReached(id, clearedLevelIds, currentLevelId),
    current: id === currentLevelId,
    stars: bestStars[id] ?? null,
  }));
}

/** No polished star icons yet (still just a number) — round to the nearest 0.5 for a readable label. */
export function formatStars(stars: number): string {
  return `★ ${Math.round(stars * 2) / 2}`;
}

export function createLevelListScreen(onSelectLevel: (id: string) => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'level-list-overlay';

  const panel = document.createElement('div');
  panel.className = 'level-list-overlay__panel';
  overlay.appendChild(panel);

  const list = document.createElement('div');
  list.className = 'level-list-overlay__list';
  panel.appendChild(list);

  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>('.level-list-overlay__item');
    const id = item?.dataset.levelId;
    if (id !== undefined) onSelectLevel(id);
  });

  return overlay;
}

/** Repopulates the level list; call every time the overlay is opened since cleared/star state changes over play. */
export function renderLevelListScreen(
  overlay: HTMLElement,
  orderedLevelIds: string[],
  clearedLevelIds: ReadonlySet<string>,
  currentLevelId: string,
  bestStars: Record<string, number>,
): void {
  const list = overlay.querySelector('.level-list-overlay__list');
  if (list === null) return;
  list.innerHTML = '';

  for (const entry of buildLevelListEntries(
    orderedLevelIds,
    clearedLevelIds,
    currentLevelId,
    bestStars,
  )) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'level-list-overlay__item';
    if (entry.current) item.classList.add('level-list-overlay__item--current');
    item.dataset.levelId = entry.id;
    item.disabled = !entry.reached;

    const label = document.createElement('span');
    label.textContent = entry.id;
    item.appendChild(label);

    if (entry.stars !== null) {
      const stars = document.createElement('span');
      stars.className = 'level-list-overlay__stars';
      stars.textContent = formatStars(entry.stars);
      item.appendChild(stars);
    }

    list.appendChild(item);
  }
}

export function showLevelListScreen(overlay: HTMLElement): void {
  overlay.classList.add(VISIBLE_CLASS);
}

export function hideLevelListScreen(overlay: HTMLElement): void {
  overlay.classList.remove(VISIBLE_CLASS);
}

export function isLevelListScreenVisible(overlay: HTMLElement): boolean {
  return overlay.classList.contains(VISIBLE_CLASS);
}
