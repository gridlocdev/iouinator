/**
 * The one way the app reaches ledger files (PRD §8.2, §8.3). A `Folder` is a folder of files on disk, in the
 * browser's storage or in memory; the app never knows which. Paths are names inside it, with `/` between
 * folders: `Ledger.txt`, `.iouinator/trash/Ledger.txt`.
 */

/** A file's text and its version, the SHA-256 of its bytes (PRD §8.3). */
export interface FileRead {
  readonly text: string;
  readonly version: string;
}

export type StoreErrorKind =
  /** The file's version isn't the one the write expected: it changed, or was made or deleted, elsewhere. */
  | 'conflict'
  /** A move's target is taken. */
  | 'exists'
  /** A move's source is gone. */
  | 'missing'
  /** A bad name: empty, or with a `/`, `\` or a leading `.`. */
  | 'name'
  /** The folder can't be written: a folder Firefox or Safari picked (PRD §8.2). */
  | 'readOnly';

export class StoreError extends Error {
  readonly kind: StoreErrorKind;

  constructor(kind: StoreErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'StoreError';
  }
}

export interface Folder {
  /** What the app calls the place: the folder's name, or "this browser". */
  readonly label: string;
  /** Why nothing in the folder can be changed; absent when it can (PRD §8.2). */
  readonly readOnly?: string;
  /** The names of the files directly in `dir` (`''` is the folder itself); none when `dir` is missing. */
  list(dir: string): Promise<string[]>;
  /** The file's text and version, or null when there is no such file. */
  read(path: string): Promise<FileRead | null>;
  /**
   * Writes `text` atomically if the file's version is still `expected` (null: the file must not exist yet),
   * and returns the new version. Otherwise it throws a `conflict` StoreError and writes nothing. The check and
   * the write can't interleave with another write to the folder.
   */
  write(path: string, text: string, expected: string | null): Promise<string>;
  /** Moves a file, making `to`'s folders. Throws `exists` when `to` is taken, `missing` when `from` is gone. */
  move(from: string, to: string): Promise<void>;
}

const HEX = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The version of `bytes`: their SHA-256, in hex. */
export async function versionOfBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return HEX(await crypto.subtle.digest('SHA-256', bytes));
}

/** The version of a file holding `text` as UTF-8. */
export function versionOf(text: string): Promise<string> {
  return versionOfBytes(new TextEncoder().encode(text));
}

/** The parts of a folder path; a part that is empty, `.` or `..` is refused. */
export function pathParts(path: string): string[] {
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\')))
    throw new StoreError('name', `“${path}” isn’t a file name in the folder.`);
  return parts;
}

/** Runs tasks one after another: each waits for the one before to settle. */
export class Serial {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(task, task);
    // The next task waits for this one either way; this one's failure goes to its own caller.
    this.#tail = Promise.allSettled([run]);
    return run;
  }
}
