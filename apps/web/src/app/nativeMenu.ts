/** The desktop menu bar, made from the command catalog (PRD §12). */
import { effect, type ReadonlySignal } from '@preact/signals';
import {
  COMMAND_GROUPS,
  debounce,
  toAccelerator,
  type Command,
  type CommandCatalog,
  type NativeMenuItem,
  type Shortcut,
} from '@iouinator/ui';
import type { AppController } from './controller.ts';

/** Separators go before these ids. */
const BREAKS = new Set([
  'file.rename',
  'file.export',
  'app.settings',
  'person.add',
  'transaction.new',
  'edit.copyMermaid',
  'view.clearFilter',
  'view.themeSystem',
  'help.shortcuts',
]);

/** Cut, Copy, Paste and Select All work on text fields. Undo and Redo are the app's own commands (PRD §7). */
const CLIPBOARD_ROLES: readonly NativeMenuItem[] = [
  { role: 'cut' },
  { role: 'copy' },
  { role: 'paste' },
  { role: 'selectAll' },
];

/**
 * Only ⌘/Ctrl chords become accelerators. A plain key (Enter, Esc) as an accelerator would be taken from every
 * text field, so the page's own key handling keeps those, and they stay out of the menu bar.
 */
function accelerator(s: Shortcut | undefined): string | undefined {
  return s && (s.mod || s.ctrl) ? toAccelerator(s) : undefined;
}

const isSeparator = (i: NativeMenuItem) => 'type' in i && i.type === 'separator';

function item(catalog: CommandCatalog, c: Command): NativeMenuItem {
  const chord = c.sequences.find((s) => s.length === 1 && accelerator(s[0]));
  const accel = chord ? accelerator(chord[0]) : undefined;
  return {
    label: c.title,
    command: c.id,
    enabled: catalog.isEnabled(c),
    ...(accel ? { accelerator: accel } : {}),
    ...(c.checked ? { type: 'checkbox' as const, checked: c.checked() } : {}),
  };
}

/** The menu bar: one menu per command group, in catalog order, with each command's current state. */
export function nativeMenu(catalog: CommandCatalog): NativeMenuItem[] {
  return COMMAND_GROUPS.map((group) => {
    const items: NativeMenuItem[] = [];
    for (const c of catalog.all) {
      if (c.group !== group || c.hidden || c.keysOnly) continue;
      if (BREAKS.has(c.id) && items.length > 0 && !isSeparator(items.at(-1)!))
        items.push({ type: 'separator' });
      items.push(item(catalog, c));
    }
    if (group === 'Edit') items.push({ type: 'separator' }, ...CLIPBOARD_ROLES);
    return { label: group, submenu: items };
  }).filter((m) => 'submenu' in m && m.submenu && m.submenu.length > 0);
}

/** Sends the menu, skipping one identical to the last (Electron rebuilds the whole bar for each). */
export function menuSender(send: (menu: readonly NativeMenuItem[]) => void): {
  send(menu: readonly NativeMenuItem[]): boolean;
  forget(): void;
} {
  let last = '';
  return {
    send(menu) {
      const key = JSON.stringify(menu);
      if (key === last) return false;
      last = key;
      send(menu);
      return true;
    },
    forget() {
      last = '';
    },
  };
}

/** Calls `changed` (at most every `settleMs`) when anything a menu item reads may have moved. */
export function watchMenuInputs(
  app: AppController,
  changed: () => void,
  more: readonly ReadonlySignal<unknown>[] = [],
  settleMs = 100,
): () => void {
  const later = debounce(settleMs, changed);
  const stop = effect(() => {
    void app.settings.value;
    void app.dialog.value;
    void app.ledger.value;
    for (const s of more) void s.value;
    later.call();
  });
  return () => {
    later.cancel();
    stop();
  };
}
