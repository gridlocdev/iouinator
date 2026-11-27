import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The theme blocks of the stylesheet: light, dark by the system, dark by the setting. */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const blocks = {
  light: css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')),
  'dark (system)': css.slice(
    css.indexOf(":root:not([data-theme='light'])"),
    css.indexOf(":root[data-theme='dark']"),
  ),
  'dark (setting)': css.slice(
    css.indexOf(":root[data-theme='dark']"),
    css.indexOf('@media (prefers-reduced-motion'),
  ),
};

function token(block: string, name: string): string {
  const hex = new RegExp(`--iou-${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(block)?.[1];
  if (!hex) throw new Error(`--iou-${name} is not a #rrggbb colour here`);
  return hex;
}

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('text on the accent (the chosen row, primary buttons) is readable in every theme', () => {
  for (const [theme, block] of Object.entries(blocks)) {
    it(theme, () => {
      expect(contrast(token(block, 'accent-text'), token(block, 'accent'))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
