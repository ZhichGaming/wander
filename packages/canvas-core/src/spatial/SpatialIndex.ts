/**
 * Wander — Zhich, Yu, Justin
 * R-tree over object bounding boxes (rbush). Answers "which objects might
 * be in this rectangle" for viewport culling, erasing and lasso hit-tests.
 */

import RBush from 'rbush';
import type { Rect } from '../math/geometry';

/** Entry stored in the tree. */
interface Entry extends Rect {
  id: string;
}

/** Spatial index keyed by object id. */
export class SpatialIndex {
  private tree = new RBush<Entry>();
  private entries = new Map<string, Entry>();

  /** Number of indexed objects. */
  get size(): number {
    return this.entries.size;
  }

  /** Adds or moves `id` to `bounds`. */
  set(id: string, bounds: Rect): void {
    this.delete(id);
    const entry: Entry = { id, ...bounds };
    this.entries.set(id, entry);
    this.tree.insert(entry);
  }

  /** Removes `id` if present. */
  delete(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.tree.remove(entry);
    this.entries.delete(id);
  }

  /** Ids whose bounds intersect `rect`. Order is unspecified. */
  search(rect: Rect): string[] {
    return this.tree.search(rect).map((e) => e.id);
  }

  /** Removes everything. */
  clear(): void {
    this.tree.clear();
    this.entries.clear();
  }
}
