/** Dollar amounts as whole cents (PRD §4.2): read from what the user typed, and shown as `$1,250.00`. */

/** The largest amount: $1,000,000,000.00. */
export const MAX_CENTS = 100_000_000_000;

export type AmountRead = { readonly cents: number } | { readonly error: string };

const AMOUNT = /^\$?((?:\d{1,3}(?:,\d{3})+)|\d+)?(?:\.(\d{0,2}))?$/;

/** Reads `12`, `12.5`, `$12.50` or `1,250.00` as cents, or says what's wrong with it. */
export function parseAmount(text: string): AmountRead {
  const clean = text.trim().replace(/^\$\s*/, '$');
  if (clean.startsWith('-') || clean.startsWith('$-')) return { error: 'The amount must be more than $0.' };
  const match = AMOUNT.exec(clean);
  const whole = match?.[1];
  const fraction = match?.[2];
  if (!match || (whole === undefined && !fraction)) return { error: 'Enter an amount like 12.50.' };
  const dollars = (whole ?? '0').replaceAll(',', '');
  // Compare as text first, so a huge number never loses digits on its way to a JS number.
  if (dollars.replace(/^0+/, '').length > 10) return { error: 'The amount can be up to $1,000,000,000.' };
  const cents = Number(dollars) * 100 + Number((fraction ?? '').padEnd(2, '0'));
  if (cents <= 0) return { error: 'The amount must be more than $0.' };
  if (cents > MAX_CENTS) return { error: 'The amount can be up to $1,000,000,000.' };
  return { cents };
}

/** True when `cents` is an amount a transaction can have. */
export function validCents(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CENTS;
}

/** `$1,250.00`; a negative amount is `−$4.00` (a minus sign, not a hyphen). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** The text an amount field starts with when editing: `1250.00`, ungrouped, no sign. */
export function amountText(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
