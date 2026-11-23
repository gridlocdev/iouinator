/**
 * The browser's ledger folders (PRD §8.2): a folder the user picked with the File System Access API, a
 * read-only snapshot of one picked with the file input (Firefox, Safari), or the browser's own storage (the
 * origin private file system), or memory where a browser has neither.
 */
import { HandleFolder } from './handleFolder.ts';
import { MemoryFolder } from './memoryFolder.ts';
import { loadPickedFolder, savePickedFolder } from './browserStorage.ts';
import type { Folder } from './folder.ts';

/** The label of the browser's own storage; the status bar says "Stored in this browser". */
export const BROWSER_LABEL = 'this browser';

/** The folder in the browser's own storage. */
export const STORAGE_FOLDER = 'ledgers';

interface PermissionHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface PickerWindow {
  showDirectoryPicker?(options: { id: string; mode: 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

/** True where the browser can open a folder on disk (Chromium browsers). */
export function canPickFolder(): boolean {
  return typeof (globalThis as PickerWindow).showDirectoryPicker === 'function';
}

/** True where the browser can pick a folder with `<input webkitdirectory>`, only to read it (Firefox, Safari). */
export function canPickFolderFiles(): boolean {
  return typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype;
}

/**
 * Picks a folder with a hidden `<input type="file" webkitdirectory>`, from the user's click. Gives every file
 * under it, or null when the user cancelled. A browser that never fires `cancel` leaves the promise pending,
 * which blocks nothing.
 */
export function pickFolderFiles(doc: Document = document): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.hidden = true;
    const done = (files: File[] | null) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(input.files ? [...input.files] : null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    doc.body.append(input);
    input.click();
  });
}

/** The browser's own storage, or memory where there is none (a private window in some browsers). */
export async function browserFolder(): Promise<Folder> {
  const storage = globalThis.navigator?.storage as StorageManager | undefined;
  if (typeof storage?.getDirectory === 'function') {
    try {
      const root = await storage.getDirectory();
      return new HandleFolder(await root.getDirectoryHandle(STORAGE_FOLDER, { create: true }), BROWSER_LABEL);
    } catch (e) {
      // Storage refused (a private window, a full disk): this visit keeps ledgers in memory.
      if (!(e instanceof DOMException)) throw e;
    }
  }
  return new MemoryFolder(BROWSER_LABEL);
}

/** Asks for a folder; null when the user cancels. The folder is remembered for the next visit. */
export async function pickFolder(): Promise<HandleFolder | null> {
  const picker = (globalThis as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: 'iouinator-ledgers', mode: 'readwrite' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
  await savePickedFolder(handle);
  return new HandleFolder(handle, handle.name);
}

/**
 * The folder picked on an earlier visit: `ready` when the browser still allows writing, `ask` when the
 * user must allow it again (a click, then `allowFolder`), or null when none was picked.
 */
export async function pickedFolder(): Promise<
  { state: 'ready'; folder: HandleFolder } | { state: 'ask'; handle: FileSystemDirectoryHandle } | null
> {
  if (!canPickFolder()) return null;
  const handle = await loadPickedFolder();
  if (!handle) return null;
  const state = await (handle as unknown as PermissionHandle).queryPermission({ mode: 'readwrite' });
  return state === 'granted'
    ? { state: 'ready', folder: new HandleFolder(handle, handle.name) }
    : { state: 'ask', handle };
}

/** Asks the browser again for a remembered folder, from a click; null when the user says no. */
export async function allowFolder(handle: FileSystemDirectoryHandle): Promise<HandleFolder | null> {
  const state = await (handle as unknown as PermissionHandle).requestPermission({ mode: 'readwrite' });
  return state === 'granted' ? new HandleFolder(handle, handle.name) : null;
}
