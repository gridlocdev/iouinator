import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER,
  addPerson,
  addTransaction,
  deleteTransaction,
  ledgerProblems,
  removePerson,
  renamePerson,
  swapTransaction,
  updateTransaction,
  type Edit,
  type Ledger,
} from '@iouinator/core';

const ok = (edit: Edit): Ledger => {
  if ('error' in edit) throw new Error(edit.error);
  return edit.ledger;
};

/** Sam (p1), Alex (p2), Kim (p3). */
function people(): Ledger {
  let l = EMPTY_LEDGER;
  for (const name of ['Sam', 'Alex', 'Kim']) l = ok(addPerson(l, name));
  return l;
}

describe('people (PRD §3)', () => {
  it('adds people with fresh ids, trimmed', () => {
    const l = ok(addPerson(people(), '  Lee '));
    expect(l.people.at(-1)).toEqual({ id: 'p4', name: 'Lee' });
    expect(ledgerProblems(l)).toEqual([]);
  });

  it('refuses empty, long and taken names', () => {
    expect(addPerson(people(), '  ')).toEqual({ error: 'A person needs a name.' });
    expect(addPerson(people(), 'x'.repeat(61))).toEqual({ error: 'A name can have up to 60 characters.' });
    expect(addPerson(people(), 'sam')).toEqual({ error: 'There’s already someone called Sam.' });
  });

  it('renames, allowing a change of case, and changes nothing for the same name', () => {
    const l = people();
    expect(ok(renamePerson(l, 'p1', 'SAM')).people[0]!.name).toBe('SAM');
    expect(ok(renamePerson(l, 'p1', 'Sam'))).toBe(l);
    expect(renamePerson(l, 'p1', 'alex')).toEqual({ error: 'There’s already someone called Alex.' });
  });

  it('removes a person with their transactions', () => {
    let l = people();
    l = ok(addTransaction(l, { from: 'p1', to: 'p2', cents: 100, description: 'a' }));
    l = ok(addTransaction(l, { from: 'p3', to: 'p1', cents: 100, description: 'b' }));
    l = ok(addTransaction(l, { from: 'p2', to: 'p3', cents: 100, description: 'c' }));
    const removed = removePerson(l, 'p1');
    expect(removed.removed).toBe(2);
    expect(ok(removed).transactions.map((t) => t.description)).toEqual(['c']);
    expect(ledgerProblems(ok(removed))).toEqual([]);
  });

  it('ids never repeat after a removal', () => {
    let l = ok(removePerson(people(), 'p3'));
    l = ok(addPerson(l, 'Lee'));
    expect(l.people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    l = ok(removePerson(l, 'p2'));
    expect(ok(addPerson(l, 'Max')).people.at(-1)!.id).toBe('p4');
  });
});

describe('transactions (PRD §4)', () => {
  it('adds, refusing self-debts, bad amounts and empty descriptions', () => {
    const l = people();
    expect(addTransaction(l, { from: 'p1', to: 'p1', cents: 1, description: 'x' })).toEqual({
      error: 'Someone can’t owe themselves.',
    });
    expect('error' in addTransaction(l, { from: 'p1', to: 'p2', cents: 0, description: 'x' })).toBe(true);
    expect(addTransaction(l, { from: 'p1', to: 'p2', cents: 5, description: '  ' })).toEqual({
      error: 'Say what the transaction is for.',
    });
    const added = addTransaction(l, { from: 'p1', to: 'p2', cents: 5, description: ' Pizza ' });
    expect(added.id).toBe('t1');
    expect(ok(added).transactions).toEqual([
      { id: 't1', from: 'p1', to: 'p2', cents: 5, description: 'Pizza' },
    ]);
  });

  it('an update that changes nothing returns the same ledger', () => {
    const l = ok(addTransaction(people(), { from: 'p1', to: 'p2', cents: 5, description: 'Pizza' }));
    expect(ok(updateTransaction(l, 't1', { from: 'p1', to: 'p2', cents: 5, description: 'Pizza ' }))).toBe(l);
    const changed = ok(updateTransaction(l, 't1', { from: 'p1', to: 'p3', cents: 5, description: 'Pizza' }));
    expect(changed.transactions[0]!.to).toBe('p3');
  });

  it('swaps and deletes; a missing id changes nothing', () => {
    const l = ok(addTransaction(people(), { from: 'p1', to: 'p2', cents: 5, description: 'Pizza' }));
    expect(swapTransaction(l, 't1').transactions[0]).toMatchObject({ from: 'p2', to: 'p1' });
    expect(swapTransaction(l, 't9')).toBe(l);
    expect(deleteTransaction(l, 't1').transactions).toEqual([]);
    expect(deleteTransaction(l, 't9')).toBe(l);
  });
});
