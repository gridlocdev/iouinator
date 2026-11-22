/** The Diagram pane (PRD §5, §6): the flatten summary, the Mermaid drawing and the Totals table. */
import { useRef } from 'preact/hooks';
import { formatCents, nodeId, type Debt } from '@iouinator/core';
import { useAsyncMarkup, useMediaQuery } from '@iouinator/ui';
import type { AppController } from './controller.ts';
import { DIAGRAM_PARTS, diagramKey, drawDiagram, edgeKey } from './mermaidDraw.ts';

export function DiagramPane({ app }: { readonly app: AppController }) {
  const people = app.ledger.value.people;
  return (
    <section class="iou-pane iou-diagram" aria-labelledby="iou-diagram-title">
      <h2 id="iou-diagram-title" class="iou-pane-title">
        Who owes whom
      </h2>
      {app.settings.value.view === 'flat' && people.length > 0 && <FlattenSummary app={app} />}
      {people.length === 0 ? (
        <p class="iou-empty">Add people to see who owes whom.</p>
      ) : (
        <>
          <Drawing app={app} />
          <Totals app={app} />
        </>
      )}
    </section>
  );
}

/** `3 debts → 1 · $30.00 less changing hands.`, or `Nothing to flatten.` (PRD §6). */
function FlattenSummary({ app }: { readonly app: AppController }) {
  const { before, after, cancelled } = app.summary.value;
  const debts = (n: number) => (n === 1 ? '1 debt' : `${n} debts`);
  const text =
    cancelled === 0 && before === after
      ? 'Nothing to flatten.'
      : `${debts(before)} → ${after} · ${formatCents(cancelled)} less changing hands.`;
  return <p class="iou-flatten-summary">{text}</p>;
}

/** The theme the page shows now, so the drawing matches it. */
function useDark(app: AppController): boolean {
  const system = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = app.settings.value.theme;
  return theme === 'dark' || (theme === 'system' && system);
}

/**
 * The Mermaid drawing. Mermaid loads the first time it is needed; each change draws again, and a drawing that
 * finishes after a newer one started is dropped. Arrows and people can be clicked to filter the list.
 */
function Drawing({ app }: { readonly app: AppController }) {
  const host = useRef<HTMLDivElement>(null);
  const text = app.mermaid.value;
  const dark = useDark(app);
  const debts = app.debts.value;
  const people = app.ledger.value.people;
  const failed = useAsyncMarkup(
    host,
    `${dark ? 'dark' : 'light'}\n${text}`,
    () => drawDiagram(text, dark),
    (el) => {
      const targets = new Set([
        ...debts.map((d) => edgeKey(d.from, d.to)),
        ...people.map((p) => nodeId(p.id)),
      ]);
      for (const part of el.querySelectorAll(DIAGRAM_PARTS))
        if (targets.has(diagramKey(part) ?? '')) part.classList.add('iou-clickable');
    },
  );
  const pick = (e: MouseEvent) => {
    const part = (e.target as Element).closest('.iou-clickable');
    const id = part ? diagramKey(part) : null;
    const debt = debts.find((d) => edgeKey(d.from, d.to) === id);
    if (debt) return app.showDebt(debt);
    const person = people.find((p) => nodeId(p.id) === id);
    if (person) app.showPerson(person.id);
  };
  return (
    <figure class="iou-figure">
      <div ref={host} class="iou-drawing" role="img" aria-label="Who owes whom" onClick={pick} />
      {failed && <p class="iou-field-error">Couldn’t draw the diagram.</p>}
    </figure>
  );
}

/** The Totals table: the same arrows as rows, each a button that filters the list (PRD §5, §14). */
function Totals({ app }: { readonly app: AppController }) {
  const debts = app.debts.value;
  const filter = app.filter.value;
  const flat = app.settings.value.view === 'flat';
  const shown = (d: Debt) =>
    filter?.kind === 'pair' &&
    ((filter.from === d.from && filter.to === d.to) ||
      (flat && filter.from === d.to && filter.to === d.from));
  if (debts.length === 0)
    return <p class="iou-empty">{flat ? 'Everyone is square.' : 'No one owes anyone yet.'}</p>;
  return (
    <table class="iou-totals">
      <caption>Totals</caption>
      <thead>
        <tr>
          <th scope="col">Who owes</th>
          <th scope="col">Whom</th>
          <th scope="col" class="iou-num">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {debts.map((d) => {
          const on = shown(d);
          return (
            <tr key={`${d.from}>${d.to}`} class={on ? 'iou-row-on' : undefined}>
              <td>
                <button
                  type="button"
                  class="iou-total"
                  aria-pressed={on}
                  aria-label={`${app.name(d.from)} owes ${app.name(d.to)} ${formatCents(d.cents)}: show transactions`}
                  onClick={() => (on ? app.clearFilter() : app.showDebt(d))}
                >
                  {app.name(d.from)}
                </button>
              </td>
              <td>{app.name(d.to)}</td>
              <td class="iou-num">{formatCents(d.cents)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
