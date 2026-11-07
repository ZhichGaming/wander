/**
 * Wander — Zhich, Yu, Justin
 * Commands that add, remove, replace and transform canvas objects.
 */

import type { Matrix } from '../math/geometry';
import type { CanvasDocument, ObjectLocation } from '../model/CanvasDocument';
import type { CanvasObject } from '../model/CanvasObject';
import { Command } from './Command';

/** Adds objects on top of one layer. */
export class CreateObjects extends Command {
  readonly label: string;

  /** Creates the command; nothing changes until `do`. */
  constructor(
    private readonly layerId: string,
    private readonly objects: readonly CanvasObject[],
    label = 'Draw',
  ) {
    super();
    this.label = label;
  }

  /** Adds every object on top of the layer. */
  do(doc: CanvasDocument): void {
    for (const o of this.objects) doc.addObject(this.layerId, o);
  }

  /** Removes the added objects. */
  undo(doc: CanvasDocument): void {
    for (let i = this.objects.length - 1; i >= 0; i--) doc.removeObject(this.objects[i].id);
  }
}

/** Removes objects, remembering their layers and positions. */
export class DeleteObjects extends Command {
  readonly label: string;
  private removed: ObjectLocation[] = [];

  /** Creates the command for the given object ids. */
  constructor(
    private readonly ids: readonly string[],
    label = 'Delete',
  ) {
    super();
    this.label = label;
  }

  /** Removes every listed object that exists. */
  do(doc: CanvasDocument): void {
    this.removed = [];
    for (const id of this.ids) {
      if (doc.getObject(id)) this.removed.push(doc.removeObject(id));
    }
  }

  /** Puts the objects back at their original positions (reverse removal order). */
  undo(doc: CanvasDocument): void {
    for (let i = this.removed.length - 1; i >= 0; i--) {
      const r = this.removed[i];
      doc.addObject(r.layerId, r.object, r.index);
    }
  }
}

/** Swaps objects for new versions with the same ids (generic edit). */
export class ReplaceObjects extends Command {
  readonly label: string;
  private before: CanvasObject[] = [];

  /** Creates the command; `after` objects must reuse existing ids. */
  constructor(
    private readonly after: readonly CanvasObject[],
    label = 'Edit',
  ) {
    super();
    this.label = label;
  }

  /** Installs the new versions, keeping the old ones for undo. */
  do(doc: CanvasDocument): void {
    this.before = this.after.map((o) => doc.replaceObject(o));
  }

  /** Restores the old versions. */
  undo(doc: CanvasDocument): void {
    for (const o of this.before) doc.replaceObject(o);
  }
}

/** Applies an affine matrix to objects (move, scale, rotate a selection). */
export class TransformObjects extends Command {
  readonly label: string;
  private inner?: ReplaceObjects;

  /** Creates the command for the given ids and matrix. */
  constructor(
    private readonly ids: readonly string[],
    private readonly matrix: Matrix,
    label = 'Transform',
  ) {
    super();
    this.label = label;
  }

  /** Transforms the objects; the transformed copies are computed once and reused on redo. */
  do(doc: CanvasDocument): void {
    if (!this.inner) {
      const after = this.ids
        .map((id) => doc.getObject(id))
        .filter((o): o is CanvasObject => !!o)
        .map((o) => o.transformed(this.matrix));
      this.inner = new ReplaceObjects(after, this.label);
    }
    this.inner.do(doc);
  }

  /** Restores the objects as they were before. */
  undo(doc: CanvasDocument): void {
    this.inner?.undo(doc);
  }
}
