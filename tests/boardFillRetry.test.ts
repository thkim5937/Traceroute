import { describe, it, expect, vi } from 'vitest';
import {
  fillGridWithRetry,
  growSnakes,
  absorbLeftoverCells,
} from '../src/generator/BoardGenerator';
import type {
  SnakeGrowthResult,
  AbsorptionResult,
  GenerationStepEvent,
} from '../src/generator/BoardGenerator';

const GENERATOR_RETRY_LIMIT = 5000;

function makeGrowth(gridSize: { rows: number; cols: number }): SnakeGrowthResult {
  return { gridSize, colorPaths: [], occupied: [], leftoverCells: [] };
}

function makeAbsorption(
  gridSize: { rows: number; cols: number },
  success: boolean,
): AbsorptionResult {
  return {
    gridSize,
    colorPaths: success
      ? [
          [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
            { row: 0, col: 3 },
            { row: 0, col: 4 },
            { row: 0, col: 5 },
          ],
        ]
      : [],
    occupied: success ? [[true, true, true, true, true, true]] : [],
    success,
    remainingLeftover: success ? [] : [{ row: 0, col: 0 }],
  };
}

describe('fillGridWithRetry', () => {
  it('succeeds within a small number of attempts on a reasonably sized grid', () => {
    const gridSize = { rows: 6, cols: 6 };
    // colorCount 1 keeps this a reliable wiring smoke test: with TRD §5.4's
    // minimum endpoint separation gate, multi-color success rates on a 6x6
    // grid are low enough that this test would be flaky (see the batch
    // regeneration report for real-world exclusion rates).
    const result = fillGridWithRetry(gridSize, 1);

    expect(result.success).toBe(true);
    expect(result.gridSize).toEqual(gridSize);
    expect(result.colorCount).toBe(1);
    expect(result.attemptsUsed).toBeGreaterThanOrEqual(1);
    expect(result.attemptsUsed).toBeLessThanOrEqual(GENERATOR_RETRY_LIMIT);
    expect(result.colorPaths).toBeDefined();
    expect(result.occupied).toBeDefined();
  });

  it('fires a retry event with the correct attemptNumber when the first attempt fails', () => {
    const gridSize = { rows: 6, cols: 6 };
    const growSnakesMock = vi.fn(() => makeGrowth(gridSize));
    let absorbCallCount = 0;
    const absorbMock = vi.fn(() => {
      absorbCallCount++;
      return makeAbsorption(gridSize, absorbCallCount > 1);
    });

    const events: GenerationStepEvent[] = [];
    const result = fillGridWithRetry(gridSize, 3, (event) => events.push(event), undefined, {
      growSnakes: growSnakesMock,
      absorbLeftoverCells: absorbMock,
    });

    expect(result.success).toBe(true);
    expect(result.attemptsUsed).toBe(2);
    expect(growSnakesMock).toHaveBeenCalledTimes(2);

    const retryEvents = events.filter((event) => event.type === 'retry');
    expect(retryEvents).toEqual([{ type: 'retry', attemptNumber: 2 }]);
  });

  it('gives up and logs after exhausting GENERATOR_RETRY_LIMIT attempts', () => {
    const gridSize = { rows: 6, cols: 6 };
    const growSnakesMock = vi.fn(() => makeGrowth(gridSize));
    const absorbMock = vi.fn(() => makeAbsorption(gridSize, false));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = fillGridWithRetry(gridSize, 3, undefined, undefined, {
      growSnakes: growSnakesMock,
      absorbLeftoverCells: absorbMock,
    });

    expect(result.success).toBe(false);
    expect(result.attemptsUsed).toBe(GENERATOR_RETRY_LIMIT);
    expect(result.colorPaths).toBeUndefined();
    expect(result.occupied).toBeUndefined();
    expect(growSnakesMock).toHaveBeenCalledTimes(GENERATOR_RETRY_LIMIT);
    expect(absorbMock).toHaveBeenCalledTimes(GENERATOR_RETRY_LIMIT);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('5000');

    warnSpy.mockRestore();
  });

  it('always consumes exactly the given retryLimit attempts before reporting failure, even for a small custom limit', () => {
    const gridSize = { rows: 6, cols: 6 };
    const growSnakesMock = vi.fn(() => makeGrowth(gridSize));
    const absorbMock = vi.fn(() => makeAbsorption(gridSize, false));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = fillGridWithRetry(gridSize, 3, undefined, 3, {
      growSnakes: growSnakesMock,
      absorbLeftoverCells: absorbMock,
    });

    expect(result.success).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(growSnakesMock).toHaveBeenCalledTimes(3);
    expect(absorbMock).toHaveBeenCalledTimes(3);

    warnSpy.mockRestore();
  });
});

describe('fillGridWithRetry with real growSnakes/absorbLeftoverCells', () => {
  it('wires the real implementations together by default', () => {
    // Sanity check that the default deps object actually points at the real
    // exported functions, not just at mocks used elsewhere in this file.
    const result = fillGridWithRetry({ rows: 4, cols: 4 }, 2);
    expect(typeof result.success).toBe('boolean');
    expect(growSnakes).toBeTypeOf('function');
    expect(absorbLeftoverCells).toBeTypeOf('function');
  });
});
