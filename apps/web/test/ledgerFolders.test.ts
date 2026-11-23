import { describe, expect, it, vi } from 'vitest';
import { MemoryFolder, READ_ONLY_REASON } from '@iouinator/ui';
import { filesFolder } from '../src/index.ts';
import { ledgerFile, makeFolderApp, people, summary } from './helpers.ts';

const SAM = ledgerFile({ people: [{ id: 'p1', name: 'Sam' }] });

const files = (f: unknown) => (f as MemoryFolder).files;

describe('ledger folders (PRD §8.2)', () => {
  it('opens the folder the platform names and blocks commands until a ledger is open', async () => {
    const folder = new MemoryFolder('Ledgers', { 'Trip.iou.json': SAM });
    const { app, catalog, folders } = makeFolderApp({ folder, key: '/Ledgers' });
    expect(catalog.run('file.rename')).toBeFalsy();
    await folders.start();
    expect(folders.current.value?.name.value).toBe('Trip');
    expect(summary(app.ledger.value)).toEqual(['Sam']);
    expect(catalog.run('file.rename')).toBe(true);
  });

  it('asks on first start; the default answer opens Documents/IOUinator and closes the question', async () => {
    const { app, folders, state } = makeFolderApp({ kind: 'first' });
    await folders.start();
    expect(app.dialog.value).toBe('folder');
    expect(folders.setup.value).toEqual({ kind: 'first' });
    await folders.useDefault();
    expect(app.dialog.value).toBe(null);
    expect(state.defaults).toEqual([true]);
    expect(files(state.fallback.folder).get('Ledger.iou.json')).toBe('');
  });

  it('closing the question uses the default folder without remembering the choice', async () => {
    const { app, folders, state } = makeFolderApp({ kind: 'allow', name: 'Ledgers' });
    await folders.start();
    folders.dismissSetup();
    await folders.current.value?.flush();
    await Promise.resolve();
    expect(state.defaults).toEqual([false]);
    expect(app.dialog.value).toBe(null);
  });

  it('a cancelled folder pick keeps the open ledger, and on a missing folder asks again', async () => {
    const folder = new MemoryFolder('Ledgers', {});
    const { folders } = makeFolderApp({ folder, key: '/Ledgers' });
    await folders.start();
    const current = folders.current.value;
    await folders.choose();
    expect(folders.current.value).toBe(current);

    const lost = makeFolderApp({ kind: 'missing', folder: '/Volumes/USB/Ledgers' });
    await lost.folders.start();
    await lost.folders.choose();
    expect(lost.app.dialog.value).toBe('folder');
    expect(lost.folders.setup.value).toEqual({ kind: 'missing', folder: '/Volumes/USB/Ledgers' });
  });

  it('switching folders saves the old ledger first and stops saving there', async () => {
    const old = new MemoryFolder('Old', {});
    const { app, folders, state } = makeFolderApp({ folder: old, key: '/Old' });
    await folders.start();
    people(app, 'Kim');
    const next = new MemoryFolder('New', { 'Other.iou.json': SAM });
    state.choice = { folder: next, key: '/New' };
    await folders.choose();
    const saved = files(old).get('Ledger.iou.json');
    expect(saved).toContain('"Kim"');
    expect(folders.current.value?.name.value).toBe('Other');
    people(app, 'Lee');
    await folders.current.value?.flush();
    expect(files(old).get('Ledger.iou.json')).toBe(saved);
    expect(files(next).get('Other.iou.json')).toContain('"Lee"');
  });
});

describe('the File commands (PRD §8.2)', () => {
  async function started() {
    const made = makeFolderApp({ folder: new MemoryFolder('Ledgers', { 'Trip.iou.json': SAM }), key: '/T' });
    await made.folders.start();
    return made;
  }

  it('New Ledger, Delete Ledger and Open Trash', async () => {
    const { app, catalog, folders } = await started();
    const current = folders.current.value!;
    catalog.run('file.new');
    await vi.waitFor(() => expect(current.name.value).toBe('Ledger'));
    catalog.run('file.delete');
    await vi.waitFor(() => expect(current.names.value).toEqual(['Trip']));
    catalog.run('file.trash');
    await vi.waitFor(() => expect(app.dialog.value).toBe('trash'));
    expect(current.trashed.value).toEqual(['Ledger']);
  });

  it('Export Ledger hands the ledger text to the platform', async () => {
    const { app, catalog, state } = await started();
    catalog.run('file.export');
    await vi.waitFor(() => expect(state.exported.length).toBe(1));
    expect(state.exported).toEqual([['Trip', SAM]]);
    expect(app.notice.value?.text).toBe('Exported Trip.');
  });

  it('no other window replaces a conflict question', async () => {
    const { app, catalog } = await started();
    app.open('conflict');
    catalog.run('app.settings');
    catalog.run('file.open');
    expect(app.dialog.value).toBe('conflict');
  });
});

/** Files as `<input webkitdirectory>` gives them for a folder called Shared. */
function pickedFiles(files: Readonly<Record<string, string>>): File[] {
  return Object.entries(files).map(([path, text]) => {
    const file = new File([text], path);
    Object.defineProperty(file, 'webkitRelativePath', { value: `Shared/${path}` });
    return file;
  });
}

describe('a folder Firefox or Safari opened, read-only (PRD §8.2)', () => {
  it('opens its ledgers to read, and turns off every command that writes, saying why', async () => {
    const { app, catalog, folders, state } = makeFolderApp({
      folder: new MemoryFolder('Mine'),
      key: 'browser',
    });
    await folders.start();
    state.choice = await filesFolder(pickedFiles({ 'Trip.iou.json': SAM }));
    await folders.choose();
    expect(folders.current.value?.name.value).toBe('Trip');
    expect(summary(app.ledger.value)).toEqual(['Sam']);
    expect(app.readOnly.value).toBe(READ_ONLY_REASON);

    for (const id of [
      'file.new',
      'file.rename',
      'file.delete',
      'file.trash',
      'person.add',
      'transaction.new',
    ]) {
      const c = catalog.get(id)!;
      expect(catalog.isEnabled(c), id).toBe(false);
      expect(catalog.whyDisabled(c), id).toBe(READ_ONLY_REASON);
    }
    for (const id of ['file.open', 'file.export', 'view.flatten', 'edit.copyMermaid'])
      expect(catalog.isEnabled(catalog.get(id)!), id).toBe(true);

    expect(app.addPerson('Kim')).toBe(READ_ONLY_REASON);
    expect(summary(app.ledger.value)).toEqual(['Sam']);
    await folders.exportLedger();
    expect(state.exported).toEqual([['Trip', SAM]]);
  });

  it('going back to the browser’s own storage makes the ledger editable again', async () => {
    const { app, folders, state } = makeFolderApp({ folder: new MemoryFolder('Mine'), key: 'browser' });
    await folders.start();
    state.choice = await filesFolder(pickedFiles({ 'Trip.iou.json': SAM }));
    await folders.choose();
    await folders.useDefault();
    expect(app.readOnly.value).toBe(null);
    expect(app.addPerson('Kim')).toBe(null);
  });

  it('refuses a folder with no ledgers, and one whose ledgers can’t be opened', async () => {
    await expect(filesFolder(pickedFiles({ 'notes.txt': 'x' }))).rejects.toThrow(
      'There are no ledgers (.iou.json files) in Shared.',
    );
    const { app, folders, state } = makeFolderApp({ folder: new MemoryFolder('Mine'), key: 'browser' });
    await folders.start();
    state.choice = await filesFolder(pickedFiles({ 'Bad.iou.json': '{' }));
    await folders.choose();
    expect(app.dialog.value).toBe('folder');
    expect(folders.setup.value).toEqual({
      kind: 'failed',
      message: 'None of the ledgers in Shared could be opened.',
    });
  });
});
