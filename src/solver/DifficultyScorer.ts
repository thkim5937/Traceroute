import type { Coord } from '../data/LevelSchema.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const TURN_WEIGHT = 5;

export function countTurns(path: Coord[]): number {
  let turns = 0;
  for (let i = 1; i <= path.length - 2; i++) {
    const dPrev = { row: path[i]!.row - path[i - 1]!.row, col: path[i]!.col - path[i - 1]!.col };
    const dNext = { row: path[i + 1]!.row - path[i]!.row, col: path[i + 1]!.col - path[i]!.col };
    if (dPrev.row !== dNext.row || dPrev.col !== dNext.col) turns++;
  }
  return turns;
}

// TRD §5.7 (2026-08-05 revision): raw score is a path-shape sum (edges + weighted
// turns) instead of solver nodeCount, since nodeCount doesn't correlate with a
// level's felt difficulty. No log10 transform here -- this doesn't have
// nodeCount's exponential range.
export function computeRawScore(solution: Coord[][]): number {
  let total = 0;
  for (const path of solution) {
    total += path.length - 1 + TURN_WEIGHT * countTurns(path);
  }
  return total;
}

export function scoreDifficulty(
  rawScore: number,
  observedMin: number,
  observedMax: number,
): { difficultyScore: number; difficultyTag: 'easy' | 'medium' | 'hard' } {
  // observedMax === observedMin (e.g. a calibration batch with zero variance)
  // would divide by zero; treat that as "no signal" and normalize to 0 rather
  // than propagating NaN.
  const normalized =
    observedMax === observedMin
      ? 0
      : clamp((rawScore - observedMin) / (observedMax - observedMin), 0, 1);
  const difficultyScore = Math.round(normalized * 99) + 1;
  // Draft thresholds per TRD §5.7; pending calibration against real batch data (TRD §13).
  const difficultyTag = difficultyScore <= 33 ? 'easy' : difficultyScore <= 66 ? 'medium' : 'hard';
  return { difficultyScore, difficultyTag };
}

// TRD §5.6 (2026-08-05 revision): the solver's found solution -- not the
// generator's discarded snake shape -- must itself be twisty per color,
// since the solver always picks the minimum-total-length solution
// independent of how the board was grown.
export const MIN_TURNS_PER_COLOR = 1;

export function meetsMinTurns(solution: Coord[][]): boolean {
  return solution.every((path) => countTurns(path) >= MIN_TURNS_PER_COLOR);
}

export function meetsMinRawScore(rawScore: number, threshold: number): boolean {
  return rawScore >= threshold;
}

export function calibrateBatch(rawScores: number[]): { observedMin: number; observedMax: number } {
  return {
    observedMin: Math.min(...rawScores),
    observedMax: Math.max(...rawScores),
  };
}
