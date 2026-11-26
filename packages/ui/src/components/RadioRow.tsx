import { useRef } from 'preact/hooks';
import { useRovingFocus } from './domHooks.ts';

/**
 * Where an arrow key moves the choice in a row of `count` radio buttons: ← ↑ back, → ↓ on, wrapping round, and
 * Home and End to the ends. `undefined` for any other key, or with a modifier held.
 */
export function radioStep(
  e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  index: number,
  count: number,
): number | undefined {
  if (count === 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return undefined;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return (index - 1 + count) % count;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return (index + 1) % count;
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return count - 1;
  return undefined;
}

/**
 * A segmented row of radio buttons, one Tab stop: the chosen one takes Tab and the arrows pick another. The
 * value comes from the app's state, and the keyboard follows it, so the ring is always on the chosen button.
 */
export function RadioRow<T extends string>(props: {
  readonly items: readonly T[];
  readonly titles: Readonly<Record<T, string>>;
  readonly value: T;
  readonly onPick: (value: T) => void;
  readonly label?: string;
  readonly labelledBy?: string;
  readonly class?: string;
  readonly title?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  useRovingFocus(row);
  const index = props.items.indexOf(props.value);
  return (
    <div
      ref={row}
      class={props.class ? `iou-segmented ${props.class}` : 'iou-segmented'}
      role="radiogroup"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      onKeyDown={(e) => {
        const to = radioStep(e, index, props.items.length);
        if (to === undefined) return;
        e.preventDefault();
        if (to !== index) props.onPick(props.items[to]!);
      }}
    >
      {props.items.map((item, i) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={props.value === item}
          tabIndex={i === Math.max(0, index) ? 0 : -1}
          title={props.title}
          onClick={() => props.onPick(item)}
        >
          {props.titles[item]}
        </button>
      ))}
    </div>
  );
}
