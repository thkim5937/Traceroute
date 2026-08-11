import type { GameController } from '../engine/GameController.ts';

// Lightbulb icon, matching ControlBar's 16×16 SVG convention.
const HINT_ICON_SVG = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M10 2a6 6 0 0 0-3.5 10.8V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-1.2A6 6 0 0 0 10 2ZM8.5 16h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1Z"/>
</svg>`;

export function createHintButton(getController: () => GameController): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'control-bar__button control-bar__hint';
  button.setAttribute('aria-label', 'Hint');
  button.title = 'Hint';
  button.innerHTML = HINT_ICON_SVG;
  button.addEventListener('click', () => {
    getController().useHint();
  });
  return button;
}
