/** The ledger file (PRD §8.1): JSON with a format name and version. `classifyFile` is the only way to read one. */
import { EMPTY_LEDGER, ledgerProblems, type Ledger, type Person, type Transaction } from './ledger.ts';

export const FORMAT = 'iouinator';
export const FORMAT_VERSION = 1;

export type FileKind =
  | { readonly kind: 'ok'; readonly ledger: Ledger }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'corrupt'; readonly reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readPerson(v: unknown): Person | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return { id: v.id, name: v.name };
}

function readTransaction(v: unknown): Transaction | null {
  if (!isObject(v)) return null;
  const { id, from, to, cents, description } = v;
  if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string') return null;
  if (typeof cents !== 'number' || typeof description !== 'string') return null;
  return { id, from, to, cents, description };
}

/** Sorts a file's text into a ledger, a newer format, or damaged (PRD §8.1). */
export function classifyFile(text: string): FileKind {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) return { kind: 'ok', ledger: EMPTY_LEDGER };
  let raw: unknown;
  try {
    raw = JSON.parse(clean);
  } catch {
    return { kind: 'corrupt', reason: 'It isn’t JSON.' };
  }
  if (!isObject(raw) || raw.format !== FORMAT)
    return { kind: 'corrupt', reason: 'It isn’t an IOUinator ledger.' };
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { kind: 'corrupt', reason: 'Its version is missing.' };
  if (version > FORMAT_VERSION) return { kind: 'newer', version };
  if (!Array.isArray(raw.people) || !Array.isArray(raw.transactions))
    return { kind: 'corrupt', reason: 'It has no people or transactions list.' };
  const people = raw.people.map(readPerson);
  const transactions = raw.transactions.map(readTransaction);
  if (people.includes(null) || transactions.includes(null))
    return { kind: 'corrupt', reason: 'A person or transaction is missing a field.' };
  const ledger: Ledger = { people: people as Person[], transactions: transactions as Transaction[] };
  const problems = ledgerProblems(ledger);
  if (problems.length) return { kind: 'corrupt', reason: problems[0]! };
  return { kind: 'ok', ledger };
}

/** The file's text: keys in a fixed order, two-space indentation, a final newline (PRD §8.1). */
export function writeLedgerText(ledger: Ledger): string {
  const file = {
    format: FORMAT,
    version: FORMAT_VERSION,
    people: ledger.people.map((p) => ({ id: p.id, name: p.name })),
    transactions: ledger.transactions.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      cents: t.cents,
      description: t.description,
    })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
