import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER,
  balances,
  balancesOf,
  flattenDebts,
  flattenSummary,
  ledgerProblems,
  rawDebts,
  type Debt,
  type Ledger,
} from '@iouinator/core';
import { RANDOM_TIMEOUT, runRandomOps } from './randomOps.ts';

/** A ledger from `[from, to, dollars]` triples between people named by letter. */
function ledger(names: string, debts: readonly [string, string, number][]): Ledger {
  return {
    people: [...names].map((n) => ({ id: n, name: n })),
    transactions: debts.map(([from, to, dollars], i) => ({
      id: `t${i + 1}`,
      from,
      to,
      cents: dollars * 100,
      description: `${from} to ${to}`,
    })),
  };
}

const show = (debts: readonly Debt[]) => debts.map((d) => `${d.from}>${d.to} ${d.cents / 100}`);

describe('raw debts (PRD §5)', () => {
  it('sums each direction separately, in people order', () => {
    const l = ledger('ABC', [
      ['B', 'A', 4],
      ['A', 'B', 10],
      ['A', 'B', 2.5],
      ['C', 'A', 1],
    ]);
    expect(show(rawDebts(l))).toEqual(['A>B 12.5', 'B>A 4', 'C>A 1']);
  });

  it('an empty ledger has none', () => {
    expect(rawDebts(EMPTY_LEDGER)).toEqual([]);
  });
});

describe('flattening (PRD §6)', () => {
  it('nets each pair', () => {
    expect(
      show(
        flattenDebts(
          ledger('AB', [
            ['A', 'B', 10],
            ['B', 'A', 4],
          ]),
        ),
      ),
    ).toEqual(['A>B 6']);
    expect(
      flattenDebts(
        ledger('AB', [
          ['A', 'B', 10],
          ['B', 'A', 10],
        ]),
      ),
    ).toEqual([]);
  });

  it('cancels a three-way loop down to its smallest debt', () => {
    const l = ledger('ABC', [
      ['A', 'B', 10],
      ['B', 'C', 10],
      ['C', 'A', 10],
    ]);
    expect(flattenDebts(l)).toEqual([]);
    const uneven = ledger('ABC', [
      ['A', 'B', 30],
      ['B', 'C', 20],
      ['C', 'A', 10],
    ]);
    expect(show(flattenDebts(uneven))).toEqual(['A>B 20', 'B>C 10']);
  });

  it('cancels overlapping loops', () => {
    const l = ledger('ABCD', [
      ['A', 'B', 5],
      ['B', 'C', 5],
      ['C', 'A', 5],
      ['C', 'D', 7],
      ['D', 'B', 3],
    ]);
    const flat = flattenDebts(l);
    expect(balancesOf(flat)).toEqual(nonZero(balances(l)));
    expect(hasLoop(flat)).toBe(false);
  });

  it('summarises what it cancelled', () => {
    const l = ledger('ABC', [
      ['A', 'B', 30],
      ['B', 'C', 20],
      ['C', 'A', 10],
    ]);
    expect(flattenSummary(rawDebts(l), flattenDebts(l))).toEqual({ before: 3, after: 2, cancelled: 3000 });
  });

  it(
    'random ledgers keep every balance, lose every loop, and only link people who transacted',
    () =>
      runRandomOps<{ ledger: Ledger }>({
        setup: (random) => {
          const names = 'ABCDEFG'.slice(0, 2 + random.int(6));
          return { ledger: ledger(names, []) };
        },
        ops: [
          {
            name: 'add a debt',
            run(state, random) {
              const ids = state.ledger.people.map((p) => p.id);
              const from = random.pick(ids);
              const to = random.pick(ids.filter((id) => id !== from));
              const cents = 1 + random.int(random.chance(0.3) ? 100 : 100_000);
              const id = `t${state.ledger.transactions.length + 1}`;
              state.ledger = {
                ...state.ledger,
                transactions: [...state.ledger.transactions, { id, from, to, cents, description: 'x' }],
              };
              return `${from}>${to} ${cents}`;
            },
          },
        ],
        check({ ledger: l }) {
          expect(ledgerProblems(l)).toEqual([]);
          const flat = flattenDebts(l);
          expect(balancesOf(flat)).toEqual(nonZero(balances(l)));
          expect(hasLoop(flat)).toBe(false);
          const pairs = new Set(l.transactions.flatMap((t) => [`${t.from}>${t.to}`, `${t.to}>${t.from}`]));
          for (const d of flat) {
            expect(d.cents).toBeGreaterThan(0);
            expect(pairs.has(`${d.from}>${d.to}`)).toBe(true);
          }
          expect(flattenDebts(l)).toEqual(flat);
        },
        steps: 25,
      }),
    RANDOM_TIMEOUT,
  );
});

function nonZero(map: ReadonlyMap<string, number>): Map<string, number> {
  return new Map([...map].filter(([, v]) => v !== 0));
}

function hasLoop(debts: readonly Debt[]): boolean {
  const next = new Map<string, string[]>();
  for (const d of debts) next.set(d.from, [...(next.get(d.from) ?? []), d.to]);
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    state.set(id, 1);
    for (const to of next.get(id) ?? []) {
      if (state.get(to) === 1) return true;
      if (!state.has(to) && visit(to)) return true;
    }
    state.set(id, 2);
    return false;
  };
  return [...next.keys()].some((id) => !state.has(id) && visit(id));
}
