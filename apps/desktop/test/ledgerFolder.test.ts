import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderError, NodeFolder, folderCall, loadFolderChoice, saveFolderChoice } from '../src/index.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'iouinator-folder-test-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const kind = (e: unknown) => (e instanceof FolderError ? e.kind : String(e));
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('the ledger folder on disk (PRD §8.3)', () => {
  it('writes, reads and lists files, with SHA-256 versions as in the browser', async () => {
    const folder = new NodeFolder(root);
    expect(await folder.read('Ledger.txt')).toBeNull();
    const v = await folder.write('Ledger.txt', '1 + 1  # = 2\n', null);
    expect(v).toBe(sha('1 + 1  # = 2\n'));
    expect(await folder.read('Ledger.txt')).toEqual({ text: '1 + 1  # = 2\n', version: v });
    expect(await folder.list('')).toEqual(['Ledger.txt']);
    expect(await folder.list('.iouinator/trash')).toEqual([]);
  });

  it('leaves no temporary or lock files behind', async () => {
    const folder = new NodeFolder(root);
    const v = await folder.write('Ledger.txt', 'a\n', null);
    await folder.write('Ledger.txt', 'b\n', v);
    expect(readdirSync(root)).toEqual(['Ledger.txt']);
  });

  it('refuses a stale version, and a new file over one that appeared', async () => {
    const folder = new NodeFolder(root);
    const v = await folder.write('Ledger.txt', 'a\n', null);
    writeFileSync(path.join(root, 'Ledger.txt'), 'edited elsewhere\n');
    await expect(folder.write('Ledger.txt', 'b\n', v).catch(kind)).resolves.toBe('conflict');
    await expect(folder.write('Ledger.txt', 'b\n', null).catch(kind)).resolves.toBe('conflict');
    expect(readFileSync(path.join(root, 'Ledger.txt'), 'utf8')).toBe('edited elsewhere\n');
  });

  it('lets one of two writes from the same version through', async () => {
    const folder = new NodeFolder(root);
    const v = await folder.write('Ledger.txt', 'a\n', null);
    const results = await Promise.allSettled([
      folder.write('Ledger.txt', 'b\n', v),
      folder.write('Ledger.txt', 'c\n', v),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('waits for a lock another writer holds, and takes over a stale one', async () => {
    const folder = new NodeFolder(root);
    const lock = path.join(root, '.Ledger.txt.lock');
    writeFileSync(lock, '1');
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    await folder.write('Ledger.txt', 'a\n', null);
    expect(readdirSync(root)).toEqual(['Ledger.txt']);
  });

  it('moves into new folders and never replaces a file', async () => {
    const folder = new NodeFolder(root);
    await folder.write('A.txt', 'a\n', null);
    await folder.write('B.txt', 'b\n', null);
    await expect(folder.move('A.txt', 'B.txt').catch(kind)).resolves.toBe('exists');
    await folder.move('A.txt', '.iouinator/trash/A.txt');
    expect(await folder.list('')).toEqual(['B.txt']);
    expect((await folder.read('.iouinator/trash/A.txt'))?.text).toBe('a\n');
    await expect(folder.move('A.txt', 'C.txt').catch(kind)).resolves.toBe('missing');
  });

  it('refuses paths that leave the folder', async () => {
    const folder = new NodeFolder(root);
    await expect(folder.read('../x.txt').catch(kind)).resolves.toBe('name');
    await expect(folder.write('/etc/x.txt', '', null).catch(kind)).resolves.toBe('name');
    await expect(folder.move('a\\..\\x', 'b').catch(kind)).resolves.toBe('name');
  });
});

describe('folder calls from the page', () => {
  it('answers with values, and errors with their kind', async () => {
    const folder = new NodeFolder(root);
    const written = await folderCall(folder, 'write', ['Ledger.txt', 'a\n', null]);
    expect(written).toEqual({ ok: true, value: sha('a\n') });
    expect(await folderCall(folder, 'write', ['Ledger.txt', 'b\n', null])).toMatchObject({
      ok: false,
      kind: 'conflict',
    });
    expect(await folderCall(folder, 'move', ['Ledger.txt', 'T.txt'])).toEqual({ ok: true, value: null });
    expect(await folderCall(folder, 'read', [42])).toMatchObject({ ok: false, kind: 'name' });
    expect(await folderCall(folder, 'remove', [])).toMatchObject({ ok: false, kind: null });
    expect(await folderCall(null, 'list', [''])).toMatchObject({ ok: false, kind: null });
  });
});

describe('the remembered folder', () => {
  it('is saved and read back, and a damaged file means none', async () => {
    const file = path.join(root, 'profile', 'folder.json');
    expect(await loadFolderChoice(file)).toBeNull();
    await saveFolderChoice(file, '/Users/x/Documents/IOUinator');
    expect(await loadFolderChoice(file)).toBe('/Users/x/Documents/IOUinator');
    writeFileSync(file, '{');
    expect(await loadFolderChoice(file)).toBeNull();
    writeFileSync(file, '{"folder":"relative"}');
    expect(await loadFolderChoice(file)).toBeNull();
  });
});
