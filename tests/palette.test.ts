import { describe, it, expect } from 'vitest';
import { PALETTE } from '../src/palette/palette';
import { assignColorIds } from '../src/palette/assignColorIds';

describe('PALETTE', () => {
  it('has 8 colors including black', () => {
    expect(Object.keys(PALETTE)).toHaveLength(8);
    expect(PALETTE.black).toBe('#000000');
  });

  it('assignColorIds allows 8 colors and throws above 8', () => {
    expect(assignColorIds(8)).toHaveLength(8);
    expect(() => assignColorIds(9)).toThrow();
  });
});
