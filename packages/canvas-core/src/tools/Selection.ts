/**
 * Wander — Zhich, Yu, Justin
 * The set of selected object ids (from the lasso). The AI harness reads it
 * to know what the student asked about; tools move or delete it.
 */

import { Emitter } from '../Emitter';
import { emptyRect, unionRect, type Rect } from '../math/geometry';
import type { CanvasDocument } from '../model/CanvasDocument';
import type { CanvasObject } from '../model/CanvasObject';

/** Ordered set of selected object ids. */
export class Selection {
  /** Fires with the selected ids after every change. */
  readonly changed = new Emitter<readonly string[]>();
  private ids = new Set<string>();

  /** Selected ids in selection order. */
  get items(): readonly string[] {
    return [...this.ids];
  }

  /** Number of selected objects. */
  get size(): number {
    return this.ids.size;
  }

  /** True when `id` is selected. */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** Replaces the selection. */
  set(ids: Iterable<string>): void {
    this.ids = new Set(ids);
    this.changed.emit(this.items);
  }

  /** Adds to the selection (multi-lasso). */
  add(ids: Iterable<string>): void {
    for (const id of ids) this.ids.add(id);
    this.changed.emit(this.items);
  }

  /** Empties the selection. */
  clear(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.changed.emit(this.items);
  }

  /** Selected objects that still exist in `doc`; prunes ids that no longer do. */
  objects(doc: CanvasDocument): CanvasObject[] {
    const out: CanvasObject[] = [];
    for (const id of this.ids) {
      const o = doc.getObject(id);
      if (o) out.push(o);
    }
    return out;
  }

  /** Union of the selected objects' bounds (empty rect when nothing is selected). */
  bounds(doc: CanvasDocument): Rect {
    return this.objects(doc).reduce((r, o) => unionRect(r, o.bounds), emptyRect());
  }
}
