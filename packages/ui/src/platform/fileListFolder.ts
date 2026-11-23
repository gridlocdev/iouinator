/**
 * A folder picked with `<input type="file" webkitdirectory>` (PRD §8.2): how Firefox and Safari open a folder,
 * as they have no `showDirectoryPicker`. The browser hands over a snapshot of the folder's files and no way to
 * write them, so this folder is read-only, and forgotten when the page closes.
 */
import { StoreError, pathParts, versionOfBytes, type FileRead, type Folder } from './folder.ts';
import { TRASH } from './ledgerLibrary.ts';

/** Why a folder picked with the file input can't be changed. */
export const READ_ONLY_REASON =
  'This browser can open a folder only to read it, so this ledger is read-only.';

/** Only the files the app reads: those directly in the folder, and the trash's. */
const kept = (path: string) =>
  !path.includes('/') || (path.startsWith(`${TRASH}/`) && !path.slice(TRASH.length + 1).includes('/'));

export class FileListFolder implements Folder {
  readonly label: string;
  readonly readOnly = READ_ONLY_REASON;
  readonly #files = new Map<string, File>();

  /** `files` as the input gives them: each `webkitRelativePath` starts with the folder's own name. */
  constructor(files: readonly File[]) {
    let name = '';
    for (const file of files) {
      const [top = '', ...rest] = file.webkitRelativePath.split('/');
      name ||= top;
      const path = rest.join('/');
      if (path && kept(path)) this.#files.set(path, file);
    }
    this.label = name || 'Folder';
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir ? `${pathParts(dir).join('/')}/` : '';
    return [...this.#files.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => p.slice(prefix.length));
  }

  async read(path: string): Promise<FileRead | null> {
    const file = this.#files.get(pathParts(path).join('/'));
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
      version: await versionOfBytes(bytes),
    };
  }

  write(path: string, _text: string, _expected: string | null): Promise<string> {
    return Promise.reject(new StoreError('readOnly', `Can’t save “${path}”: ${READ_ONLY_REASON}`));
  }

  move(from: string, _to: string): Promise<void> {
    return Promise.reject(new StoreError('readOnly', `Can’t move “${from}”: ${READ_ONLY_REASON}`));
  }
}
