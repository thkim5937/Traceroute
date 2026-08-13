import { describe, expect, it } from 'vitest';
import {
  MIN_ENDPOINT_GAP,
  MIN_ENDPOINT_GRID_DISTANCE,
  selectMultiEndpoints,
} from '../src/generator/BoardGenerator.ts';
import type { Coord } from '../src/data/LevelSchema.ts';

function straightPath(length: number): Coord[] {
  return Array.from({ length }, (_, col) => ({ row: 0, col }));
}

function gaps(coords: Coord[], path: Coord[]): number[] {
  const indices = coords.map((c) => path.findIndex((p) => p.row === c.row && p.col === c.col));
  return indices.slice(1).map((idx, i) => idx - indices[i]!);
}

describe('selectMultiEndpoints', () => {
  it('returns 3 well-spaced coords for a long straight path', () => {
    const path = straightPath(12);
    const result = selectMultiEndpoints(path, 3);
    expect(result).toBeDefined();
    expect(result).toHaveLength(3);
    expect(result![0]).toEqual(path[0]);
    expect(result![2]).toEqual(path[11]);
    expect(result![1]).toEqual({ row: 0, col: 6 });
    for (const gap of gaps(result!, path)) {
      expect(gap).toBeGreaterThanOrEqual(MIN_ENDPOINT_GAP + 1);
    }
  });

  it('returns 4 well-spaced coords for the same path', () => {
    const path = straightPath(12);
    const result = selectMultiEndpoints(path, 4);
    expect(result).toBeDefined();
    expect(result).toHaveLength(4);
    expect(result![0]).toEqual(path[0]);
    expect(result![3]).toEqual(path[11]);
    for (const gap of gaps(result!, path)) {
      expect(gap).toBeGreaterThanOrEqual(MIN_ENDPOINT_GAP + 1);
    }
  });

  it('returns undefined for a short path that cannot fit 4 spaced points', () => {
    const path = straightPath(4);
    const result = selectMultiEndpoints(path, 4);
    expect(result).toBeUndefined();
  });

  it('endpointCount=2 matches existing first/last extraction behavior', () => {
    const path = straightPath(6);
    const result = selectMultiEndpoints(path, 2);
    expect(result).toEqual([path[0], path[path.length - 1]]);
  });

  it('returns coordinates in the same relative order as they appear in path', () => {
    const path = straightPath(12);
    const result = selectMultiEndpoints(path, 4)!;
    const indices = result.map((c) => path.findIndex((p) => p.row === c.row && p.col === c.col));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it('returns undefined when a curled-back path places index-spaced endpoints orthogonally adjacent', () => {
    // Spiral-in shape. Path indices 0, 3, 6 are evenly spaced along the path
    // (satisfying the index-gap check), but index 0 (0,0) and index 3 (0,1)
    // end up only Manhattan-distance 1 apart on the grid because the path
    // curls back -- true orthogonal adjacency, which must still be rejected.
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ];
    const result = selectMultiEndpoints(path, 3);
    expect(result).toBeUndefined();
  });

  it('accepts index-spaced endpoints that are only diagonal-adjacent (Manhattan distance 2)', () => {
    // Same U-shape as before: index 0 (0,0) and index 6 (0,2) are
    // Manhattan-distance 2 apart (diagonal-adjacent), which the relaxed
    // MIN_ENDPOINT_GRID_DISTANCE threshold now allows.
    const path: Coord[] = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 1, col: 2 },
      { row: 0, col: 2 },
    ];
    const result = selectMultiEndpoints(path, 3);
    expect(result).toBeDefined();
    for (let i = 0; i < result!.length; i++) {
      for (let j = i + 1; j < result!.length; j++) {
        const a = result![i]!;
        const b = result![j]!;
        expect(Math.abs(a.row - b.row) + Math.abs(a.col - b.col)).toBeGreaterThanOrEqual(
          MIN_ENDPOINT_GRID_DISTANCE,
        );
      }
    }
  });
});
