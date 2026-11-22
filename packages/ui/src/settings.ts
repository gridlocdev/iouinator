/**
 * Per-device settings (PRD §11): kept in this browser profile or this desktop app, never with the ledgers. A
 * missing or wrong field takes its default, so one bad value never throws the rest away.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** The diagram's view (PRD §5, §6). */
export const VIEWS = ['raw', 'flat'] as const;
export type View = (typeof VIEWS)[number];

export interface Settings {
  readonly theme: Theme;
  readonly view: View;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', view: 'raw' };

export function parseSettings(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const oneOf = <T>(items: readonly T[], value: unknown, fallback: T): T =>
    items.includes(value as T) ? (value as T) : fallback;
  return { theme: oneOf(THEMES, o.theme, d.theme), view: oneOf(VIEWS, o.view, d.view) };
}

/** Where settings are kept. */
export interface SettingsStorage {
  load(): Settings;
  save(settings: Settings): void;
  /** Calls `fn` when another window changes the settings; returns a function that stops watching. */
  watch?(fn: (settings: Settings) => void): () => void;
}

const KEY = 'iouinator.settings';

/** The settings another window saved, from a `storage` event; null when the event is about something else. */
export function settingsFromEvent(e: {
  readonly key: string | null;
  readonly newValue: string | null;
}): Settings | null {
  if (e.key !== KEY && e.key !== null) return null;
  if (e.newValue === null) return DEFAULT_SETTINGS;
  try {
    return parseSettings(JSON.parse(e.newValue));
  } catch {
    return null;
  }
}

/**
 * Settings in `localStorage`, shared by every window of this browser profile. A browser that refuses storage (private windows, blocked site data) still runs:
 * settings then last until the window closes.
 */
export function localSettings(): SettingsStorage {
  return {
    load() {
      try {
        const text = localStorage.getItem(KEY);
        return text === null ? DEFAULT_SETTINGS : parseSettings(JSON.parse(text));
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    save(settings) {
      try {
        localStorage.setItem(KEY, JSON.stringify(settings));
      } catch (e) {
        console.warn('Settings were not kept:', e);
      }
    },
    watch(fn) {
      const listen = (e: StorageEvent) => {
        const settings = settingsFromEvent(e);
        if (settings) fn(settings);
      };
      addEventListener('storage', listen);
      return () => removeEventListener('storage', listen);
    },
  };
}

/** Settings that last only while the page is open; for tests and scenarios. */
export function memorySettings(
  initial: Partial<Settings> = {},
): SettingsStorage & { change(settings: Partial<Settings>): void } {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const watchers = new Set<(settings: Settings) => void>();
  return {
    load: () => current,
    save(settings) {
      current = settings;
    },
    watch(fn) {
      watchers.add(fn);
      return () => {
        watchers.delete(fn);
      };
    },
    /** Another window's change. */
    change(settings) {
      current = { ...current, ...settings };
      for (const fn of watchers) fn(current);
    },
  };
}
