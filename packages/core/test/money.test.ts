import { describe, expect, it } from 'vitest';
import { amountText, formatCents, parseAmount } from '@iouinator/core';

describe('parseAmount (PRD §4.2)', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['$12.50', 1250],
    ['  $ 12.50 ', 1250],
    ['1,250.00', 125000],
    ['.5', 50],
    ['0.01', 1],
    ['12.', 1200],
    ['1000000000', 100_000_000_000],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseAmount(text)).toEqual({ cents });
  });

  it.each([
    ['', 'Enter an amount like 12.50.'],
    ['abc', 'Enter an amount like 12.50.'],
    ['1.234', 'Enter an amount like 12.50.'],
    ['1,25', 'Enter an amount like 12.50.'],
    ['.', 'Enter an amount like 12.50.'],
    ['0', 'The amount must be more than $0.'],
    ['-5', 'The amount must be more than $0.'],
    ['$-5', 'The amount must be more than $0.'],
    ['1000000000.01', 'The amount can be up to $1,000,000,000.'],
    ['99999999999999999999', 'The amount can be up to $1,000,000,000.'],
  ])('refuses %j', (text, error) => {
    expect(parseAmount(text)).toEqual({ error });
  });
});

describe('formatCents', () => {
  it('groups and keeps two decimals', () => {
    expect(formatCents(125000)).toBe('$1,250.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(-400)).toBe('−$4.00');
    expect(formatCents(100_000_000_000)).toBe('$1,000,000,000.00');
  });

  it('gives edit text that reads back the same', () => {
    for (const cents of [1, 99, 100, 1250, 123456789])
      expect(parseAmount(amountText(cents))).toEqual({ cents });
  });
});
