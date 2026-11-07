/**
 * Wander — Zhich, Yu, Justin
 * A freehand stroke: raw input points plus a style. Its filled outline is
 * computed by its brush on demand and cached (the object is immutable).
 */

import { getBrush } from '../brush/registry';
import {
  applyMatrix,
  boundsOfPoints,
  distanceToSegment,
  inflateRect,
  matrixScale,
  unionRect,
  type Matrix,
  type Rect,
  type Vec2,
} from '../math/geometry';
import { newId } from '../ids';
import { CanvasObject, type ObjectJSON } from './CanvasObject';
import type { StrokePoint, StrokeStyle } from './StrokeStyle';

/** Serialized stroke. Points are packed as [x, y, pressure, time, ...]. */
export interface StrokeJSON extends ObjectJSON {
  kind: 'stroke';
  style: StrokeStyle;
  points: number[];
  /** Optional packed tilt as [tiltX, tiltY, ...], same length / 2 as points / 4. */
  tilt?: number[];
}

/** Immutable freehand stroke. */
export class Stroke extends CanvasObject {
  readonly kind = 'stroke' as const;
  readonly points: readonly StrokePoint[];
  readonly style: Readonly<StrokeStyle>;
  private cachedBounds?: Rect;
  private cachedOutline?: Vec2[];
  private cachedOpacity?: number;

  /** Creates a stroke; pass no id to get a fresh one. */
  constructor(points: readonly StrokePoint[], style: StrokeStyle, id: string = newId('s')) {
    super(id);
    this.points = points;
    this.style = { ...style };
  }

  /**
   * Bounds of the drawn outline (which can be much wider than the width for
   * pencil shading), unioned with the points padded by the width.
   */
  get bounds(): Rect {
    if (!this.cachedBounds) {
      const padded = inflateRect(boundsOfPoints(this.points), this.style.width);
      const outline = this.outline;
      this.cachedBounds = outline.length > 0 ? unionRect(padded, boundsOfPoints(outline)) : padded;
    }
    return this.cachedBounds;
  }

  /** Filled outline polygon from the brush, computed once. */
  get outline(): Vec2[] {
    if (!this.cachedOutline) {
      this.cachedOutline = getBrush(this.style.brush).outline(this.points, this.style, true);
    }
    return this.cachedOutline;
  }

  /** Opacity to draw with: the style's opacity times the brush's (pencil shading is lighter). */
  get opacity(): number {
    if (this.cachedOpacity === undefined) {
      this.cachedOpacity = this.style.opacity * getBrush(this.style.brush).opacity(this.points, this.style);
    }
    return this.cachedOpacity;
  }

  /** True when a circle at `p` touches the stroke's centre line widened by half its width. */
  hitTest(p: Vec2, radius: number): boolean {
    const reach = radius + this.style.width / 2;
    const pts = this.points;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= reach;
    for (let i = 1; i < pts.length; i++) {
      if (distanceToSegment(p, pts[i - 1], pts[i]) <= reach) return true;
    }
    return false;
  }

  /** Same stroke with every point transformed and the width scaled. */
  transformed(m: Matrix): Stroke {
    const points = this.points.map((pt) => ({ ...pt, ...applyMatrix(m, pt) }));
    return new Stroke(points, { ...this.style, width: this.style.width * matrixScale(m) }, this.id);
  }

  /** Copy with different points and a new id (used when an eraser splits a stroke). */
  withPoints(points: readonly StrokePoint[]): Stroke {
    return new Stroke(points, this.style);
  }

  /** Packed JSON record. */
  toJSON(): StrokeJSON {
    const points: number[] = [];
    let hasTilt = false;
    for (const p of this.points) {
      points.push(p.x, p.y, p.pressure, p.time);
      if (p.tiltX !== undefined || p.tiltY !== undefined) hasTilt = true;
    }
    const json: StrokeJSON = { kind: 'stroke', id: this.id, style: { ...this.style }, points };
    if (hasTilt) json.tilt = this.points.flatMap((p) => [p.tiltX ?? 0, p.tiltY ?? 0]);
    return json;
  }

  /** Rebuilds a stroke from its JSON record. */
  static fromJSON(json: StrokeJSON): Stroke {
    const pts: StrokePoint[] = [];
    for (let i = 0, k = 0; i < json.points.length; i += 4, k += 2) {
      const p: StrokePoint = {
        x: json.points[i],
        y: json.points[i + 1],
        pressure: json.points[i + 2],
        time: json.points[i + 3],
      };
      if (json.tilt) {
        p.tiltX = json.tilt[k];
        p.tiltY = json.tilt[k + 1];
      }
      pts.push(p);
    }
    return new Stroke(pts, json.style, json.id);
  }
}
