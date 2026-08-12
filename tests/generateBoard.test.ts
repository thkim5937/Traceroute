import { describe, it, expect, vi } from 'vitest';
import { generateBoard } from '../src/generator/BoardGenerator';
import type { FillResult } from '../src/generator/BoardGenerator';

describe('generateBoard', () => {
  it('returns one [start, end] endpoint pair per color on success', () => {
    const gridSize = { rows: 6, cols: 6 };
    // colorCount 1 keeps this reliable: TRD §5.4's minimum endpoint
    // separation gate makes multi-color success on a 6x6 grid too rare for
    // a deterministic test (see the batch regeneration report).
    const colorCount = 1;
    const result = generateBoard(gridSize, colorCount);

    expect(result.success).toBe(true);
    expect(result.endpoints).toHaveLength(colorCount);
    for (const pair of result.endpoints ?? []) {
      expect(pair).toHaveLength(2);
      expect(pair[0]).toHaveProperty('row');
      expect(pair[0]).toHaveProperty('col');
      expect(pair[1]).toHaveProperty('row');
      expect(pair[1]).toHaveProperty('col');
    }
  });

  it('succeeds with blockedCells present, and never places an endpoint on one (TRD §5.14)', () => {
    const gridSize = { rows: 4, cols: 4 };
    const colorCount = 2;
    const blockedCells = [
      { row: 1, col: 1 },
      { row: 2, col: 2 },
    ];

    const result = generateBoard(
      gridSize,
      colorCount,
      undefined,
      undefined,
      undefined,
      blockedCells,
    );

    expect(result.success).toBe(true);
    expect(result.endpoints).toHaveLength(colorCount);
    const allEndpointCells = (result.endpoints ?? []).flat();
    for (const blocked of blockedCells) {
      expect(allEndpointCells.some((c) => c.row === blocked.row && c.col === blocked.col)).toBe(
        false,
      );
    }
  });

  it('does not leak colorPaths or occupied onto the returned object', () => {
    const result = generateBoard({ rows: 6, cols: 6 }, 1);
    const keys = Object.keys(result).sort();

    expect(keys).toEqual(['attemptsUsed', 'endpoints', 'success'].sort());
    expect(result).not.toHaveProperty('colorPaths');
    expect(result).not.toHaveProperty('occupied');
    expect(result).not.toHaveProperty('gridSize');
    expect(result).not.toHaveProperty('colorCount');
  });

  it('omits endpoints and passes through attemptsUsed on failure', () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 3;
    const failedFill: FillResult = {
      gridSize,
      colorCount,
      success: false,
      attemptsUsed: 200,
    };
    const fillGridWithRetryMock = vi.fn(() => failedFill);

    const result = generateBoard(gridSize, colorCount, undefined, undefined, {
      fillGridWithRetry: fillGridWithRetryMock,
    });

    expect(result).toEqual({
      success: false,
      attemptsUsed: 200,
    });
    expect(fillGridWithRetryMock).toHaveBeenCalledTimes(1);
  });

  it('forwards a custom retryLimit down to fillGridWithRetry', () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 3;
    const fillGridWithRetryMock = vi.fn((): FillResult => ({
      gridSize,
      colorCount,
      success: false,
      attemptsUsed: 3,
    }));

    const result = generateBoard(gridSize, colorCount, undefined, 3, {
      fillGridWithRetry: fillGridWithRetryMock,
    });

    expect(result.success).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(fillGridWithRetryMock).toHaveBeenCalledWith(
      gridSize,
      colorCount,
      undefined,
      3,
      undefined,
      undefined,
    );
  });

  it('on failure, attemptsUsed always equals exactly the retryLimit that was passed in (even a small custom one)', () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 3;
    const retryLimit = 3;
    const fillGridWithRetryMock = vi.fn((): FillResult => ({
      gridSize,
      colorCount,
      success: false,
      attemptsUsed: retryLimit,
    }));

    const result = generateBoard(gridSize, colorCount, undefined, retryLimit, {
      fillGridWithRetry: fillGridWithRetryMock,
    });

    expect(result.success).toBe(false);
    expect(result.attemptsUsed).toBe(retryLimit);
  });
});

describe('generateBoard with multiEndpointRequests', () => {
  function straightPath(length: number): { row: number; col: number }[] {
    return Array.from({ length }, (_, col) => ({ row: 0, col }));
  }

  it('upgrades exactly one color to 3 endpoints, leaves the others at 2', () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 3;
    const colorPaths = [straightPath(12), straightPath(12), straightPath(12)];
    const fillGridWithRetryMock = vi.fn((): FillResult => ({
      gridSize,
      colorCount,
      success: true,
      colorPaths,
      occupied: [],
      attemptsUsed: 1,
    }));

    const result = generateBoard(
      gridSize,
      colorCount,
      undefined,
      undefined,
      { fillGridWithRetry: fillGridWithRetryMock },
      undefined,
      [3],
    );

    expect(result.success).toBe(true);
    const lengths = (result.endpoints ?? []).map((e) => e.length);
    expect(lengths.filter((l) => l === 3)).toHaveLength(1);
    expect(lengths.filter((l) => l === 2)).toHaveLength(2);
  });

  it('retries up to retryLimit and fails when the requested endpoint count cannot fit', () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 2;
    const colorPaths = [straightPath(4), straightPath(4)];
    const retryLimit = 3;
    const fillGridWithRetryMock = vi.fn((): FillResult => ({
      gridSize,
      colorCount,
      success: true,
      colorPaths,
      occupied: [],
      attemptsUsed: 1,
    }));

    const result = generateBoard(
      gridSize,
      colorCount,
      undefined,
      retryLimit,
      { fillGridWithRetry: fillGridWithRetryMock },
      undefined,
      [4],
    );

    expect(result.success).toBe(false);
    expect(result.attemptsUsed).toBe(retryLimit);
    expect(fillGridWithRetryMock).toHaveBeenCalledTimes(retryLimit);
  });

  it("omitted multiEndpointRequests still returns today's 2-element endpoint pairs", () => {
    const gridSize = { rows: 6, cols: 6 };
    const colorCount = 1;
    const result = generateBoard(gridSize, colorCount);

    expect(result.success).toBe(true);
    for (const pair of result.endpoints ?? []) {
      expect(pair).toHaveLength(2);
    }
  });
});
