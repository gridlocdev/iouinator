/** Draws Mermaid text as SVG (PRD §5). Mermaid is bundled, and loaded only when the first drawing is asked for. */
import { nodeId } from '@iouinator/core';
import type MermaidModule from 'mermaid';

type Mermaid = typeof MermaidModule;

let loading: Promise<Mermaid> | null = null;
let drawn = 0;

function load(): Promise<Mermaid> {
  loading ??= import('mermaid').then((m) => m.default);
  return loading;
}

/** The id Mermaid gives the arrow from one person to another: the first edge between two nodes. */
export function edgeKey(from: string, to: string): string {
  return `L_${nodeId(from)}_${nodeId(to)}_0`;
}

/** The colours of the drawing, matched to the app's own (PRD §5). */
const COLOURS = {
  light: { fill: '#e3f4ea', border: '#1f8f4e', text: '#1d1d1f', line: '#8e8f97', label: '#ffffff' },
  dark: { fill: '#1f3a2a', border: '#3cc27a', text: '#ececee', line: '#7c7c85', label: '#2c2c2f' },
};

/**
 * What a part of the drawing stands for: an arrow's `edgeKey`, or a person's `nodeId`. Arrows and their labels
 * carry it in `data-id`; a person's box has it inside its element id (`…-flowchart-n_p1-0`).
 */
export function diagramKey(el: Element): string | null {
  const data = el.getAttribute('data-id');
  if (data) return data;
  if (!el.classList.contains('node')) return null;
  return /-flowchart-(.+)-\d+$/.exec(el.id)?.[1] ?? null;
}

/** The parts of the drawing `diagramKey` can name. */
export const DIAGRAM_PARTS = '[data-id], g.node';

/** The SVG for `text`, in the light or dark Mermaid theme. */
export async function drawDiagram(text: string, dark: boolean): Promise<string> {
  const mermaid = await load();
  const c = COLOURS[dark ? 'dark' : 'light'];
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      darkMode: dark,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      fontSize: '13px',
      primaryColor: c.fill,
      primaryBorderColor: c.border,
      primaryTextColor: c.text,
      lineColor: c.line,
      edgeLabelBackground: c.label,
    },
    flowchart: { htmlLabels: false, curve: 'basis' },
  });
  const { svg } = await mermaid.render(`iou-diagram-${++drawn}`, text);
  return svg;
}
