import { describe, expect, it } from 'vitest';
import { storageKeep } from '../src/index.ts';

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('what the browser keeps per folder (PRD §8.2, §8.3)', () => {
  it('remembers the open ledger for each folder', () => {
    const keep = storageKeep(memory());
    expect(keep.lastLedger('a')).toBeNull();
    keep.setLastLedger('a', 'Rent');
    keep.setLastLedger('b', 'Ledger');
    expect(keep.lastLedger('a')).toBe('Rent');
  });

  it('keeps, reads and drops snapshots, and ignores damaged ones', () => {
    const storage = memory();
    const keep = storageKeep(storage);
    keep.putSnapshot('a', 'Rent', { text: '1\n', base: 'v1', at: 5 });
    expect(keep.snapshot('a', 'Rent')).toEqual({ text: '1\n', base: 'v1', at: 5 });
    expect(keep.snapshot('b', 'Rent')).toBeNull();
    keep.dropSnapshot('a', 'Rent');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
    storage.map.set('iouinator.snapshot.a/Rent', '{');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
    storage.map.set('iouinator.snapshot.a/Rent', '{"text":1}');
    expect(keep.snapshot('a', 'Rent')).toBeNull();
  });
});
