export interface ControlBarHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const UNDO_ICON_SVG = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M8 4.5a6 6 0 1 1-5.4 3.4.75.75 0 0 1 1.35.66A4.5 4.5 0 1 0 8 6H6.1l2.15-2.15a.75.75 0 1 0-1.06-1.06L3.5 6.48a.75.75 0 0 0 0 1.06l3.69 3.69a.75.75 0 1 0 1.06-1.06L6.1 7.98"/>
</svg>`;

// Mirror image of the undo arc: same path, flipped horizontally.
const REDO_ICON_SVG = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true" style="transform: scaleX(-1);">
  <path d="M8 4.5a6 6 0 1 1-5.4 3.4.75.75 0 0 1 1.35.66A4.5 4.5 0 1 0 8 6H6.1l2.15-2.15a.75.75 0 1 0-1.06-1.06L3.5 6.48a.75.75 0 0 0 0 1.06l3.69 3.69a.75.75 0 1 0 1.06-1.06L6.1 7.98"/>
</svg>`;

function makeButton(
  className: string,
  iconSvg: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `control-bar__button ${className}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = iconSvg;
  button.addEventListener('click', onClick);
  return button;
}

export function createControlBar(handlers: ControlBarHandlers): HTMLDivElement {
  const bar = document.createElement('div');
  bar.className = 'control-bar';
  bar.appendChild(makeButton('control-bar__undo', UNDO_ICON_SVG, 'Undo', handlers.onUndo));
  bar.appendChild(makeButton('control-bar__redo', REDO_ICON_SVG, 'Redo', handlers.onRedo));

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'control-bar__button control-bar__clear';
  clearButton.textContent = 'Clear';
  clearButton.addEventListener('click', handlers.onClear);
  bar.appendChild(clearButton);

  return bar;
}

/**
 * Briefly highlights the Undo button to guide the player when a hint cannot
 * make progress (color's tail is stuck). Auto-dismisses after 1.5s.
 */
export function pulseUndoButton(controlBar: HTMLElement): void {
  const btn = controlBar.querySelector('.control-bar__undo');
  if (!(btn instanceof HTMLElement)) return;
  btn.classList.add('control-bar__undo--pulse');
  setTimeout(() => btn.classList.remove('control-bar__undo--pulse'), 1500);
}

export function setControlBarState(
  bar: HTMLElement,
  state: { canUndo: boolean; canRedo: boolean },
): void {
  const undoButton = bar.querySelector('.control-bar__undo');
  if (undoButton instanceof HTMLButtonElement) {
    undoButton.disabled = !state.canUndo;
  }
  const redoButton = bar.querySelector('.control-bar__redo');
  if (redoButton instanceof HTMLButtonElement) {
    redoButton.disabled = !state.canRedo;
  }
}
