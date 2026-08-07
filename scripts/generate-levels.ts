import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { generateSolvableBoard } from '../src/generator/generateSolvableBoard.ts';
import { solve, type SolverLimits, type SolverResult } from '../src/solver/Solver.ts';
import {
  computeRawScore,
  calibrateBatch,
  scoreDifficulty,
} from '../src/solver/DifficultyScorer.ts';
import { assignColorIds } from '../src/palette/assignColorIds.ts';
import { buildLevelData } from '../src/data/buildLevelData.ts';
import type { BoardResult } from '../src/generator/BoardGenerator.ts';
import type { Coord, LevelData, LevelIndex } from '../src/data/LevelSchema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HAND_LEVELS_DIR = path.join(__dirname, '../src/levels/hand');
const GENERATED_LEVELS_DIR = path.join(__dirname, '../src/levels/generated');
const LEVEL_INDEX_PATH = path.join(__dirname, '../src/levels/index.json');
const CALIBRATION_CONSTANTS_PATH = path.join(__dirname, '../src/solver/calibrationConstants.ts');
const HAND_LEVEL_IDS = ['hand-01', 'hand-02', 'hand-03', 'hand-04', 'hand-05', 'hand-06'];

// TRD §5.5 (2026-08-05 update): pipeline-only solver limit override, used for
// every solve()/generateSolvableBoard() call in this script so hard instances
// like hand-05 aren't excluded by Solver.ts's tight interactive-demo defaults
// (SOLVER_NODE_LIMIT/SOLVER_TIME_LIMIT_MS, which stay untouched for §5.10's
// live demo screen).
export const PIPELINE_SOLVER_NODE_LIMIT = 15_000_000;
export const PIPELINE_SOLVER_TIME_LIMIT_MS = 90_000;
const PIPELINE_SOLVER_LIMITS: SolverLimits = {
  nodeLimit: PIPELINE_SOLVER_NODE_LIMIT,
  timeLimitMs: PIPELINE_SOLVER_TIME_LIMIT_MS,
};

// TRD §5.13 (2026-08-06 revision): 44 generated specs in 4 tiers of 11, each
// fixing gridSize/colorCount.
export interface GeneratedLevelSpec {
  id: string;
  gridSize: { rows: number; cols: number };
  colorCount: number;
  /** TRD §5.14/§5.11: v1 obstacle support, populated for 30 of the 44 generated specs. */
  blockedCells?: Coord[];
}

function generatedTier(
  startNum: number,
  endNum: number,
  gridSize: { rows: number; cols: number },
  colorCount: number,
): GeneratedLevelSpec[] {
  const specs: GeneratedLevelSpec[] = [];
  for (let n = startNum; n <= endNum; n++) {
    specs.push({ id: `gen-${String(n).padStart(4, '0')}`, gridSize, colorCount });
  }
  return specs;
}

function obstacleRange(start: number, end: number, count: number): [string, number][] {
  const entries: [string, number][] = [];
  for (let n = start; n <= end; n++) entries.push([`gen-${String(n).padStart(4, '0')}`, count]);
  return entries;
}

// Final tier spec table (2026-08-06 revision): tier 1 (gen-0001-gen-0011)
// gets no obstacles; every other tier gets blockedCells ramping 3/5/6/7/8/9
// across its sub-range. 33 of 44 total.
const OBSTACLE_SPEC_COUNTS: Record<string, number> = Object.fromEntries([
  ...obstacleRange(12, 14, 3),
  ...obstacleRange(15, 22, 5),
  ...obstacleRange(23, 33, 6),
  ...obstacleRange(34, 37, 7),
  ...obstacleRange(38, 41, 8),
  ...obstacleRange(42, 44, 9),
]);

// TRD §5.14 (2026-08-05 update): if fillGridWithRetry exhausts its 200-attempt
// budget for an obstacle-tier spec's blockedCells draw, reroll a fresh
// blockedCells set and retry with a full fresh budget, up to this many total
// draws. Applies uniformly to all 30 obstacle-tier specs -- see collectGeneratedRecord.
export const OBSTACLE_BLOCKED_CELLS_REROLL_LIMIT = 5;

function randomBlockedCells(
  gridSize: { rows: number; cols: number },
  count: number,
  avoid: Coord[] = [],
): Coord[] {
  const avoidKeys = new Set(avoid.map((c) => `${c.row},${c.col}`));
  const all: Coord[] = [];
  for (let row = 0; row < gridSize.rows; row++) {
    for (let col = 0; col < gridSize.cols; col++) {
      if (!avoidKeys.has(`${row},${col}`)) {
        all.push({ row, col });
      }
    }
  }
  for (let i = all.length - 1; i > all.length - 1 - count; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = all[i]!;
    all[i] = all[j]!;
    all[j] = temp;
  }
  return all.slice(all.length - count);
}

// Section 6 (multi-cell obstacles v2): a rectangular obstacle shape, in (rows, cols) cells.
const OBSTACLE_RECTANGLE_SHAPES: { rows: number; cols: number }[] = [
  { rows: 2, cols: 2 },
  { rows: 2, cols: 3 },
  { rows: 3, cols: 2 },
];

export function randomObstacleRectangle(gridSize: { rows: number; cols: number }): Coord[] {
  const shape =
    OBSTACLE_RECTANGLE_SHAPES[Math.floor(Math.random() * OBSTACLE_RECTANGLE_SHAPES.length)]!;
  const top = Math.floor(Math.random() * (gridSize.rows - shape.rows + 1));
  const left = Math.floor(Math.random() * (gridSize.cols - shape.cols + 1));
  const cells: Coord[] = [];
  for (let r = 0; r < shape.rows; r++) {
    for (let c = 0; c < shape.cols; c++) {
      cells.push({ row: top + r, col: left + c });
    }
  }
  return cells;
}

// Section 6: exactly one of a spec's N blockedCells slots is upgraded to a multi-cell
// rectangle; the remaining N-1 slots stay independent 1x1 cells, as before.
export function randomObstacleBlockedCells(
  gridSize: { rows: number; cols: number },
  count: number,
): Coord[] {
  const rectangle = randomObstacleRectangle(gridSize);
  const singles = randomBlockedCells(gridSize, count - 1, rectangle);
  return [...rectangle, ...singles];
}

export const GENERATED_LEVEL_SPECS: GeneratedLevelSpec[] = [
  ...generatedTier(1, 11, { rows: 5, cols: 5 }, 5),
  ...generatedTier(12, 22, { rows: 6, cols: 6 }, 6),
  ...generatedTier(23, 33, { rows: 7, cols: 7 }, 7),
  ...generatedTier(34, 44, { rows: 8, cols: 8 }, 8),
].map((spec) => {
  const obstacleCount = OBSTACLE_SPEC_COUNTS[spec.id];
  return obstacleCount === undefined
    ? spec
    : { ...spec, blockedCells: randomObstacleBlockedCells(spec.gridSize, obstacleCount) };
});

// Section 6 (difficulty floor): minimum solver-computed rawScore required per major
// tier, one threshold per tier (sub-range splits within tier2/tier4 exist but their
// medians were close enough not to warrant separate thresholds -- see Step 1 report).
// Values are the median rawScore observed across the pre-this-change batch of 43
// generated levels (2026-08-07), computed via DifficultyScorer.computeRawScore on
// each level's stored solution. Boards scoring below their tier's threshold are
// rejected and retried, same mechanism as MIN_TURNS_PER_COLOR.
const MIN_RAW_SCORE_BY_TIER: Record<number, number> = {
  1: 48, // tier1 5x5: n=11, min=41, median=48, max=68
  2: 56, // tier2 6x6: n=11, min=46, median=56, max=68
  3: 71, // tier3 7x7: n=11, min=56, median=71, max=94
  4: 96.5, // tier4 8x8: n=10, min=71, median=96.5, max=117
};

function minRawScoreForSpec(spec: GeneratedLevelSpec): number {
  const tier = spec.gridSize.rows - 4;
  return MIN_RAW_SCORE_BY_TIER[tier]!;
}

type RecordStatus = 'ok' | 'generation-failed' | 'unresolved-after-retries' | 'unsolvable';

export interface LevelSpecRecord {
  id: string;
  origin: 'hand' | 'generated';
  gridSize: { rows: number; cols: number };
  endpoints?: [Coord, Coord][];
  /** Hand levels only: positional colorId for each endpoint pair, since hand levels don't go through assignColorIds again. */
  colorIds?: string[];
  solverResult?: SolverResult;
  rawScore?: number;
  status: RecordStatus;
  /** TRD §5.11: the blockedCells actually used for this record's board, if any. */
  blockedCells?: Coord[];
}

export interface CollectDeps {
  generateSolvableBoard: typeof generateSolvableBoard;
  solve: typeof solve;
}

const defaultDeps: CollectDeps = { generateSolvableBoard, solve };

function readHandLevel(id: string): LevelData {
  const raw = readFileSync(path.join(HAND_LEVELS_DIR, `${id}.json`), 'utf-8');
  return JSON.parse(raw) as LevelData;
}

function classifySolverResult(solverResult: SolverResult): {
  status: RecordStatus;
  rawScore: number;
} {
  const rawScore = computeRawScore(solverResult.solution);
  if (solverResult.status === 'solved') return { status: 'ok', rawScore };
  if (solverResult.status === 'unresolved') {
    // TRD §5.6 revision: an aborted search with a candidate already found is
    // accepted immediately, not excluded -- only a genuinely empty-handed
    // abort still counts as unresolved-after-retries.
    return solverResult.hasSolution
      ? { status: 'ok', rawScore }
      : { status: 'unresolved-after-retries', rawScore };
  }
  return { status: 'unsolvable', rawScore };
}

export function collectGeneratedRecord(
  spec: GeneratedLevelSpec,
  deps: CollectDeps,
): LevelSpecRecord {
  const obstacleCellCount = OBSTACLE_SPEC_COUNTS[spec.id];
  const minRawScoreThreshold = minRawScoreForSpec(spec);
  let blockedCells = spec.blockedCells;
  let result = deps.generateSolvableBoard(
    spec.gridSize,
    spec.colorCount,
    undefined,
    undefined,
    blockedCells,
    PIPELINE_SOLVER_LIMITS,
    minRawScoreThreshold,
  );

  for (
    let draw = 2;
    obstacleCellCount !== undefined &&
    result.status === 'failed' &&
    draw <= OBSTACLE_BLOCKED_CELLS_REROLL_LIMIT;
    draw++
  ) {
    blockedCells = randomObstacleBlockedCells(spec.gridSize, obstacleCellCount);
    result = deps.generateSolvableBoard(
      spec.gridSize,
      spec.colorCount,
      undefined,
      undefined,
      blockedCells,
      PIPELINE_SOLVER_LIMITS,
      minRawScoreThreshold,
    );
  }

  if (
    result.status === 'failed' ||
    result.solverResult === undefined ||
    result.boardResult?.endpoints === undefined
  ) {
    return {
      id: spec.id,
      origin: 'generated',
      gridSize: spec.gridSize,
      status: 'generation-failed',
    };
  }

  const { status, rawScore } = classifySolverResult(result.solverResult);
  return {
    id: spec.id,
    origin: 'generated',
    gridSize: spec.gridSize,
    endpoints: result.boardResult.endpoints,
    solverResult: result.solverResult,
    rawScore,
    status,
    blockedCells,
  };
}

function collectHandRecord(id: string, deps: CollectDeps): LevelSpecRecord {
  const level = readHandLevel(id);
  const endpoints = level.colors.map((c) => c.endpoints);
  const colorIds = level.colors.map((c) => c.colorId);
  const solverResult = deps.solve(level.gridSize, endpoints, PIPELINE_SOLVER_LIMITS);
  const { status, rawScore } = classifySolverResult(solverResult);

  return {
    id: level.id,
    origin: 'hand',
    gridSize: level.gridSize,
    endpoints,
    colorIds,
    solverResult,
    rawScore,
    status,
  };
}

export function collectLevelResults(deps: CollectDeps = defaultDeps): LevelSpecRecord[] {
  const generatedRecords = GENERATED_LEVEL_SPECS.map((spec) => collectGeneratedRecord(spec, deps));
  const handRecords = HAND_LEVEL_IDS.map((id) => collectHandRecord(id, deps));
  return [...generatedRecords, ...handRecords];
}

export interface AssembleResult {
  levels: LevelData[];
  failed: LevelSpecRecord[];
  observedMin: number;
  observedMax: number;
}

// TRD §5.7 Phase 2: normalize rawScores into difficultyScore/Tag and assemble
// the final LevelData batch, per §5.4 step 5 excluding (but still reporting)
// any record that didn't reach a solved state.
export function assembleLevelBatch(records: LevelSpecRecord[]): AssembleResult {
  const ok = records.filter(
    (r) => r.status === 'ok' && r.solverResult !== undefined && r.rawScore !== undefined,
  );
  const failed = records.filter((r) => r.status !== 'ok');

  const { observedMin, observedMax } = calibrateBatch(ok.map((r) => r.rawScore!));

  const levels = ok.map((r) => {
    const boardResult: BoardResult = { success: true, endpoints: r.endpoints, attemptsUsed: 1 };
    const difficultyResult = scoreDifficulty(r.rawScore!, observedMin, observedMax);
    const colorIds = r.origin === 'hand' ? r.colorIds! : assignColorIds(r.endpoints!.length);
    return buildLevelData(
      boardResult,
      r.solverResult!,
      difficultyResult,
      r.gridSize,
      colorIds,
      r.origin,
      r.id,
      undefined,
      r.blockedCells,
    );
  });

  return { levels, failed, observedMin, observedMax };
}

export function buildLevelIndex(levels: LevelData[]): LevelIndex {
  return levels.map((l) => ({ id: l.id, difficultyScore: l.difficultyScore, origin: l.origin }));
}

// TRD §5.7 Phase 2 file-writing shell: writes assembled levels, the sequencing
// index, and the calibration constants used to produce them. Kept separate
// from assembleLevelBatch so the normalize/assemble logic stays unit-testable
// without touching disk.
function writeLevelOutputs(result: AssembleResult): void {
  mkdirSync(GENERATED_LEVELS_DIR, { recursive: true });
  for (const level of result.levels) {
    const dir = level.origin === 'generated' ? GENERATED_LEVELS_DIR : HAND_LEVELS_DIR;
    writeFileSync(path.join(dir, `${level.id}.json`), JSON.stringify(level, null, 2) + '\n');
  }

  writeFileSync(LEVEL_INDEX_PATH, JSON.stringify(buildLevelIndex(result.levels), null, 2) + '\n');

  writeFileSync(
    CALIBRATION_CONSTANTS_PATH,
    `// Auto-generated by scripts/generate-levels.ts (TRD §5.7). Do not edit by hand.\n` +
      `export const observedMin = ${result.observedMin};\n` +
      `export const observedMax = ${result.observedMax};\n`,
  );

  for (const record of result.failed) {
    console.error(`[generate-levels] excluded ${record.id} (status: ${record.status})`);
  }
}

function main(): void {
  const records = collectLevelResults();
  const result = assembleLevelBatch(records);
  writeLevelOutputs(result);
  console.log(
    `Wrote ${result.levels.length} levels (${result.failed.length} excluded) of ${records.length} total specs.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
