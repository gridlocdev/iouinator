import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  RELEASES_PAGE,
  checkForUpdate,
  fetchLatestRelease,
  isNewer,
  loadLastCheck,
  parseRelease,
  parseVersion,
} from '../src/index.ts';

const dirs: string[] = [];
const prefsFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'iouinator-updates-'));
  dirs.push(dir);
  return path.join(dir, 'updates.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('versions', () => {
  it('reads plain versions with or without a v, and nothing else', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
    expect(parseVersion('1.2.3-beta.1')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });

  it('compares each part as a number', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '0.10.0')).toBe(false);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
  });
});

describe('parseRelease', () => {
  it('takes the tag and keeps the link only on the releases page', () => {
    expect(parseRelease({ tag_name: 'v1.1.0', html_url: `${RELEASES_PAGE}/tag/v1.1.0` })).toEqual({
      version: '1.1.0',
      url: `${RELEASES_PAGE}/tag/v1.1.0`,
    });
    expect(parseRelease({ tag_name: 'v1.1.0', html_url: 'https://example.com/evil' })?.url).toBe(
      RELEASES_PAGE,
    );
  });

  it('skips drafts, pre-releases and odd answers', () => {
    expect(parseRelease({ tag_name: 'v2.0.0', draft: true })).toBeNull();
    expect(parseRelease({ tag_name: 'v2.0.0', prerelease: true })).toBeNull();
    expect(parseRelease({ tag_name: 'latest' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  it('throws on an error answer', async () => {
    const fetcher = (() => Promise.resolve(new Response('', { status: 404 }))) as typeof fetch;
    await expect(fetchLatestRelease(fetcher)).rejects.toThrow('GitHub answered 404');
  });
});

describe('checkForUpdate', () => {
  const release = { version: '0.2.0', url: `${RELEASES_PAGE}/tag/v0.2.0` };

  it('reports a newer release and remembers when it asked', async () => {
    const file = prefsFile();
    const now = 1_800_000_000_000;
    await expect(
      checkForUpdate({ file, current: '0.1.0', now, latest: () => Promise.resolve(release) }),
    ).resolves.toEqual(release);
    expect(await loadLastCheck(file)).toBe(now);
  });

  it('asks at most once a day, even when the last check failed', async () => {
    const file = prefsFile();
    const now = 1_800_000_000_000;
    let asked = 0;
    const failing = () => {
      asked++;
      return Promise.reject(new Error('offline'));
    };
    await expect(checkForUpdate({ file, current: '0.1.0', now, latest: failing })).rejects.toThrow('offline');
    await expect(
      checkForUpdate({ file, current: '0.1.0', now: now + 1000, latest: failing }),
    ).resolves.toBeNull();
    expect(asked).toBe(1);
    await checkForUpdate({ file, current: '0.1.0', now: now + CHECK_INTERVAL_MS, latest: failing }).catch(
      () => undefined,
    );
    expect(asked).toBe(2);
  });

  it('says nothing about the same or an older version', async () => {
    const latest = () => Promise.resolve(release);
    await expect(checkForUpdate({ file: prefsFile(), current: '0.2.0', now: 1, latest })).resolves.toBeNull();
  });

  it('asks again when the clock went back past the last check', async () => {
    const file = prefsFile();
    writeFileSync(file, JSON.stringify({ lastCheck: 2_000_000_000_000 }));
    const latest = () => Promise.resolve(release);
    await expect(checkForUpdate({ file, current: '0.1.0', now: 1_800_000_000_000, latest })).resolves.toEqual(
      release,
    );
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ lastCheck: 1_800_000_000_000 });
  });

  it('treats a damaged file as never checked', async () => {
    const file = prefsFile();
    writeFileSync(file, '{oops');
    expect(await loadLastCheck(file)).toBe(0);
  });
});
