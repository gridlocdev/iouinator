import { describe, expect, it } from 'vitest';
import { menuSender, nativeMenu, shortcutGroups } from '../src/index.ts';
import { makeApp, owe, people } from './helpers.ts';

describe('commands', () => {
  it('run through the catalog and keep settings', () => {
    const { app, catalog } = makeApp();
    catalog.run('view.flatten');
    catalog.run('view.themeDark');
    expect(app.settings.value).toMatchObject({ view: 'flat', theme: 'dark' });
  });

  it('New Transaction needs two people', () => {
    const { app, catalog } = makeApp();
    people(app, 'Sam');
    expect(catalog.run('transaction.new')).toBe(false);
    people(app, 'Alex');
    expect(catalog.run('transaction.new')).toBe(true);
    expect(app.focus.value.target).toBe('amount');
  });

  it('the transaction menu acts on its own row', () => {
    const { app, catalog } = makeApp();
    people(app, 'Sam', 'Alex');
    owe(app, 'Sam', 'Alex', 1, 'A');
    owe(app, 'Sam', 'Alex', 2, 'B');
    const first = app.ledger.value.transactions[0]!;
    app.openMenu({ kind: 'transaction', id: first.id, x: 0, y: 0 });
    expect(catalog.run('transaction.delete')).toBe(true);
    expect(app.ledger.value.transactions.map((t) => t.description)).toEqual(['B']);
  });

  it('the person menu renames, shows and removes', () => {
    const { app, catalog } = makeApp();
    const [sam] = people(app, 'Sam', 'Alex');
    expect(catalog.run('person.rename')).toBe(false);
    app.openMenu({ kind: 'person', id: sam!, x: 0, y: 0 });
    catalog.run('person.rename');
    expect(app.dialog.value).toBe('renamePerson');
    expect(app.renaming.value).toBe(sam);
  });

  it('let only the dialog toggles through while a dialog is open', () => {
    const { app, catalog } = makeApp();
    catalog.run('help.shortcuts');
    expect(app.dialog.value).toBe('shortcuts');
    expect(catalog.run('view.flatten')).toBe(false);
    catalog.run('help.shortcuts');
    expect(app.dialog.value).toBeNull();
  });

  it('build the menu bar without keys-only commands, with clipboard roles under Edit', () => {
    const { catalog } = makeApp();
    const menu = nativeMenu(catalog);
    expect(menu.map((m) => ('label' in m ? m.label : ''))).toEqual(['File', 'Edit', 'View', 'Help']);
    const text = JSON.stringify(menu);
    expect(text).not.toContain('transaction.up');
    expect(text).toContain('"role":"paste"');
    expect(text).toContain('"accelerator":"CmdOrCtrl+Shift+C"');
  });

  it('send the menu only when it changed', () => {
    const sent: unknown[] = [];
    const sender = menuSender((m) => sent.push(m));
    const { catalog } = makeApp();
    expect(sender.send(nativeMenu(catalog))).toBe(true);
    expect(sender.send(nativeMenu(catalog))).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('list every shortcut in the Keyboard Shortcuts window', () => {
    const { catalog } = makeApp();
    const lines = shortcutGroups(catalog, true).flatMap((g) =>
      g.lines.map((l) => `${l.title} ${l.keys.flat().join(' ')}`),
    );
    expect(lines).toContain('Flatten Debts F');
    expect(lines).toContain('Settings ⌘,');
  });
});
