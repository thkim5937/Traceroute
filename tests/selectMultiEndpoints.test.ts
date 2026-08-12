import { describe, expect, it } from 'vitest';
import { MIN_ENDPOINT_GAP, selectMultiEndpoints } from '../src/generator/BoardGenerator.ts';
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
});
