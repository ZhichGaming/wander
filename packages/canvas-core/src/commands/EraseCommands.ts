/**
 * Wander — Zhich, Yu, Justin
 * Commands used by the partial eraser. SplitStroke swaps one stroke for the
 * pieces left after erasing part of it, keeping them at the same z position.
 */

import type { CanvasDocument, ObjectLocation } from '../model/CanvasDocument';
import type { Stroke } from '../model/Stroke';
import { Command } from './Command';

/**
 * Replaces a stroke with zero or more pieces at the original layer and
 * z index. The pieces are created once by the caller (with new ids), so
 * redo reinstalls exactly the same objects; undo restores the original.
 */
export class SplitStroke extends Command {
  readonly label = 'Erase';
  private removed?: ObjectLocation;

  /** Creates the command; `pieces` are listed bottom to top. */
  constructor(
    private readonly strokeId: string,
    private readonly pieces: readonly Stroke[],
  ) {
    super();
  }

  /** Removes the original and inserts the pieces where it was. */
  do(doc: CanvasDocument): void {
    this.removed = doc.removeObject(this.strokeId);
    const { layerId, index } = this.removed;
    this.pieces.forEach((piece, i) => doc.addObject(layerId, piece, index + i));
  }

  /** Removes the pieces and puts the original back at its old position. */
  undo(doc: CanvasDocument): void {
    if (!this.removed) return;
    for (let i = this.pieces.length - 1; i >= 0; i--) doc.removeObject(this.pieces[i].id);
    const { layerId, index, object } = this.removed;
    doc.addObject(layerId, object, index);
  }
}
