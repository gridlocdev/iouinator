// The behaviour every Folder has (PRD §8.3), run against each adapter.
import { describe, expect, it } from 'vitest';
import { StoreError, LedgerLibrary, versionOf, type Folder } from '../src/index.ts';

const kind = (e: unknown) => (e instanceof StoreError ? e.kind : String(e));

export function folderContract(name: string, make: () => Promise<Folder>): void {
  describe(`${name} folder`, () => {
    it('writes new files, reads them with their version, and lists them', async () => {
      const folder = await make();
      expect(await folder.read('Ledger.txt')).toBeNull();
      const version = await folder.write('Ledger.txt', '1 + 1  # = 2\n', null);
      expect(version).toBe(await versionOf('1 + 1  # = 2\n'));
      expect(await folder.read('Ledger.txt')).toEqual({ text: '1 + 1  # = 2\n', version });
      expect(await folder.list('')).toEqual(['Ledger.txt']);
      expect(await folder.list('.iouinator/trash')).toEqual([]);
    });

    it('refuses a write against a stale version, and a new file over an old one', async () => {
      const folder = await make();
      const first = await folder.write('Ledger.txt', 'a\n', null);
      const second = await folder.write('Ledger.txt', 'b\n', first);
      await expect(folder.write('Ledger.txt', 'c\n', first).catch(kind)).resolves.toBe('conflict');
      await expect(folder.write('Ledger.txt', 'c\n', null).catch(kind)).resolves.toBe('conflict');
      expect((await folder.read('Ledger.txt'))?.text).toBe('b\n');
      expect(second).not.toBe(first);
    });

    it('lets only one of two writes from the same version through', async () => {
      const folder = await make();
      const v = await folder.write('Ledger.txt', 'a\n', null);
      const results = await Promise.allSettled([
        folder.write('Ledger.txt', 'b\n', v),
        folder.write('Ledger.txt', 'c\n', v),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('moves files into new folders, and refuses a taken or missing name', async () => {
      const folder = await make();
      await folder.write('A.txt', 'a\n', null);
      await folder.write('B.txt', 'b\n', null);
      await expect(folder.move('A.txt', 'B.txt').catch(kind)).resolves.toBe('exists');
      await folder.move('A.txt', '.iouinator/trash/A.txt');
      expect(await folder.list('')).toEqual(['B.txt']);
      expect(await folder.list('.iouinator/trash')).toEqual(['A.txt']);
      expect((await folder.read('.iouinator/trash/A.txt'))?.text).toBe('a\n');
      await expect(folder.move('A.txt', 'C.txt').catch(kind)).resolves.toBe('missing');
    });

    it('refuses paths that leave the folder', async () => {
      const folder = await make();
      await expect(folder.read('../x.txt').catch(kind)).resolves.toBe('name');
      await expect(folder.write('a/../../x.txt', '', null).catch(kind)).resolves.toBe('name');
    });

    it('keeps ledgers: new names, rename, trash and restore (PRD §8.2)', async () => {
      const ledgers = new LedgerLibrary(await make());
      expect((await ledgers.create()).name).toBe('Ledger');
      expect((await ledgers.create()).name).toBe('Ledger 2');
      await ledgers.rename('Ledger 2', 'Groceries');
      await expect(ledgers.rename('Groceries', 'ledger').catch(kind)).resolves.toBe('exists');
      await expect(ledgers.rename('Groceries', 'a/b').catch(kind)).resolves.toBe('name');
      await ledgers.rename('Groceries', 'groceries');
      expect(await ledgers.names()).toEqual(['groceries', 'Ledger']);
      expect(await ledgers.trash('Ledger')).toBe('Ledger');
      await ledgers.create();
      expect(await ledgers.trash('Ledger')).toBe('Ledger 2');
      expect(await ledgers.trashed()).toEqual(['Ledger', 'Ledger 2']);
      await ledgers.create();
      expect(await ledgers.restore('Ledger')).toBe('Ledger 2');
      expect(await ledgers.names()).toEqual(['groceries', 'Ledger', 'Ledger 2']);
    });
  });
}
