/** The app's state and what the UI does to it. Components read the signals and call the methods. */
import { batch, computed, signal, type Signal } from '@preact/signals';
import {
  EMPTY_LEDGER,
  addPerson,
  addTransaction,
  balances,
  deleteTransaction,
  flattenDebts,
  flattenSummary,
  mermaidText,
  personById,
  rawDebts,
  removePerson,
  renamePerson,
  swapTransaction,
  updateTransaction,
  type Debt,
  type Ledger,
  type Transaction,
  type TransactionFields,
} from '@iouinator/core';
import type { Settings, SettingsStorage, View } from '@iouinator/ui';
import { Notices, type Notice } from './notices.ts';
import { UndoStack } from './undo.ts';

export type DialogKind =
  | 'commands'
  | 'shortcuts'
  | 'settings'
  | 'ledgers'
  | 'rename'
  | 'trash'
  | 'conflict'
  | 'recovery'
  | 'folder'
  | 'editTransaction'
  | 'renamePerson';

/** Which transactions the list shows (PRD §4.4). `both`: the pair in either direction (the flattened view). */
export type Filter =
  | { readonly kind: 'pair'; readonly from: string; readonly to: string; readonly both: boolean }
  | { readonly kind: 'person'; readonly id: string };

/** Where a command asked the keyboard to go; `n` changes each time, so asking twice moves it twice. */
export interface FocusRequest {
  readonly target: 'person' | 'amount' | 'list';
  readonly n: number;
}

/** A right-click menu: what it is about and where it opens (PRD §10). */
export interface ContextMenu {
  readonly kind: 'person' | 'transaction';
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface ControllerOptions {
  readonly settings: SettingsStorage;
  readonly version: string;
  /** Writes text to the clipboard. */
  readonly copy?: (text: string) => Promise<void>;
}

export class AppController {
  readonly version: string;
  readonly settings: Signal<Settings>;
  readonly ledger = signal<Ledger>(EMPTY_LEDGER);
  readonly dialog = signal<DialogKind | null>(null);
  readonly filter = signal<Filter | null>(null);
  /** The chosen transaction in the list. */
  readonly chosen = signal<string | null>(null);
  /** The transaction Edit Transaction… is open on. */
  readonly editing = signal<string | null>(null);
  /** The person Rename Person… is open on. */
  readonly renaming = signal<string | null>(null);
  readonly focus = signal<FocusRequest>({ target: 'list', n: 0 });
  readonly menu = signal<ContextMenu | null>(null);
  /** True while the transaction list has the keyboard: Enter, Delete and the arrows act on it (PRD §4.3). */
  readonly listFocused = signal(false);
  /** Why the ledger can't be changed (a folder Firefox or Safari opened), or null (PRD §8.2). */
  readonly readOnly = signal<string | null>(null);
  readonly #notices = new Notices();
  readonly notice = this.#notices.notice;
  /** What the screen reader's live region says (PRD §14). */
  readonly announcement = this.#notices.announcement;

  /** Each direction summed separately (PRD §5). */
  readonly raw = computed(() => rawDebts(this.ledger.value));
  /** Pairs netted and loops cancelled (PRD §6). */
  readonly flat = computed(() => flattenDebts(this.ledger.value));
  /** The debts the diagram shows, in the current view. */
  readonly debts = computed<readonly Debt[]>(() =>
    this.settings.value.view === 'flat' ? this.flat.value : this.raw.value,
  );
  readonly summary = computed(() => flattenSummary(this.raw.value, this.flat.value));
  readonly balances = computed(() => balances(this.ledger.value));
  readonly mermaid = computed(() => mermaidText(this.ledger.value, this.debts.value));
  /** The transactions the list shows, after the filter (PRD §4.4). */
  readonly visible = computed(() => {
    const f = this.filter.value;
    const all = this.ledger.value.transactions;
    if (!f) return all;
    if (f.kind === 'person') return all.filter((t) => t.from === f.id || t.to === f.id);
    return all.filter(
      (t) => (t.from === f.from && t.to === f.to) || (f.both && t.from === f.to && t.to === f.from),
    );
  });

  readonly #storage: SettingsStorage;
  readonly #copy: (text: string) => Promise<void>;
  /** Earlier ledgers, for ⌘Z (PRD §7). */
  readonly #undo = new UndoStack<Ledger>();

  constructor(options: ControllerOptions) {
    this.version = options.version;
    this.#storage = options.settings;
    this.settings = signal(options.settings.load());
    this.#copy = options.copy ?? ((text) => navigator.clipboard.writeText(text));
    options.settings.watch?.((next) => (this.settings.value = next));
  }

  // Settings (PRD §11)

  update(change: Partial<Settings>): void {
    const next = { ...this.settings.value, ...change };
    this.settings.value = next;
    this.#storage.save(next);
  }

  /** Raw or Flattened (PRD §6). A pair filter follows: one direction in Raw, both in Flattened. */
  setView(view: View): void {
    if (view === this.settings.value.view) return;
    batch(() => {
      this.update({ view });
      const f = this.filter.value;
      if (f?.kind === 'pair') this.filter.value = { ...f, both: view === 'flat' };
    });
    this.#announce(view === 'flat' ? 'Showing flattened debts.' : 'Showing every debt.');
  }

  toggleFlatten(): void {
    this.setView(this.settings.value.view === 'flat' ? 'raw' : 'flat');
  }

  // Dialogs, menus and notices

  open(kind: DialogKind): void {
    batch(() => {
      this.menu.value = null;
      this.dialog.value = kind;
    });
  }

  /** Opens `kind`, or closes it when it is the one open. */
  toggle(kind: DialogKind): void {
    if (this.dialog.value === kind) this.close();
    else this.open(kind);
  }

  close(): void {
    batch(() => {
      this.dialog.value = null;
      this.editing.value = null;
      this.renaming.value = null;
    });
  }

  /** True while a dialog is open: keys then go to the dialog. */
  blocked(): boolean {
    return this.dialog.value !== null;
  }

  say(text: string, options: { tone?: Notice['tone']; action?: Notice['action'] } = {}): void {
    this.#notices.say(text, options);
  }

  dismissNotice(): void {
    this.#notices.dismiss();
  }

  #announce(text: string): void {
    this.#notices.announce(text);
  }

  openMenu(menu: ContextMenu): void {
    batch(() => {
      if (menu.kind === 'transaction') this.chosen.value = menu.id;
      this.menu.value = menu;
    });
  }

  closeMenu(): void {
    this.menu.value = null;
  }

  /** The person a person command acts on: the open menu's. */
  personTarget(): string | null {
    const m = this.menu.value;
    return m?.kind === 'person' ? m.id : null;
  }

  /** The transaction a transaction command acts on: the open menu's, or the chosen one. */
  transactionTarget(): Transaction | null {
    const m = this.menu.value;
    const id = m?.kind === 'transaction' ? m.id : this.chosen.value;
    return id === null ? null : (this.ledger.value.transactions.find((t) => t.id === id) ?? null);
  }

  requestFocus(target: FocusRequest['target']): void {
    this.focus.value = { target, n: this.focus.value.n + 1 };
  }

  // The ledger and undo (PRD §7)

  /** Shows a ledger just opened, with nothing to undo and no filter. */
  loadLedger(ledger: Ledger): void {
    batch(() => {
      this.#undo.clear();
      this.filter.value = null;
      this.chosen.value = null;
      this.#show(ledger);
    });
  }

  /** A change to the ledger, kept for ⌘Z. The same ledger is no change: nothing is recorded. */
  editLedger(ledger: Ledger): void {
    if (ledger === this.ledger.value) return;
    this.#undo.push(this.ledger.value);
    this.#show(ledger);
  }

  canStep(step: 'undo' | 'redo'): boolean {
    return step === 'undo' ? this.#undo.canUndo() : this.#undo.canRedo();
  }

  step(step: 'undo' | 'redo'): void {
    if (this.#refused()) return;
    const ledger = step === 'undo' ? this.#undo.undo(this.ledger.value) : this.#undo.redo(this.ledger.value);
    if (!ledger) return;
    this.#show(ledger);
    this.#announce(step === 'undo' ? 'Undone.' : 'Redone.');
  }

  /** Shows `ledger`, keeping the filter and the chosen transaction pointing at things still there. */
  #show(ledger: Ledger): void {
    batch(() => {
      this.ledger.value = ledger;
      const f = this.filter.value;
      const there = (id: string) => personById(ledger, id) !== undefined;
      if (f && !(f.kind === 'person' ? there(f.id) : there(f.from) && there(f.to))) this.filter.value = null;
      const chosen = this.chosen.value;
      if (chosen !== null && !this.visible.value.some((t) => t.id === chosen))
        this.chosen.value = this.visible.value.at(-1)?.id ?? null;
    });
  }

  /** The notice's Undo takes back only its own change: once another edit lands, it does nothing. */
  #undoFor(after: Ledger): Notice['action'] {
    return {
      label: 'Undo',
      run: () => {
        if (this.ledger.value === after) this.step('undo');
      },
    };
  }

  /** True, after saying why, when the ledger can't be changed. */
  #refused(): boolean {
    const why = this.readOnly.value;
    if (why !== null) this.say(why, { tone: 'error' });
    return why !== null;
  }

  /** A person's name, or `someone` for an id that isn't there. */
  name(id: string): string {
    return personById(this.ledger.value, id)?.name ?? 'someone';
  }

  // People (PRD §3)

  /** Adds a person; returns an error to show by the field, or null when added. */
  addPerson(name: string): string | null {
    if (this.readOnly.value !== null) return this.readOnly.value;
    const edit = addPerson(this.ledger.value, name);
    if ('error' in edit) return edit.error;
    this.editLedger(edit.ledger);
    this.#announce(`Added ${this.name(edit.id!)}.`);
    return null;
  }

  /** Renames a person; returns an error to show, or null when done. The same name changes nothing. */
  renamePerson(id: string, name: string): string | null {
    if (this.readOnly.value !== null) return this.readOnly.value;
    const before = this.name(id);
    const edit = renamePerson(this.ledger.value, id, name);
    if ('error' in edit) return edit.error;
    if (edit.ledger === this.ledger.value) return null;
    this.editLedger(edit.ledger);
    this.say(`Renamed ${before} to ${this.name(id)}.`);
    return null;
  }

  /** Removes a person and their transactions; the notice's Undo brings them back (PRD §3). */
  removePerson(id: string): void {
    if (this.#refused()) return;
    const name = this.name(id);
    const edit = removePerson(this.ledger.value, id);
    if ('error' in edit) return this.say(edit.error, { tone: 'error' });
    const n = edit.removed ?? 0;
    this.editLedger(edit.ledger);
    const count = n === 0 ? '' : ` and ${n === 1 ? '1 transaction' : `${n} transactions`}`;
    this.say(`Removed ${name}${count}.`, { action: this.#undoFor(edit.ledger) });
  }

  showPerson(id: string): void {
    this.filter.value = { kind: 'person', id };
    this.#announce(`Showing ${this.name(id)}’s transactions.`);
  }

  startRenamePerson(id: string): void {
    if (this.#refused()) return;
    this.renaming.value = id;
    this.open('renamePerson');
  }

  // Transactions (PRD §4)

  /** Adds a transaction; returns an error to show, or null when added. */
  addTransaction(fields: TransactionFields): string | null {
    if (this.readOnly.value !== null) return this.readOnly.value;
    const edit = addTransaction(this.ledger.value, fields);
    if ('error' in edit) return edit.error;
    batch(() => {
      this.editLedger(edit.ledger);
      if (this.visible.value.some((t) => t.id === edit.id)) this.chosen.value = edit.id!;
    });
    this.#announce(`Added: ${this.name(fields.from)} owes ${this.name(fields.to)}.`);
    return null;
  }

  /** Saves Edit Transaction…; returns an error to show, or null when done. No change records nothing. */
  updateTransaction(id: string, fields: TransactionFields): string | null {
    if (this.readOnly.value !== null) return this.readOnly.value;
    const edit = updateTransaction(this.ledger.value, id, fields);
    if ('error' in edit) return edit.error;
    this.editLedger(edit.ledger);
    return null;
  }

  startEdit(t: Transaction): void {
    if (this.#refused()) return;
    batch(() => {
      this.chosen.value = t.id;
      this.editing.value = t.id;
      this.open('editTransaction');
    });
  }

  swap(t: Transaction): void {
    if (this.#refused()) return;
    this.editLedger(swapTransaction(this.ledger.value, t.id));
    this.#announce(`Now ${this.name(t.to)} owes ${this.name(t.from)}.`);
  }

  /** Deletes a transaction; the chosen row moves to the next one. The notice's Undo brings it back. */
  deleteTransaction(t: Transaction): void {
    if (this.#refused()) return;
    const list = this.visible.value;
    const at = list.findIndex((x) => x.id === t.id);
    const after = deleteTransaction(this.ledger.value, t.id);
    if (after === this.ledger.value) return;
    batch(() => {
      this.chosen.value = (list[at + 1] ?? list[at - 1])?.id ?? null;
      this.editLedger(after);
    });
    this.say(`Deleted ${t.description}.`, { action: this.#undoFor(after) });
  }

  /** Moves the chosen transaction: ↑/↓ by one, Home/End to the ends. */
  moveChoice(to: 'up' | 'down' | 'first' | 'last'): void {
    const list = this.visible.value;
    if (!list.length) return;
    const at = list.findIndex((t) => t.id === this.chosen.value);
    let index: number;
    if (to === 'first') index = 0;
    else if (to === 'last' || at < 0) index = list.length - 1;
    else index = at + (to === 'down' ? 1 : -1);
    this.chosen.value = list[Math.max(0, Math.min(list.length - 1, index))]!.id;
  }

  // The diagram and the filter (PRD §4.4, §5)

  /** Filters the list to a debt's transactions: one direction in Raw, both in Flattened. */
  showDebt(d: Pick<Debt, 'from' | 'to'>): void {
    this.filter.value = { kind: 'pair', from: d.from, to: d.to, both: this.settings.value.view === 'flat' };
    this.#announce(`Showing ${this.filterText() ?? ''}.`);
  }

  clearFilter(): void {
    this.filter.value = null;
  }

  /** The filter as words: `Sam → Alex`, `Sam ↔ Alex`, `Sam’s transactions`. */
  filterText(): string | null {
    const f = this.filter.value;
    if (!f) return null;
    if (f.kind === 'person') return `${this.name(f.id)}’s transactions`;
    return `${this.name(f.from)} ${f.both ? '↔' : '→'} ${this.name(f.to)}`;
  }

  async copyMermaid(): Promise<void> {
    try {
      await this.#copy(this.mermaid.value);
      this.say('Copied the diagram as Mermaid.');
    } catch {
      this.say('Couldn’t copy to the clipboard.', { tone: 'error' });
    }
  }
}
