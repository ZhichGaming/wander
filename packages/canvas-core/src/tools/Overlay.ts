/**
 * Wander — Zhich, Yu, Justin
 * Transient, non-document drawing state that tools publish for the
 * renderer: the stroke being drawn, the lasso path and the eraser cursor.
 * Nothing here is saved or undoable.
 */

import { Emitter } from '../Emitter';
import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';

/** The stroke currently being drawn. */
export interface LiveStroke {
  points: StrokePoint[];
  /** Look-ahead samples drawn after `points` but never committed. */
  predicted: StrokePoint[];
  style: StrokeStyle;
}

/** Eraser cursor in world space. */
export interface EraserCursor {
  center: Vec2;
  radius: number;
}

/** Snapshot of the overlay. */
export interface OverlayState {
  liveStroke: LiveStroke | null;
  lasso: Vec2[] | null;
  eraser: EraserCursor | null;
}

/** Mutable overlay with change notification. Tools write, the renderer reads. */
export class Overlay {
  /** Fires after any change with the full state. */
  readonly changed = new Emitter<OverlayState>();
  private s: OverlayState = { liveStroke: null, lasso: null, eraser: null };

  /** Current state. Arrays are live; copy them before keeping. */
  get state(): Readonly<OverlayState> {
    return this.s;
  }

  /** Sets or clears the live stroke. */
  setLiveStroke(stroke: LiveStroke | null): void {
    this.s = { ...this.s, liveStroke: stroke };
    this.changed.emit(this.s);
  }

  /** Sets or clears the lasso polygon. */
  setLasso(points: Vec2[] | null): void {
    this.s = { ...this.s, lasso: points };
    this.changed.emit(this.s);
  }

  /** Sets or clears the eraser cursor. */
  setEraser(cursor: EraserCursor | null): void {
    this.s = { ...this.s, eraser: cursor };
    this.changed.emit(this.s);
  }

  /** Clears everything. */
  clear(): void {
    this.s = { liveStroke: null, lasso: null, eraser: null };
    this.changed.emit(this.s);
  }
}
