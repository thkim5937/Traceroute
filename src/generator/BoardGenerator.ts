import type { Coord } from '../data/LevelSchema.ts';

const P_STOP = 0.15;
export const GENERATOR_RETRY_LIMIT = 5000;

export type GenerationStepEvent =
  | { type: 'grow' | 'stop' | 'dead-end'; colorIndex: number; cell: Coord }
  | { type: 'retry'; attemptNumber: number };

export interface SnakeGrowthResult {
  gridSize: { rows: number; cols: number };
  colorPaths: Coord[][];
  occupied: boolean[][];
  leftoverCells: Coord[];
}

export interface AbsorptionResult {
  gridSize: { rows: number; cols: number };
  colorPaths: Coord[][];
  occupied: boolean[][];
  success: boolean;
  remainingLeftover: Coord[];
}

export interface FillResult {
  gridSize: { rows: number; cols: number };
  colorCount: number;
  success: boolean;
  colorPaths?: Coord[][];
  occupied?: boolean[][];
  attemptsUsed: number;
}

export interface BoardResult {
  success: boolean;
  endpoints?: Coord[][];
  attemptsUsed: number;
}

const DIRECTIONS: Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

function isOccupied(occupied: boolean[][], row: number, col: number): boolean {
  return occupied[row]?.[col] ?? false;
}

function setOccupied(occupied: boolean[][], row: number, col: number): void {
  const rowCells = occupied[row];
  if (rowCells === undefined) {
    return;
  }
  rowCells[col] = true;
}

function unoccupiedNeighbors(
  occupied: boolean[][],
  gridSize: { rows: number; cols: number },
  cell: Coord,
): Coord[] {
  const neighbors: Coord[] = [];
  for (const dir of DIRECTIONS) {
    const row = cell.row + dir.row;
    const col = cell.col + dir.col;
    if (row < 0 || row >= gridSize.rows || col < 0 || col >= gridSize.cols) {
      continue;
    }
    if (!isOccupied(occupied, row, col)) {
      neighbors.push({ row, col });
    }
  }
  return neighbors;
}

function pickRandom<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function isAdjacent(a: Coord, b: Coord): boolean {
  const rowDiff = Math.abs(a.row - b.row);
  const colDiff = Math.abs(a.col - b.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

function coordKey(cell: Coord): string {
  return `${cell.row},${cell.col}`;
}

export function growSnakes(
  gridSize: { rows: number; cols: number },
  colorCount: number,
  onStep?: (event: GenerationStepEvent) => void,
  blockedCells: Coord[] = [],
): SnakeGrowthResult {
  const occupied: boolean[][] = Array.from({ length: gridSize.rows }, () =>
    new Array<boolean>(gridSize.cols).fill(false),
  );
  for (const cell of blockedCells) {
    setOccupied(occupied, cell.row, cell.col);
  }
  const colorPaths: Coord[][] = [];

  for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
    const allUnoccupied: Coord[] = [];
    for (let row = 0; row < gridSize.rows; row++) {
      for (let col = 0; col < gridSize.cols; col++) {
        if (!isOccupied(occupied, row, col)) {
          allUnoccupied.push({ row, col });
        }
      }
    }
    // TRD §5.4 (2026-08-05): a color's first move must always be taken if any
    // unvisited neighbor exists, so only start where a first move is possible.
    // p_stop below never applies to that first move — it only gates the
    // second potential move onward.
    const startCandidates = allUnoccupied.filter(
      (cell) => unoccupiedNeighbors(occupied, gridSize, cell).length > 0,
    );
    const start = pickRandom(startCandidates);
    if (start === undefined) {
      colorPaths.push([]);
      continue;
    }

    setOccupied(occupied, start.row, start.col);
    const path: Coord[] = [start];
    onStep?.({ type: 'grow', colorIndex, cell: start });

    for (;;) {
      const tail = path[path.length - 1];
      if (tail === undefined) {
        break;
      }
      const candidates = unoccupiedNeighbors(occupied, gridSize, tail);
      if (candidates.length === 0) {
        onStep?.({ type: 'dead-end', colorIndex, cell: tail });
        break;
      }

      const next = pickRandom(candidates);
      if (next === undefined) {
        break;
      }
      setOccupied(occupied, next.row, next.col);
      path.push(next);
      onStep?.({ type: 'grow', colorIndex, cell: next });

      if (path.length >= 2 && Math.random() < P_STOP) {
        onStep?.({ type: 'stop', colorIndex, cell: next });
        break;
      }
    }

    colorPaths.push(path);
  }

  const leftoverCells: Coord[] = [];
  for (let row = 0; row < gridSize.rows; row++) {
    for (let col = 0; col < gridSize.cols; col++) {
      if (!isOccupied(occupied, row, col)) {
        leftoverCells.push({ row, col });
      }
    }
  }

  return { gridSize, colorPaths, occupied, leftoverCells };
}

export function absorbLeftoverCells(
  growth: SnakeGrowthResult,
  onStep?: (event: GenerationStepEvent) => void,
): AbsorptionResult {
  const gridSize = growth.gridSize;
  const colorPaths = growth.colorPaths.map((path) => path.slice());
  const occupied = growth.occupied.map((row) => row.slice());
  const leftoverMap = new Map<string, Coord>(
    growth.leftoverCells.map((cell) => [coordKey(cell), cell]),
  );

  for (;;) {
    const endpoints: (Coord | undefined)[] = colorPaths.map((path) => path[path.length - 1]);
    const claimedColors = new Set<number>();
    const toAbsorb: { cell: Coord; colorIndex: number }[] = [];

    for (const cell of leftoverMap.values()) {
      let matchCount = 0;
      let matchedColorIndex: number | undefined;
      for (let colorIndex = 0; colorIndex < endpoints.length; colorIndex++) {
        const endpoint = endpoints[colorIndex];
        if (endpoint !== undefined && isAdjacent(endpoint, cell)) {
          matchCount++;
          matchedColorIndex = colorIndex;
        }
      }
      if (
        matchCount === 1 &&
        matchedColorIndex !== undefined &&
        !claimedColors.has(matchedColorIndex)
      ) {
        toAbsorb.push({ cell, colorIndex: matchedColorIndex });
        claimedColors.add(matchedColorIndex);
      }
    }

    if (toAbsorb.length === 0) {
      break;
    }

    for (const { cell, colorIndex } of toAbsorb) {
      colorPaths[colorIndex]?.push(cell);
      setOccupied(occupied, cell.row, cell.col);
      leftoverMap.delete(coordKey(cell));
      onStep?.({ type: 'grow', colorIndex, cell });
    }
  }

  const remainingLeftover = Array.from(leftoverMap.values());
  const everyColorHasCells = colorPaths.every((path) => path.length > 0);
  return {
    gridSize,
    colorPaths,
    occupied,
    success: remainingLeftover.length === 0 && everyColorHasCells,
    remainingLeftover,
  };
}

export function fillGridWithRetry(
  gridSize: { rows: number; cols: number },
  colorCount: number,
  onStep?: (event: GenerationStepEvent) => void,
  retryLimit: number = GENERATOR_RETRY_LIMIT,
  deps: {
    growSnakes: typeof growSnakes;
    absorbLeftoverCells: typeof absorbLeftoverCells;
  } = { growSnakes, absorbLeftoverCells },
  blockedCells?: Coord[],
): FillResult {
  for (let attempt = 1; attempt <= retryLimit; attempt++) {
    if (attempt > 1) {
      onStep?.({ type: 'retry', attemptNumber: attempt });
    }

    const growth = deps.growSnakes(gridSize, colorCount, onStep, blockedCells);
    const absorption = deps.absorbLeftoverCells(growth, onStep);

    if (absorption.success) {
      return {
        gridSize,
        colorCount,
        success: true,
        colorPaths: absorption.colorPaths,
        occupied: absorption.occupied,
        attemptsUsed: attempt,
      };
    }
  }

  console.warn(
    `fillGridWithRetry: failed to fill grid after ${retryLimit} attempts ` +
      `(gridSize=${JSON.stringify(gridSize)}, colorCount=${colorCount})`,
  );
  return {
    gridSize,
    colorCount,
    success: false,
    attemptsUsed: retryLimit,
  };
}

export const MIN_ENDPOINT_GAP = 2;

export function selectMultiEndpoints(path: Coord[], endpointCount: number): Coord[] | undefined {
  const lastIndex = path.length - 1;
  const indices: number[] = [];
  for (let i = 0; i < endpointCount; i++) {
    indices.push(Math.round((i * lastIndex) / (endpointCount - 1)));
  }

  for (let i = 1; i < indices.length; i++) {
    const prev = indices[i - 1];
    const curr = indices[i];
    if (prev === undefined || curr === undefined || curr - prev < MIN_ENDPOINT_GAP + 1) {
      return undefined;
    }
  }

  return indices.map((index) => {
    const cell = path[index];
    if (cell === undefined) {
      throw new Error('selectMultiEndpoints: index out of range despite bounds check');
    }
    return cell;
  });
}

function shuffledIndices(count: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = indices[i];
    const b = indices[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    indices[i] = b;
    indices[j] = a;
  }
  return indices;
}

function defaultEndpoints(colorPaths: Coord[][]): Coord[][] {
  return colorPaths.map((path) => {
    const start = path[0];
    const end = path[path.length - 1];
    if (start === undefined || end === undefined) {
      throw new Error('generateBoard: color path unexpectedly empty despite fill success');
    }
    return [start, end];
  });
}

export function generateBoard(
  gridSize: { rows: number; cols: number },
  colorCount: number,
  onStep?: (event: GenerationStepEvent) => void,
  retryLimit: number = GENERATOR_RETRY_LIMIT,
  deps: { fillGridWithRetry: typeof fillGridWithRetry } = { fillGridWithRetry },
  blockedCells?: Coord[],
  multiEndpointRequests?: number[],
): BoardResult {
  if (multiEndpointRequests === undefined || multiEndpointRequests.length === 0) {
    const fillResult = deps.fillGridWithRetry(
      gridSize,
      colorCount,
      onStep,
      retryLimit,
      undefined,
      blockedCells,
    );

    if (!fillResult.success || fillResult.colorPaths === undefined) {
      return {
        success: false,
        attemptsUsed: fillResult.attemptsUsed,
      };
    }

    return {
      success: true,
      endpoints: defaultEndpoints(fillResult.colorPaths),
      attemptsUsed: fillResult.attemptsUsed,
    };
  }

  for (let attempt = 1; attempt <= retryLimit; attempt++) {
    if (attempt > 1) {
      onStep?.({ type: 'retry', attemptNumber: attempt });
    }

    const fillResult = deps.fillGridWithRetry(
      gridSize,
      colorCount,
      onStep,
      1,
      undefined,
      blockedCells,
    );
    if (!fillResult.success || fillResult.colorPaths === undefined) {
      continue;
    }

    const endpoints = defaultEndpoints(fillResult.colorPaths);
    const chosenCount = Math.min(multiEndpointRequests.length, colorCount);
    // Prioritize the longest-grown paths for the upgrade instead of picking
    // uniformly at random: a longer path is far more likely to satisfy
    // selectMultiEndpoints' MIN_ENDPOINT_GAP spacing requirement, which
    // meaningfully raises the whole-grid-reroll success rate on dense grids
    // (TRD §5.15 batch-generation tuning, 2026-08-13). Ties (e.g. mocked
    // equal-length paths in tests) are broken by a pre-shuffle so ordering
    // stays non-deterministic when lengths are equal.
    const colorPaths = fillResult.colorPaths;
    const chosenIndices = shuffledIndices(colorCount)
      .sort((a, b) => (colorPaths[b]?.length ?? 0) - (colorPaths[a]?.length ?? 0))
      .slice(0, chosenCount);
    // Pair the largest requested endpoint count with the longest available
    // path for the same reason.
    const sortedRequests = [...multiEndpointRequests].sort((a, b) => b - a);

    let allChosenSucceeded = true;
    for (let i = 0; i < chosenIndices.length; i++) {
      const colorIndex = chosenIndices[i];
      const requestedCount = sortedRequests[i];
      if (colorIndex === undefined || requestedCount === undefined) {
        continue;
      }
      const path = fillResult.colorPaths[colorIndex];
      const selected = path === undefined ? undefined : selectMultiEndpoints(path, requestedCount);
      if (selected === undefined) {
        allChosenSucceeded = false;
        break;
      }
      endpoints[colorIndex] = selected;
    }

    if (allChosenSucceeded) {
      return {
        success: true,
        endpoints,
        attemptsUsed: attempt,
      };
    }
  }

  console.warn(
    `generateBoard: failed to fill grid with requested multi-endpoint colors after ${retryLimit} attempts ` +
      `(gridSize=${JSON.stringify(gridSize)}, colorCount=${colorCount})`,
  );
  return {
    success: false,
    attemptsUsed: retryLimit,
  };
}
