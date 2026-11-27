/**
 * The From and To pickers (PRD §4.3). The page draws its own list instead of a native select, whose open list
 * on macOS takes no keys from the page: while the list is open, Tab and Shift+Tab (and ↓ ↑) move through the
 * names; while it's closed, Tab moves on to the next field as usual.
 */
import { useRef, useState } from 'preact/hooks';
import type { Person } from '@iouinator/core';
import { Icon, isComposingKey, listStep, usePopupPlace, useScrollIntoView } from '@iouinator/ui';

interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** The next person after `from` whose name starts with `letter`, wrapping round; -1 if nobody's does. */
export function nextByLetter(people: readonly Person[], letter: string, from: number): number {
  const l = letter.toLocaleLowerCase();
  for (let step = 1; step <= people.length; step++) {
    const i = (from + step) % people.length;
    if (people[i]!.name.toLocaleLowerCase().startsWith(l)) return i;
  }
  return -1;
}

const isLetter = (e: KeyboardEvent) =>
  e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey;

export function PersonPicker({
  id,
  label,
  people,
  value,
  describedBy,
  invalid = false,
  onPick,
}: {
  readonly id: string;
  readonly label: string;
  readonly people: readonly Person[];
  readonly value: string;
  readonly describedBy: string | undefined;
  readonly invalid?: boolean;
  readonly onPick: (id: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<Anchor | null>(null);
  const [index, setIndex] = useState(0);
  const current = people.findIndex((p) => p.id === value);
  const optionId = (i: number) => `${id}-option-${i}`;

  const show = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r || people.length === 0) return;
    setIndex(Math.max(0, current));
    setOpen({ x: r.left, y: r.bottom + 2, width: r.width });
  };
  const close = () => setOpen(null);
  const pick = (i: number) => {
    const person = people[i];
    if (person) onPick(person.id);
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isComposingKey(e)) return;
    if (open) {
      const step = listStep(e, index, people.length);
      if (step !== undefined) setIndex(step);
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(people.length - 1);
      else if (e.key === 'Enter' || e.key === ' ') pick(index);
      else if (e.key === 'Escape') close();
      else if (isLetter(e)) {
        const i = nextByLetter(people, e.key, index);
        if (i >= 0) setIndex(i);
      } else return;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ') show();
    // Enter in any field adds the transaction, as in the text fields.
    else if (e.key === 'Enter') button.current?.closest('form')?.requestSubmit();
    else if (isLetter(e)) {
      const i = nextByLetter(people, e.key, current);
      if (i >= 0) pick(i);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div class="iou-field iou-picker">
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        class="iou-picker-button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open !== null}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? optionId(index) : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        // Space opens on key down; its key up would click the button and close the list again.
        onKeyUp={(e) => e.key === ' ' && e.preventDefault()}
        onBlur={close}
      >
        <span class="iou-picker-name">{people[current]?.name ?? ''}</span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <PickerList
          id={id}
          people={people}
          current={current}
          index={index}
          anchor={open}
          optionId={optionId}
          onHover={setIndex}
          onPick={pick}
        />
      )}
    </div>
  );
}

function PickerList({
  id,
  people,
  current,
  index,
  anchor,
  optionId,
  onHover,
  onPick,
}: {
  readonly id: string;
  readonly people: readonly Person[];
  readonly current: number;
  readonly index: number;
  readonly anchor: Anchor;
  readonly optionId: (i: number) => string;
  readonly onHover: (i: number) => void;
  readonly onPick: (i: number) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const at = usePopupPlace(list, anchor);
  useScrollIntoView(list, `#${optionId(index)}`);
  return (
    <ul
      ref={list}
      id={`${id}-list`}
      role="listbox"
      class="iou-picker-list"
      style={{
        left: `${(at ?? anchor).x}px`,
        top: `${(at ?? anchor).y}px`,
        minWidth: `${anchor.width}px`,
        visibility: at ? 'visible' : 'hidden',
      }}
    >
      {people.map((p, i) => (
        <li
          key={p.id}
          id={optionId(i)}
          role="option"
          aria-selected={i === index}
          class="iou-picker-option"
          // Keep focus on the button, so the list stays open and its keys keep working.
          onPointerDown={(e) => e.preventDefault()}
          onPointerMove={() => i !== index && onHover(i)}
          onClick={() => onPick(i)}
        >
          <span class="iou-picker-check" aria-hidden="true">
            {i === current ? '✓' : ''}
          </span>
          {p.name}
        </li>
      ))}
    </ul>
  );
}
