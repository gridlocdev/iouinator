import { describe, expect, it, vi } from 'vitest';
import {
  CommandCatalog,
  captureKeys,
  formatShortcut,
  listenForKeys,
  shortcutOfEvent,
  type CommandSpec,
  type ShortcutEvent,
} from '../src/index.ts';

const key = (e: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...e,
});

/** A key event Node can dispatch: Node has `Event` but no `KeyboardEvent`. */
function press(target: EventTarget, e: Partial<ShortcutEvent>, type = 'keydown'): Event {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(key(e))) Object.defineProperty(event, name, { value });
  target.dispatchEvent(event);
  return event;
}

/** A window with no focused element, which is all `listenForKeys` reads. */
const fakeWindow = () => Object.assign(new EventTarget(), { document: { activeElement: null } });

function catalog(enabled = () => true) {
  const ran: string[] = [];
  const spec = (id: string, shortcuts: string[], more: Partial<CommandSpec> = {}): CommandSpec => ({
    id,
    title: id,
    description: id,
    group: 'Edit',
    shortcuts,
    run: () => void ran.push(id),
    ...more,
  });
  const c = new CommandCatalog([
    spec('new', ['n']),
    spec('new-off', ['n'], { enabled: () => false }),
    spec('undo', ['mod+z'], { enabled }),
    spec('inbox', ['g i']),
    spec('clear', ['esc']),
  ]);
  return { c, ran };
}

describe('what a key runs (the Keyboard Shortcuts window)', () => {
  it('finds the command, preferring an enabled one, and runs nothing', () => {
    const { c, ran } = catalog();
    expect(c.meaningOf(key({ key: 'n' }), true).command?.id).toBe('new');
    expect(c.meaningOf(key({ key: 'z', metaKey: true }), true).command?.id).toBe('undo');
    expect(c.meaningOf(key({ key: 'z', ctrlKey: true }), true).command).toBe(null);
    expect(ran).toEqual([]);
  });

  it('reports a command that is off, and the sequences a key starts', () => {
    const { c } = catalog(() => false);
    expect(c.meaningOf(key({ key: 'z', metaKey: true }), true).command?.id).toBe('undo');
    const g = c.meaningOf(key({ key: 'g' }), true);
    expect(g.command).toBe(null);
    expect(g.starts.map((s) => s.id)).toEqual(['inbox']);
  });

  it('writes the pressed keys the way the catalog does, and skips a modifier alone', () => {
    const label = (e: Partial<ShortcutEvent>, mac: boolean) => {
      const s = shortcutOfEvent(key(e), mac);
      return s && formatShortcut(s, mac);
    };
    expect(label({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }, true)).toBe('⇧⌘Z');
    expect(label({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }, false)).toBe('Ctrl+Shift+Z');
    expect(label({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }, true)).toBe('⇧⌘]');
    expect(label({ key: 'ArrowDown' }, true)).toBe('↓');
    expect(label({ key: 'Shift', shiftKey: true }, true)).toBe(null);
    expect(label({ key: 'Meta', metaKey: true }, true)).toBe(null);
  });
});

describe('capturing keys ("press a shortcut")', () => {
  it('takes keys before the app, and gives them back when it stops', () => {
    const win = fakeWindow();
    const { c, ran } = catalog();
    const heard: string[] = [];
    // Registered first, as a capturing listener on the window runs before the app's in a browser.
    const stop = captureKeys(win, (e) => heard.push(e.key));
    listenForKeys(win as unknown as Window, c, () => false);
    expect(press(win, { key: 'n' }).defaultPrevented).toBe(true);
    expect(press(win, { key: 'n' }, 'keyup').defaultPrevented).toBe(true);
    expect(heard).toEqual(['n']);
    expect(ran).toEqual([]);
    stop();
    stop();
    press(win, { key: 'n' });
    expect(ran).toEqual(['new']);
  });

  it('never takes Escape: it ends the capture and still reaches the app', () => {
    const win = fakeWindow();
    const { c, ran } = catalog();
    const onEnd = vi.fn();
    captureKeys(win, () => {}, onEnd);
    listenForKeys(win as unknown as Window, c, () => false);
    const esc = press(win, { key: 'Escape' });
    expect(esc.defaultPrevented).toBe(true); // by the app's own Esc command, not the capture
    expect(ran).toEqual(['clear']);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(esc);
    press(win, { key: 'n' });
    expect(ran).toEqual(['clear', 'new']);
  });

  it('a handler that throws ends the capture, so keys reach the app again', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const win = fakeWindow();
    const { c, ran } = catalog();
    const onEnd = vi.fn();
    let calls = 0;
    captureKeys(
      win,
      () => {
        calls++;
        throw new Error('broken');
      },
      onEnd,
    );
    listenForKeys(win as unknown as Window, c, () => false);
    press(win, { key: 'n' });
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(null);
    expect(error).toHaveBeenCalled();
    expect(press(win, { key: 'n' }).defaultPrevented).toBe(true);
    expect(ran).toEqual(['new']);
    expect(calls).toBe(1);
    error.mockRestore();
  });
});
