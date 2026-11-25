/** What the Keyboard Shortcuts window lists (PRD §10): every command with a key, plus keys that aren't commands. */
import {
  COMMAND_GROUPS,
  formatShortcut,
  shortcutOfEvent,
  type CommandCatalog,
  type CommandGroup,
  type ShortcutEvent,
} from '@iouinator/ui';

export interface ShortcutLine {
  readonly title: string;
  /** Each way to press it; a way is one or more keys pressed in turn. */
  readonly keys: readonly (readonly string[])[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly lines: readonly ShortcutLine[];
}

const GROUP_TITLES: Record<CommandGroup, string> = {
  File: 'App',
  Edit: 'People and transactions',
  View: 'View',
  Help: 'Help',
};

/** Keys handled outside the catalog: forms, menus and dialogs. */
function extras(mac: boolean): Partial<Record<CommandGroup, ShortcutLine[]>> {
  return {
    Edit: [
      { title: 'Add the person or transaction you typed', keys: [[mac ? '↩' : 'Enter']] },
      { title: 'Open a person’s or transaction’s menu', keys: [[mac ? '⇧F10' : 'Shift+F10']] },
    ],
    Help: [
      {
        title: 'Next / previous command in the command menu',
        keys: mac ? [['↓'], ['↑'], ['⇥'], ['⇧⇥']] : [['Down'], ['Up'], ['Tab'], ['Shift+Tab']],
      },
      { title: 'Close a window or menu', keys: [[mac ? '⎋' : 'Esc']] },
    ],
  };
}

export function shortcutGroups(catalog: CommandCatalog, mac: boolean): ShortcutGroup[] {
  const more = extras(mac);
  return COMMAND_GROUPS.map((group) => {
    const lines: ShortcutLine[] = catalog.all
      .filter((c) => c.group === group && c.sequences.length > 0)
      .map((c) => ({
        title: c.title.replace(/…$/, ''),
        keys: c.sequences.map((_, i) => catalog.keys({ ...c, sequences: [c.sequences[i]!] }, mac)),
      }));
    return { title: GROUP_TITLES[group], lines: [...lines, ...(more[group] ?? [])] };
  }).filter((g) => g.lines.length > 0);
}

/** What the "press a shortcut" mode shows for one key press. */
export interface KeyPress {
  /** The keys pressed, as the window writes them (⇧⌘Z, Ctrl+Shift+Z). */
  readonly keys: string;
  /** The command it runs, or "No command". */
  readonly says: string;
  /** Why the command wouldn't run now, if it wouldn't. */
  readonly note: string | null;
}

/** What a key runs, from the same catalog the keyboard uses (PRD §10); null for a modifier on its own. */
export function describeKeyPress(catalog: CommandCatalog, e: ShortcutEvent, mac: boolean): KeyPress | null {
  const pressed = shortcutOfEvent(e, mac);
  if (!pressed) return null;
  const keys = formatShortcut(pressed, mac);
  const { command, starts } = catalog.meaningOf(e, mac);
  const title = (c: { readonly title: string }) => c.title.replace(/…$/, '');
  if (command) {
    const off =
      catalog.whyDisabled(command) ?? (catalog.isEnabled(command) ? null : 'Not available right now.');
    return { keys, says: title(command), note: off };
  }
  if (starts.length > 0) {
    const names = starts.map((c) => `${title(c)} (${catalog.keys(c, mac).join(' then ')})`).join(', ');
    return { keys, says: `First key of ${names}`, note: null };
  }
  return { keys, says: 'No command', note: null };
}
