/**
 * A grid coordinate with top-left origin.
 * `row` increases downward, `col` increases rightward.
 */
export interface Coord {
  row: number;
  col: number;
}

/**
 * Represents one Numberlink puzzle level.
 *
 * - `origin`: distinguishes hand-designed levels from procedurally generated ones.
 * - `handDraftOrder`: temporary manual ordering used only before the difficulty-scoring
 *   system exists (Week 10); ignored afterward.
 * - `solution`: the simplest solution path found by the offline pipeline; may be an
 *   approximation if the solver hit its search limit.
 * - `minTotalEdgeLength` and `obstacles`: support Stretch features (star rating,
 *   obstacles) and may be unused until those sections are implemented.
 */
export interface LevelData {
  id: string;
  gridSize: { rows: number; cols: number };
  /**
   * Design invariant (not enforced by the type system): `endpoints` has length 2
   * for most colors. Colors introduced from roughly level 20 onward may be
   * 'multi-endpoint' colors with 3 or 4 endpoints (TRD §5.15).
   */
  colors: { colorId: string; endpoints: Coord[] }[];
  /** Distinguishes hand-designed vs procedurally generated levels. */
  origin: 'hand' | 'generated';
  difficultyTag: 'easy' | 'medium' | 'hard';
  difficultyScore: number;
  /** Temporary manual ordering before difficulty scoring (Week 10); ignored afterward. */
  handDraftOrder?: number;
  /** Simplest solution path from the offline pipeline; may be approximate. */
  solution: { colorId: string; path: Coord[] }[];
  /** Stretch feature (star rating): minimum total edge length across all paths. */
  minTotalEdgeLength: number;
  /** Stretch feature (obstacles): blocked cells and edges on the grid. */
  obstacles?: { blockedCells: Coord[]; blockedEdges: [Coord, Coord][] };
}

/**
 * A lightweight entry in the sequencing index (`src/levels/index.json`).
 * Used to sort and paginate levels without loading full level data.
 * `origin` distinguishes hand-designed vs procedurally generated levels.
 */
export type LevelIndex = { id: string; difficultyScore: number; origin: 'hand' | 'generated' }[];
