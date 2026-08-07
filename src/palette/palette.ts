/**
 * Maps every colorId used across src/levels/hand/hand-*.json to an
 * Okabe-Ito colorblind-safe hex color. Five of the six original colorIds
 * ("orange", "blue", "green", "yellow", "vermillion") name their Okabe-Ito
 * color directly. "sky" has no direct name match — "vermillion" already
 * claims the only reddish color, so "sky" takes the one leftover color, sky
 * blue, to keep the mapping a consistent 1:1. "purple" (TRD §5.13 2026-08-06
 * revision) adds the Okabe-Ito reddish purple as the 7th color.
 */
export const PALETTE: Record<string, string> = {
  orange: '#E69F00',
  blue: '#0072B2',
  green: '#009E73',
  yellow: '#F0E442',
  vermillion: '#D55E00',
  sky: '#56B4E9',
  purple: '#CC79A7',
  black: '#000000',
};
