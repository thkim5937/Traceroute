import {
  generateBoard,
  type BoardResult,
  type GenerationStepEvent,
} from '../generator/BoardGenerator.ts';
import { solve, type SolverResult, type SolverNodeEvent } from '../solver/Solver.ts';
import { computeRawScore, scoreDifficulty } from '../solver/DifficultyScorer.ts';
import { assignColorIds } from '../palette/assignColorIds.ts';
import { buildLevelData } from '../data/buildLevelData.ts';
import { observedMin, observedMax } from '../solver/calibrationConstants.ts';
import { PALETTE } from '../palette/palette.ts';
import {
  renderGrid,
  renderDots,
  renderPaths,
  renderBlockedCells,
} from '../render/CanvasRenderer.ts';
import { attachInputHandler } from '../render/InputHandler.ts';
import { createGameController, type GameController } from '../engine/GameController.ts';
import type { LevelData } from '../data/LevelSchema.ts';

const DEMO_LEVEL_ID = 'dev-demo';
const STEP_DELAY_MS = 30;

// Solver onNode fires on every move applied/undone during search (including
// forced moves and rejected candidates in failed branches), which for
// anything but a trivial puzzle can be tens of thousands of events -- far
// too many to play back one at a time. Cap total playback to a fixed
// duration and sample down to a fixed max draw count instead.
const TARGET_PLAYBACK_MS = 3000;
const MAX_DRAW_STEPS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Evenly samples up to maxSteps indices from [0, eventCount) and returns the
 * per-step delay so total playback time is targetMs (never more, and never
 * instant when there's at least one event to show). */
export function planPlayback(
  eventCount: number,
  targetMs: number,
  maxSteps: number,
): { indices: number[]; stepDelayMs: number } {
  if (eventCount <= 0) {
    return { indices: [], stepDelayMs: 0 };
  }
  const stepCount = Math.min(eventCount, maxSteps);
  const indices: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    indices.push(Math.floor((i * eventCount) / stepCount));
  }
  return { indices, stepDelayMs: targetMs / stepCount };
}

/**
 * Assembles a playable LevelData directly from a generated board + solve
 * result, bypassing LevelLoader/the offline pipeline entirely (dev-only).
 * Reuses assignColorIds and buildLevelData -- the same color-assignment and
 * level-assembly logic the offline pipeline uses (TRD §5.11) -- rather than
 * duplicating that step.
 */
export function buildDemoLevelData(
  gridSize: { rows: number; cols: number },
  boardResult: BoardResult,
  solverResult: SolverResult,
): LevelData {
  if (!boardResult.success || boardResult.endpoints === undefined) {
    throw new Error('buildDemoLevelData: board generation failed');
  }
  if (solverResult.solution === undefined) {
    throw new Error(`buildDemoLevelData: solver has no solution (status '${solverResult.status}')`);
  }

  const rawScore = computeRawScore(solverResult.solution);
  const difficultyResult = scoreDifficulty(rawScore, observedMin, observedMax);
  const colorIds = assignColorIds(boardResult.endpoints.length);

  return buildLevelData(
    boardResult,
    solverResult,
    difficultyResult,
    gridSize,
    colorIds,
    'generated',
    DEMO_LEVEL_ID,
  );
}

export interface DemoControllerElements {
  rowsInput: HTMLInputElement;
  colsInput: HTMLInputElement;
  colorCountInput: HTMLInputElement;
  generateButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  statusEl: HTMLElement;
  canvas: HTMLCanvasElement;
}

export function createDemoController(elements: DemoControllerElements): void {
  const { rowsInput, colsInput, colorCountInput, generateButton, playButton, statusEl, canvas } =
    elements;
  const ctx = canvas.getContext('2d')!;
  const cellSize = 40;

  let level: LevelData | undefined;
  let controller: GameController | undefined;
  let inputAttached = false;

  playButton.disabled = true;

  function setStatus(message: string): void {
    statusEl.textContent = message;
  }

  function drawEmptyGrid(gridSize: { rows: number; cols: number }): void {
    canvas.width = gridSize.cols * cellSize;
    canvas.height = gridSize.rows * cellSize;
    renderGrid(ctx, gridSize, cellSize);
  }

  function drawStep(cell: { row: number; col: number }): void {
    ctx.fillStyle = '#aa3bff';
    ctx.fillRect(cell.col * cellSize + 2, cell.row * cellSize + 2, cellSize - 4, cellSize - 4);
  }

  function renderPlayableLevel(currentLevel: LevelData): void {
    canvas.width = currentLevel.gridSize.cols * cellSize;
    canvas.height = currentLevel.gridSize.rows * cellSize;

    function render(): void {
      if (controller === undefined) return;
      renderGrid(ctx, currentLevel.gridSize, cellSize);
      renderBlockedCells(ctx, currentLevel.obstacles?.blockedCells, cellSize);
      renderDots(ctx, currentLevel.colors, cellSize, PALETTE);
      renderPaths(ctx, controller.getState(), currentLevel, cellSize, PALETTE);
    }

    controller = createGameController(
      currentLevel,
      render,
      () => setStatus('Cleared!'),
      () => {},
    );
    render();

    if (!inputAttached) {
      inputAttached = true;
      attachInputHandler(
        canvas,
        () => level!,
        () => controller!.getState(),
        (_clickCell, prevState, newState) => {
          controller!.handleClickResult(prevState, newState);
        },
      );
    }
  }

  async function onGenerate(): Promise<void> {
    generateButton.disabled = true;
    playButton.disabled = true;
    level = undefined;
    controller = undefined;

    const rows = Number(rowsInput.value);
    const cols = Number(colsInput.value);
    const colorCount = Number(colorCountInput.value);
    const gridSize = { rows, cols };

    drawEmptyGrid(gridSize);
    setStatus('Generating...');

    // Single attempt only: pass generateBoard's existing default retryLimit
    // unchanged, and don't loop or retry on failure ourselves (TRD §5.10).
    // onStep must be synchronous (BoardGenerator awaits nothing), so each
    // step schedules its own delayed draw rather than the generator itself
    // pausing between steps.
    let stepDelay = Promise.resolve();
    const boardResult = generateBoard(gridSize, colorCount, (event: GenerationStepEvent) => {
      if (event.type === 'grow' || event.type === 'stop') {
        stepDelay = stepDelay.then(() => {
          drawStep(event.cell);
          return sleep(STEP_DELAY_MS);
        });
      }
    });
    await stepDelay;

    if (!boardResult.success || boardResult.endpoints === undefined) {
      setStatus(`Generation failed after ${boardResult.attemptsUsed} attempt(s).`);
      generateButton.disabled = false;
      return;
    }

    setStatus('Solving...');
    // solve() runs synchronously to completion, so events are collected here
    // (no per-event delay) and played back afterward, capped to a fixed
    // total duration -- see planPlayback.
    const visitEvents: SolverNodeEvent[] = [];
    const onNode = (event: SolverNodeEvent): void => {
      if (event.type === 'visit') {
        visitEvents.push(event);
      }
    };
    const solverResult = solve(gridSize, boardResult.endpoints, {}, [], undefined, onNode);

    const { indices, stepDelayMs } = planPlayback(
      visitEvents.length,
      TARGET_PLAYBACK_MS,
      MAX_DRAW_STEPS,
    );
    for (const index of indices) {
      const event = visitEvents[index];
      if (event === undefined) continue;
      drawStep(event.cell);
      await sleep(stepDelayMs);
    }

    if (!solverResult.hasSolution || solverResult.solution === undefined) {
      setStatus(`Solve outcome: ${solverResult.status} (no solution found).`);
      generateButton.disabled = false;
      return;
    }

    const rawScore = computeRawScore(solverResult.solution);
    const difficultyResult = scoreDifficulty(rawScore, observedMin, observedMax);
    level = buildDemoLevelData(gridSize, boardResult, solverResult);

    setStatus(
      `Solved (status: ${solverResult.status}). rawScore=${rawScore}, ` +
        `difficultyScore=${difficultyResult.difficultyScore}, difficultyTag=${difficultyResult.difficultyTag}`,
    );
    generateButton.disabled = false;
    playButton.disabled = false;
  }

  function onPlay(): void {
    if (level === undefined) return;
    renderPlayableLevel(level);
  }

  generateButton.addEventListener('click', () => {
    void onGenerate();
  });
  playButton.addEventListener('click', onPlay);
}
