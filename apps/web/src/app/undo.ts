/** Undo and redo of ledger changes (PRD §7): whole ledgers are kept, since a ledger never changes in place. */

/** The most steps kept; the oldest goes first. */
export const MAX_UNDO = 200;

export class UndoStack<T> {
  #undo: T[] = [];
  #redo: T[] = [];

  /** Records the state before a change; a new change ends what could be redone. */
  push(before: T): void {
    this.#undo.push(before);
    if (this.#undo.length > MAX_UNDO) this.#undo.shift();
    this.#redo = [];
  }

  /** The state to go back to from `current`, or null when there is none. */
  undo(current: T): T | null {
    const before = this.#undo.pop();
    if (before === undefined) return null;
    this.#redo.push(current);
    return before;
  }

  /** The state to go forward to from `current`, or null when there is none. */
  redo(current: T): T | null {
    const after = this.#redo.pop();
    if (after === undefined) return null;
    this.#undo.push(current);
    return after;
  }

  /** Forgets every step: another ledger was opened. */
  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }

  canUndo(): boolean {
    return this.#undo.length > 0;
  }

  canRedo(): boolean {
    return this.#redo.length > 0;
  }
}
