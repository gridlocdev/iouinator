/** Every command, for the keyboard, ⌘K, the menu bar and the Keyboard Shortcuts window (PRD §10). */
import { CommandCatalog, type CommandSpec, type Theme } from '@iouinator/ui';
import type { AppController, DialogKind } from './controller.ts';
import { inBrowserStorage, type LedgerFolders } from './ledgerFolders.ts';
import type { OpenLedger } from './openLedger.ts';

const THEME_TITLES: Readonly<Record<Theme, string>> = {
  system: 'System Appearance',
  light: 'Light Appearance',
  dark: 'Dark Appearance',
};

/** Commands that open or close their own window still run with a dialog open, so their key closes it again. */
const DIALOG_TOGGLES = new Set([
  'help.commands',
  'help.shortcuts',
  'app.settings',
  'file.open',
  'file.rename',
  'file.trash',
]);

/**
 * The File menu's ledger commands (PRD §8.2). They run on the open folder's open ledger; while no folder is open
 * (at start, or while another is picked) no command runs at all.
 */
function ledgerCommands(app: AppController, folders: LedgerFolders): CommandSpec[] {
  const current = () => folders.current.value;
  const act =
    (what: string, task: (s: OpenLedger) => Promise<unknown>): (() => void) =>
    () => {
      const s = current();
      if (!s) return;
      task(s).catch((e: unknown) => {
        console.warn(e);
        app.say(`Couldn’t ${what}: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      });
    };
  const platform = folders.platform;
  const specs: CommandSpec[] = [
    {
      id: 'file.new',
      writes: true,
      title: 'New Ledger',
      description: 'Start a new ledger in the ledger folder.',
      group: 'File',
      shortcuts: ['mod+n'],
      run: act('make a new ledger', (s) => s.newLedger()),
    },
    {
      id: 'file.open',
      title: 'Open Ledger…',
      description: 'Pick one of the ledgers in the ledger folder.',
      group: 'File',
      keywords: 'switch list ledgers files',
      run: () => app.toggle('ledgers'),
    },
  ];
  if (platform.canChoose)
    specs.push({
      id: 'file.folder',
      title: 'Open Ledger Folder…',
      description: 'Keep ledgers in another folder.',
      group: 'File',
      shortcuts: ['mod+o'],
      keywords: 'choose directory location',
      run: () => void folders.choose(),
    });
  if (platform.offersDefault)
    specs.push({
      id: 'file.browserStorage',
      title: platform.defaultTitle,
      description: 'Keep ledgers in the browser’s own storage instead of a folder.',
      group: 'File',
      enabled: () => !inBrowserStorage(current()),
      run: () => void folders.useDefault(),
    });
  specs.push(
    {
      id: 'file.rename',
      writes: true,
      title: 'Rename Ledger…',
      description: 'Give the open ledger another name.',
      group: 'File',
      run: () => app.toggle('rename'),
    },
    {
      id: 'file.delete',
      writes: true,
      title: 'Delete Ledger',
      description: 'Move the open ledger to the trash.',
      group: 'File',
      keywords: 'remove trash',
      danger: true,
      run: act('delete the ledger', (s) => s.trash()),
    },
    {
      id: 'file.export',
      title: 'Export Ledger…',
      description: 'Save a copy of the open ledger as an .iou.json file.',
      group: 'File',
      keywords: 'download save copy',
      run: () =>
        void folders.exportLedger().catch((e: unknown) => {
          app.say(`Couldn’t export the ledger: ${e instanceof Error ? e.message : String(e)}`, {
            tone: 'error',
          });
        }),
    },
    {
      id: 'file.trash',
      writes: true,
      title: 'Open Trash…',
      description: 'See deleted ledgers and restore them.',
      group: 'File',
      keywords: 'restore deleted',
      run: () => {
        if (app.dialog.value === 'trash') app.close();
        else
          act('open the trash', async (s) => {
            await s.listTrash();
            app.open('trash');
          })();
      },
    },
  );
  return specs;
}

/** Dialogs that wait for an answer: no other window replaces them. */
const QUESTIONS: ReadonlySet<DialogKind> = new Set(['conflict', 'recovery', 'folder']);

/** The right-click menus (PRD §10): command ids in order, `-` for a separator. */
export const MENUS = {
  person: ['person.rename', 'person.show', '-', 'person.remove'],
  transaction: ['transaction.edit', 'transaction.swap', '-', 'transaction.delete'],
} as const;

export function buildCommands(app: AppController, folders?: LedgerFolders): CommandCatalog {
  const s = () => app.settings.value;
  const people = () => app.ledger.value.people.length;
  /** The transaction list has the keyboard, or a menu is open on a transaction. */
  const onList = () => app.listFocused.value || app.menu.value?.kind === 'transaction';
  const withTransaction =
    (fn: (t: NonNullable<ReturnType<AppController['transactionTarget']>>) => void) => () => {
      const t = app.transactionTarget();
      app.closeMenu();
      if (t) fn(t);
    };
  const withPerson = (fn: (id: string) => void) => () => {
    const id = app.personTarget();
    app.closeMenu();
    if (id !== null) fn(id);
  };
  const specs: CommandSpec[] = [
    ...(folders ? ledgerCommands(app, folders) : []),
    {
      id: 'app.settings',
      title: 'Settings…',
      description: 'Change the appearance and the view the diagram opens in.',
      group: 'File',
      shortcuts: ['mod+,'],
      keywords: 'preferences options',
      global: true,
      run: () => app.toggle('settings'),
    },
    {
      id: 'edit.undo',
      writes: true,
      title: 'Undo',
      description: 'Undo the last change to the ledger.',
      group: 'Edit',
      shortcuts: ['mod+z'],
      enabled: () => app.canStep('undo'),
      run: () => app.step('undo'),
    },
    {
      id: 'edit.redo',
      writes: true,
      title: 'Redo',
      description: 'Redo the change you undid last.',
      group: 'Edit',
      shortcuts: ['shift+mod+z'],
      enabled: () => app.canStep('redo'),
      run: () => app.step('redo'),
    },
    {
      id: 'person.add',
      writes: true,
      title: 'Add Person',
      description: 'Type the name of someone to add to the ledger.',
      group: 'Edit',
      shortcuts: ['p'],
      keywords: 'new name friend',
      run: () => app.requestFocus('person'),
    },
    {
      id: 'person.rename',
      writes: true,
      title: 'Rename Person…',
      description: 'Give a person another name.',
      group: 'Edit',
      hidden: true,
      keysOnly: true,
      enabled: () => app.personTarget() !== null,
      run: withPerson((id) => app.startRenamePerson(id)),
    },
    {
      id: 'person.show',
      title: 'Show Their Transactions',
      description: 'Show only the transactions a person is in.',
      group: 'Edit',
      hidden: true,
      keysOnly: true,
      enabled: () => app.personTarget() !== null,
      run: withPerson((id) => app.showPerson(id)),
    },
    {
      id: 'person.remove',
      writes: true,
      title: 'Remove Person',
      description: 'Remove a person and every transaction they are in.',
      group: 'Edit',
      hidden: true,
      keysOnly: true,
      danger: true,
      enabled: () => app.personTarget() !== null,
      run: withPerson((id) => app.removePerson(id)),
    },
    {
      id: 'transaction.new',
      writes: true,
      title: 'New Transaction',
      description: 'Type the amount of a new transaction.',
      group: 'Edit',
      shortcuts: ['n'],
      keywords: 'add owe debt payment',
      enabled: () => people() >= 2,
      run: () => app.requestFocus('amount'),
    },
    {
      id: 'transaction.edit',
      writes: true,
      title: 'Edit Transaction…',
      description: 'Change the chosen transaction.',
      group: 'Edit',
      shortcuts: ['enter'],
      keysOnly: true,
      enabled: () => onList() && app.transactionTarget() !== null,
      run: withTransaction((t) => app.startEdit(t)),
    },
    {
      id: 'transaction.swap',
      writes: true,
      title: 'Swap Direction',
      description: 'Turn who owes whom around in the chosen transaction.',
      group: 'Edit',
      keywords: 'reverse flip',
      enabled: () => app.transactionTarget() !== null,
      run: withTransaction((t) => app.swap(t)),
    },
    {
      id: 'transaction.delete',
      writes: true,
      title: 'Delete Transaction',
      description: 'Remove the chosen transaction.',
      group: 'Edit',
      shortcuts: ['delete', 'backspace'],
      keysOnly: true,
      danger: true,
      enabled: () => onList() && app.transactionTarget() !== null,
      run: withTransaction((t) => app.deleteTransaction(t)),
    },
    ...(
      [
        ['up', 'Previous Transaction', 'up'],
        ['down', 'Next Transaction', 'down'],
        ['first', 'First Transaction', 'home'],
        ['last', 'Last Transaction', 'end'],
      ] as const
    ).map(([to, title, key]): CommandSpec => ({
      id: `transaction.${to}`,
      title,
      description: `Choose the ${title.toLowerCase().replace(' transaction', '')} transaction in the list.`,
      group: 'Edit',
      shortcuts: [key],
      keysOnly: true,
      hidden: true,
      enabled: () => app.listFocused.value,
      run: () => app.moveChoice(to),
    })),
    {
      id: 'edit.copyMermaid',
      title: 'Copy Diagram as Mermaid',
      description: 'Copy the diagram’s Mermaid text, for pasting into Markdown.',
      group: 'Edit',
      shortcuts: ['shift+mod+c'],
      keywords: 'markdown export graph',
      global: true,
      run: () => app.copyMermaid(),
    },
    {
      id: 'view.flatten',
      title: 'Flatten Debts',
      description: 'Net each pair and cancel loops of debts in the diagram.',
      group: 'View',
      shortcuts: ['f'],
      keywords: 'simplify net cycles raw',
      checked: () => s().view === 'flat',
      run: () => app.toggleFlatten(),
    },
    {
      id: 'view.clearFilter',
      title: 'Clear Filter',
      description: 'Show every transaction again.',
      group: 'View',
      shortcuts: ['esc'],
      keywords: 'all',
      enabled: () => app.filter.value !== null,
      run: () => app.clearFilter(),
    },
    ...(['system', 'light', 'dark'] as const).map((theme): CommandSpec => ({
      id: `view.theme${theme[0]!.toUpperCase()}${theme.slice(1)}`,
      title: THEME_TITLES[theme],
      description: `Use the ${theme === 'system' ? 'system’s' : theme} appearance.`,
      group: 'View',
      keywords: 'theme dark mode light mode',
      checked: () => s().theme === theme,
      run: () => app.update({ theme }),
    })),
    {
      id: 'help.commands',
      title: 'Command Menu',
      description: 'Search every command.',
      group: 'Help',
      shortcuts: ['mod+k'],
      global: true,
      run: () => app.toggle('commands'),
    },
    {
      id: 'help.shortcuts',
      title: 'Keyboard Shortcuts',
      description: 'List every keyboard shortcut.',
      group: 'Help',
      shortcuts: ['mod+/'],
      keywords: 'keys help',
      global: true,
      run: () => app.toggle('shortcuts'),
    },
  ];
  const catalog = new CommandCatalog(specs);
  catalog.readOnly = () => app.readOnly.value;
  catalog.gate = (c) => {
    if (folders !== undefined && folders.current.value === null) return false;
    const open = app.dialog.value;
    return open === null || (DIALOG_TOGGLES.has(c.id) && !QUESTIONS.has(open));
  };
  return catalog;
}
