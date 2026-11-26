import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  keyFocus,
  memorySettings,
  parseSettings,
  settingsFromEvent,
} from '../src/index.ts';

describe('settings', () => {
  it('keeps good fields and defaults bad ones one by one', () => {
    expect(parseSettings({ theme: 'dark', view: 'sideways' })).toEqual({ theme: 'dark', view: 'raw' });
    expect(parseSettings({ theme: 'blue', view: 'flat' })).toEqual({ theme: 'system', view: 'flat' });
  });

  it('reads anything that is not an object as the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('dark')).toEqual(DEFAULT_SETTINGS);
  });

  it('reads another window’s settings from a storage event, and nothing else', () => {
    const newValue = JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(settingsFromEvent({ key: 'iouinator.settings', newValue })?.theme).toBe('dark');
    expect(settingsFromEvent({ key: 'iouinator.lastLedger', newValue })).toBeNull();
    expect(settingsFromEvent({ key: 'iouinator.settings', newValue: '{oops' })).toBeNull();
    expect(settingsFromEvent({ key: null, newValue: null })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps settings in memory for tests', () => {
    const storage = memorySettings({ theme: 'light' });
    expect(storage.load().theme).toBe('light');
    storage.save({ ...storage.load(), view: 'flat' });
    expect(storage.load().view).toBe('flat');
  });
});

/** A stand-in element: `closest` matches when the selector names one of `matches`. */
function fakeElement(...matches: string[]): Element {
  const body = {} as Element;
  return {
    ownerDocument: { body },
    closest: (selector: string) => (matches.some((m) => selector.includes(m)) ? ({} as Element) : null),
  } as unknown as Element;
}

describe('keyFocus', () => {
  it('tells text fields and buttons from the rest of the page', () => {
    expect(keyFocus(fakeElement('input'))).toBe('text');
    expect(keyFocus(fakeElement('button'))).toBe('control');
    expect(keyFocus(fakeElement())).toBe('list');
    expect(keyFocus(null)).toBe('list');
    // A focused list row takes the list's keys (Enter edits it), not a button's.
    expect(keyFocus(fakeElement('[role=option]'))).toBe('list');
  });
});
