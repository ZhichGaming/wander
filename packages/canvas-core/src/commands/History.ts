/**
 * Wander — Zhich, Yu, Justin
 * Undo and redo stacks. Executes commands against one document, and can
 * record a run of commands into a single group (beginGroup / endGroup) so an
 * AI response or a multi-step gesture undoes in one step.
 */

import { Emitter } from '../Emitter';
import type { CanvasDocument } from '../model/CanvasDocument';
import { Command, CommandGroup } from './Command';

/** Snapshot of what undo and redo would do, for UI buttons. */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

/** Undo/redo manager for one document. */
export class History {
  /** Fires after execute, undo, redo or clear. */
  readonly changed = new Emitter<HistoryState>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private groups: CommandGroup[] = [];

  /** Creates a history for `doc` keeping at most `limit` undo steps. */
  constructor(
    private readonly doc: CanvasDocument,
    private readonly limit = 500,
  ) {}

  /** Applies `cmd` and records it (into the open group, if any). */
  execute(cmd: Command): void {
    cmd.do(this.doc);
    const open = this.groups[this.groups.length - 1];
    if (open) {
      open.add(cmd);
      return;
    }
    this.push(cmd);
  }

  /** Starts recording subsequent commands into one undo step. Nestable. */
  beginGroup(label: string): void {
    this.groups.push(new CommandGroup(label));
  }

  /** Closes the innermost group. Empty groups are dropped. */
  endGroup(): void {
    const group = this.groups.pop();
    if (!group) throw new Error('endGroup without beginGroup');
    if (group.children.length === 0) return;
    const parent = this.groups[this.groups.length - 1];
    if (parent) parent.add(group);
    else this.push(group);
  }

  /** Runs `fn` with every command it executes grouped into one undo step. */
  group<T>(label: string, fn: () => T): T {
    this.beginGroup(label);
    try {
      return fn();
    } finally {
      this.endGroup();
    }
  }

  /** Reverts the last step. Returns false when there is nothing to undo. */
  undo(): boolean {
    if (this.groups.length) throw new Error('Cannot undo while a group is open');
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo(this.doc);
    this.redoStack.push(cmd);
    this.notify();
    return true;
  }

  /** Re-applies the last undone step. Returns false when there is nothing to redo. */
  redo(): boolean {
    if (this.groups.length) throw new Error('Cannot redo while a group is open');
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.do(this.doc);
    this.undoStack.push(cmd);
    this.notify();
    return true;
  }

  /** Forgets all steps (for example after loading a document). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.groups = [];
    this.notify();
  }

  /** Current undo/redo availability. */
  get state(): HistoryState {
    const u = this.undoStack[this.undoStack.length - 1];
    const r = this.redoStack[this.redoStack.length - 1];
    return { canUndo: !!u, canRedo: !!r, undoLabel: u?.label, redoLabel: r?.label };
  }

  /** Pushes a finished step, clears redo and trims to the limit. */
  private push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  /** Emits the current state. */
  private notify(): void {
    this.changed.emit(this.state);
  }
}
