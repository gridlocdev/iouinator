/**
 * The update check (PRD §12): on start, at most once a day, ask GitHub for the newest release and tell the page
 * when it is newer than this version. It only reads; nothing is downloaded or installed. No Electron imports,
 * so tests run it.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where releases are published. */
export const RELEASES_API = 'https://api.github.com/repos/gridlocdev/iouinator/releases/latest';
export const RELEASES_PAGE = 'https://github.com/gridlocdev/iouinator/releases';
/** The check runs at most this often. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A published release: its version without the `v`, and its page. */
export interface Release {
  readonly version: string;
  readonly url: string;
}

/** `v1.2.3` or `1.2.3` → [1, 2, 3]; null for anything else, pre-releases included. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a newer version than `current`; false when either can't be read. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** The release in GitHub's `releases/latest` answer. Its link must be on this app's releases page. */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== 'object') return null;
  const { tag_name: tag, html_url: url, draft, prerelease } = json as Record<string, unknown>;
  if (typeof tag !== 'string' || !parseVersion(tag) || draft === true || prerelease === true) return null;
  const page = typeof url === 'string' && url.startsWith(`${RELEASES_PAGE}/`) ? url : RELEASES_PAGE;
  return { version: tag.trim().replace(/^v/, ''), url: page };
}

/** When the last check ran (ms since the epoch); 0 when never, or when the file is damaged. */
export async function loadLastCheck(file: string): Promise<number> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return 0;
    throw e;
  }
  const at = (raw as { lastCheck?: unknown } | null)?.lastCheck;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
}

export async function saveLastCheck(file: string, at: number): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temp, `${JSON.stringify({ lastCheck: at })}\n`, 'utf8');
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

/** Asks GitHub for the newest release. Throws when it can't be reached or answers oddly. */
export async function fetchLatestRelease(fetcher: typeof fetch): Promise<Release> {
  const res = await fetcher(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'IOUinator' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = parseRelease(await res.json());
  if (!release) throw new Error('No release found');
  return release;
}

/**
 * The start-up check: a newer release, or null when there is none, the last check was less than a day ago, or
 * GitHub can't be reached. The time is saved before asking, so a failing network doesn't ask on every start.
 */
export async function checkForUpdate(options: {
  readonly file: string;
  readonly current: string;
  readonly now: number;
  readonly latest: () => Promise<Release>;
}): Promise<Release | null> {
  const last = await loadLastCheck(options.file);
  if (options.now - last < CHECK_INTERVAL_MS && last <= options.now) return null;
  await saveLastCheck(options.file, options.now);
  const release = await options.latest();
  return isNewer(release.version, options.current) ? release : null;
}
