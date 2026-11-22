/** What the diagram shows (PRD §5, §6): the totals between people, raw or flattened, and everyone's balance. */
import type { Ledger } from './ledger.ts';

/** `from` owes `to` `cents` in all. */
export interface Debt {
  readonly from: string;
  readonly to: string;
  readonly cents: number;
}

/** What flattening cancelled (PRD §6.5). */
export interface FlattenSummary {
  readonly before: number;
  readonly after: number;
  /** How much less money changes hands: the raw total minus the flattened total. */
  readonly cancelled: number;
}

/** The order people are in, for sorting debts the same way every time. */
function orderOf(ledger: Ledger): Map<string, number> {
  return new Map(ledger.people.map((p, i) => [p.id, i]));
}

function sortDebts(debts: Debt[], order: ReadonlyMap<string, number>): Debt[] {
  const at = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  return debts.sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to));
}

/** One debt per direction between two people: the sum of every transaction that way (PRD §5). */
export function rawDebts(ledger: Ledger): Debt[] {
  const sums = new Map<string, Map<string, number>>();
  for (const t of ledger.transactions) {
    const row = sums.get(t.from) ?? new Map<string, number>();
    sums.set(t.from, row);
    row.set(t.to, (row.get(t.to) ?? 0) + t.cents);
  }
  const debts: Debt[] = [];
  for (const [from, row] of sums) for (const [to, cents] of row) debts.push({ from, to, cents });
  return sortDebts(debts, orderOf(ledger));
}

/** Each person's balance: what they are owed minus what they owe. */
export function balances(ledger: Ledger): Map<string, number> {
  const result = new Map(ledger.people.map((p) => [p.id, 0]));
  for (const t of ledger.transactions) {
    result.set(t.from, (result.get(t.from) ?? 0) - t.cents);
    result.set(t.to, (result.get(t.to) ?? 0) + t.cents);
  }
  return result;
}

/** The balances that `debts` give. */
export function balancesOf(debts: readonly Debt[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const d of debts) {
    result.set(d.from, (result.get(d.from) ?? 0) - d.cents);
    result.set(d.to, (result.get(d.to) ?? 0) + d.cents);
  }
  return result;
}

/**
 * The flattened debts (PRD §6): each pair netted to one direction, then every loop cancelled by subtracting its
 * smallest debt. Balances stay the same, and the same ledger always gives the same result.
 */
export function flattenDebts(ledger: Ledger): Debt[] {
  const order = orderOf(ledger);
  const ids = ledger.people.map((p) => p.id);
  // graph.get(a).get(b): a owes b, always > 0; at most one direction per pair.
  const graph = new Map<string, Map<string, number>>(ids.map((id) => [id, new Map()]));
  const owes = (a: string, b: string) => graph.get(a)?.get(b) ?? 0;
  const set = (a: string, b: string, cents: number) => {
    const row = graph.get(a)!;
    if (cents > 0) row.set(b, cents);
    else row.delete(b);
  };
  // 1. Net each pair.
  for (const d of rawDebts(ledger)) {
    const back = owes(d.to, d.from);
    if (back >= d.cents) set(d.to, d.from, back - d.cents);
    else {
      set(d.to, d.from, 0);
      set(d.from, d.to, d.cents - back + owes(d.from, d.to));
    }
  }
  // 2. Cancel loops until there are none. Each pass removes at least one debt, so this ends.
  const at = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  const next = (id: string) => [...graph.get(id)!.keys()].sort((a, b) => at(a) - at(b));
  for (let loop = findLoop(ids, next); loop; loop = findLoop(ids, next)) {
    let smallest = Infinity;
    for (let i = 0; i < loop.length; i++)
      smallest = Math.min(smallest, owes(loop[i]!, loop[(i + 1) % loop.length]!));
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      set(a, b, owes(a, b) - smallest);
    }
  }
  const debts: Debt[] = [];
  for (const [from, row] of graph) for (const [to, cents] of row) debts.push({ from, to, cents });
  return sortDebts(debts, order);
}

/** The first loop a depth-first search finds, as the people around it in order; null when there is none. */
function findLoop(ids: readonly string[], next: (id: string) => readonly string[]): string[] | null {
  const state = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 'open');
    path.push(id);
    for (const to of next(id)) {
      const s = state.get(to);
      if (s === 'open') return path.slice(path.indexOf(to));
      if (s === undefined) {
        const found = visit(to);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of ids) {
    if (state.has(id)) continue;
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

export function totalCents(debts: readonly Debt[]): number {
  return debts.reduce((sum, d) => sum + d.cents, 0);
}

/** How the flattened debts compare with the raw ones (PRD §6.5). */
export function flattenSummary(raw: readonly Debt[], flat: readonly Debt[]): FlattenSummary {
  return { before: raw.length, after: flat.length, cancelled: totalCents(raw) - totalCents(flat) };
}
