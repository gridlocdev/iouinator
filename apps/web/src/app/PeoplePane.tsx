/** The People pane (PRD §3): the add field, then each person with their balance. */
import { useRef, useState } from 'preact/hooks';
import { MAX_NAME, formatCents } from '@iouinator/core';
import { useFocusRequest } from '@iouinator/ui';
import type { AppController } from './controller.ts';

/** `+$12.50` (is owed), `−$4.00` (owes) or `settled`. */
export function balanceText(cents: number): string {
  if (cents === 0) return 'settled';
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

export function PeoplePane({ app }: { readonly app: AppController }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const focus = app.focus.value;
  useFocusRequest(input, focus.target === 'person' ? focus.n : 0);
  const people = app.ledger.value.people;
  const balances = app.balances.value;
  const filter = app.filter.value;
  return (
    <section class="iou-pane iou-people" aria-labelledby="iou-people-title">
      <h2 id="iou-people-title" class="iou-pane-title">
        People
      </h2>
      <form
        class="iou-add-person"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = app.addPerson(name);
          setError(problem);
          if (problem === null) setName('');
        }}
      >
        <input
          ref={input}
          type="text"
          autoComplete="off"
          placeholder="Add a person"
          aria-label="Name of a person to add"
          maxLength={MAX_NAME + 20}
          value={name}
          aria-invalid={error !== null}
          aria-describedby={error ? 'iou-person-error' : undefined}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
        />
        <button type="submit" class="iou-button">
          Add
        </button>
      </form>
      {error && (
        <p id="iou-person-error" class="iou-field-error" role="alert">
          {error}
        </p>
      )}
      {people.length === 0 ? (
        <p class="iou-empty">No one yet. Add the people who owe each other.</p>
      ) : (
        <ul class="iou-person-list">
          {people.map((p) => {
            const cents = balances.get(p.id) ?? 0;
            const shown = filter?.kind === 'person' && filter.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  class="iou-person"
                  aria-pressed={shown}
                  title="Show their transactions"
                  onClick={() => (shown ? app.clearFilter() : app.showPerson(p.id))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const at = menuPoint(e);
                    app.openMenu({ kind: 'person', id: p.id, ...at });
                  }}
                >
                  <span class="iou-person-name">{p.name}</span>
                  <span
                    class={`iou-balance${cents > 0 ? ' iou-owed' : cents < 0 ? ' iou-owes' : ''}`}
                    aria-label={
                      cents === 0
                        ? 'settled'
                        : cents > 0
                          ? `is owed ${formatCents(cents)}`
                          : `owes ${formatCents(-cents)}`
                    }
                  >
                    {balanceText(cents)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Where a context menu opens: at the pointer, or under the element for Shift+F10 and the menu key. */
export function menuPoint(e: MouseEvent): { x: number; y: number } {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left + 8, y: r.bottom };
}
