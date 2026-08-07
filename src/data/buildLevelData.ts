import type { Coord, LevelData } from './LevelSchema';
import type { BoardResult } from '../generator/BoardGenerator';
import type { SolverResult } from '../solver/Solver';

export function buildLevelData(
  boardResult: BoardResult,
  solverResult: SolverResult,
  difficultyResult: { difficultyScore: number; difficultyTag: 'easy' | 'medium' | 'hard' },
  gridSize: { rows: number; cols: number },
  colorIds: string[],
  origin: 'hand' | 'generated',
  id: string,
  handDraftOrder?: number,
  blockedCells?: Coord[],
): LevelData {
  if (!boardResult.success || boardResult.endpoints === undefined) {
    throw new Error('buildLevelData: boardResult.success is false');
  }
  const hasSolution = solverResult.hasSolution ?? solverResult.status === 'solved';
  if (!hasSolution || solverResult.solution === undefined) {
    throw new Error(
      `buildLevelData: solverResult has no solution (status '${solverResult.status}')`,
    );
  }

  const endpoints = boardResult.endpoints;
  const solution = solverResult.solution;
  const colorCount = endpoints.length;
  if (colorCount !== solution.length) {
    throw new Error(
      `buildLevelData: endpoints length (${colorCount}) does not match solution length (${solution.length})`,
    );
  }

  const colors = colorIds.map((colorId, i) => ({ colorId, endpoints: endpoints[i]! }));
  const solutionByColor = colorIds.map((colorId, i) => ({ colorId, path: solution[i]! }));

  const minTotalEdgeLength = solution.reduce((sum, path) => sum + (path.length - 1), 0);

  return {
    id,
    gridSize,
    colors,
    origin,
    difficultyTag: difficultyResult.difficultyTag,
    difficultyScore: difficultyResult.difficultyScore,
    handDraftOrder,
    solution: solutionByColor,
    minTotalEdgeLength,
    obstacles: blockedCells === undefined ? undefined : { blockedCells, blockedEdges: [] },
  };
}
