/**
 * The ledger folder on disk (PRD §8.2, §8.3), behind the page's `Folder` interface: atomic writes (a temporary
 * file beside the ledger, then a rename), a `.<name>.lock` file held while checking the version and writing,
 * and versions that are the SHA-256 of the bytes, as in the browser. No Electron imports, so tests run it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, readdir, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

/** The kinds of failure the page acts on; anything else is an ordinary error, and the save is retried. */
export type FolderErrorKind = 'conflict' | 'exists' | 'missing' | 'name';

export class FolderError extends Error {
  readonly kind: FolderErrorKind;

  constructor(kind: FolderErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface FileRead {
  readonly text: string;
  readonly version: string;
}

/** A lock file older than this belongs to a writer that died. */
const STALE_LOCK_MS = 10_000;
/** How long a write waits for another writer's lock before failing (and being retried by the page). */
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 25;

export function versionOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

/** Runs tasks one after another, per key. */
class KeyedSerial {
  readonly #tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const tail = this.#tails.get(key) ?? Promise.resolve();
    const run = tail.then(task, task);
    const settled = Promise.allSettled([run]);
    this.#tails.set(key, settled);
    void settled.then(() => {
      if (this.#tails.get(key) === settled) this.#tails.delete(key);
    });
    return run;
  }
}

export class NodeFolder {
  readonly root: string;
  readonly #serial = new KeyedSerial();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** The absolute path for a folder path (`Ledger.iou.json`, `.iouinator/trash/Ledger.iou.json`), refusing any that leave it. */
  resolve(relative: string): string {
    const parts = typeof relative === 'string' ? relative.split('/') : [''];
    if (parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\') || p.includes('\0')))
      throw new FolderError('name', `“${relative}” isn’t a file name in the folder.`);
    return path.join(this.root, ...parts);
  }

  async list(dir: string): Promise<string[]> {
    const full = dir ? this.resolve(dir) : this.root;
    try {
      const entries = await readdir(full, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (e) {
      if (code(e) === 'ENOENT') return [];
      throw e;
    }
  }

  async read(relative: string): Promise<FileRead | null> {
    const file = this.resolve(relative);
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (e) {
      if (code(e) === 'ENOENT') return null;
      throw e;
    }
    return { text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), version: versionOf(bytes) };
  }

  /** Writes `text` when the file is still at `expected` (null: when there is no file). Returns the new version. */
  async write(relative: string, text: string, expected: string | null): Promise<string> {
    const file = this.resolve(relative);
    return this.#serial.run(file, () =>
      this.#locked(file, async () => {
        const now = await this.read(relative);
        if ((now?.version ?? null) !== expected)
          throw new FolderError('conflict', `“${relative}” changed somewhere else.`);
        const bytes = new TextEncoder().encode(text);
        await mkdir(path.dirname(file), { recursive: true });
        await writeAtomic(file, bytes);
        return versionOf(bytes);
      }),
    );
  }

  /** Moves a file to a free name, making its folder. Never replaces a file. */
  async move(from: string, to: string): Promise<void> {
    const a = this.resolve(from);
    const b = this.resolve(to);
    return this.#serial.run(a, () =>
      this.#locked(a, async () => {
        await mkdir(path.dirname(b), { recursive: true });
        try {
          // A hard link fails if the name is taken, so nothing is ever replaced, even by a race.
          await link(a, b);
        } catch (e) {
          if (code(e) === 'ENOENT') throw new FolderError('missing', `“${from}” isn’t there any more.`);
          if (code(e) === 'EEXIST') throw new FolderError('exists', `“${to}” is taken.`);
          // A file system without hard links (FAT, some network drives): check, then rename.
          await renameIfFree(a, b, from, to);
          return;
        }
        await unlink(a);
      }),
    );
  }

  /** Runs `task` holding `.<name>.lock` beside `file`, so a second copy of the app can't write in between. */
  async #locked<T>(file: string, task: () => Promise<T>): Promise<T> {
    const lock = path.join(path.dirname(file), `.${path.basename(file)}.lock`);
    await mkdir(path.dirname(lock), { recursive: true });
    await takeLock(lock);
    try {
      return await task();
    } finally {
      await rm(lock, { force: true });
    }
  }
}

async function takeLock(lock: string): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await open(lock, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return;
    } catch (e) {
      if (code(e) !== 'EEXIST') throw e;
    }
    const age = await lockAge(lock);
    if (age !== null && age > STALE_LOCK_MS) await rm(lock, { force: true });
    else if (Date.now() > deadline) throw new Error(`${path.basename(lock)} is held by another writer.`);
    else await sleep(LOCK_POLL_MS);
  }
}

/** How old the lock file is, or null when it went away meanwhile. */
async function lockAge(lock: string): Promise<number | null> {
  try {
    return Date.now() - (await stat(lock)).mtimeMs;
  } catch (e) {
    if (code(e) === 'ENOENT') return null;
    throw e;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (code(e) === 'ENOENT') return false;
    throw e;
  }
}

async function renameIfFree(a: string, b: string, from: string, to: string): Promise<void> {
  if (!(await exists(a))) throw new FolderError('missing', `“${from}” isn’t there any more.`);
  if (await exists(b)) throw new FolderError('exists', `“${to}” is taken.`);
  await rename(a, b);
}

/** A temporary file beside `file`, flushed to disk, then renamed over it, and the folder flushed too. */
async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
  // Windows can't open a folder to flush it; its rename is durable enough there.
  if (process.platform === 'win32') return;
  const dir = await open(path.dirname(file), 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
