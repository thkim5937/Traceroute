/**
 * Maps every colorId used across src/levels/hand/hand-*.json to an
 * Okabe-Ito colorblind-safe hex color. Five of the six colorIds ("orange",
 * "blue", "green", "yellow", "vermillion") name their Okabe-Ito color
 * directly. "sky" has no direct name match — "vermillion" already claims
 * the only reddish color, so "sky" takes the one leftover color, sky blue,
 * to keep the mapping a consistent 1:1.
 */
export const PALETTE: Record<string, string> = {
  orange: '#E69F00',
  blue: '#0072B2',
  green: '#009E73',
  yellow: '#F0E442',
  vermillion: '#D55E00',
  sky: '#56B4E9',
};
