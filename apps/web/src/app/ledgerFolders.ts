/**
 * Which ledger folder is open (PRD §8.2), and switching between them: the desktop app's folder on disk, or in
 * the browser a folder the user picked or the browser's own storage. Each folder gets its own OpenLedger.
 */
import { signal } from '@preact/signals';
import {
  BROWSER_LABEL,
  NativeFolder,
  after,
  allowFolder,
  browserFolder,
  FileListFolder,
  LedgerLibrary,
  canPickFolder,
  canPickFolderFiles,
  forgetPickedFolder,
  pickFolder,
  pickFolderFiles,
  pickedFolder,
  type Folder,
  type LedgerKeep,
} from '@iouinator/ui';
import type { AppController } from './controller.ts';
import type { IOUinatorNative } from './native.ts';
import { OpenLedger, type OpenLedgerOptions } from './openLedger.ts';

/** A folder ready to open; `key` names it in the app's storage (last ledger, snapshots). */
export interface OpenedFolder {
  readonly folder: Folder;
  readonly key: string;
}

/** The question the folder dialog asks before any folder is open. */
export type FolderSetup =
  /** Desktop, first start: no folder chosen yet. */
  | { readonly kind: 'first' }
  /** Desktop: the remembered folder isn't there (an unplugged drive). */
  | { readonly kind: 'missing'; readonly folder: string }
  /** Browser: the remembered folder needs the user's permission again. */
  | { readonly kind: 'allow'; readonly name: string }
  /** Opening the folder failed. */
  | { readonly kind: 'failed'; readonly message: string };

/** What differs between the desktop app and the browser. */
export interface FolderPlatform {
  /** The folder to open at start, or the question to ask first. */
  first(): Promise<OpenedFolder | FolderSetup>;
  /** True when the user can pick a folder of their own. */
  readonly canChoose: boolean;
  /** Asks the user for a folder; null when they cancel. */
  choose(): Promise<OpenedFolder | null>;
  /**
   * True when the open folder can change while the picker is open (the desktop app moves to the new folder as
   * it closes), so the open ledger is set aside until the pick ends.
   */
  readonly pickMovesFolder: boolean;
  /** The folder dialog's first answer: Documents/IOUinator, or the browser's own storage. */
  readonly defaultTitle: string;
  /** `remember`: the browser forgets a folder it picked, so the next visit starts in its own storage too. */
  useDefault(remember: boolean): Promise<OpenedFolder>;
  /** Offer the default folder as a command too (browser, which can switch back from a picked folder). */
  readonly offersDefault: boolean;
  /** Saves a copy of a ledger where the user says; false when they cancel. */
  exportLedger(name: string, text: string): Promise<boolean>;
  /** Asks again for the remembered folder (browser); null when the user says no. */
  allow(): Promise<OpenedFolder | null>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class LedgerFolders {
  /** The open folder's open ledger; null until a folder is open, and while another is being picked. */
  readonly current = signal<OpenLedger | null>(null);
  readonly setup = signal<FolderSetup | null>(null);
  readonly platform: FolderPlatform;
  readonly #app: AppController;
  readonly #keep: LedgerKeep;
  readonly #options: Partial<OpenLedgerOptions>;

  constructor(
    app: AppController,
    platform: FolderPlatform,
    keep: LedgerKeep,
    options: Partial<OpenLedgerOptions> = {},
  ) {
    this.#app = app;
    this.platform = platform;
    this.#keep = keep;
    this.#options = options;
  }

  /** Opens the folder of the last visit, or asks which one to use. */
  async start(): Promise<void> {
    let first: OpenedFolder | FolderSetup;
    try {
      first = await this.platform.first();
    } catch (e) {
      first = { kind: 'failed', message: message(e) };
    }
    if ('key' in first) await this.#use(first);
    else this.#ask(first);
  }

  /** ⌘O: asks for another folder and opens it, after the open ledger's last save. */
  async choose(): Promise<void> {
    const old = this.current.value;
    const setup = this.setup.value;
    if (old) {
      await old.flush();
      old.snapshot();
    }
    // Nothing is saved or checked while the picker is open: on desktop, the folder changes as it closes. The
    // browser's pickers leave the open folder alone, and Firefox's may never say it was cancelled.
    if (this.platform.pickMovesFolder) this.current.value = null;
    let picked: OpenedFolder | null = null;
    try {
      picked = await this.platform.choose();
    } catch (e) {
      this.#app.say(`Couldn’t open the folder: ${message(e)}`, { tone: 'error' });
    }
    if (picked) await this.#use(picked, old);
    else if (old) {
      this.current.value = old;
      this.#app.readOnly.value = old.folder.readOnly ?? null;
    } else this.#ask(setup ?? { kind: 'first' });
  }

  /** The folder dialog's first answer. */
  async useDefault(remember = true): Promise<void> {
    try {
      await this.#use(await this.platform.useDefault(remember), this.current.value);
    } catch (e) {
      this.#ask({ kind: 'failed', message: message(e) });
    }
  }

  /** Browser: allows the remembered folder again; a no keeps the question up. */
  async allow(): Promise<void> {
    const folder = await this.platform.allow();
    if (folder) await this.#use(folder);
  }

  /** Export Ledger…: the open ledger as `<name>.iou.json`. */
  async exportLedger(): Promise<void> {
    const current = this.current.value;
    const name = current?.name.value;
    if (!current || name == null) return;
    if (await this.platform.exportLedger(name, current.text())) this.#app.say(`Exported ${name}.`);
  }

  /** The folder dialog was closed without an answer: the default folder for now, so the app can start. */
  dismissSetup(): void {
    void this.useDefault(false);
  }

  #ask(setup: FolderSetup): void {
    this.setup.value = setup;
    this.#app.open('folder');
  }

  async #use(opened: OpenedFolder, old: OpenLedger | null = null): Promise<void> {
    if (old) {
      await old.flush();
      old.stop();
    }
    this.setup.value = null;
    if (this.#app.dialog.peek() === 'folder') this.#app.close();
    this.#app.readOnly.value = null;
    const current = new OpenLedger({
      ...this.#options,
      app: this.#app,
      folder: opened.folder,
      key: opened.key,
      keep: this.#keep,
    });
    try {
      await current.start();
    } catch (e) {
      current.stop();
      this.current.value = null;
      this.#ask({ kind: 'failed', message: message(e) });
      return;
    }
    this.current.value = current;
    this.#app.readOnly.value = opened.folder.readOnly ?? null;
  }
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/** The desktop app's folders, through the bridge. */
export function desktopPlatform(native: IOUinatorNative): FolderPlatform {
  const opened = (path: string): OpenedFolder => ({
    folder: new NativeFolder((op, args) => native.folder(op, args), baseName(path)),
    key: path,
  });
  return {
    async first() {
      const info = await native.folderInfo();
      if (info.folder === null) return { kind: 'first' };
      return info.missing ? { kind: 'missing', folder: info.folder } : opened(info.folder);
    },
    canChoose: true,
    pickMovesFolder: true,
    async choose() {
      const path = await native.chooseFolder();
      return path === null ? null : opened(path);
    },
    defaultTitle: 'Use Documents/IOUinator',
    async useDefault() {
      return opened(await native.useDefaultFolder());
    },
    offersDefault: false,
    exportLedger: (name, text) => native.exportLedger(name, text),
    allow: () => Promise.resolve(null),
  };
}

/** The key of the browser's own storage. */
export const BROWSER_KEY = 'browser';

/** What Open Ledger Folder… says in a browser that can't open a folder at all. */
export const NO_FOLDER_PICKER =
  'This browser can’t open a folder. The IOUinator desktop app keeps ledgers in a folder on your computer.';

/**
 * A folder picked with the file input, read-only (PRD §8.2). One with no ledgers is refused, as nothing could
 * be made in it.
 */
export async function filesFolder(files: readonly File[]): Promise<OpenedFolder> {
  const folder = new FileListFolder(files);
  if ((await new LedgerLibrary(folder).names()).length === 0)
    throw new Error(`There are no ledgers (.iou.json files) in ${folder.label}.`);
  return { folder, key: `files:${folder.label}` };
}

/**
 * The browser's folders: one the user picked, where the browser can (read-only in Firefox and Safari), or its
 * own storage.
 */
export function browserPlatform(): FolderPlatform {
  let remembered: FileSystemDirectoryHandle | null = null;
  const picked = (folder: Folder): OpenedFolder => ({ folder, key: `picked:${folder.label}` });
  return {
    async first() {
      const found = await pickedFolder();
      if (found?.state === 'ready') return picked(found.folder);
      if (found?.state === 'ask') {
        remembered = found.handle;
        return { kind: 'allow', name: found.handle.name };
      }
      return { folder: await browserFolder(), key: BROWSER_KEY };
    },
    // Where the browser can't open a folder, Open Ledger Folder… says so.
    canChoose: true,
    pickMovesFolder: false,
    async choose() {
      if (canPickFolder()) {
        const folder = await pickFolder();
        return folder ? picked(folder) : null;
      }
      if (!canPickFolderFiles()) throw new Error(NO_FOLDER_PICKER);
      const files = await pickFolderFiles();
      return files ? filesFolder(files) : null;
    },
    defaultTitle: 'Keep Ledgers in This Browser',
    offersDefault: canPickFolder() || canPickFolderFiles(),
    exportLedger: (name, text) => {
      download(`${name}.iou.json`, text);
      return Promise.resolve(true);
    },
    async useDefault(remember) {
      if (remember) await forgetPickedFolder();
      return { folder: await browserFolder(), key: BROWSER_KEY };
    },
    async allow() {
      if (!remembered) return null;
      const folder = await allowFolder(remembered);
      return folder ? picked(folder) : null;
    },
  };
}

/** Downloads `text` as a file. */
function download(file: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.click();
  // Some browsers read the file a little after the click.
  after(10_000, () => URL.revokeObjectURL(url));
}

/** True when the open folder is the browser's own storage. */
export const inBrowserStorage = (current: OpenLedger | null) => current?.folder.label === BROWSER_LABEL;
