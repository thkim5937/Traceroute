import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('sanity check: environment is working', () => {
    expect(1 + 1).toBe(2);
  });
});
