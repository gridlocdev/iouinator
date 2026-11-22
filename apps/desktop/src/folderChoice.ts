/**
 * Which ledger folder the desktop app uses (PRD §8.2), remembered in its data folder, and the one IPC call the
 * page makes on it. The page names no paths of its own: it may only take the default folder or one the user
 * picked in the open dialog. No Electron imports, so tests run it.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FolderError, type NodeFolder } from './ledgerFolder.ts';

/** The folder the app last used, or null. */
export async function loadFolderChoice(file: string): Promise<string | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    // Never chosen, or a damaged file: the page asks again.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return null;
    throw e;
  }
  const folder = (raw as { folder?: unknown } | null)?.folder;
  return typeof folder === 'string' && path.isAbsolute(folder) ? folder : null;
}

export async function saveFolderChoice(file: string, folder: string): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temp, `${JSON.stringify({ folder })}\n`, 'utf8');
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

/** True when `folder` is there and is a folder (a drive may be unplugged). */
export async function folderExists(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

/** What the page learns at start: the remembered folder, whether it is there, and the default. */
export interface FolderInfo {
  readonly folder: string | null;
  readonly missing: boolean;
  readonly defaultFolder: string;
}

/** A folder call's answer. Errors are values, since Electron rewrites the message of a thrown one. */
export type FolderReply =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly kind: string | null; readonly message: string };

const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new FolderError('name', 'A file name is missing.');
  return v;
};

/** Runs one folder call from the page: `list`, `read`, `write` or `move`, with its arguments. */
export async function folderCall(
  folder: NodeFolder | null,
  op: unknown,
  args: unknown,
): Promise<FolderReply> {
  try {
    if (!folder) throw new Error('No ledger folder is open.');
    const a = Array.isArray(args) ? (args as unknown[]) : [];
    let value: unknown;
    if (op === 'list') value = await folder.list(str(a[0] ?? ''));
    else if (op === 'read') value = await folder.read(str(a[0]));
    else if (op === 'write') {
      const expected = a[2] === null ? null : str(a[2]);
      value = await folder.write(str(a[0]), str(a[1]), expected);
    } else if (op === 'move') value = await folder.move(str(a[0]), str(a[1]));
    else throw new Error(`Unknown folder call ${String(op)}.`);
    return { ok: true, value: value ?? null };
  } catch (e) {
    const kind = e instanceof FolderError ? e.kind : null;
    return { ok: false, kind, message: e instanceof Error ? e.message : String(e) };
  }
}
