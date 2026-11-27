/** The From, To, Amount and For fields, shared by the transaction form and Edit Transaction… (PRD §4.3). */
import { useState } from 'preact/hooks';
import {
  MAX_DESCRIPTION,
  checkDescription,
  parseAmount,
  type Ledger,
  type TransactionFields as Fields,
} from '@iouinator/core';
import type { AppController } from './controller.ts';
import { PersonPicker } from './PersonPicker.tsx';

export interface DraftValues {
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly description: string;
}

/** The field an error is about: it is marked invalid and gets the keyboard. */
export type DraftField = 'from' | 'amount' | 'for';

export interface DraftError {
  readonly message: string;
  readonly field: DraftField;
}

export interface TransactionDraft {
  readonly values: DraftValues;
  readonly error: DraftError | null;
  set(change: Partial<DraftValues>): void;
  /** Shows the error on its field and moves the keyboard there. */
  fail(message: string, field?: DraftField): void;
  /** Drops the error, as when you move on from the form. */
  clear(): void;
  /** The fields as the ledger takes them, or the first error and its field. */
  fields(): Fields | { readonly error: string; readonly field: DraftField };
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

export function useTransactionDraft(
  app: AppController,
  idPrefix: string,
  initial: DraftValues = EMPTY,
): TransactionDraft {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<DraftError | null>(null);
  return {
    values,
    error,
    set(change) {
      setValues((v) => ({ ...v, ...change }));
      setError(null);
    },
    fail(message, field = 'amount') {
      setError({ message, field });
      document.getElementById(`${idPrefix}-${field}`)?.focus();
    },
    clear() {
      setError(null);
    },
    fields() {
      const { from, to } = shownPair(app.ledger.value, values);
      if (!from || !to) return { error: 'Choose who owes and whom.', field: 'from' };
      const amount = parseAmount(values.amount);
      if ('error' in amount) return { error: amount.error, field: 'amount' };
      const description = checkDescription(values.description);
      if ('error' in description) return { error: description.error, field: 'for' };
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
      <PersonPicker
        id={`${idPrefix}-from`}
        label="From"
        people={people}
        value={from}
        describedBy={described}
        invalid={draft.error?.field === 'from'}
        // Picking the person in To swaps the two, so From and To never match.
        onPick={(next) => draft.set(next === to ? { from: next, to: from } : { from: next })}
      />
      <span class="iou-owes-word" aria-hidden="true">
        owes
      </span>
      <PersonPicker
        id={`${idPrefix}-to`}
        label="To"
        people={people}
        value={to}
        describedBy={described}
        onPick={(next) => draft.set(next === from ? { to: next, from: to } : { to: next })}
      />
      <label class="iou-field iou-field-amount">
        <span>Amount</span>
        <input
          ref={amountRef}
          id={`${idPrefix}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 12.50"
          value={draft.values.amount}
          data-autofocus={autofocus === 'amount' ? true : undefined}
          aria-invalid={draft.error?.field === 'amount'}
          aria-describedby={described}
          onInput={(e) => draft.set({ amount: e.currentTarget.value })}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <label class="iou-field iou-field-for">
        <span>For</span>
        <input
          id={`${idPrefix}-for`}
          type="text"
          autoComplete="off"
          placeholder="e.g. Pizza"
          maxLength={MAX_DESCRIPTION + 20}
          value={draft.values.description}
          aria-invalid={draft.error?.field === 'for'}
          aria-describedby={described}
          onInput={(e) => draft.set({ description: e.currentTarget.value })}
        />
      </label>
      {draft.error && (
        <p id={errorId} class="iou-field-error" role="alert">
          {draft.error.message}
        </p>
      )}
    </div>
  );
}
