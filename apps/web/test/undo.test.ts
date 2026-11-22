import { describe, expect, it } from 'vitest';
import { MAX_UNDO, UndoStack } from '../src/index.ts';

describe('undo stack (PRD §7.3)', () => {
  it('undoes and redoes in order, and a new change ends the redo', () => {
    const stack = new UndoStack<string>();
    expect(stack.undo('a')).toBeNull();
    stack.push('a');
    stack.push('b');
    expect(stack.undo('c')).toBe('b');
    expect(stack.undo('b')).toBe('a');
    expect(stack.canUndo()).toBe(false);
    expect(stack.redo('a')).toBe('b');
    expect(stack.redo('b')).toBe('c');
    expect(stack.redo('c')).toBeNull();
    stack.undo('c');
    stack.push('b');
    expect(stack.canRedo()).toBe(false);
  });

  it('keeps the newest steps', () => {
    const stack = new UndoStack<number>();
    for (let i = 0; i < MAX_UNDO + 5; i++) stack.push(i);
    let last = -1;
    for (let at: number | null = 0; at !== null; at = stack.undo(at)) last = at;
    expect(last).toBe(5);
  });
});
