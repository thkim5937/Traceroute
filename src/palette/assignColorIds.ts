import { PALETTE } from './palette';

const PALETTE_KEYS = Object.keys(PALETTE);

export function assignColorIds(colorCount: number): string[] {
  if (colorCount > PALETTE_KEYS.length) {
    throw new Error(
      `assignColorIds: colorCount (${colorCount}) exceeds palette size (${PALETTE_KEYS.length})`,
    );
  }
  return PALETTE_KEYS.slice(0, colorCount);
}
