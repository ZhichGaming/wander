/**
 * Wander — Zhich, Yu, Justin
 * Command pattern for undo and redo. Each edit is a Command subclass that
 * knows how to apply and revert itself on a document. A CommandGroup bundles
 * several commands so they undo in one step (for example one AI response).
 */

import type { CanvasDocument } from '../model/CanvasDocument';

/** One undoable edit. */
export abstract class Command {
  /** Short human-readable name, e.g. "Draw stroke". */
  abstract readonly label: string;

  /** Applies the edit. Called again on redo, so it must be repeatable after undo. */
  abstract do(doc: CanvasDocument): void;

  /** Reverts exactly what the last `do` changed. */
  abstract undo(doc: CanvasDocument): void;
}

/** Several commands applied in order and undone in reverse as one step. */
export class CommandGroup extends Command {
  readonly label: string;
  readonly children: Command[];

  /** Creates a group from `children` (may be filled later via `add`). */
  constructor(label: string, children: Command[] = []) {
    super();
    this.label = label;
    this.children = children;
  }

  /** Appends a command that has already been applied (used while recording). */
  add(cmd: Command): void {
    this.children.push(cmd);
  }

  /** Applies every child in order. */
  do(doc: CanvasDocument): void {
    for (const c of this.children) c.do(doc);
  }

  /** Reverts every child in reverse order. */
  undo(doc: CanvasDocument): void {
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i].undo(doc);
  }
}
