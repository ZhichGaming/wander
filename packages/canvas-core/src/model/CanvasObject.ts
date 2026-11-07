/**
 * Wander — Zhich, Yu, Justin
 * Base class for everything that lives on the canvas (strokes, imported
 * pages and images). Objects are immutable: an edit produces a new object
 * with the same id, which keeps undo simple (a command stores before and
 * after objects) and makes cached geometry safe to keep.
 */

import type { Matrix, Rect, Vec2 } from '../math/geometry';

/** Serialized form shared by every object kind. */
export interface ObjectJSON {
  kind: string;
  id: string;
  [key: string]: unknown;
}

/** Abstract canvas object. Subclasses define geometry and serialization. */
export abstract class CanvasObject {
  /** Stable identity across edits, undo and save/load. */
  readonly id: string;

  /** Creates the object with the given id. */
  constructor(id: string) {
    this.id = id;
  }

  /** Type tag used by the serializer and the renderer ("stroke", "page"...). */
  abstract readonly kind: string;

  /** World-space bounding box, including stroke width. */
  abstract get bounds(): Rect;

  /** True when a circle of `radius` at world point `p` touches the object. */
  abstract hitTest(p: Vec2, radius: number): boolean;

  /** Returns a copy (same id) with matrix `m` applied. */
  abstract transformed(m: Matrix): CanvasObject;

  /** Plain JSON record for this object. */
  abstract toJSON(): ObjectJSON;
}
