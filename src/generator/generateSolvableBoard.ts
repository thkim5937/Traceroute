import {
  generateBoard,
  GENERATOR_RETRY_LIMIT,
  type BoardResult,
  type GenerationStepEvent,
} from './BoardGenerator.ts';
import { solve, type SolverLimits, type SolverResult } from '../solver/Solver.ts';
import { computeRawScore, meetsMinRawScore, meetsMinTurns } from '../solver/DifficultyScorer.ts';
import type { Coord } from '../data/LevelSchema.ts';

export interface SolvableBoardResult {
  status: 'success' | 'failed';
  boardResult?: BoardResult;
  solverResult?: SolverResult;
  totalAttemptsUsed: number;
}

export function generateSolvableBoard(
  gridSize: { rows: number; cols: number },
  colorCount: number,
  onStep?: (event: GenerationStepEvent) => void,
  deps: { generateBoard: typeof generateBoard; solve: typeof solve } = { generateBoard, solve },
  blockedCells?: Coord[],
  limits?: SolverLimits,
  minRawScoreThreshold?: number,
  multiEndpointRequests?: number[],
  overallDeadlineMs?: number,
): SolvableBoardResult {
  let totalUsed = 0;

  for (;;) {
    if (overallDeadlineMs !== undefined && Date.now() > overallDeadlineMs) {
      return { status: 'failed', totalAttemptsUsed: totalUsed };
    }

    const remaining = GENERATOR_RETRY_LIMIT - totalUsed;
    if (remaining <= 0) {
      return { status: 'failed', totalAttemptsUsed: totalUsed };
    }

    const boardResult =
      multiEndpointRequests === undefined
        ? deps.generateBoard(gridSize, colorCount, onStep, remaining, undefined, blockedCells)
        : deps.generateBoard(
            gridSize,
            colorCount,
            onStep,
            remaining,
            undefined,
            blockedCells,
            multiEndpointRequests,
          );
    totalUsed += boardResult.attemptsUsed;

    if (!boardResult.success || boardResult.endpoints === undefined) {
      return { status: 'failed', totalAttemptsUsed: totalUsed };
    }

    const solverResult = deps.solve(gridSize, boardResult.endpoints, limits, blockedCells);
    const accepted = solverResult.status !== 'unresolved' || solverResult.hasSolution;
    const meetsRawScore =
      minRawScoreThreshold === undefined ||
      (solverResult.solution !== undefined &&
        meetsMinRawScore(computeRawScore(solverResult.solution), minRawScoreThreshold));
    if (
      accepted &&
      solverResult.solution !== undefined &&
      meetsMinTurns(solverResult.solution) &&
      meetsRawScore
    ) {
      return { status: 'success', boardResult, solverResult, totalAttemptsUsed: totalUsed };
    }
    // UNRESOLVED with no candidate at all, or a candidate that doesn't meet
    // MIN_TURNS_PER_COLOR (TRD §5.6) or MIN_RAW_SCORE (Section 6 difficulty
    // floor): loop back and regenerate with whatever budget remains.
  }
}
