export interface SaveData {
  version: 1;
  clearedLevelIds: string[];
  /** TRD §4/§5.9: star rating per level, 1.0-3.0 in 0.25 steps after hint penalty. */
  bestStars: Record<string, number>;
}

const STORAGE_KEY = 'numberlink:save:v1';

function defaultSaveData(): SaveData {
  return { version: 1, clearedLevelIds: [], bestStars: {} };
}

function isValidSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.clearedLevelIds) &&
    typeof candidate.bestStars === 'object' &&
    candidate.bestStars !== null
  );
}

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultSaveData();
    const parsed: unknown = JSON.parse(raw);
    return isValidSaveData(parsed) ? parsed : defaultSaveData();
  } catch {
    return defaultSaveData();
  }
}

/** Records a level's star rating only if it beats the previously recorded best. */
export function applyBestStars(
  bestStars: Record<string, number>,
  levelId: string,
  newStars: number,
): Record<string, number> {
  const existing = bestStars[levelId];
  if (existing !== undefined && existing >= newStars) {
    return bestStars;
  }
  return { ...bestStars, [levelId]: newStars };
}

export function saveSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // no-op: a failed save must never crash the game or interrupt play
  }
}
