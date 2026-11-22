import { describe, expect, it } from 'vitest';
import { MemoryFolder, LedgerLibrary, checkLedgerName, copyName, freeName } from '../src/index.ts';

describe('ledger names (PRD §8.2)', () => {
  it('takes a name with or without .iou.json, and refuses ones a file system can’t hold', () => {
    expect(checkLedgerName('  Groceries.iou.json ')).toEqual({ name: 'Groceries' });
    for (const bad of ['', '.hidden', 'a/b', 'a:b', 'tab\there', 'x'.repeat(201)])
      expect(checkLedgerName(bad)).toHaveProperty('error');
  });

  it('finds a free name, ignoring case', () => {
    expect(freeName('Ledger', [])).toBe('Ledger');
    expect(freeName('Ledger', ['ledger', 'Ledger 2'])).toBe('Ledger 3');
  });

  it('names a copy after the time it was made', () => {
    expect(copyName('Rent', new Date(2026, 0, 2, 3, 4, 5))).toBe('Rent copy 2026-01-02-030405');
  });

  it('names a new ledger Ledger, then Ledger 2', async () => {
    const ledgers = new LedgerLibrary(new MemoryFolder('m', {}));
    expect((await ledgers.create()).name).toBe('Ledger');
    expect((await ledgers.create()).name).toBe('Ledger 2');
  });

  it('lists only .iou.json files, not the trash', async () => {
    const ledgers = new LedgerLibrary(
      new MemoryFolder('m', {
        'b.iou.json': '',
        'A.iou.json': '',
        'notes.json': '',
        '.iouinator/trash/c.iou.json': '',
      }),
    );
    expect(await ledgers.names()).toEqual(['A', 'b']);
    expect(await ledgers.trashed()).toEqual(['c']);
  });
});
