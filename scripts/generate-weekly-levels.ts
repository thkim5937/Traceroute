import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { generateSolvableBoard } from '../src/generator/generateSolvableBoard.ts';
import type { SolverLimits } from '../src/solver/Solver.ts';
import { scoreDifficulty } from '../src/solver/DifficultyScorer.ts';
import { observedMin, observedMax } from '../src/solver/calibrationConstants.ts';
import { assignColorIds } from '../src/palette/assignColorIds.ts';
import { buildLevelData } from '../src/data/buildLevelData.ts';
import type { BoardResult } from '../src/generator/BoardGenerator.ts';
import type { LevelData, LevelIndex } from '../src/data/LevelSchema.ts';
import {
  TIER_DEFINITIONS,
  classifySolverResult,
  buildLevelIndex,
  HAND_LEVELS_DIR,
  GENERATED_LEVELS_DIR,
  LEVEL_INDEX_PATH,
  PIPELINE_SOLVER_NODE_LIMIT,
  PIPELINE_SOLVER_TIME_LIMIT_MS,
  type TierDefinition,
} from './generate-levels.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEEKLY_SUMMARY_PATH = path.join(__dirname, '../weekly-generation-summary.txt');

// Placeholder defaults -- the developer will tune these once real weekly runs
// give a sense of AI-review pass rates and desired weekly output volume.
export const WEEKLY_LEVELS_PER_RUN = 5;
export const AI_REVIEW_RETRY_LIMIT = 3;

// Distinct from a crash (exit 1): signals "ran fine, nothing approved this
// week" so the workflow can skip opening a PR instead of treating it as a failure.
export const NOTHING_TO_SUBMIT_EXIT_CODE = 2;

const WEEKLY_SOLVER_LIMITS: SolverLimits = {
  nodeLimit: PIPELINE_SOLVER_NODE_LIMIT,
  timeLimitMs: PIPELINE_SOLVER_TIME_LIMIT_MS,
};

export function pickTierForSlot(slotIndex: number): TierDefinition {
  return TIER_DEFINITIONS[slotIndex % TIER_DEFINITIONS.length]!;
}

export interface TierLevelSummary {
  gridSize: { rows: number; cols: number };
  colorCount: number;
  blockedCellCount: number;
  totalEdgeLength: number;
  difficultyScore: number;
}

// Compact per-level summary for the AI review prompt (TRD §13 criterion a) --
// full path/solution data is deliberately left out to keep the prompt small.
export function summarizeSameTierLevels(
  tier: TierDefinition,
  existingLevels: LevelData[],
): TierLevelSummary[] {
  return existingLevels
    .filter(
      (level) =>
        level.gridSize.rows === tier.gridSize.rows &&
        level.gridSize.cols === tier.gridSize.cols &&
        level.colors.length === tier.colorCount,
    )
    .map((level) => ({
      gridSize: level.gridSize,
      colorCount: level.colors.length,
      blockedCellCount: level.obstacles?.blockedCells.length ?? 0,
      totalEdgeLength: level.minTotalEdgeLength,
      difficultyScore: level.difficultyScore,
    }));
}

export function buildReviewPrompt(
  level: LevelData,
  existingSameTierSummary: TierLevelSummary[],
): string {
  return [
    'You are reviewing a candidate Numberlink puzzle level before it ships to players.',
    `Candidate: gridSize ${level.gridSize.rows}x${level.gridSize.cols}, colorCount ${level.colors.length}, ` +
      `blockedCells ${level.obstacles?.blockedCells.length ?? 0}, totalEdgeLength ${level.minTotalEdgeLength}, ` +
      `difficultyScore ${level.difficultyScore}, difficultyTag "${level.difficultyTag}".`,
    `Existing same-tier levels (${existingSameTierSummary.length}): ${JSON.stringify(existingSameTierSummary)}`,
    'Approve only if ALL of the following hold:',
    '1. The candidate is not too similar/duplicative to the existing same-tier levels above.',
    '2. The candidate is subjectively fun and satisfying to solve.',
    '3. The difficultyTag actually match how the level would feel to play, not just the numeric score.',
    '4. difficultyTag is "medium" or "hard" -- reject anything that comes out "easy".',
    'Respond with ONLY compact JSON matching this exact shape: {"approved": boolean, "reasoning": string}. ' +
      'Keep "reasoning" to at most 2 sentences (roughly 40 words).',
  ].join('\n');
}

export interface ReviewApiResult {
  approved: boolean;
  reasoning: string;
}

export interface ReviewDeps {
  callReviewApi: (prompt: string) => Promise<ReviewApiResult>;
}

export function reviewLevel(
  level: LevelData,
  existingSameTierSummary: TierLevelSummary[],
  deps: ReviewDeps,
): Promise<ReviewApiResult> {
  return deps.callReviewApi(buildReviewPrompt(level, existingSameTierSummary));
}

export interface GenerateDeps {
  generateSolvableBoard: typeof generateSolvableBoard;
}

export function generateCandidateLevel(
  tier: TierDefinition,
  provisionalId: string,
  deps: GenerateDeps,
): LevelData | undefined {
  const result = deps.generateSolvableBoard(
    tier.gridSize,
    tier.colorCount,
    undefined,
    undefined,
    undefined,
    WEEKLY_SOLVER_LIMITS,
  );
  if (
    result.status === 'failed' ||
    result.solverResult === undefined ||
    result.boardResult?.endpoints === undefined
  ) {
    return undefined;
  }

  const { status, rawScore } = classifySolverResult(result.solverResult);
  if (status !== 'ok') return undefined;

  const boardResult: BoardResult = {
    success: true,
    endpoints: result.boardResult.endpoints,
    attemptsUsed: 1,
  };
  // Frozen calibration bounds (TRD §13 decision): scoring new weekly levels
  // against these instead of recalibrating avoids retroactively shifting the
  // difficultyScore/star-rating of the 50 levels already shipped to players.
  const difficultyResult = scoreDifficulty(rawScore, observedMin, observedMax);
  const colorIds = assignColorIds(tier.colorCount);
  return buildLevelData(
    boardResult,
    result.solverResult,
    difficultyResult,
    tier.gridSize,
    colorIds,
    'generated',
    provisionalId,
  );
}

export interface SlotAttempt {
  attempt: number;
  approved: boolean;
  reasoning: string;
}

export interface SlotOutcome {
  slotIndex: number;
  tier: TierDefinition;
  approvedLevel?: LevelData;
  attempts: SlotAttempt[];
}

export type WeeklyDeps = GenerateDeps & ReviewDeps;

export async function runSlot(
  slotIndex: number,
  existingLevels: LevelData[],
  deps: WeeklyDeps,
): Promise<SlotOutcome> {
  const tier = pickTierForSlot(slotIndex);
  const summary = summarizeSameTierLevels(tier, existingLevels);
  const attempts: SlotAttempt[] = [];

  for (let attempt = 1; attempt <= AI_REVIEW_RETRY_LIMIT; attempt++) {
    const candidate = generateCandidateLevel(tier, `pending-slot-${slotIndex}`, deps);
    if (candidate === undefined) {
      attempts.push({
        attempt,
        approved: false,
        reasoning: 'candidate generation failed (no solvable board found)',
      });
      continue;
    }

    const review = await reviewLevel(candidate, summary, deps);
    attempts.push({ attempt, approved: review.approved, reasoning: review.reasoning });
    if (review.approved) {
      return { slotIndex, tier, approvedLevel: candidate, attempts };
    }
  }

  return { slotIndex, tier, attempts };
}

// Next id continues after the highest existing gen-XXXX id, offset by how
// many levels have already been approved this run (so approved ids stay
// contiguous -- skipped/rejected slots don't consume an id).
export function nextGeneratedId(index: LevelIndex, offset: number): string {
  const maxNum = index.reduce((max, entry) => {
    const match = /^gen-(\d+)$/.exec(entry.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `gen-${String(maxNum + offset).padStart(4, '0')}`;
}

export interface WeeklyRunResult {
  approvedLevels: LevelData[];
  slotResults: SlotOutcome[];
}

export async function runWeeklyGeneration(
  existingIndex: LevelIndex,
  existingLevels: LevelData[],
  deps: WeeklyDeps,
): Promise<WeeklyRunResult> {
  const approvedLevels: LevelData[] = [];
  const slotResults: SlotOutcome[] = [];
  const allLevels = [...existingLevels];
  let approvedCount = 0;

  for (let slotIndex = 0; slotIndex < WEEKLY_LEVELS_PER_RUN; slotIndex++) {
    const outcome = await runSlot(slotIndex, allLevels, deps);
    if (outcome.approvedLevel === undefined) {
      slotResults.push(outcome);
      console.warn(
        `[generate-weekly-levels] slot ${slotIndex} exhausted retries: ` +
          outcome.attempts.map((a) => a.reasoning).join('; '),
      );
      continue;
    }

    approvedCount++;
    const finalLevel: LevelData = {
      ...outcome.approvedLevel,
      id: nextGeneratedId(existingIndex, approvedCount),
    };
    approvedLevels.push(finalLevel);
    allLevels.push(finalLevel);
    slotResults.push({ ...outcome, approvedLevel: finalLevel });
  }

  return { approvedLevels, slotResults };
}

export function formatSummary(slotResults: SlotOutcome[]): string {
  const approved = slotResults.filter((s) => s.approvedLevel !== undefined);
  const rejected = slotResults.filter((s) => s.approvedLevel === undefined);
  const lines = [
    `Weekly level generation: ${approved.length} approved, ${rejected.length} rejected`,
    '',
    ...slotResults.map((s) => {
      const header =
        `Slot ${s.slotIndex} (tier ${s.tier.gridSize.rows}x${s.tier.gridSize.cols}, colors ${s.tier.colorCount}): ` +
        (s.approvedLevel ? `approved as ${s.approvedLevel.id}` : 'rejected');
      const attemptLines = s.attempts.map(
        (a) => `  attempt ${a.attempt}: ${a.approved ? 'approved' : 'rejected'} -- ${a.reasoning}`,
      );
      return [header, ...attemptLines].join('\n');
    }),
  ];
  return lines.join('\n');
}

function loadExistingLevels(index: LevelIndex): LevelData[] {
  return index.map((entry) => {
    const dir = entry.origin === 'hand' ? HAND_LEVELS_DIR : GENERATED_LEVELS_DIR;
    const raw = readFileSync(path.join(dir, `${entry.id}.json`), 'utf-8');
    return JSON.parse(raw) as LevelData;
  });
}

// Same write pattern as scripts/generate-levels.ts's writeLevelOutputs, but
// appends to the existing index/files instead of overwriting them, and never
// touches calibrationConstants.ts (frozen -- see generateCandidateLevel).
function writeApprovedLevels(approvedLevels: LevelData[], existingIndex: LevelIndex): void {
  for (const level of approvedLevels) {
    writeFileSync(
      path.join(GENERATED_LEVELS_DIR, `${level.id}.json`),
      JSON.stringify(level, null, 2) + '\n',
    );
  }
  const newIndex: LevelIndex = [...existingIndex, ...buildLevelIndex(approvedLevels)];
  writeFileSync(LEVEL_INDEX_PATH, JSON.stringify(newIndex, null, 2) + '\n');
}

export function parseReviewResponse(text: string): ReviewApiResult {
  try {
    const parsed = JSON.parse(text) as Partial<ReviewApiResult>;
    return { approved: Boolean(parsed.approved), reasoning: String(parsed.reasoning ?? '') };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      approved: false,
      reasoning: `AI review response was not valid JSON (${message}); treating as rejected. Raw response (truncated): ${text.slice(0, 200)}`,
    };
  }
}

async function createAnthropicReviewApi(): Promise<(prompt: string) => Promise<ReviewApiResult>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required to run AI level review');
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  return async (prompt: string) => {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1536,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = message.content.find((block) => block.type === 'text');
    return parseReviewResponse(textBlock?.text ?? '{}');
  };
}

async function main(): Promise<void> {
  const existingIndex = JSON.parse(readFileSync(LEVEL_INDEX_PATH, 'utf-8')) as LevelIndex;
  const existingLevels = loadExistingLevels(existingIndex);
  const deps: WeeklyDeps = {
    generateSolvableBoard,
    callReviewApi: await createAnthropicReviewApi(),
  };

  const { approvedLevels, slotResults } = await runWeeklyGeneration(
    existingIndex,
    existingLevels,
    deps,
  );
  const summary = formatSummary(slotResults);
  console.log(summary);
  writeFileSync(WEEKLY_SUMMARY_PATH, summary + '\n');

  if (approvedLevels.length === 0) {
    process.exitCode = NOTHING_TO_SUBMIT_EXIT_CODE;
    return;
  }

  writeApprovedLevels(approvedLevels, existingIndex);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
