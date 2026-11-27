/**
 * The open ledger and its file (PRD §8.2, §8.3): every change is saved at once, one save at a time; a failed
 * save is retried, then reported; a save against a file changed elsewhere stops and asks; changes made
 * elsewhere are picked up when nothing is unsaved; unsaved text is kept in snapshots for recovery.
 */
import { effect, signal } from '@preact/signals';
import { classifyFile, writeLedgerText, type Ledger } from '@iouinator/core';
import {
  StoreError,
  LedgerLibrary,
  checkLedgerName,
  copyName,
  freeName,
  wait,
  type Folder,
  type Snapshot,
  type LedgerKeep,
} from '@iouinator/ui';
import type { AppController } from './controller.ts';

export type SaveState = 'saved' | 'saving' | 'failed';

/** A save found the file changed or deleted somewhere else; nothing is saved until the user chooses. */
export interface Conflict {
  readonly kind: 'changed' | 'deleted';
  readonly name: string;
}

/** A snapshot of unsaved work found on opening a ledger. */
export interface Recovery {
  readonly name: string;
  readonly snapshot: Snapshot;
}

export interface OpenLedgerOptions {
  readonly app: AppController;
  readonly folder: Folder;
  /** Names this folder in the keep: its path on desktop, `browser` for the browser's storage. */
  readonly key: string;
  readonly keep: LedgerKeep;
  readonly now?: () => Date;
  /** The waits before each retry of a failed save (PRD §8.3). */
  readonly retries?: readonly number[];
}

export const RETRIES = [300, 600] as const;

export class OpenLedger {
  readonly folder: Folder;
  readonly library: LedgerLibrary;
  /** The open ledger's name, or null before one is open. */
  readonly name = signal<string | null>(null);
  readonly names = signal<readonly string[]>([]);
  readonly state = signal<SaveState>('saved');
  readonly conflict = signal<Conflict | null>(null);
  readonly recovery = signal<Recovery | null>(null);
  /** The trash's ledgers, as last listed (Open Trash…). */
  readonly trashed = signal<readonly string[]>([]);

  readonly #app: AppController;
  readonly #key: string;
  readonly #keep: LedgerKeep;
  readonly #now: () => Date;
  readonly #retries: readonly number[];
  /** The version of the file as last read or written; null when there was no file. */
  #version: string | null = null;
  /** The ledger's text when it last matched the file: unsaved while the ledger's text differs. */
  #clean = '';
  #saving: Promise<void> | null = null;
  #again = false;
  /** True while this object itself changes the ledger, which is then no change to save. */
  #loading = false;
  #stopWatching: (() => void) | null = null;

  constructor(options: OpenLedgerOptions) {
    this.#app = options.app;
    this.folder = options.folder;
    this.library = new LedgerLibrary(options.folder);
    this.#key = options.key;
    this.#keep = options.keep;
    this.#now = options.now ?? (() => new Date());
    this.#retries = options.retries ?? RETRIES;
  }

  /**
   * Opens the ledger last open in this folder, or the first that opens, or a new `Ledger` when none does
   * (PRD §8.1, §8.2).
   */
  async start(): Promise<void> {
    const names = await this.#refreshNames();
    const last = this.#keep.lastLedger(this.#key);
    const first = last !== null && names.includes(last) ? [last] : [];
    await this.#openFirst([...first, ...names.filter((n) => n !== last)]);
    this.#stopWatching = effect(() => {
      void this.#app.ledger.value;
      if (!this.#loading) void this.save();
    });
  }

  /** Stops saving on changes (another folder was opened). */
  stop(): void {
    this.#stopWatching?.();
    this.#stopWatching = null;
  }

  /** The text the open ledger would be written as. */
  text(): string {
    return writeLedgerText(this.#app.ledger.value);
  }

  /** True while the ledger has changes the file doesn't. */
  unsaved(): boolean {
    return this.name.value !== null && this.text() !== this.#clean;
  }

  /**
   * Opens a ledger by name, after the open one's last save. A file from a newer IOUinator, or a damaged one,
   * isn't opened, and never written over (PRD §8.1).
   */
  async open(name: string): Promise<boolean> {
    await this.flush();
    const read = await this.library.read(name);
    if (!read) {
      await this.#refreshNames();
      this.#app.say(`${name} isn’t there any more.`, { tone: 'error' });
      return false;
    }
    const file = classifyFile(read.text);
    if (file.kind !== 'ok') {
      const why = file.kind === 'newer' ? 'was made by a newer IOUinator' : 'is damaged and wasn’t opened';
      this.#app.say(`${name} ${why}.`, { tone: 'error' });
      return false;
    }
    this.#show(name, file.ledger, read.version, false);
    this.#keep.setLastLedger(this.#key, name);
    this.conflict.value = null;
    const snapshot = this.#keep.snapshot(this.#key, name);
    if (snapshot && snapshot.text !== this.#clean && snapshot.text !== read.text) {
      this.recovery.value = { name, snapshot };
      this.#app.open('recovery');
    } else if (snapshot) this.#keep.dropSnapshot(this.#key, name);
    return true;
  }

  /** Waits for the save in progress, if any. */
  async flush(): Promise<void> {
    while (this.#saving) await this.#saving;
  }

  /** Saves the ledger if it has changes; a change during a save is saved right after it. */
  save(): Promise<void> {
    if (this.#saving) {
      this.#again = true;
      return this.#saving;
    }
    if (!this.unsaved() || this.conflict.value) return Promise.resolve();
    // The loop starts after `#saving` is set, and clears it in the same step as it ends, so a change made
    // once it has finished starts a new save rather than joining one that is over.
    this.#saving = Promise.resolve().then(() => this.#saveLoop());
    return this.#saving;
  }

  async #saveLoop(): Promise<void> {
    try {
      do {
        this.#again = false;
        const name = this.name.value;
        const text = this.text();
        if (name === null || text === this.#clean || this.conflict.value) break;
        this.state.value = 'saving';
        try {
          this.#version = await this.#write(name, text, this.#version);
          this.#clean = text;
        } catch (e) {
          if (e instanceof StoreError && e.kind === 'conflict')
            await this.#conflictFound(name).catch((error: unknown) => this.#failed(name, error));
          else this.#failed(name, e);
          return;
        }
      } while (this.#again);
      this.state.value = 'saved';
      if (this.name.value !== null) this.#keep.dropSnapshot(this.#key, this.name.value);
    } finally {
      this.#saving = null;
    }
  }

  /** One write, retried after each wait in `retries` unless it is a conflict (PRD §8.3). */
  async #write(name: string, text: string, expected: string | null): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.library.write(name, text, expected);
      } catch (e) {
        const retry = this.#retries[attempt];
        if (e instanceof StoreError || retry === undefined) throw e;
        await wait(retry);
      }
    }
  }

  #failed(name: string, error: unknown): void {
    console.warn(`Couldn’t save ${name}:`, error);
    this.state.value = 'failed';
    this.snapshot();
  }

  async #conflictFound(name: string): Promise<void> {
    const now = await this.library.read(name);
    this.state.value = 'saved';
    this.snapshot();
    this.conflict.value = { kind: now ? 'changed' : 'deleted', name };
    this.#app.open('conflict');
  }

  /** Keeps the unsaved text in the app's storage (PRD §8.3); nothing when everything is saved. */
  snapshot(): void {
    const name = this.name.value;
    if (name === null || !this.unsaved()) return;
    const snapshot = { text: this.text(), base: this.#version, at: this.#now().getTime() };
    try {
      this.#keep.putSnapshot(this.#key, name, snapshot);
    } catch (e) {
      // A full storage quota: the ledger itself is still open, and saving goes on.
      console.warn('Couldn’t keep a snapshot of the ledger:', e);
    }
  }

  // Conflicts (PRD §8.3)

  /** Writes the ledger as `<name> copy <date>` and opens the file on disk (or the copy, if the file is gone). */
  async saveMineAsCopy(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    const text = this.text();
    const copy = freeName(copyName(conflict.name, this.#now()), await this.library.names());
    await this.library.write(copy, text, null);
    this.conflict.value = null;
    this.#keep.dropSnapshot(this.#key, conflict.name);
    await this.open(conflict.kind === 'changed' ? conflict.name : copy);
    await this.#refreshNames();
    this.#app.say(`Saved your ledger as ${copy}.`);
  }

  /** Writes the ledger over the file as it is now. */
  async keepMine(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    this.#version = (await this.library.read(conflict.name))?.version ?? null;
    this.conflict.value = null;
    await this.save();
    await this.#refreshNames();
  }

  /** Takes the file as it is now; a deleted file closes the ledger. ⌘Z brings the ledger back. */
  async useTheirs(): Promise<void> {
    const conflict = this.conflict.value;
    if (!conflict) return;
    this.conflict.value = null;
    this.#keep.dropSnapshot(this.#key, conflict.name);
    const read = await this.library.read(conflict.name);
    const file = read ? classifyFile(read.text) : null;
    if (read && file?.kind === 'ok') this.#show(conflict.name, file.ledger, read.version, true);
    else if (read && !(await this.open(conflict.name))) await this.#openAnother();
    else await this.#openAnother();
  }

  // Changes made elsewhere (PRD §8.3)

  /** Picks up the file's changes when the ledger has nothing unsaved; one undo step. */
  async check(): Promise<void> {
    const name = this.name.value;
    if (name === null || this.#saving || this.conflict.value || this.recovery.value || this.unsaved()) return;
    const read = await this.library.read(name);
    // Something changed meanwhile: the next check looks again.
    if (this.name.value !== name || this.#saving || this.unsaved()) return;
    await this.#refreshNames();
    if (!read) {
      this.conflict.value = { kind: 'deleted', name };
      this.#app.open('conflict');
      return;
    }
    if (read.version === this.#version) return;
    // A newer or damaged file is left alone: an edit here then meets it as a conflict.
    const file = classifyFile(read.text);
    if (file.kind !== 'ok') return;
    const before = this.text();
    this.#show(name, file.ledger, read.version, true);
    if (this.text() === before) return;
    this.#app.say(`Updated ${name} with changes made elsewhere.`, {
      action: { label: 'Undo', run: () => this.#app.step('undo') },
    });
  }

  // Recovery (PRD §8.3)

  /** Puts the snapshot's text back in the ledger, as one undo step, and saves it. */
  restore(): void {
    const recovery = this.recovery.value;
    if (!recovery) return;
    this.recovery.value = null;
    const file = classifyFile(recovery.snapshot.text);
    if (file.kind === 'ok') this.#app.editLedger(file.ledger);
  }

  discard(): void {
    const recovery = this.recovery.value;
    if (!recovery) return;
    this.recovery.value = null;
    this.#keep.dropSnapshot(this.#key, recovery.name);
  }

  // The folder's ledgers (PRD §8.2)

  /** A new ledger, named `Ledger`, `Ledger 2`…, opened (PRD §8.2). */
  async newLedger(): Promise<void> {
    await this.flush();
    const { name } = await this.library.create();
    await this.#refreshNames();
    await this.open(name);
  }

  /** Renames the open ledger; returns an error to show, or null when done. */
  async rename(to: string): Promise<string | null> {
    const from = this.name.value;
    const checked = checkLedgerName(to);
    if ('error' in checked) return checked.error;
    if (from === null || checked.name === from) return null;
    await this.flush();
    try {
      await this.library.rename(from, checked.name);
    } catch (e) {
      if (e instanceof StoreError && e.kind === 'exists')
        return `There’s already a ledger called ${checked.name}.`;
      if (e instanceof StoreError) return e.message;
      throw e;
    }
    this.#keep.dropSnapshot(this.#key, from);
    this.name.value = checked.name;
    this.#keep.setLastLedger(this.#key, checked.name);
    await this.#refreshNames();
    this.#app.say(`Renamed ${from} to ${checked.name}.`);
    return null;
  }

  /** Moves the open ledger to the trash and opens another; the notice's Undo brings it back. */
  async trash(): Promise<void> {
    const name = this.name.value;
    if (name === null) return;
    await this.flush();
    const trashed = await this.library.trash(name);
    this.#keep.dropSnapshot(this.#key, name);
    const left = await this.#refreshNames();
    await this.#openFirst(left);
    // With none left, a new empty ledger opens, maybe with the same name: say so, or it looks like a wipe.
    const fresh = left.length === 0 ? ' and started a new, empty ledger' : '';
    this.#app.say(`Moved ${name} to the trash${fresh}.`, {
      action: { label: 'Undo', run: () => void this.restoreTrashed(trashed) },
    });
  }

  /** Lists the trash for Open Trash…. */
  async listTrash(): Promise<readonly string[]> {
    const names = await this.library.trashed();
    this.trashed.value = names;
    return names;
  }

  /** Brings a ledger back from the trash and opens it; a taken name gets ` 2`. */
  async restoreTrashed(trashed: string): Promise<void> {
    const name = await this.library.restore(trashed);
    this.trashed.value = this.trashed.value.filter((n) => n !== trashed);
    await this.#refreshNames();
    await this.open(name);
    this.#app.say(`Restored ${name}.`);
  }

  async #openAnother(): Promise<void> {
    await this.#openFirst(await this.#refreshNames());
  }

  /** Opens the first of `names` that opens, or a new ledger; a read-only folder can't have one. */
  async #openFirst(names: readonly string[]): Promise<void> {
    for (const name of names) if (await this.open(name)) return;
    if (this.folder.readOnly !== undefined)
      throw new Error(`None of the ledgers in ${this.folder.label} could be opened.`);
    await this.newLedger();
  }

  async #refreshNames(): Promise<string[]> {
    const names = await this.library.names();
    this.names.value = names;
    return names;
  }

  /** Shows a file's ledger: as a new ledger (undo forgotten), or as one undo step. */
  #show(name: string, ledger: Ledger, version: string, asEdit: boolean): void {
    this.#loading = true;
    try {
      if (asEdit) this.#app.editLedger(ledger);
      else this.#app.loadLedger(ledger);
      this.name.value = name;
      this.#version = version;
      this.#clean = this.text();
      this.state.value = 'saved';
    } finally {
      this.#loading = false;
    }
  }
}
