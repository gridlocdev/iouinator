/** The Transactions pane (PRD §4): the form above, the list below, with the filter between. */
import { useRef } from 'preact/hooks';
import { formatCents } from '@iouinator/core';
import { useFocusRequest, useRovingFocus, useScrollIntoView } from '@iouinator/ui';
import type { AppController } from './controller.ts';
import { TransactionFields, useTransactionDraft } from './TransactionFields.tsx';

export function TransactionsPane({ app }: { readonly app: AppController }) {
  return (
    <section class="iou-pane iou-transactions" aria-labelledby="iou-transactions-title">
      <h2 id="iou-transactions-title" class="iou-pane-title">
        Transactions
      </h2>
      {app.readOnly.value !== null ? null : app.ledger.value.people.length < 2 ? (
        <p class="iou-empty">Add at least two people to record a transaction.</p>
      ) : (
        <TransactionForm app={app} />
      )}
      <FilterBar app={app} />
      <TransactionList app={app} />
    </section>
  );
}

/** Adds a transaction; From and To stay for the next one, and focus goes back to Amount (PRD §4.3). */
function TransactionForm({ app }: { readonly app: AppController }) {
  const draft = useTransactionDraft(app, 'iou-new');
  const amount = useRef<HTMLInputElement>(null);
  const focus = app.focus.value;
  useFocusRequest(amount, focus.target === 'amount' ? focus.n : 0);
  return (
    <form
      class="iou-transaction-form"
      aria-label="New transaction"
      // An error is about this try: moving on to something else (a row, a dialog) drops it.
      onFocusOut={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !e.currentTarget.contains(to)) draft.clear();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const fields = draft.fields();
        if ('error' in fields) return draft.fail(fields.error, fields.field);
        const error = app.addTransaction(fields);
        if (error !== null) return draft.fail(error);
        draft.set({ amount: '', description: '' });
        amount.current?.focus();
      }}
    >
      <TransactionFields app={app} draft={draft} idPrefix="iou-new" amountRef={amount} />
      <button type="submit" class="iou-button iou-button-primary">
        Add
      </button>
    </form>
  );
}

function FilterBar({ app }: { readonly app: AppController }) {
  const text = app.filterText();
  if (text === null) return null;
  return (
    <div class="iou-filter" role="status">
      <span>
        Showing <strong>{text}</strong>
      </span>
      <button type="button" class="iou-link-button" onClick={() => app.clearFilter()}>
        Clear
      </button>
    </div>
  );
}

/**
 * The list: one row per transaction, newest last. It takes the keyboard as one stop, the chosen row (or the last
 * when none is); ↑/↓, Home/End choose a row, Enter edits it and Delete removes it, through the command catalog
 * (PRD §4.3). The chosen row is the app's state, and the keyboard follows it.
 */
function TransactionList({ app }: { readonly app: AppController }) {
  const list = useRef<HTMLDivElement>(null);
  const rows = app.visible.value;
  const chosen = app.chosen.value;
  const all = app.ledger.value.transactions.length;
  useScrollIntoView(list, chosen === null ? null : `[data-id="${chosen}"]`);
  const focus = app.focus.value;
  useRovingFocus(list, focus.target === 'list' ? focus.n : 0);
  // Under "Add at least two people…", an empty list has nothing more to say.
  if (all === 0 && app.ledger.value.people.length < 2) return null;
  if (rows.length === 0)
    return <p class="iou-empty">{all === 0 ? 'No transactions yet.' : 'No transactions match.'}</p>;
  const current = rows.some((t) => t.id === chosen) ? chosen : rows.at(-1)!.id;
  return (
    <div
      ref={list}
      class="iou-transaction-list"
      role="listbox"
      aria-label="Transactions"
      onFocusIn={(e) => {
        app.listFocused.value = true;
        const id = (e.target as HTMLElement).dataset.id;
        if (id !== undefined && id !== chosen) app.chosen.value = id;
      }}
      onFocusOut={(e) => {
        if (!list.current?.contains(e.relatedTarget as Node | null)) app.listFocused.value = false;
      }}
      onContextMenu={(e) => {
        // A right-click opens on its row; Shift+F10 or the menu key on the chosen one.
        e.preventDefault();
        const row = (e.target as Element).closest<HTMLElement>('[data-id]');
        const id = row?.dataset.id ?? chosen;
        if (id == null) return;
        const r = (row ?? list.current?.querySelector(`[data-id="${id}"]`))?.getBoundingClientRect();
        const at =
          e.clientX || e.clientY || !r ? { x: e.clientX, y: e.clientY } : { x: r.left + 8, y: r.bottom };
        app.openMenu({ kind: 'transaction', id, ...at });
      }}
    >
      {rows.map((t) => {
        const label = `${app.name(t.from)} owes ${app.name(t.to)} ${formatCents(t.cents)} for ${t.description}`;
        return (
          <div
            key={t.id}
            id={`iou-t-${t.id}`}
            data-id={t.id}
            role="option"
            aria-selected={t.id === chosen}
            tabIndex={t.id === current ? 0 : -1}
            aria-label={label}
            class="iou-transaction"
            onPointerDown={() => (app.chosen.value = t.id)}
            onDblClick={() => app.startEdit(t)}
          >
            <span class="iou-transaction-who">
              <span>{app.name(t.from)}</span>
              <span class="iou-arrow" aria-hidden="true">
                →
              </span>
              <span>{app.name(t.to)}</span>
            </span>
            <span class="iou-transaction-for">{t.description}</span>
            <span class="iou-transaction-amount">{formatCents(t.cents)}</span>
          </div>
        );
      })}
    </div>
  );
}
