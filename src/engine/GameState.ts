import type { Coord } from '../data/LevelSchema';

export interface ColorPathState {
  colorId: string;
  path: Coord[]; // 시작 endpoint부터 현재 activeTail까지, 순서대로
  completed: boolean;
}

export interface GameState {
  levelId: string;
  paths: Map<string, ColorPathState>;
  activeColorId: string | null;
}
