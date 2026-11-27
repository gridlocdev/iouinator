import { describe, expect, it } from 'vitest';
import { classifyFile } from '@iouinator/core';
import { MemoryFolder, type FileRead, type Folder } from '@iouinator/ui';
import { OpenLedger } from '../src/index.ts';
import { ledgerFile, makeApp, memoryKeep, owe, people, summary } from './helpers.ts';

const NOW = new Date(2026, 10, 19, 14, 5, 9);

const SAM_ALEX = ledgerFile({
  people: [
    { id: 'p1', name: 'Sam' },
    { id: 'p2', name: 'Alex' },
  ],
  transactions: [{ id: 't1', from: 'p1', to: 'p2', cents: 1000, description: 'Rent' }],
});

async function startOpenLedger(
  files: Record<string, string> = {},
  folder: Folder = new MemoryFolder('m', files),
) {
  const made = makeApp();
  const { keep, map } = memoryKeep();
  const current = new OpenLedger({ app: made.app, folder, key: 'm', keep, now: () => NOW, retries: [0, 0] });
  await current.start();
  return { ...made, current, keep, map, folder };
}

const disk = (folder: Folder) => (folder as MemoryFolder).files;
/** The ledger in a file, summarised. */
const onDisk = (folder: Folder, file: string) => {
  const read = classifyFile(disk(folder).get(file) ?? '');
  return read.kind === 'ok' ? summary(read.ledger) : read.kind;
};

describe('the open ledger (PRD §8.2)', () => {
  it('gives an empty folder a ledger called Ledger, and saves each change at once', async () => {
    const { app, current, folder } = await startOpenLedger();
    expect(current.name.value).toBe('Ledger');
    expect(disk(folder).get('Ledger.iou.json')).toBe('');
    people(app, 'Sam');
    await current.flush();
    expect(onDisk(folder, 'Ledger.iou.json')).toEqual(['Sam']);
    expect(current.state.value).toBe('saved');
  });

  it('reopens the ledger last open in the folder, else the first', async () => {
    const files = { 'A.iou.json': '', 'B.iou.json': SAM_ALEX };
    const first = await startOpenLedger(files);
    expect(first.current.name.value).toBe('A');
    const { keep } = memoryKeep();
    keep.setLastLedger('m', 'B');
    const made = makeApp();
    const current = new OpenLedger({ app: made.app, folder: new MemoryFolder('m', files), key: 'm', keep });
    await current.start();
    expect(current.name.value).toBe('B');
    expect(summary(made.app.ledger.value)).toEqual(['Sam,Alex', 'Sam>Alex 1000 Rent']);
  });

  it('never opens or overwrites a damaged file or one from a newer IOUinator', async () => {
    const newer = JSON.stringify({ format: 'iouinator', version: 99, people: [] });
    const { app, current, folder } = await startOpenLedger({
      'Bad.iou.json': '{oops',
      'New.iou.json': newer,
    });
    expect(current.name.value).toBe('Ledger');
    expect(await current.open('Bad')).toBe(false);
    expect(app.notice.value?.text).toBe('Bad is damaged and wasn’t opened.');
    expect(await current.open('New')).toBe(false);
    expect(app.notice.value?.text).toBe('New was made by a newer IOUinator.');
    people(app, 'Sam');
    await current.flush();
    expect(disk(folder).get('Bad.iou.json')).toBe('{oops');
    expect(disk(folder).get('New.iou.json')).toBe(newer);
  });

  it('never runs two saves at once, and saves a change made during a save right after it', async () => {
    const inner = new MemoryFolder('m');
    let running = 0;
    let most = 0;
    const slow: Folder = {
      label: 'slow',
      list: (d) => inner.list(d),
      read: (p): Promise<FileRead | null> => inner.read(p),
      move: (a, b) => inner.move(a, b),
      write: async (p, t, v) => {
        running++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return inner.write(p, t, v);
      },
    };
    const { app, current } = await startOpenLedger({}, slow);
    people(app, 'A', 'B', 'C');
    await current.flush();
    expect(most).toBe(1);
    expect(onDisk(inner, 'Ledger.iou.json')).toEqual(['A,B,C']);
  });
});

describe('failed saves (PRD §8.3)', () => {
  it('retries twice, then shows the failure and keeps a snapshot until a save works', async () => {
    const inner = new MemoryFolder('m', { 'Ledger.iou.json': '' });
    let failures = 3;
    const flaky: Folder = {
      label: 'flaky',
      list: (d) => inner.list(d),
      read: (p) => inner.read(p),
      move: (a, b) => inner.move(a, b),
      write: (p, t, v) => (failures-- > 0 ? Promise.reject(new Error('disk full')) : inner.write(p, t, v)),
    };
    const { app, current, keep } = await startOpenLedger({}, flaky);
    people(app, 'Sam');
    await current.flush();
    expect(failures).toBe(0);
    expect(current.state.value).toBe('failed');
    expect(keep.snapshot('m', 'Ledger')?.text).toContain('"Sam"');
    await current.save();
    expect(current.state.value).toBe('saved');
    expect(onDisk(inner, 'Ledger.iou.json')).toEqual(['Sam']);
    expect(keep.snapshot('m', 'Ledger')).toBeNull();
  });
});

describe('conflicts (PRD §8.3)', () => {
  const THEIRS = ledgerFile({ people: [{ id: 'p1', name: 'Theirs' }] });

  async function conflicted() {
    const s = await startOpenLedger({ 'Rent.iou.json': SAM_ALEX });
    disk(s.folder).set('Rent.iou.json', THEIRS);
    owe(s.app, 'Alex', 'Sam', 3, 'Gum');
    await s.current.flush();
    return s;
  }
  const MINE = ['Sam,Alex', 'Sam>Alex 1000 Rent', 'Alex>Sam 300 Gum'];

  it('stops saving and asks when the file changed somewhere else', async () => {
    const { app, current, folder } = await conflicted();
    expect(current.conflict.value).toEqual({ kind: 'changed', name: 'Rent' });
    expect(app.dialog.value).toBe('conflict');
    owe(app, 'Alex', 'Sam', 1, 'More');
    await current.flush();
    expect(disk(folder).get('Rent.iou.json')).toBe(THEIRS);
  });

  it('Save Mine as a Copy writes a dated copy and opens the file on disk', async () => {
    const { app, current, folder } = await conflicted();
    await current.saveMineAsCopy();
    expect(onDisk(folder, 'Rent copy 2026-11-19-140509.iou.json')).toEqual(MINE);
    expect(summary(app.ledger.value)).toEqual(['Theirs']);
    expect(current.conflict.value).toBeNull();
  });

  it('Keep Mine writes over the file', async () => {
    const { current, folder } = await conflicted();
    await current.keepMine();
    expect(onDisk(folder, 'Rent.iou.json')).toEqual(MINE);
  });

  it('Use Theirs takes the file, and ⌘Z brings mine back', async () => {
    const { app, current, folder } = await conflicted();
    await current.useTheirs();
    expect(summary(app.ledger.value)).toEqual(['Theirs']);
    app.step('undo');
    await current.flush();
    expect(onDisk(folder, 'Rent.iou.json')).toEqual(MINE);
  });

  it('a file deleted somewhere else asks the same', async () => {
    const s = await startOpenLedger({ 'Rent.iou.json': SAM_ALEX });
    disk(s.folder).delete('Rent.iou.json');
    owe(s.app, 'Alex', 'Sam', 3, 'Gum');
    await s.current.flush();
    expect(s.current.conflict.value).toEqual({ kind: 'deleted', name: 'Rent' });
    await s.current.keepMine();
    expect(onDisk(s.folder, 'Rent.iou.json')).toEqual(MINE);
  });
});

describe('changes made elsewhere (PRD §8.3)', () => {
  it('are picked up as one undo step when nothing is unsaved', async () => {
    const { app, current, folder } = await startOpenLedger({ 'Ledger.iou.json': SAM_ALEX });
    const theirs = ledgerFile({ people: [{ id: 'p1', name: 'Sam' }] });
    disk(folder).set('Ledger.iou.json', theirs);
    await current.check();
    expect(summary(app.ledger.value)).toEqual(['Sam']);
    expect(app.notice.value?.text).toBe('Updated Ledger with changes made elsewhere.');
    app.notice.value?.action?.run();
    expect(summary(app.ledger.value)).toEqual(['Sam,Alex', 'Sam>Alex 1000 Rent']);
    await current.flush();
    expect(onDisk(folder, 'Ledger.iou.json')).toEqual(['Sam,Alex', 'Sam>Alex 1000 Rent']);
  });

  it('are not picked up while a save is pending, nor when the file is damaged', async () => {
    const { app, current, folder } = await startOpenLedger({ 'Ledger.iou.json': SAM_ALEX });
    people(app, 'Kim');
    disk(folder).set('Ledger.iou.json', ledgerFile({}));
    await current.check();
    expect(summary(app.ledger.value)[0]).toBe('Sam,Alex,Kim');

    const s = await startOpenLedger({ 'Ledger.iou.json': SAM_ALEX });
    disk(s.folder).set('Ledger.iou.json', '{oops');
    await s.current.check();
    expect(summary(s.app.ledger.value)[0]).toBe('Sam,Alex');
  });
});

describe('recovery (PRD §8.3)', () => {
  it('offers a snapshot that differs from the file, and Restore saves it', async () => {
    const { keep } = memoryKeep();
    keep.putSnapshot('m', 'Ledger', { text: SAM_ALEX, base: null, at: 1 });
    const { app } = makeApp();
    const folder = new MemoryFolder('m', { 'Ledger.iou.json': '' });
    const current = new OpenLedger({ app, folder, key: 'm', keep });
    await current.start();
    expect(current.recovery.value?.name).toBe('Ledger');
    expect(app.dialog.value).toBe('recovery');
    current.restore();
    await current.flush();
    expect(onDisk(folder, 'Ledger.iou.json')).toEqual(['Sam,Alex', 'Sam>Alex 1000 Rent']);
    expect(keep.snapshot('m', 'Ledger')).toBeNull();
  });

  it('Discard drops the snapshot', async () => {
    const { keep } = memoryKeep();
    keep.putSnapshot('m', 'Ledger', { text: SAM_ALEX, base: null, at: 1 });
    const { app } = makeApp();
    const current = new OpenLedger({
      app,
      folder: new MemoryFolder('m', { 'Ledger.iou.json': '' }),
      key: 'm',
      keep,
    });
    await current.start();
    current.discard();
    expect(keep.snapshot('m', 'Ledger')).toBeNull();
    expect(app.ledger.value.people).toEqual([]);
  });
});

describe('the folder’s ledgers (PRD §8.2)', () => {
  it('New Ledger, Rename and Delete with Undo', async () => {
    const { app, current, folder } = await startOpenLedger();
    await current.newLedger();
    expect(current.name.value).toBe('Ledger 2');
    expect(await current.rename('Ledger')).toBe('There’s already a ledger called Ledger.');
    expect(await current.rename('a/b')).toMatch(/can’t have/);
    expect(await current.rename('Trip')).toBeNull();
    expect(current.names.value).toEqual(['Ledger', 'Trip']);
    people(app, 'Sam');
    await current.trash();
    expect(current.name.value).toBe('Ledger');
    expect(app.notice.value?.text).toBe('Moved Trip to the trash.');
    expect(onDisk(folder, '.iouinator/trash/Trip.iou.json')).toEqual(['Sam']);
    expect(app.notice.value?.action?.label).toBe('Undo');
    await current.restoreTrashed('Trip');
    expect(current.name.value).toBe('Trip');
    expect(summary(app.ledger.value)).toEqual(['Sam']);
  });

  it('deleting the last ledger leaves a new one, and says so', async () => {
    const { app, current, folder } = await startOpenLedger();
    await current.trash();
    expect(current.name.value).toBe('Ledger');
    expect(app.notice.value?.text).toBe('Moved Ledger to the trash and started a new, empty ledger.');
    expect([...disk(folder).keys()].sort()).toEqual(['.iouinator/trash/Ledger.iou.json', 'Ledger.iou.json']);
  });
});
