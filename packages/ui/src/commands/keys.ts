/** The page's one keyboard listener: every key goes through the command catalog (PRD §10). */
import { debounce } from '../schedule.ts';
import type { CommandCatalog, KeyFocus } from './command.ts';

/** How long "press a shortcut" waits for a key before it gives the keyboard back by itself. */
export const CAPTURE_IDLE_MS = 30_000;

/** Where keyboard focus is, for deciding which keys are commands. A list's own row counts as the list. */
export function keyFocus(el: Element | null): KeyFocus {
  if (!el || el === el.ownerDocument?.body) return 'list';
  if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'text';
  if (el.closest('button, a, [role=button], [role=menuitem]')) return 'control';
  return 'list';
}

/**
 * Sends key presses on `target` to the catalog. `blocked` is true while a dialog is open; then only commands
 * the catalog's gate lets through (those that toggle their own window) run, and a blocked shortcut with ⌘ or
 * Ctrl still doesn't reach the browser (Ctrl+Shift+C would open its inspector). Returns a function that stops
 * listening.
 */
export function listenForKeys(target: Window, catalog: CommandCatalog, blocked: () => boolean): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const result = catalog.forEvent(e, keyFocus(target.document.activeElement));
    if (!result) return;
    if (result.kind === 'wait') {
      e.preventDefault();
      return;
    }
    if (blocked() && !catalog.gate?.(result.command)) {
      if (e.metaKey || e.ctrlKey) e.preventDefault();
      return;
    }
    e.preventDefault();
    catalog.run(result.command.id);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}

/**
 * Takes every key press on `target` before the app sees it and hands it to `onKey`, for the Keyboard Shortcuts
 * window's "press a shortcut" mode. Escape is never taken: it ends the capture and goes on to the app as usual.
 * If `onKey` throws, the capture ends, so a bug can't leave every key swallowed, and so does `idleMs` with no key
 * pressed, so a forgotten capture can't either. `onEnd` is called once when the capture ends by itself: with the
 * Escape event, or null after an error or the idle time. Returns a function that ends it, safe to call more than once.
 */
export function captureKeys(
  target: EventTarget,
  onKey: (e: KeyboardEvent) => void,
  onEnd: (escape: KeyboardEvent | null) => void = () => {},
  idleMs = CAPTURE_IDLE_MS,
): () => void {
  const listening = new AbortController();
  const idle = debounce(idleMs, () => end(null));
  const stop = () => {
    idle.cancel();
    listening.abort();
  };
  const end = (escape: KeyboardEvent | null) => {
    if (listening.signal.aborted) return;
    stop();
    onEnd(escape);
  };
  function listener(event: Event) {
    const e = event as KeyboardEvent;
    if (e.key === 'Escape') {
      if (e.type === 'keydown') end(e);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    idle.call();
    let handled = false;
    try {
      onKey(e);
      handled = true;
    } catch (error) {
      console.error('Key capture failed, so it stopped', error);
    } finally {
      if (!handled) end(null);
    }
  }
  for (const type of ['keydown', 'keyup', 'keypress'])
    target.addEventListener(type, listener, { capture: true, signal: listening.signal });
  idle.call();
  return stop;
}
