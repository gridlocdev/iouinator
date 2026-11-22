/** The diagram's Mermaid text (PRD §5): a left-to-right flowchart, one node per person, one arrow per debt. */
import type { Debt } from './debts.ts';
import type { Ledger } from './ledger.ts';
import { formatCents } from './money.ts';

/**
 * Text that is safe inside a Mermaid quoted label. Mermaid reads `#name;` as an entity, so `#` itself is written
 * `#35;`, and quotes and angle brackets as their codes.
 */
export function mermaidLabel(text: string): string {
  return text.replace(/[#"<>&]/g, (c) => `#${c.charCodeAt(0)};`);
}

/** The node id for a person: `n_` and their id, which is letters and digits only in files IOUinator wrote. */
export function nodeId(personId: string): string {
  return `n_${personId.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0)}_`)}`;
}

/** The Mermaid flowchart for `debts` among the ledger's people. Arrows come in the order of `debts`. */
export function mermaidText(ledger: Ledger, debts: readonly Debt[]): string {
  const lines = ['flowchart LR'];
  for (const p of ledger.people) lines.push(`  ${nodeId(p.id)}["${mermaidLabel(p.name)}"]`);
  for (const d of debts)
    lines.push(`  ${nodeId(d.from)} -->|"${mermaidLabel(formatCents(d.cents))}"| ${nodeId(d.to)}`);
  return `${lines.join('\n')}\n`;
}
