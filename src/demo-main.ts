import './style.css';
import { createDemoController } from './ui/DemoController.ts';

createDemoController({
  rowsInput: document.getElementById('demo-rows') as HTMLInputElement,
  colsInput: document.getElementById('demo-cols') as HTMLInputElement,
  colorCountInput: document.getElementById('demo-color-count') as HTMLInputElement,
  generateButton: document.getElementById('demo-generate') as HTMLButtonElement,
  playButton: document.getElementById('demo-play') as HTMLButtonElement,
  statusEl: document.getElementById('demo-status') as HTMLElement,
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
});
