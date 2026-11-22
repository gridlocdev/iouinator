/** What the desktop app's preload script puts on `window.iouinatorNative` (PRD §12). */
import type { NativeMenuItem, NativeReply } from '@iouinator/ui';

/** A newer published release: its version and its page. */
export interface Release {
  readonly version: string;
  readonly url: string;
}

export interface IOUinatorNative {
  readonly version: string;
  /** `unified` on macOS: no title bar, the traffic lights sit in the page's top row. */
  readonly chrome: string;
  /** The window went in or out of full screen. */
  onFullScreen(fn: (full: boolean) => void): void;
  /** Replaces the menu bar. */
  setMenu(items: readonly NativeMenuItem[]): void;
  /** A menu bar item was chosen. */
  onCommand(fn: (id: string) => void): void;
  /** The remembered ledger folder, whether it is there, and the default one (PRD §8.2). */
  folderInfo(): Promise<{ folder: string | null; missing: boolean; defaultFolder: string }>;
  /** Makes Documents/IOUinator the ledger folder, creating it. */
  useDefaultFolder(): Promise<string>;
  /** Asks the user for a ledger folder; null when they cancel. */
  chooseFolder(): Promise<string | null>;
  /** One call in the ledger folder: `list`, `read`, `write` or `move`. */
  folder(op: string, args: readonly unknown[]): Promise<NativeReply>;
  /** Asks where to save a copy of the ledger and writes it; false when the user cancels. */
  exportLedger(name: string, text: string): Promise<boolean>;
  /** A newer release than this one, checked at most once a day (PRD §12); null when there is none. */
  latestRelease(): Promise<Release | null>;
}

export function nativeBridge(): IOUinatorNative | null {
  return (globalThis as { iouinatorNative?: IOUinatorNative }).iouinatorNative ?? null;
}
