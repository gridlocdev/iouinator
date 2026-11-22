/**
 * A folder through the File System Access API: a folder the user picked, or the browser's own private
 * storage (`navigator.storage.getDirectory()`), which has the same interface (PRD §8.2).
 */
import { Serial, StoreError, pathParts, versionOfBytes, type FileRead, type Folder } from './folder.ts';

/** The browser lock every tab's writes take, so one tab's version check can't pass between another's. */
const LOCK = 'iouinator-ledgers';

const isNotFound = (e: unknown) =>
  e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');

export class HandleFolder implements Folder {
  readonly #serial = new Serial();

  readonly root: FileSystemDirectoryHandle;
  readonly label: string;

  constructor(root: FileSystemDirectoryHandle, label: string) {
    this.root = root;
    this.label = label;
  }

  /** Runs `task` after this folder's earlier writes, holding the cross-tab lock where the browser has one. */
  #locked<T>(task: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    return this.#serial.run(() => (locks ? locks.request(LOCK, task) : task()));
  }

  /** The folder holding `parts`' last part, or null when a folder on the way is missing. */
  async #dir(parts: readonly string[], create = false): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.root;
    try {
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
    return dir;
  }

  async #file(path: string): Promise<File | null> {
    const parts = pathParts(path);
    const dir = await this.#dir(parts.slice(0, -1));
    try {
      return dir ? await (await dir.getFileHandle(parts.at(-1)!)).getFile() : null;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async list(dir: string): Promise<string[]> {
    const handle = await this.#dir(dir ? pathParts(dir) : []);
    if (!handle) return [];
    const names: string[] = [];
    for await (const entry of handle.values()) if (entry.kind === 'file') names.push(entry.name);
    return names;
  }

  async read(path: string): Promise<FileRead | null> {
    const file = await this.#file(path);
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
      version: await versionOfBytes(bytes),
    };
  }

  async write(path: string, text: string, expected: string | null): Promise<string> {
    const parts = pathParts(path);
    return this.#locked(async () => {
      const now = await this.read(path);
      if ((now?.version ?? null) !== expected)
        throw new StoreError('conflict', `“${path}” changed somewhere else.`);
      const dir = (await this.#dir(parts.slice(0, -1), true))!;
      const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });
      // A writable writes to a copy and swaps it in on close, so a failed save leaves the file as it was.
      const bytes = new TextEncoder().encode(text);
      const writable = await handle.createWritable();
      try {
        await writable.write(bytes);
        await writable.close();
      } catch (e) {
        // The write's error is the one to report; aborting only drops the copy.
        await Promise.allSettled([writable.abort()]);
        throw e;
      }
      return versionOfBytes(bytes);
    });
  }

  async move(from: string, to: string): Promise<void> {
    const a = pathParts(from);
    const b = pathParts(to);
    return this.#locked(async () => {
      const file = await this.#file(from);
      if (!file) throw new StoreError('missing', `“${from}” isn’t there any more.`);
      if (await this.#file(to)) throw new StoreError('exists', `“${to}” is taken.`);
      // Copy, then remove: not every browser can move a file handle.
      const dir = (await this.#dir(b.slice(0, -1), true))!;
      const writable = await (await dir.getFileHandle(b.at(-1)!, { create: true })).createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
      await (await this.#dir(a.slice(0, -1)))!.removeEntry(a.at(-1)!);
    });
  }
}
