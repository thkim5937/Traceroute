import { describe, it, expect } from 'vitest';
import { assignColorIds } from '../src/palette/assignColorIds';
import { PALETTE } from '../src/palette/palette';

describe('assignColorIds', () => {
  it('returns the first colorCount keys of PALETTE in PALETTE order', () => {
    const keys = Object.keys(PALETTE);
    expect(assignColorIds(3)).toEqual(keys.slice(0, 3));
    expect(assignColorIds(1)).toEqual(keys.slice(0, 1));
  });

  it('returns all palette keys when colorCount equals the palette size', () => {
    const keys = Object.keys(PALETTE);
    expect(assignColorIds(keys.length)).toEqual(keys);
  });

  it('throws when colorCount exceeds the palette size', () => {
    const keys = Object.keys(PALETTE);
    expect(() => assignColorIds(keys.length + 1)).toThrow();
  });
});
