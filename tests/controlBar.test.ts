// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createControlBar, setControlBarState } from '../src/ui/ControlBar.ts';

describe('ControlBar', () => {
  it('renders undo, redo, and clear buttons with SVG icons', () => {
    const bar = createControlBar({
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onClear: vi.fn(),
    });

    const undoButton = bar.querySelector('.control-bar__undo');
    const redoButton = bar.querySelector('.control-bar__redo');
    const clearButton = bar.querySelector('.control-bar__clear');

    expect(undoButton).toBeInstanceOf(HTMLButtonElement);
    expect(redoButton).toBeInstanceOf(HTMLButtonElement);
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);
    expect(undoButton?.querySelector('svg')).toBeTruthy();
    expect(redoButton?.querySelector('svg')).toBeTruthy();
  });

  it('invokes handlers on click', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onClear = vi.fn();
    const bar = createControlBar({ onUndo, onRedo, onClear });

    bar.querySelector<HTMLButtonElement>('.control-bar__undo')?.click();
    bar.querySelector<HTMLButtonElement>('.control-bar__redo')?.click();
    bar.querySelector<HTMLButtonElement>('.control-bar__clear')?.click();

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('toggles disabled state via setControlBarState', () => {
    const bar = createControlBar({
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onClear: vi.fn(),
    });

    setControlBarState(bar, { canUndo: false, canRedo: false });
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__undo')?.disabled).toBe(true);
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__redo')?.disabled).toBe(true);

    setControlBarState(bar, { canUndo: true, canRedo: false });
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__undo')?.disabled).toBe(false);
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__redo')?.disabled).toBe(true);

    setControlBarState(bar, { canUndo: true, canRedo: true });
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__undo')?.disabled).toBe(false);
    expect(bar.querySelector<HTMLButtonElement>('.control-bar__redo')?.disabled).toBe(false);
  });
});
