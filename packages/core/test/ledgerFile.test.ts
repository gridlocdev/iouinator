import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER,
  classifyFile,
  mermaidText,
  rawDebts,
  writeLedgerText,
  type Ledger,
} from '@iouinator/core';

const LEDGER: Ledger = {
  people: [
    { id: 'p1', name: 'Sam' },
    { id: 'p2', name: 'Alex "Al" <3>' },
  ],
  transactions: [{ id: 't1', from: 'p1', to: 'p2', cents: 1050, description: 'Pizza #1' }],
};

describe('ledger file (PRD §8.1)', () => {
  it('writes a stable, byte-identical round trip', () => {
    const text = writeLedgerText(LEDGER);
    expect(text.endsWith('}\n')).toBe(true);
    const read = classifyFile(text);
    expect(read).toEqual({ kind: 'ok', ledger: LEDGER });
    if (read.kind === 'ok') expect(writeLedgerText(read.ledger)).toBe(text);
  });

  it('reads a byte-order mark and an empty file', () => {
    expect(classifyFile(`\uFEFF${writeLedgerText(LEDGER)}`)).toEqual({ kind: 'ok', ledger: LEDGER });
    expect(classifyFile('')).toEqual({ kind: 'ok', ledger: EMPTY_LEDGER });
  });

  it('refuses a newer version', () => {
    expect(classifyFile('{"format":"iouinator","version":2}')).toEqual({ kind: 'newer', version: 2 });
  });

  it.each([
    ['not json', '{'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['another format', '{"format":"x","version":1,"people":[],"transactions":[]}'],
    ['no lists', '{"format":"iouinator","version":1}'],
    [
      'a missing person',
      '{"format":"iouinator","version":1,"people":[],"transactions":[{"id":"t1","from":"a","to":"b","cents":1,"description":"x"}]}',
    ],
    [
      'a fractional amount',
      '{"format":"iouinator","version":1,"people":[{"id":"a","name":"A"},{"id":"b","name":"B"}],"transactions":[{"id":"t1","from":"a","to":"b","cents":1.5,"description":"x"}]}',
    ],
    [
      'duplicate names',
      '{"format":"iouinator","version":1,"people":[{"id":"a","name":"A"},{"id":"b","name":"a"}],"transactions":[]}',
    ],
  ])('calls %s damaged', (_, text) => {
    expect(classifyFile(text).kind).toBe('corrupt');
  });
});

describe('mermaid text (PRD §5)', () => {
  it('escapes labels and draws every person and debt', () => {
    expect(mermaidText(LEDGER, rawDebts(LEDGER))).toBe(
      [
        'flowchart LR',
        '  n_p1["Sam"]',
        '  n_p2["Alex #34;Al#34; #60;3#62;"]',
        '  n_p1 -->|"$10.50"| n_p2',
        '',
      ].join('\n'),
    );
  });
});
