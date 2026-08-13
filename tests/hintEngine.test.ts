import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyHint } from '../src/engine/HintEngine';
import { createGameController, resolveHintTargetColorId } from '../src/engine/GameController';
import type { GameState, ColorPathState } from '../src/engine/GameState';
import type { LevelData } from '../src/data/LevelSchema';

vi.mock('../src/solver/Solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solver/Solver')>();
  return { ...actual, solve: vi.fn(actual.solve) };
});
import { solve } from '../src/solver/Solver';
const solveMock = vi.mocked(solve);

// ── Shared fixtures ───────────────────────────────────────────────────────────

// 3×3 L-shaped level. stored solution goes right-then-down; player may go down-then-right.
const level: LevelData = {
  id: 'hint-test',
  gridSize: { rows: 3, cols: 3 },
  colors: [
    {
      colorId: 'red',
      endpoints: [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [
    {
      colorId: 'red',
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 2 },
        { row: 2, col: 2 },
      ],
    },
  ],
  minTotalEdgeLength: 0,
};

function emptyState(): GameState {
  return { levelId: level.id, paths: new Map(), activeColorId: null };
}

function stateWithPath(
  colorId: string,
  path: { row: number; col: number }[],
  completed = false,
): GameState {
  const paths = new Map<string, ColorPathState>();
  paths.set(colorId, { colorId, path, completed });
  return { levelId: level.id, paths, activeColorId: colorId };
}

beforeEach(() => {
  solveMock.mockClear();
});

// ── applyHint unit tests ──────────────────────────────────────────────────────

describe('applyHint', () => {
  it('first hint on untouched color reveals the first straight segment via the fast path (no solver call)', () => {
    const result = applyHint(level, 'red', emptyState());
    expect(result.status).toBe('revealed');
    if (result.status !== 'revealed') return;
    expect(result.newPath[0]).toEqual({ row: 0, col: 0 });
    expect(result.newPath.length).toBeGreaterThan(1);
    expect(solveMock).not.toHaveBeenCalled();
    // All cells in the revealed segment must share the same axis.
    const axis = result.newPath[0]!.row === result.newPath[1]!.row ? 'col' : 'row';
    for (let i = 2; i < result.newPath.length; i++) {
      const a = result.newPath[i - 1]!.row === result.newPath[i]!.row ? 'col' : 'row';
      expect(a).toBe(axis);
    }
  });

  it('multiple hint clicks in sequence reach the target endpoint, all via the fast path', () => {
    let state = emptyState();
    let finalPath: { row: number; col: number }[] | null = null;
    for (let i = 0; i < 10; i++) {
      const r = applyHint(level, 'red', state);
      if (r.status !== 'revealed') break;
      finalPath = r.newPath;
      state = stateWithPath('red', r.newPath);
    }
    expect(finalPath).not.toBeNull();
    expect(finalPath![finalPath!.length - 1]).toEqual({ row: 2, col: 2 });
    expect(solveMock).not.toHaveBeenCalled();
  });

  it('preserves player path drawn in a different direction than level.solution (slow path re-solves)', () => {
    // Player goes down-then-right; stored solution goes right-then-down.
    const playerPath = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ];
    const result = applyHint(level, 'red', stateWithPath('red', playerPath));
    expect(result.status).toBe('revealed');
    if (result.status !== 'revealed') return;
    expect(solveMock).toHaveBeenCalled();
    // Player's drawn cells must appear as an exact prefix.
    for (let i = 0; i < playerPath.length; i++) {
      expect(result.newPath[i]).toEqual(playerPath[i]);
    }
    expect(result.newPath.length).toBeGreaterThan(playerPath.length);
  });

  it('returns stuck when tail cannot reach target — path is NOT modified', () => {
    // Obstacles block (1,1) and (1,2); player drew into (2,0)→(2,1)→(2,2).
    // Tail (2,2) cannot reach target (0,2) because row 1 cols 1-2 are blocked.
    const boxedLevel: LevelData = {
      id: 'boxed',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
      obstacles: {
        blockedCells: [
          { row: 1, col: 1 },
          { row: 1, col: 2 },
        ],
        blockedEdges: [],
      },
    };
    const playerPath = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ];
    const before = stateWithPath('red', playerPath);
    const result = applyHint(boxedLevel, 'red', before);

    expect(result.status).toBe('stuck');
    // Path must be completely untouched — byte-for-byte identical state.
    expect(before.paths.get('red')?.path).toEqual(playerPath);
  });

  it('returns noop when color already reaches target', () => {
    const fullPath = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ];
    expect(applyHint(level, 'red', stateWithPath('red', fullPath)).status).toBe('noop');
  });

  it('returns noop for unknown colorId', () => {
    expect(applyHint(level, 'nonexistent', emptyState()).status).toBe('noop');
  });

  it('returns stuck when even the starting endpoint is fully boxed in by another color', () => {
    const twoColorLevel: LevelData = {
      id: 'fully-blocked',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 2, col: 2 },
          ],
        },
        {
          colorId: 'blue',
          endpoints: [
            { row: 0, col: 1 },
            { row: 1, col: 0 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [],
      minTotalEdgeLength: 0,
    };
    // Blue's drawn path occupies both neighbors of red's start (0,0), and
    // diverges from (the nonexistent) level.solution, forcing the slow path.
    const paths = new Map<string, ColorPathState>();
    paths.set('blue', {
      colorId: 'blue',
      path: [
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
      completed: false,
    });
    const state: GameState = { levelId: 'fully-blocked', paths, activeColorId: null };
    expect(applyHint(twoColorLevel, 'red', state).status).toBe('stuck');
  });

  it('finds an alternate valid combination when a divergent color still leaves the board solvable', () => {
    // Red (0,0)->(2,0) and blue (0,2)->(2,2) each have a straight-column
    // solution with a free middle column as buffer. Blue has diverged one
    // step sideways into that buffer -- still very solvable, since red's own
    // column is completely untouched and blue can simply continue down
    // through the buffer to its target.
    const twoColorLevel: LevelData = {
      id: 'still-solvable',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 2, col: 0 },
          ],
        },
        {
          colorId: 'blue',
          endpoints: [
            { row: 0, col: 2 },
            { row: 2, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 2, col: 0 },
          ],
        },
        {
          colorId: 'blue',
          path: [
            { row: 0, col: 2 },
            { row: 1, col: 2 },
            { row: 2, col: 2 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
    };
    const paths = new Map<string, ColorPathState>();
    paths.set('blue', {
      colorId: 'blue',
      path: [
        { row: 0, col: 2 },
        { row: 0, col: 1 },
      ],
      completed: false,
    });
    const state: GameState = { levelId: 'still-solvable', paths, activeColorId: null };

    const result = applyHint(twoColorLevel, 'red', state);
    expect(solveMock).toHaveBeenCalled();
    expect(result.status).toBe('revealed');
    if (result.status !== 'revealed') return;
    expect(result.newPath[0]).toEqual({ row: 0, col: 0 });
    expect(result.newPath[result.newPath.length - 1]).toEqual({ row: 2, col: 0 });
  });

  it("blocks an untouched color's endpoint even though it has no drawn path (fast path, respected by the stored solution)", () => {
    // Green has no drawn path, and neither does red -- the whole board is
    // untouched, so this takes the fast path. The stored solution for red was
    // itself computed to avoid green's endpoint at (0,1), so reading it
    // directly still can never reveal a cell that collides with green.
    const threeColorLevel: LevelData = {
      id: 'endpoint-block',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 2 },
          ],
        },
        {
          colorId: 'green',
          endpoints: [
            { row: 0, col: 1 },
            { row: 2, col: 1 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            { row: 1, col: 2 },
            { row: 0, col: 2 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
    };
    const state: GameState = { levelId: 'endpoint-block', paths: new Map(), activeColorId: null };

    const result = applyHint(threeColorLevel, 'red', state);
    expect(result.status).toBe('revealed');
    if (result.status !== 'revealed') return;
    expect(solveMock).not.toHaveBeenCalled();
    expect(result.newPath.some((c) => c.row === 0 && c.col === 1)).toBe(false);
  });

  it('minimal single-turn L (diagonal-adjacent endpoints) takes two hint clicks, not one (fast path)', () => {
    const minimalLevel: LevelData = {
      id: 'minimal-L',
      gridSize: { rows: 3, cols: 3 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 1 },
            { row: 1, col: 2 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'easy',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 1 },
            { row: 0, col: 2 },
            { row: 1, col: 2 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
    };
    const first = applyHint(minimalLevel, 'red', emptyState());
    expect(first.status).toBe('revealed');
    if (first.status !== 'revealed') return;
    // Must NOT reach the target yet — only the first straight segment.
    expect(first.newPath[first.newPath.length - 1]).not.toEqual({ row: 1, col: 2 });
    expect(first.newPath.length).toBe(2);
    expect(solveMock).not.toHaveBeenCalled();

    const second = applyHint(minimalLevel, 'red', stateWithPath('red', first.newPath));
    expect(second.status).toBe('revealed');
    if (second.status !== 'revealed') return;
    expect(second.newPath[second.newPath.length - 1]).toEqual({ row: 1, col: 2 });
    expect(solveMock).not.toHaveBeenCalled();
  });

  it('8×8 board resolves in under 50ms via the fast path, never calling the solver', () => {
    const bigLevel: LevelData = {
      id: 'big',
      gridSize: { rows: 8, cols: 8 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 7, col: 7 },
          ],
        },
      ],
      origin: 'generated',
      difficultyTag: 'hard',
      difficultyScore: 100,
      solution: [],
      minTotalEdgeLength: 0,
    };
    const t0 = Date.now();
    applyHint(bigLevel, 'red', emptyState());
    expect(Date.now() - t0).toBeLessThan(50);
    expect(solveMock).not.toHaveBeenCalled();
  });

  describe('reconstructed real bug: completing one color via a divergent route strands another', () => {
    // 4x5 grid: two "rooms" (col 0 and col 4, all 4 rows) connected only by
    // two single-row corridors (row 1 and row 2); rows 0 and 3 are blocked in
    // their middle columns. The valid stored solution gives red the row-1
    // corridor and blue the row-2 corridor -- no overlap.
    //
    // Divergent bug scenario: red is drawn through row-2 (blue's corridor)
    // instead. Red's own remaining tail-to-target reachability is completely
    // fine (it can still reach (0,4) via row 1) -- but blue's start (3,0) now
    // has zero legal neighbors ((2,0) taken by red, (3,1) obstacle-blocked),
    // stranding blue outright. A hint for red must recognize this and refuse
    // to reveal, even though red-in-isolation looks perfectly hintable.
    const strandingLevel: LevelData = {
      id: 'stranding',
      gridSize: { rows: 4, cols: 5 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          endpoints: [
            { row: 3, col: 0 },
            { row: 3, col: 4 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'hard',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            { row: 1, col: 2 },
            { row: 1, col: 3 },
            { row: 1, col: 4 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          path: [
            { row: 3, col: 0 },
            { row: 2, col: 0 },
            { row: 2, col: 1 },
            { row: 2, col: 2 },
            { row: 2, col: 3 },
            { row: 2, col: 4 },
            { row: 3, col: 4 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
      obstacles: {
        blockedCells: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 3, col: 1 },
          { row: 3, col: 2 },
          { row: 3, col: 3 },
        ],
        blockedEdges: [],
      },
    };
    const redDivergentPrefix = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ];

    it('recognizes the whole board is unsolvable and returns stuck, not just checking red in isolation', () => {
      const paths = new Map<string, ColorPathState>();
      paths.set('red', { colorId: 'red', path: redDivergentPrefix, completed: false });
      const state: GameState = { levelId: 'stranding', paths, activeColorId: 'red' };

      const result = applyHint(strandingLevel, 'red', state);

      expect(solveMock).toHaveBeenCalled();
      expect(result.status).toBe('stuck');
      // Path must not be mutated on stuck.
      expect(state.paths.get('red')?.path).toEqual(redDivergentPrefix);
    });

    it('exposes the fixture as genuinely valid: an undiverged board is solvable via the fast path', () => {
      const result = applyHint(strandingLevel, 'red', emptyState());
      expect(result.status).toBe('revealed');
      expect(solveMock).not.toHaveBeenCalled();
    });
  });

  it('respects the interactive solver time/node budget: an aborted, no-candidate solve returns stuck, not a hang', () => {
    // Force the solver into the slow path (divergence), then mock its result
    // to look exactly like what happens when HINT_SOLVER_NODE_LIMIT /
    // HINT_SOLVER_TIME_LIMIT_MS is hit with no candidate found yet.
    solveMock.mockImplementationOnce(() => ({
      status: 'unresolved',
      hasSolution: false,
      nodeCount: 500_000,
      searchFullyCompleted: false,
    }));

    const playerPath = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ];
    const before = stateWithPath('red', playerPath);
    const result = applyHint(level, 'red', before);

    expect(solveMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('stuck');
    expect(before.paths.get('red')?.path).toEqual(playerPath);
  });
});

// ── applyHint multi-endpoint tests (TRD §5.15 Phase 2) ───────────────────────

describe('applyHint with multi-endpoint colors', () => {
  // 3x3 grid, single color "sky" with 3 endpoints. Stored solution path visits
  // them in declaration order: (0,0) -> (2,0) -> (0,2).
  const multiLevel: LevelData = {
    id: 'multi-hint-test',
    gridSize: { rows: 3, cols: 3 },
    colors: [
      {
        colorId: 'sky',
        endpoints: [
          { row: 0, col: 0 },
          { row: 2, col: 0 },
          { row: 0, col: 2 },
        ],
      },
    ],
    origin: 'hand',
    difficultyTag: 'easy',
    difficultyScore: 0,
    solution: [
      {
        colorId: 'sky',
        path: [
          { row: 0, col: 0 },
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 2, col: 1 },
          { row: 2, col: 2 },
          { row: 1, col: 2 },
          { row: 0, col: 2 },
        ],
      },
    ],
    minTotalEdgeLength: 0,
  };

  function multiState(
    path: { row: number; col: number }[],
    completed = false,
  ): GameState {
    const paths = new Map<string, ColorPathState>();
    paths.set('sky', { colorId: 'sky', path, completed });
    return { levelId: multiLevel.id, paths, activeColorId: 'sky' };
  }

  it('fast path: repeated hints visit all 3 endpoints across multiple clicks, then noop', () => {
    let state: GameState = { levelId: multiLevel.id, paths: new Map(), activeColorId: 'sky' };
    let finalPath: { row: number; col: number }[] | null = null;
    for (let i = 0; i < 10; i++) {
      const r = applyHint(multiLevel, 'sky', state);
      if (r.status !== 'revealed') break;
      finalPath = r.newPath;
      state = multiState(r.newPath);
    }
    expect(finalPath).not.toBeNull();
    // All 3 declared endpoints must appear somewhere in the final revealed path.
    for (const endpoint of multiLevel.colors[0]!.endpoints) {
      expect(finalPath!.some((c) => c.row === endpoint.row && c.col === endpoint.col)).toBe(true);
    }
    expect(solveMock).not.toHaveBeenCalled();

    // One more click on the now-fully-visited color is a noop.
    const finalState = multiState(finalPath!);
    expect(applyHint(multiLevel, 'sky', finalState).status).toBe('noop');
  });

  it('noop is order-independent: all 3 endpoints present anywhere in the path, regardless of visit order', () => {
    // Visits (2,0) first, then (0,0), then (0,2) last -- reverse of
    // declaration order. isColorComplete-style membership check doesn't care.
    const outOfOrderPath = [
      { row: 2, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ];
    expect(applyHint(multiLevel, 'sky', multiState(outOfOrderPath)).status).toBe('noop');
  });

  it('partial visitation (2 of 3 endpoints) is not a noop -- hint keeps going', () => {
    // Player has reached (0,0) and (2,0) but not yet (0,2).
    const partialPath = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ];
    const result = applyHint(multiLevel, 'sky', multiState(partialPath));
    expect(result.status).toBe('revealed');
  });

  it('slow path: passes the FULL endpoint set (not just two) to solve() for a diverged multi-endpoint color', () => {
    // Player draws (0,0) -> (0,1), diverging immediately from the stored
    // solution's second cell (1,0) -- forces the slow re-solve path.
    const playerPath = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ];
    const mockedSolvedPath = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
    ];
    solveMock.mockImplementationOnce(() => ({
      status: 'solved',
      solution: [mockedSolvedPath],
      hasSolution: true,
      nodeCount: 1,
      searchFullyCompleted: true,
    }));

    const result = applyHint(multiLevel, 'sky', multiState(playerPath));

    expect(solveMock).toHaveBeenCalledTimes(1);
    // The call's endpoints argument must carry all 3 of this color's
    // endpoints, in declared order -- not just "start" and "one other".
    const [, calledEndpoints] = solveMock.mock.calls[0]!;
    expect(calledEndpoints).toEqual([multiLevel.colors[0]!.endpoints]);

    expect(result.status).toBe('revealed');
    if (result.status !== 'revealed') return;
    expect(result.newPath[0]).toEqual({ row: 0, col: 0 });
    expect(result.newPath[1]).toEqual({ row: 0, col: 1 });
  });
});

// ── GameController integration tests ─────────────────────────────────────────

function makeController(nudgeUndo = vi.fn()) {
  return {
    ctrl: createGameController(level, vi.fn(), vi.fn(), vi.fn(), nudgeUndo),
    nudgeUndo,
  };
}

describe('GameController.useHint', () => {
  it('hint usage is undoable via the existing undo stack', () => {
    const { ctrl } = makeController();
    ctrl.useHint('red');
    const afterPath = ctrl.getState().paths.get('red')?.path;
    expect(afterPath).toBeDefined();
    expect(afterPath!.length).toBeGreaterThan(1);
    expect(ctrl.canUndo()).toBe(true);
    ctrl.undo();
    expect(ctrl.getState().paths.get('red')).toBeUndefined();
  });

  it('hint on an already-completed color is a no-op', () => {
    const { ctrl } = makeController();
    for (let i = 0; i < 10; i++) {
      const prev = ctrl.getState();
      ctrl.useHint('red');
      if (ctrl.getState().paths.get('red')?.completed) break;
      if (ctrl.getState() === prev) break;
    }
    const completedState = ctrl.getState();
    expect(completedState.paths.get('red')?.completed).toBe(true);
    ctrl.useHint('red');
    expect(ctrl.getState()).toBe(completedState);
  });

  it("useHint() with no argument on a fresh controller reveals the first color's first segment", () => {
    const { ctrl } = makeController();
    ctrl.useHint();
    const path = ctrl.getState().paths.get('red')?.path;
    expect(path).toBeDefined();
    expect(path!.length).toBeGreaterThan(1);
    expect(path![0]).toEqual({ row: 0, col: 0 });
  });

  it('nudgeUndo called on stuck (whole-board stranding via a divergent manual draw), NOT on revealed or noop', () => {
    // Same stranding scenario as the reconstructed-real-bug applyHint test:
    // a manually-drawn divergent red path traps blue outright. The manual
    // draw is injected via handleClickResult (the same entry point PathEngine
    // clicks use), then a hint is requested for blue.
    const strandingLevel: LevelData = {
      id: 'stranding-controller',
      gridSize: { rows: 4, cols: 5 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          endpoints: [
            { row: 3, col: 0 },
            { row: 3, col: 4 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'hard',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            { row: 1, col: 2 },
            { row: 1, col: 3 },
            { row: 1, col: 4 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          path: [
            { row: 3, col: 0 },
            { row: 2, col: 0 },
            { row: 2, col: 1 },
            { row: 2, col: 2 },
            { row: 2, col: 3 },
            { row: 2, col: 4 },
            { row: 3, col: 4 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
      obstacles: {
        blockedCells: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 3, col: 1 },
          { row: 3, col: 2 },
          { row: 3, col: 3 },
        ],
        blockedEdges: [],
      },
    };
    const nudge = vi.fn();
    const ctrl = createGameController(strandingLevel, vi.fn(), vi.fn(), vi.fn(), nudge);

    const prev = ctrl.getState();
    const divergedState: GameState = {
      ...prev,
      paths: new Map([
        [
          'red',
          {
            colorId: 'red',
            path: [
              { row: 0, col: 0 },
              { row: 1, col: 0 },
              { row: 2, col: 0 },
              { row: 2, col: 1 },
              { row: 2, col: 2 },
              { row: 2, col: 3 },
              { row: 2, col: 4 },
            ],
            completed: false,
          },
        ],
      ]),
    };
    ctrl.handleClickResult(prev, divergedState);

    ctrl.useHint('blue');
    expect(nudge).toHaveBeenCalledTimes(1);
    // Stuck must not mutate state.
    expect(ctrl.getState().paths.get('blue')).toBeUndefined();

    // A hint that succeeds must never call nudge.
    nudge.mockClear();
    const { ctrl: ctrl2, nudgeUndo: nudge2 } = makeController();
    ctrl2.useHint('red');
    expect(nudge2).not.toHaveBeenCalled();
  });
});

describe('GameController.getHintUseCount', () => {
  it('is 0 on a fresh controller', () => {
    const { ctrl } = makeController();
    expect(ctrl.getHintUseCount()).toBe(0);
  });

  it('increments once per revealed hint', () => {
    const { ctrl } = makeController();
    ctrl.useHint('red');
    expect(ctrl.getHintUseCount()).toBe(1);
    ctrl.useHint('red');
    expect(ctrl.getHintUseCount()).toBe(2);
  });

  it('does not increment on a no-op hint (already-completed color)', () => {
    const { ctrl } = makeController();
    for (let i = 0; i < 10; i++) {
      const prev = ctrl.getState();
      ctrl.useHint('red');
      if (ctrl.getState().paths.get('red')?.completed) break;
      if (ctrl.getState() === prev) break;
    }
    const countAtCompletion = ctrl.getHintUseCount();
    ctrl.useHint('red'); // no-op: already completed
    expect(ctrl.getHintUseCount()).toBe(countAtCompletion);
  });

  it('does not increment on a stuck hint', () => {
    const strandingLevel: LevelData = {
      id: 'stranding-hintcount',
      gridSize: { rows: 4, cols: 5 },
      colors: [
        {
          colorId: 'red',
          endpoints: [
            { row: 0, col: 0 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          endpoints: [
            { row: 3, col: 0 },
            { row: 3, col: 4 },
          ],
        },
      ],
      origin: 'hand',
      difficultyTag: 'hard',
      difficultyScore: 0,
      solution: [
        {
          colorId: 'red',
          path: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            { row: 1, col: 2 },
            { row: 1, col: 3 },
            { row: 1, col: 4 },
            { row: 0, col: 4 },
          ],
        },
        {
          colorId: 'blue',
          path: [
            { row: 3, col: 0 },
            { row: 2, col: 0 },
            { row: 2, col: 1 },
            { row: 2, col: 2 },
            { row: 2, col: 3 },
            { row: 2, col: 4 },
            { row: 3, col: 4 },
          ],
        },
      ],
      minTotalEdgeLength: 0,
      obstacles: {
        blockedCells: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 3, col: 1 },
          { row: 3, col: 2 },
          { row: 3, col: 3 },
        ],
        blockedEdges: [],
      },
    };
    const ctrl = createGameController(strandingLevel, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const prev = ctrl.getState();
    const divergedState: GameState = {
      ...prev,
      paths: new Map([
        [
          'red',
          {
            colorId: 'red',
            path: [
              { row: 0, col: 0 },
              { row: 1, col: 0 },
              { row: 2, col: 0 },
              { row: 2, col: 1 },
              { row: 2, col: 2 },
              { row: 2, col: 3 },
              { row: 2, col: 4 },
            ],
            completed: false,
          },
        ],
      ]),
    };
    ctrl.handleClickResult(prev, divergedState);
    ctrl.useHint('blue'); // stuck
    expect(ctrl.getHintUseCount()).toBe(0);
  });

  it('does not decrement when a hint-revealed move is undone', () => {
    const { ctrl } = makeController();
    ctrl.useHint('red');
    expect(ctrl.getHintUseCount()).toBe(1);
    ctrl.undo();
    expect(ctrl.getHintUseCount()).toBe(1);
  });

  it('persists across clearBoard within the same level attempt, but resets on resetLevel', () => {
    const { ctrl } = makeController();
    ctrl.useHint('red');
    expect(ctrl.getHintUseCount()).toBe(1);

    ctrl.clearBoard();
    expect(ctrl.getHintUseCount()).toBe(1);

    ctrl.resetLevel();
    expect(ctrl.getHintUseCount()).toBe(0);
  });
});

// ── resolveHintTargetColorId unit tests ──────────────────────────────────────

const twoColorLevel: LevelData = {
  id: 'two-color',
  gridSize: { rows: 1, cols: 4 },
  colors: [
    {
      colorId: 'red',
      endpoints: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    },
    {
      colorId: 'blue',
      endpoints: [
        { row: 0, col: 2 },
        { row: 0, col: 3 },
      ],
    },
  ],
  origin: 'hand',
  difficultyTag: 'easy',
  difficultyScore: 0,
  solution: [
    {
      colorId: 'red',
      path: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    },
    {
      colorId: 'blue',
      path: [
        { row: 0, col: 2 },
        { row: 0, col: 3 },
      ],
    },
  ],
  minTotalEdgeLength: 0,
};

function makeState(activeColorId: string | null, completedColors: string[] = []): GameState {
  const paths = new Map(
    completedColors.map((id) => [id, { colorId: id, path: [], completed: true }]),
  );
  return { levelId: 'two-color', paths, activeColorId };
}

describe('resolveHintTargetColorId', () => {
  it('returns activeColorId when it is set and not completed', () => {
    expect(resolveHintTargetColorId(makeState('blue'), twoColorLevel)).toBe('blue');
  });

  it('returns first not-completed color when activeColorId is null', () => {
    expect(resolveHintTargetColorId(makeState(null), twoColorLevel)).toBe('red');
  });

  it('falls through to first not-completed color when activeColorId is completed', () => {
    expect(resolveHintTargetColorId(makeState('red', ['red']), twoColorLevel)).toBe('blue');
  });

  it('returns null when all colors are completed', () => {
    expect(resolveHintTargetColorId(makeState('red', ['red', 'blue']), twoColorLevel)).toBeNull();
  });
});
