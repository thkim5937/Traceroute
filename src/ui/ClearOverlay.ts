const VISIBLE_CLASS = 'clear-overlay--visible';

export function createClearOverlay(onNextLevel: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'clear-overlay';

  const message = document.createElement('p');
  message.className = 'clear-overlay__message';
  message.textContent = 'Clear!';
  overlay.appendChild(message);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'clear-overlay__button';
  button.textContent = 'Next Level';
  button.addEventListener('click', onNextLevel);
  overlay.appendChild(button);

  return overlay;
}

export interface ClearOverlayContent {
  message: string;
  showButton: boolean;
}

export function setClearOverlayContent(overlay: HTMLElement, content: ClearOverlayContent): void {
  const message = overlay.querySelector('.clear-overlay__message');
  if (message !== null) {
    message.textContent = content.message;
  }
  const button = overlay.querySelector('.clear-overlay__button');
  if (button instanceof HTMLElement) {
    button.hidden = !content.showButton;
  }
}

export function showClearOverlay(overlay: HTMLElement): void {
  overlay.classList.add(VISIBLE_CLASS);
}

export function hideClearOverlay(overlay: HTMLElement): void {
  overlay.classList.remove(VISIBLE_CLASS);
}

export function isClearOverlayVisible(overlay: HTMLElement): boolean {
  return overlay.classList.contains(VISIBLE_CLASS);
}
