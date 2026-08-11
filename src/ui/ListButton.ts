// Hamburger icon, matching ControlBar's 16×16 SVG convention.
const HAMBURGER_ICON_SVG = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M3 5.5A.75.75 0 0 1 3.75 4.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.5ZM3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm0 4.5a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z"/>
</svg>`;

// Close/X icon, same 16×16 convention, shown while the level list overlay is open.
const CLOSE_ICON_SVG = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z"/>
</svg>`;

export function createListButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'list-button';
  button.innerHTML = HAMBURGER_ICON_SVG;
  button.addEventListener('click', onClick);
  setListButtonOpen(button, false);
  return button;
}

/** Swaps the button's icon/label between the closed (hamburger) and open (close) states. */
export function setListButtonOpen(button: HTMLButtonElement, isOpen: boolean): void {
  button.innerHTML = isOpen ? CLOSE_ICON_SVG : HAMBURGER_ICON_SVG;
  const label = isOpen ? 'Close level list' : 'Level list';
  button.setAttribute('aria-label', label);
  button.title = label;
}
