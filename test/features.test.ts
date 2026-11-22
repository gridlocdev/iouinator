// The feature map: docs/features.md lists every feature the way a user names it, and each one has scenarios.
// Each "## " heading in docs/features.md is a feature; a scenario file covers it with test.describe('<the heading>', …).
// It checks the repo's docs and e2e folder, not one package, so it sits in test/ beside the architecture test.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../', import.meta.url);
const doc = readFileSync(new URL('docs/features.md', ROOT), 'utf8');
const features = [...doc.matchAll(/^## (.+)$/gm)].map((match) => (match[1] ?? '').trim());

const specs = readdirSync(new URL('e2e/', ROOT))
  .filter((file) => file.endsWith('.spec.ts'))
  .map((file) => readFileSync(new URL(`e2e/${file}`, ROOT), 'utf8'))
  .join('\n');
const groups = [...specs.matchAll(/test\.describe\(\s*(['"`])(.+?)\1/g)];
const described = groups.map((match) => match[2] ?? '');

/** The text of each scenario group, up to the next group, so an empty group shows. */
const groupBodies = groups.map((match, i) => ({
  name: match[2] ?? '',
  body: specs.slice(match.index, groups[i + 1]?.index ?? specs.length),
}));

/** Sections that aren't checked by a scenario, each with the reason (only by hand, not a feature). Keep it short. */
const NOT_SCENARIOS = new Map<string, string>([
  // ['Desktop, browser and NAS', 'platform overview, not one feature'],
]);

describe('docs/features.md', () => {
  it('has a scenario for every feature', () => {
    const missing = features.filter((feature) => !NOT_SCENARIOS.has(feature) && !described.includes(feature));
    expect(missing).toEqual([]);
  });

  it('names a real feature in every scenario group', () => {
    const unknown = described.filter((name) => !features.includes(name));
    expect(unknown).toEqual([]);
  });

  it('runs every scenario: none skipped, marked to fix later, or run alone', () => {
    expect([...specs.matchAll(/\btest(?:\.describe)?\.(?:skip|fixme|only)\b/g)].map((m) => m[0])).toEqual([]);
  });

  it('has at least one scenario in every group', () => {
    const empty = groupBodies.filter((g) => !/\btest\(/.test(g.body)).map((g) => g.name);
    expect(empty).toEqual([]);
  });

  it('lists no exemption for a feature that is gone', () => {
    expect([...NOT_SCENARIOS.keys()].filter((feature) => !features.includes(feature))).toEqual([]);
  });
});
