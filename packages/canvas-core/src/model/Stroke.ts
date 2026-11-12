/**
 * Wander — Zhich, Yu, Justin
 * A freehand stroke: raw input points plus a style. Its filled outline is
 * computed by its brush on demand and cached (the object is immutable).
 *
 * A stroke the partial eraser has cut is "baked": its points are the
 * finished centre line the brush drew (pressure holds the radius as a
 * fraction of baked.size, edges which outline vertices it produced) and
 * its outline no longer goes through the
 * brush, so the ink left after a cut stays exactly where it was.
 */

import { freehandBakedOutline, freehandCentre, type BakedOptions } from '../brush/freehand';
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

/** Frozen look of a baked stroke: how to outline its centre line, and its brush opacity. */
export interface BakedInk extends BakedOptions {
  /** Brush opacity multiplier of the original stroke. */
  opacity: number;
}

/** Serialized stroke. Points are packed as [x, y, pressure, time, ...]. */
export interface StrokeJSON extends ObjectJSON {
  kind: 'stroke';
  style: StrokeStyle;
  points: number[];
  /** Optional packed tilt as [tiltX, tiltY, ...], same length / 2 as points / 4. */
  tilt?: number[];
  /** Present when the points are a baked centre line. */
  baked?: BakedInk;
  /** With `baked`: each point's `edges`, -1 where it has none. */
  edges?: number[];
}

/** Immutable freehand stroke. */
export class Stroke extends CanvasObject {
  readonly kind = 'stroke' as const;
  readonly points: readonly StrokePoint[];
  readonly style: Readonly<StrokeStyle>;
  /** Set when the points are a baked centre line (see the file comment). */
  readonly baked?: Readonly<BakedInk>;
  private cachedBounds?: Rect;
  private cachedOutline?: Vec2[];
  private cachedOpacity?: number;

  /** Creates a stroke; pass no id to get a fresh one. */
  constructor(points: readonly StrokePoint[], style: StrokeStyle, id: string = newId('s'), baked?: BakedInk) {
    super(id);
    this.points = points;
    this.style = { ...style };
    if (baked) this.baked = { ...baked };
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
      this.cachedOutline = this.baked
        ? freehandBakedOutline(this.points, this.baked)
        : getBrush(this.style.brush).outline(this.points, this.style, true);
    }
    return this.cachedOutline;
  }

  /** Opacity to draw with: the style's opacity times the brush's (pencil shading is lighter). */
  get opacity(): number {
    if (this.cachedOpacity === undefined) {
      this.cachedOpacity =
        this.style.opacity * (this.baked?.opacity ?? getBrush(this.style.brush).opacity(this.points, this.style));
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
    const scale = matrixScale(m);
    const baked = this.baked && { ...this.baked, size: this.baked.size * scale };
    return new Stroke(points, { ...this.style, width: this.style.width * scale }, this.id, baked);
  }

  /**
   * This stroke with its drawn centre line frozen into its points; it looks
   * the same. Returns the stroke itself when it is already baked or its
   * brush cannot describe it (a tap, or a brush without `freehand`).
   */
  toBaked(): Stroke {
    if (this.baked) return this;
    const brush = getBrush(this.style.brush);
    const call = brush.freehand?.(this.points, this.style);
    if (!call) return this;
    const { size, smoothing, capStart, capEnd } = call.options;
    const points = freehandCentre(call.input, call.options).map((p) => ({ ...p, time: 0 }));
    const opacity = brush.opacity(this.points, this.style);
    return new Stroke(points, this.style, this.id, { size, smoothing, capStart, capEnd, trimEnd: true, opacity });
  }

  /**
   * Copy with different points and a new id (used when an eraser splits a
   * stroke). `keepsEnd` says whether the copy still ends at this stroke's
   * last point; it only matters for a baked stroke.
   */
  withPoints(points: readonly StrokePoint[], keepsEnd = true): Stroke {
    const baked = this.baked && { ...this.baked, trimEnd: this.baked.trimEnd && keepsEnd };
    return new Stroke(points, this.style, undefined, baked);
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
    if (this.baked) {
      json.baked = { ...this.baked };
      json.edges = this.points.map((p) => p.edges ?? -1);
    }
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
      if (json.edges && json.edges[k / 2] >= 0) p.edges = json.edges[k / 2];
      pts.push(p);
    }
    return new Stroke(pts, json.style, json.id, json.baked);
  }
}
