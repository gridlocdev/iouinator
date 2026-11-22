/** The status bar's notices, and what the screen reader's live region says (PRD §14). */
import { signal } from '@preact/signals';
import { after } from '@iouinator/ui';

export interface Notice {
  readonly text: string;
  readonly tone: 'info' | 'error';
  readonly action?: { readonly label: string; readonly run: () => void };
}

/** How long a notice stays; one with an action stays longer, so there is time to use it. */
export const NOTICE_MS = 4_000;
export const NOTICE_ACTION_MS = 10_000;

export class Notices {
  readonly notice = signal<Notice | null>(null);
  readonly announcement = signal('');
  #timer: (() => void) | null = null;

  /** Shows `text` in the status bar for a while, and says it. */
  say(text: string, options: { tone?: Notice['tone']; action?: Notice['action'] } = {}): void {
    this.#timer?.();
    this.notice.value = {
      text,
      tone: options.tone ?? 'info',
      ...(options.action ? { action: options.action } : {}),
    };
    this.announce(text);
    this.#timer = after(options.action ? NOTICE_ACTION_MS : NOTICE_MS, () => this.dismiss());
  }

  /**
   * Says `text` through the live region. The same text twice in a row gets a trailing no-break space, so the
   * region changes and screen readers read it again (PRD §14).
   */
  announce(text: string): void {
    this.announcement.value = this.announcement.value === text ? `${text}\u00a0` : text;
  }

  dismiss(): void {
    this.#timer?.();
    this.#timer = null;
    this.notice.value = null;
  }
}
