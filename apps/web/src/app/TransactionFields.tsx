/** The From, To, Amount and For fields, shared by the transaction form and Edit Transaction… (PRD §4.3). */
import { useState } from 'preact/hooks';
import { MAX_DESCRIPTION, parseAmount, type Ledger, type TransactionFields as Fields } from '@iouinator/core';
import type { AppController } from './controller.ts';

export interface DraftValues {
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly description: string;
}

export interface TransactionDraft {
  readonly values: DraftValues;
  readonly error: string | null;
  set(change: Partial<DraftValues>): void;
  setError(error: string | null): void;
  /** The fields as the ledger takes them, or the amount's error. */
  fields(): Fields | { readonly error: string };
}

const EMPTY: DraftValues = { from: '', to: '', amount: '', description: '' };

/**
 * The From and To the fields show. One that names nobody in the ledger (a new form, a removed person) is the
 * first person who fits, so what you see is what is added.
 */
export function shownPair(ledger: Ledger, values: DraftValues): { from: string; to: string } {
  const people = ledger.people;
  const has = (id: string) => people.some((p) => p.id === id);
  const from = has(values.from) ? values.from : (people[0]?.id ?? '');
  const to = has(values.to) && values.to !== from ? values.to : (people.find((p) => p.id !== from)?.id ?? '');
  return { from, to };
}

export function useTransactionDraft(app: AppController, initial: DraftValues = EMPTY): TransactionDraft {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return {
    values,
    error,
    set(change) {
      setValues((v) => ({ ...v, ...change }));
      setError(null);
    },
    setError,
    fields() {
      const { from, to } = shownPair(app.ledger.value, values);
      if (!from || !to) return { error: 'Choose who owes and whom.' };
      const amount = parseAmount(values.amount);
      if ('error' in amount) return amount;
      return { from, to, cents: amount.cents, description: values.description };
    },
  };
}

/** The fields, with the error under them. */
export function TransactionFields({
  app,
  draft,
  idPrefix,
  autofocus,
  amountRef,
}: {
  readonly app: AppController;
  readonly draft: TransactionDraft;
  readonly idPrefix: string;
  readonly autofocus?: 'amount';
  readonly amountRef?: { current: HTMLInputElement | null };
}) {
  const people = app.ledger.value.people;
  const { from, to } = shownPair(app.ledger.value, draft.values);
  const errorId = `${idPrefix}-error`;
  const described = draft.error ? errorId : undefined;
  return (
    <div class="iou-transaction-fields">
      <label class="iou-field">
        <span>From</span>
        <select
          value={from}
          aria-describedby={described}
          onChange={(e) => {
            const next = e.currentTarget.value;
            // Picking the person in To swaps the two, so From and To never match.
            draft.set(next === to ? { from: next, to: from } : { from: next });
          }}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <span class="iou-owes-word" aria-hidden="true">
        owes
      </span>
      <label class="iou-field">
        <span>To</span>
        <select
          value={to}
          aria-describedby={described}
          onChange={(e) => {
            const next = e.currentTarget.value;
            draft.set(next === from ? { to: next, from: to } : { to: next });
          }}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label class="iou-field iou-field-amount">
        <span>Amount</span>
        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="$0.00"
          value={draft.values.amount}
          data-autofocus={autofocus === 'amount' ? true : undefined}
          aria-invalid={draft.error !== null}
          aria-describedby={described}
          onInput={(e) => draft.set({ amount: e.currentTarget.value })}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <label class="iou-field iou-field-for">
        <span>For</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Pizza"
          maxLength={MAX_DESCRIPTION + 20}
          value={draft.values.description}
          aria-describedby={described}
          onInput={(e) => draft.set({ description: e.currentTarget.value })}
        />
      </label>
      {draft.error && (
        <p id={errorId} class="iou-field-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
