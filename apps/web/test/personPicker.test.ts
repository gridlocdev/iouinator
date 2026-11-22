import { describe, expect, it } from 'vitest';
import { nextByLetter } from '../src/index.ts';

describe('nextByLetter', () => {
  const people = ['Sam', 'alex', 'Sue', 'Jo'].map((name, i) => ({ id: `p${i + 1}`, name }));

  it('finds the next name with that letter after the one given, ignoring case and wrapping round', () => {
    expect(nextByLetter(people, 's', 0)).toBe(2);
    expect(nextByLetter(people, 'S', 2)).toBe(0);
    expect(nextByLetter(people, 'A', 3)).toBe(1);
  });

  it('stays on the only match and gives -1 when nobody matches', () => {
    expect(nextByLetter(people, 'j', 3)).toBe(3);
    expect(nextByLetter(people, 'z', 0)).toBe(-1);
  });
});
