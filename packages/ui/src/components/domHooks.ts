/**
 * The page's only effects outside the shared components. Each one keeps a piece of the DOM in step with the
 * model (focus, a scroll position, a drawing, a popup's place); none copies one piece of state into another.
 */
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { captureKeys } from '../commands/keys.ts';

/** Focuses the element each time `when` turns true, before the next key can land anywhere else. */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useLayoutEffect(() => {
    if (when) ref.current?.focus();
  }, [ref, when]);
}

/**
 * Keeps the keyboard in a popup menu: focuses its first enabled button when it opens, calls `onClose` on a
 * pointer press outside it or when the window loses focus, and gives focus back to where it was on closing.
 * `shown` is false while the popup is still hidden for placing: a hidden element refuses focus, so the first
 * button is focused once it shows.
 */
export function usePopupFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, shown = true): void {
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('blur', onClose);
      const now = document.activeElement;
      if (previous?.isConnected && (now === null || now === document.body || ref.current?.contains(now)))
        previous.focus();
    };
  }, [ref, onClose]);
  useLayoutEffect(() => {
    if (shown) ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [ref, shown]);
}

/** Focuses the element each time `request` changes to a new number above 0: a command asked for it. */
export function useFocusRequest(ref: RefObject<HTMLElement | null>, request: number): void {
  useLayoutEffect(() => {
    if (request > 0) ref.current?.focus();
  }, [ref, request]);
}

/** The one item of a list or a group that takes Tab: the current one (roving tabindex). */
export const CURRENT_ITEM = '[tabindex="0"]';

/**
 * Keeps the keyboard on the current item of a list or a group, the one element inside `ref` with
 * `tabindex="0"` (the rest have -1). The app's state picks that item; this moves focus after it. When the current
 * item changes while focus is inside, or the focused item goes (a delete, an undo, a reload), focus moves to the
 * new current item. `request` above 0, each time it changes, focuses it outright: a command asked for it.
 */
export function useRovingFocus(ref: RefObject<HTMLElement | null>, request = 0): void {
  // Read while rendering, before this render can take the focused item away.
  const had = useRef(false);
  had.current = typeof document !== 'undefined' && (ref.current?.contains(document.activeElement) ?? false);
  useLayoutEffect(() => {
    const root = ref.current;
    const now = document.activeElement;
    const lost = now === null || now === document.body;
    if (!root || !(root.contains(now) || (had.current && lost))) return;
    const item = root.querySelector<HTMLElement>(CURRENT_ITEM);
    if (item && item !== now) item.focus();
  });
  useLayoutEffect(() => {
    if (request > 0) ref.current?.querySelector<HTMLElement>(CURRENT_ITEM)?.focus();
  }, [ref, request]);
}

/** Scrolls the element inside `ref` that `selector` finds into view whenever the selector changes. */
export function useScrollIntoView(ref: RefObject<HTMLElement | null>, selector: string | null): void {
  useEffect(() => {
    if (selector !== null) ref.current?.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  }, [ref, selector]);
}

/** Whether a media query matches now, following its changes. */
export function useMediaQuery(query: string): boolean {
  const list = typeof matchMedia === 'function' ? matchMedia(query) : null;
  const [matches, setMatches] = useState(list?.matches ?? false);
  useEffect(() => {
    if (!list) return;
    const changed = () => setMatches(list.matches);
    changed();
    list.addEventListener('change', changed);
    return () => list.removeEventListener('change', changed);
  }, [query]);
  return matches;
}

/**
 * Puts the markup `make` resolves to into the element each time `key` changes, then calls `after` on the
 * element. Markup that arrives after a newer `make` started is dropped. Returns true while the last one failed.
 */
export function useAsyncMarkup(
  ref: RefObject<HTMLElement | null>,
  key: string,
  make: () => Promise<string>,
  after: (el: HTMLElement) => void,
): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    make().then(
      (markup) => {
        if (!current || !ref.current) return;
        ref.current.innerHTML = markup;
        setFailed(false);
        after(ref.current);
      },
      (e: unknown) => {
        if (!current) return;
        console.warn('Couldn’t draw:', e);
        if (ref.current) ref.current.innerHTML = '';
        setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [ref, key]);
  return failed;
}

/**
 * Where a popup opened at `point` goes so it stays in the window: flipped up or left when it would run off.
 * Null until it has been measured; keep it hidden till then.
 */
export function usePopupPlace(
  ref: RefObject<HTMLElement | null>,
  point: { readonly x: number; readonly y: number },
): { x: number; y: number } | null {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    const h = ref.current?.offsetHeight ?? 0;
    setAt({
      x: point.x + w > innerWidth - 4 ? Math.max(4, point.x - w) : point.x,
      y: point.y + h > innerHeight - 4 ? Math.max(4, point.y - h) : point.y,
    });
  }, [ref, point.x, point.y]);
  return at;
}

/**
 * While `on`, every key press but Escape goes to `onKey` before the app sees it (`captureKeys`). Taken before the
 * browser paints, so the first key after turning it on is caught; given back when `on` turns false, when the
 * component goes, on Escape and if `onKey` throws (the last two call `onEnd`).
 */
export function useKeyCapture(
  on: boolean,
  onKey: (e: KeyboardEvent) => void,
  onEnd: (escape: KeyboardEvent | null) => void,
): void {
  useLayoutEffect(() => (on ? captureKeys(window, onKey, onEnd) : undefined), [on]);
}
