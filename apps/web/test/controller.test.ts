import { describe, expect, it } from 'vitest';
import { balanceText } from '../src/index.ts';
import { makeApp, owe, people, summary } from './helpers.ts';

describe('people (PRD §3)', () => {
  it('adds, refuses a blank or repeated name, and renames', () => {
    const { app } = makeApp();
    const [sam] = people(app, 'Sam');
    expect(app.addPerson('  ')).not.toBeNull();
    expect(app.addPerson('sam')).not.toBeNull();
    expect(app.renamePerson(sam!, 'Samira')).toBeNull();
    expect(app.notice.value?.text).toBe('Renamed Sam to Samira.');
    expect(app.ledger.value.people.map((p) => p.name)).toEqual(['Samira']);
  });

  it('renaming to the same name records nothing', () => {
    const { app } = makeApp();
    const [sam] = people(app, 'Sam');
    app.step('undo');
    app.step('redo');
    const before = app.ledger.value;
    expect(app.renamePerson(sam!, 'Sam')).toBeNull();
    expect(app.ledger.value).toBe(before);
  });

  it('removing a person takes their transactions, and the notice’s Undo brings both back', () => {
    const { app } = makeApp();
    const [sam] = people(app, 'Sam', 'Alex', 'Kim');
    owe(app, 'Sam', 'Alex', 10);
    owe(app, 'Kim', 'Sam', 5);
    owe(app, 'Kim', 'Alex', 2);
    app.removePerson(sam!);
    expect(summary(app.ledger.value)).toEqual(['Alex,Kim', 'Kim>Alex 200 Lunch']);
    expect(app.notice.value?.text).toBe('Removed Sam and 2 transactions.');
    app.notice.value!.action!.run();
    expect(app.ledger.value.transactions).toHaveLength(3);
  });

  it('shows each balance: owed is plus, owes is minus', () => {
    const { app } = makeApp();
    const [sam, alex] = people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 12.5);
    expect(balanceText(app.balances.value.get(alex!)!)).toBe('+$12.50');
    expect(balanceText(app.balances.value.get(sam!)!)).toBe('−$12.50');
    expect(balanceText(0)).toBe('settled');
  });
});

describe('transactions (PRD §4)', () => {
  it('needs two different people, an amount and what it was for', () => {
    const { app } = makeApp();
    const [sam, alex] = people(app, 'Sam', 'Alex');
    const t = { from: sam!, to: alex!, cents: 500, description: 'Taxi' };
    expect(app.addTransaction({ ...t, description: ' ' })).toBe('Say what the transaction is for.');
    expect(app.addTransaction({ ...t, to: sam! })).not.toBeNull();
    expect(app.addTransaction({ ...t, cents: 0 })).not.toBeNull();
    expect(app.addTransaction(t)).toBeNull();
    expect(app.chosen.value).toBe(app.ledger.value.transactions[0]!.id);
  });

  it('edit, swap and delete, each one undo step', () => {
    const { app } = makeApp();
    people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 5, 'Taxi');
    const t = app.ledger.value.transactions[0]!;
    expect(app.updateTransaction(t.id, { ...t, cents: 700 })).toBeNull();
    app.swap(app.ledger.value.transactions[0]!);
    expect(summary(app.ledger.value)[1]).toBe('Alex>Sam 700 Taxi');
    app.deleteTransaction(app.ledger.value.transactions[0]!);
    expect(app.notice.value?.text).toBe('Deleted Taxi.');
    app.step('undo');
    app.step('undo');
    expect(summary(app.ledger.value)[1]).toBe('Sam>Alex 700 Taxi');
    app.step('undo');
    expect(summary(app.ledger.value)[1]).toBe('Sam>Alex 500 Taxi');
  });

  it('an edit that changes nothing records nothing', () => {
    const { app } = makeApp();
    people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 5, 'Taxi');
    const before = app.ledger.value;
    const t = before.transactions[0]!;
    expect(app.updateTransaction(t.id, t)).toBeNull();
    expect(app.ledger.value).toBe(before);
  });

  it('a notice’s Undo does nothing once another edit landed', () => {
    const { app } = makeApp();
    people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 5, 'Taxi');
    app.deleteTransaction(app.ledger.value.transactions[0]!);
    const undo = app.notice.value!.action!;
    owe(app, 'Alex', 'Sam', 1, 'Gum');
    undo.run();
    expect(summary(app.ledger.value)).toEqual(['Sam,Alex', 'Alex>Sam 100 Gum']);
  });

  it('deleting moves the choice to the next row, and the arrows move it', () => {
    const { app } = makeApp();
    people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 1, 'A');
    owe(app, 'Sam', 'Alex', 2, 'B');
    owe(app, 'Sam', 'Alex', 3, 'C');
    const [a, b, c] = app.ledger.value.transactions;
    app.moveChoice('first');
    expect(app.chosen.value).toBe(a!.id);
    app.moveChoice('up');
    expect(app.chosen.value).toBe(a!.id);
    app.moveChoice('down');
    app.deleteTransaction(b!);
    expect(app.chosen.value).toBe(c!.id);
  });
});

describe('the diagram and the filter (PRD §4.4, §5, §6)', () => {
  function triangle() {
    const made = makeApp();
    people(made.app, 'A', 'B', 'C');
    owe(made.app, 'A', 'B', 10);
    owe(made.app, 'B', 'C', 10);
    owe(made.app, 'C', 'A', 15);
    owe(made.app, 'B', 'A', 4);
    return made;
  }

  it('Raw shows every direction; Flattened nets pairs and cancels the loop', () => {
    const { app } = triangle();
    expect(app.debts.value).toHaveLength(4);
    app.toggleFlatten();
    expect(app.settings.value.view).toBe('flat');
    // Pairs net to A→B 6, B→C 10, C→A 15; the loop cancels 6 from each.
    const [a, b, c] = app.ledger.value.people.map((p) => p.id);
    expect(app.debts.value).toEqual(
      expect.arrayContaining([
        { from: b, to: c, cents: 400 },
        { from: c, to: a, cents: 900 },
      ]),
    );
    expect(app.debts.value).toHaveLength(2);
    expect(app.summary.value).toEqual({ before: 4, after: 2, cancelled: 3900 - 1300 });
  });

  it('a debt filters the list one way in Raw and both ways in Flattened', () => {
    const { app } = triangle();
    const [a, b] = app.ledger.value.people.map((p) => p.id);
    app.showDebt({ from: a!, to: b! });
    expect(app.filterText()).toBe('A → B');
    expect(app.visible.value.map((t) => t.cents)).toEqual([1000]);
    app.setView('flat');
    expect(app.filterText()).toBe('A ↔ B');
    expect(app.visible.value.map((t) => t.cents)).toEqual([1000, 400]);
    app.clearFilter();
    expect(app.visible.value).toHaveLength(4);
  });

  it('a person filter shows everything they are in, and goes when they do', () => {
    const { app } = triangle();
    const c = app.ledger.value.people[2]!.id;
    app.showPerson(c);
    expect(app.visible.value).toHaveLength(2);
    app.removePerson(c);
    expect(app.filter.value).toBeNull();
  });

  it('copies the diagram as Mermaid', async () => {
    const { app, copied } = triangle();
    await app.copyMermaid();
    expect(copied[0]).toMatch(/^flowchart LR/);
    expect(copied[0]).toContain('$10.00');
    expect(app.notice.value?.text).toBe('Copied the diagram as Mermaid.');
  });
});

describe('opening a ledger (PRD §7)', () => {
  it('clears undo, the filter and the choice', () => {
    const { app } = makeApp();
    people(app, 'Sam', 'Alex');
    app.showPerson(app.ledger.value.people[0]!.id);
    app.loadLedger({ people: [], transactions: [] });
    expect(app.filter.value).toBeNull();
    expect(app.canStep('undo')).toBe(false);
  });
});
