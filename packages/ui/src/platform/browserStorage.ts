/**
 * What the browser keeps for the ledger folder, outside it (PRD §8.2, §8.3): the folder the user picked (in
 * IndexedDB, the one place a folder handle can be kept), the open ledger per folder, and crash snapshots of
 * unsaved ledgers (in local storage).
 */

/** An unsaved ledger's text, written while a save is pending and on closing (PRD §8.3). */
export interface Snapshot {
  readonly text: string;
  /** The version of the file the text was based on; null for a file that wasn't there. */
  readonly base: string | null;
  /** When it was taken, in ms since 1970. */
  readonly at: number;
}

/** Small per-folder records the app keeps between visits. */
export interface LedgerKeep {
  lastLedger(folder: string): string | null;
  setLastLedger(folder: string, name: string): void;
  snapshot(folder: string, name: string): Snapshot | null;
  putSnapshot(folder: string, name: string, snapshot: Snapshot): void;
  dropSnapshot(folder: string, name: string): void;
}

function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
  const s = o as Partial<Snapshot> | null;
  if (typeof s?.text !== 'string' || typeof s.at !== 'number') return null;
  return { text: s.text, base: typeof s.base === 'string' ? s.base : null, at: s.at };
}

/** A keep over a Storage (local storage in the app, a map in tests). Failed writes (a full quota) are thrown. */
export function storageKeep(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): LedgerKeep {
  const last = (folder: string) => `iouinator.lastLedger.${folder}`;
  const snap = (folder: string, name: string) => `iouinator.snapshot.${folder}/${name}`;
  return {
    lastLedger: (folder) => storage.getItem(last(folder)),
    setLastLedger: (folder, name) => storage.setItem(last(folder), name),
    snapshot: (folder, name) => parseSnapshot(storage.getItem(snap(folder, name))),
    putSnapshot: (folder, name, s) => storage.setItem(snap(folder, name), JSON.stringify(s)),
    dropSnapshot: (folder, name) => storage.removeItem(snap(folder, name)),
  };
}

/** The keep in this browser profile's local storage, or one in memory where there is none. */
export function localKeep(): LedgerKeep {
  try {
    const storage = globalThis.localStorage;
    if (storage) return storageKeep(storage);
  } catch (e) {
    // Storage blocked by the browser's settings: keep things for this visit only.
    if (!(e instanceof DOMException)) throw e;
  }
  const map = new Map<string, string>();
  return storageKeep({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
}

const DB = 'iouinator';
const STORE = 'folders';
const PICKED = 'picked';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Couldn’t open the browser’s database.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('The browser’s database failed.'));
    });
  } finally {
    db.close();
  }
}

/** The folder the user picked last time, or null. */
export async function loadPickedFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const handle = await withStore<unknown>('readonly', (s) => s.get(PICKED));
  return handle instanceof FileSystemDirectoryHandle ? handle : null;
}

export async function savePickedFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (s) => s.put(handle, PICKED));
}

export async function forgetPickedFolder(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (s) => s.delete(PICKED));
}
