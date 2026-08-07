import { describe, it, expect, vi } from 'vitest';
import { generateSolvableBoard } from '../src/generator/generateSolvableBoard';
import type { BoardResult } from '../src/generator/BoardGenerator';
import type { SolverResult } from '../src/solver/Solver';

const gridSize = { rows: 6, cols: 6 };
const colorCount = 3;
const endpoints: [{ row: number; col: number }, { row: number; col: number }][] = [
  [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
];

function board(overrides: Partial<BoardResult>): BoardResult {
  return { success: true, endpoints, attemptsUsed: 1, ...overrides };
}

const defaultSolution = [
  [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
  ],
];

function solverResult(overrides: Partial<SolverResult>): SolverResult {
  return {
    status: 'solved',
    nodeCount: 0,
    searchFullyCompleted: true,
    solution: defaultSolution,
    ...overrides,
  };
}

describe('generateSolvableBoard', () => {
  it('succeeds on the first attempt when generation and solving both succeed immediately', () => {
    const generateBoardMock = vi.fn(() => board({ attemptsUsed: 1 }));
    const solveMock = vi.fn(() => solverResult({ status: 'solved' }));

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(1);
    expect(result.boardResult).toEqual(board({ attemptsUsed: 1 }));
    expect(result.solverResult).toEqual(solverResult({ status: 'solved' }));
    expect(generateBoardMock).toHaveBeenCalledTimes(1);
    expect(generateBoardMock).toHaveBeenCalledWith(
      gridSize,
      colorCount,
      undefined,
      5000,
      undefined,
      undefined,
    );
    expect(solveMock).toHaveBeenCalledTimes(1);
  });

  it('forwards blockedCells to both generateBoard and solve when provided', () => {
    const blockedCells = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ];
    const generateBoardMock = vi.fn(() => board({ attemptsUsed: 1 }));
    const solveMock = vi.fn(() => solverResult({ status: 'solved' }));

    generateSolvableBoard(
      gridSize,
      colorCount,
      undefined,
      { generateBoard: generateBoardMock, solve: solveMock },
      blockedCells,
    );

    expect(generateBoardMock).toHaveBeenCalledWith(
      gridSize,
      colorCount,
      undefined,
      5000,
      undefined,
      blockedCells,
    );
    expect(solveMock).toHaveBeenCalledWith(gridSize, endpoints, undefined, blockedCells);
  });

  it('regenerates with a smaller remaining budget after an UNRESOLVED solve, carrying totalUsed over', () => {
    const generateBoardMock = vi
      .fn()
      .mockImplementationOnce(() => board({ attemptsUsed: 3 }))
      .mockImplementationOnce(() => board({ attemptsUsed: 2 }));
    const solveMock = vi
      .fn()
      .mockImplementationOnce(() => solverResult({ status: 'unresolved' }))
      .mockImplementationOnce(() => solverResult({ status: 'solved' }));

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(5);
    expect(generateBoardMock).toHaveBeenCalledTimes(2);
    expect(generateBoardMock).toHaveBeenNthCalledWith(
      1,
      gridSize,
      colorCount,
      undefined,
      5000,
      undefined,
      undefined,
    );
    expect(generateBoardMock).toHaveBeenNthCalledWith(
      2,
      gridSize,
      colorCount,
      undefined,
      4997,
      undefined,
      undefined,
    );
    expect(solveMock).toHaveBeenCalledTimes(2);
  });

  it('reports failed immediately with no solve() call when generateBoard exhausts the full shared budget on fill failure alone', () => {
    const generateBoardMock = vi.fn(() =>
      board({ success: false, endpoints: undefined, attemptsUsed: 5000 }),
    );
    const solveMock = vi.fn();

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('failed');
    expect(result.totalAttemptsUsed).toBe(5000);
    expect(result.boardResult).toBeUndefined();
    expect(result.solverResult).toBeUndefined();
    expect(generateBoardMock).toHaveBeenCalledTimes(1);
    expect(solveMock).not.toHaveBeenCalled();
  });

  it('shares ONE combined budget of 5000 across fill-failure and UNRESOLVED-triggered regeneration attempts, never granting a fresh 5000', () => {
    const generateBoardMock = vi
      .fn()
      .mockImplementationOnce(() => board({ attemptsUsed: 4995 }))
      .mockImplementationOnce(() => board({ attemptsUsed: 5 }));
    const solveMock = vi
      .fn()
      .mockImplementationOnce(() => solverResult({ status: 'unresolved' }))
      .mockImplementationOnce(() => solverResult({ status: 'unresolved' }));

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('failed');
    expect(result.totalAttemptsUsed).toBe(5000);
    expect(generateBoardMock).toHaveBeenCalledTimes(2);
    expect(generateBoardMock).toHaveBeenNthCalledWith(
      1,
      gridSize,
      colorCount,
      undefined,
      5000,
      undefined,
      undefined,
    );
    expect(generateBoardMock).toHaveBeenNthCalledWith(
      2,
      gridSize,
      colorCount,
      undefined,
      5,
      undefined,
      undefined,
    );
    expect(solveMock).toHaveBeenCalledTimes(2);
  });

  it('accepts an UNRESOLVED solve immediately when it already has a candidate, without a wasted retry (TRD §5.6)', () => {
    const generateBoardMock = vi.fn(() => board({ attemptsUsed: 1 }));
    const solveMock = vi.fn(() =>
      solverResult({
        status: 'unresolved',
        hasSolution: true,
        searchFullyCompleted: false,
        solution: [
          [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 1 },
          ],
        ],
      }),
    );

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(1);
    expect(generateBoardMock).toHaveBeenCalledTimes(1);
    expect(solveMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a solved board whose solution has a straight-line color and retries (TRD §5.6, MIN_TURNS_PER_COLOR)', () => {
    const straightLine = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ];
    const turny = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ];
    const generateBoardMock = vi
      .fn()
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }))
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }));
    const solveMock = vi
      .fn()
      .mockImplementationOnce(() =>
        solverResult({ status: 'solved', solution: [straightLine, turny] }),
      )
      .mockImplementationOnce(() => solverResult({ status: 'solved', solution: [turny, turny] }));

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(2);
    expect(generateBoardMock).toHaveBeenCalledTimes(2);
    expect(solveMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a solved board whose rawScore is below minRawScoreThreshold and retries', () => {
    // defaultSolution: 1 turny path, edges=2, turns=1 -> rawScore = 2 + TURN_WEIGHT(5)*1 = 7 (below 8)
    const zigzag = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]; // edges=4, turns=3 -> rawScore = 4 + TURN_WEIGHT(5)*3 = 19 (above 8)
    const generateBoardMock = vi
      .fn()
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }))
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }));
    const solveMock = vi
      .fn()
      .mockImplementationOnce(() => solverResult({ status: 'solved', solution: defaultSolution }))
      .mockImplementationOnce(() => solverResult({ status: 'solved', solution: [zigzag] }));

    const result = generateSolvableBoard(
      gridSize,
      colorCount,
      undefined,
      { generateBoard: generateBoardMock, solve: solveMock },
      undefined,
      undefined,
      8,
    );

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(2);
    expect(generateBoardMock).toHaveBeenCalledTimes(2);
    expect(solveMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a solved board whose rawScore is exactly at minRawScoreThreshold', () => {
    const generateBoardMock = vi.fn(() => board({ attemptsUsed: 1 }));
    const solveMock = vi.fn(() => solverResult({ status: 'solved', solution: defaultSolution }));

    const result = generateSolvableBoard(
      gridSize,
      colorCount,
      undefined,
      { generateBoard: generateBoardMock, solve: solveMock },
      undefined,
      undefined,
      7,
    );

    expect(result.status).toBe('success');
    expect(generateBoardMock).toHaveBeenCalledTimes(1);
    expect(solveMock).toHaveBeenCalledTimes(1);
  });

  it('still enforces MIN_TURNS_PER_COLOR even when minRawScoreThreshold passes', () => {
    const straightLine = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
      { row: 0, col: 6 },
      { row: 0, col: 7 },
      { row: 0, col: 8 },
    ]; // edges=8, turns=0 -> rawScore = 8, clears an 8 threshold but 0 turns fails MIN_TURNS_PER_COLOR
    const zigzag = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]; // edges=4, turns=3 -> rawScore = 19, clears both gates
    const generateBoardMock = vi
      .fn()
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }))
      .mockImplementationOnce(() => board({ attemptsUsed: 1 }));
    const solveMock = vi
      .fn()
      .mockImplementationOnce(() => solverResult({ status: 'solved', solution: [straightLine] }))
      .mockImplementationOnce(() => solverResult({ status: 'solved', solution: [zigzag] }));

    const result = generateSolvableBoard(
      gridSize,
      colorCount,
      undefined,
      { generateBoard: generateBoardMock, solve: solveMock },
      undefined,
      undefined,
      8,
    );

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(2);
    expect(generateBoardMock).toHaveBeenCalledTimes(2);
    expect(solveMock).toHaveBeenCalledTimes(2);
  });

  it('accepts immediately with no wasted retry when every color already has >= 1 turn', () => {
    const turny = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ];
    const generateBoardMock = vi.fn(() => board({ attemptsUsed: 1 }));
    const solveMock = vi.fn(() => solverResult({ status: 'solved', solution: [turny, turny] }));

    const result = generateSolvableBoard(gridSize, colorCount, undefined, {
      generateBoard: generateBoardMock,
      solve: solveMock,
    });

    expect(result.status).toBe('success');
    expect(result.totalAttemptsUsed).toBe(1);
    expect(generateBoardMock).toHaveBeenCalledTimes(1);
    expect(solveMock).toHaveBeenCalledTimes(1);
  });
});
