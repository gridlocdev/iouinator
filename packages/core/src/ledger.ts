/**
 * The ledger (PRD §3, §4): its people and its transactions, and every edit to them. Edits never change a ledger;
 * they return a new one, the same object when nothing changed, or an error to show.
 */
import { validCents } from './money.ts';

export interface Person {
  readonly id: string;
  readonly name: string;
}

/** `from` owes `to` `cents`, for `description` (PRD §4.1). */
export interface Transaction {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly cents: number;
  readonly description: string;
}

export interface Ledger {
  readonly people: readonly Person[];
  readonly transactions: readonly Transaction[];
}

export const EMPTY_LEDGER: Ledger = { people: [], transactions: [] };

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 200;

export type Edit = { readonly ledger: Ledger } | { readonly error: string };

/** The fields of a transaction the user fills in. */
export interface TransactionFields {
  readonly from: string;
  readonly to: string;
  readonly cents: number;
  readonly description: string;
}

const same = (a: string, b: string) => a.toLocaleLowerCase('en-US') === b.toLocaleLowerCase('en-US');

/** `name` trimmed, or what's wrong with it; `except` is the person being renamed (PRD §3). */
export function checkPersonName(
  ledger: Ledger,
  name: string,
  except?: string,
): { name: string } | { error: string } {
  const clean = name.trim();
  if (!clean) return { error: 'A person needs a name.' };
  if ([...clean].length > MAX_NAME) return { error: `A name can have up to ${MAX_NAME} characters.` };
  const taken = ledger.people.find((p) => p.id !== except && same(p.name, clean));
  if (taken) return { error: `There’s already someone called ${taken.name}.` };
  return { name: clean };
}

/** `description` trimmed, or what's wrong with it (PRD §4.1). */
export function checkDescription(description: string): { description: string } | { error: string } {
  const clean = description.trim();
  if (!clean) return { error: 'Say what the transaction is for.' };
  if ([...clean].length > MAX_DESCRIPTION)
    return { error: `The description can have up to ${MAX_DESCRIPTION} characters.` };
  return { description: clean };
}

/** The next free id with this prefix: one more than the highest `p<n>` there is. */
function nextId(prefix: 'p' | 't', items: readonly { readonly id: string }[]): string {
  let max = 0;
  for (const { id } of items) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(1));
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function personById(ledger: Ledger, id: string): Person | undefined {
  return ledger.people.find((p) => p.id === id);
}

export function addPerson(ledger: Ledger, name: string): Edit & { id?: string } {
  const checked = checkPersonName(ledger, name);
  if ('error' in checked) return checked;
  const id = nextId('p', ledger.people);
  return { ledger: { ...ledger, people: [...ledger.people, { id, name: checked.name }] }, id };
}

export function renamePerson(ledger: Ledger, id: string, name: string): Edit {
  const person = personById(ledger, id);
  if (!person) return { error: 'That person isn’t in the ledger any more.' };
  const checked = checkPersonName(ledger, name, id);
  if ('error' in checked) return checked;
  if (checked.name === person.name) return { ledger };
  return {
    ledger: { ...ledger, people: ledger.people.map((p) => (p.id === id ? { ...p, name: checked.name } : p)) },
  };
}

/** Removes a person and every transaction they are in (PRD §3). */
export function removePerson(ledger: Ledger, id: string): Edit & { removed?: number } {
  if (!personById(ledger, id)) return { ledger, removed: 0 };
  const transactions = ledger.transactions.filter((t) => t.from !== id && t.to !== id);
  return {
    ledger: { people: ledger.people.filter((p) => p.id !== id), transactions },
    removed: ledger.transactions.length - transactions.length,
  };
}

function checkFields(ledger: Ledger, fields: TransactionFields): TransactionFields | { error: string } {
  if (!personById(ledger, fields.from) || !personById(ledger, fields.to))
    return { error: 'Choose who owes and whom.' };
  if (fields.from === fields.to) return { error: 'Someone can’t owe themselves.' };
  if (!validCents(fields.cents)) return { error: 'The amount must be from $0.01 to $1,000,000,000.' };
  const description = checkDescription(fields.description);
  if ('error' in description) return description;
  return { ...fields, description: description.description };
}

export function addTransaction(ledger: Ledger, fields: TransactionFields): Edit & { id?: string } {
  const checked = checkFields(ledger, fields);
  if ('error' in checked) return checked;
  const id = nextId('t', ledger.transactions);
  const t: Transaction = {
    id,
    from: checked.from,
    to: checked.to,
    cents: checked.cents,
    description: checked.description,
  };
  return { ledger: { ...ledger, transactions: [...ledger.transactions, t] }, id };
}

/** Changes a transaction's fields; the same ledger when none changed (PRD §4.3). */
export function updateTransaction(ledger: Ledger, id: string, fields: TransactionFields): Edit {
  const before = ledger.transactions.find((t) => t.id === id);
  if (!before) return { error: 'That transaction isn’t in the ledger any more.' };
  const checked = checkFields(ledger, fields);
  if ('error' in checked) return checked;
  if (
    before.from === checked.from &&
    before.to === checked.to &&
    before.cents === checked.cents &&
    before.description === checked.description
  )
    return { ledger };
  const after: Transaction = { id, ...pick(checked) };
  return { ledger: { ...ledger, transactions: ledger.transactions.map((t) => (t.id === id ? after : t)) } };
}

const pick = (f: TransactionFields): TransactionFields => ({
  from: f.from,
  to: f.to,
  cents: f.cents,
  description: f.description,
});

export function swapTransaction(ledger: Ledger, id: string): Ledger {
  if (!ledger.transactions.some((t) => t.id === id)) return ledger;
  return {
    ...ledger,
    transactions: ledger.transactions.map((t) => (t.id === id ? { ...t, from: t.to, to: t.from } : t)),
  };
}

export function deleteTransaction(ledger: Ledger, id: string): Ledger {
  if (!ledger.transactions.some((t) => t.id === id)) return ledger;
  return { ...ledger, transactions: ledger.transactions.filter((t) => t.id !== id) };
}

/**
 * What's wrong with a ledger, or nothing (PRD §8.1): every id unique, names unique ignoring case and in range,
 * every transaction between two different people of the ledger, with a valid amount and description.
 */
export function ledgerProblems(ledger: Ledger): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const p of ledger.people) {
    if (ids.has(p.id)) problems.push(`Two people have the id ${p.id}.`);
    ids.add(p.id);
    const name = p.name.trim();
    if (!name || name !== p.name || [...name].length > MAX_NAME) problems.push(`${p.id} has a bad name.`);
    const key = name.toLocaleLowerCase('en-US');
    if (names.has(key)) problems.push(`Two people are called ${name}.`);
    names.add(key);
  }
  const people = new Set(ids);
  for (const t of ledger.transactions) {
    if (ids.has(t.id)) problems.push(`The id ${t.id} is used twice.`);
    ids.add(t.id);
    if (!people.has(t.from) || !people.has(t.to)) problems.push(`${t.id} names someone who isn’t there.`);
    if (t.from === t.to) problems.push(`${t.id} is from and to the same person.`);
    if (!validCents(t.cents)) problems.push(`${t.id} has a bad amount.`);
    if ('error' in checkDescription(t.description) || t.description !== t.description.trim())
      problems.push(`${t.id} has a bad description.`);
  }
  return problems;
}
