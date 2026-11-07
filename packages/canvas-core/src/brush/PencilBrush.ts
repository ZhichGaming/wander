/**
 * Wander — Zhich, Yu, Justin
 * Pencil brush: graphite that responds to Apple Pencil tilt like a real
 * pencil. Held upright it draws a thin line from the tip; tilted towards
 * the paper it shades with the side of the lead, giving a much wider,
 * lighter stroke. Pressure darkens and widens a little. The renderer fills
 * the outline with a graphite grain texture and multiplies it onto the
 * paper, so overlapping shading builds up like real graphite.
 *
 * Built on perfect-freehand (MIT) with thinning 1, so each point's
 * "pressure" is exactly its radius as a fraction of the largest radius,
 * which lets this class control width directly.
 */

import { getStroke } from 'perfect-freehand';
import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush } from './Brush';
import { dotOutline, isSinglePoint } from './outlinePath';
import { resample, type PreparedPoint } from './samplePrep';

/** Pressure reported by devices that have no pressure sensor. */
const NO_PRESSURE = 0.5;
/** Lean from vertical (radians) where shading starts: about 50 degrees. */
const SHADE_START = (50 * Math.PI) / 180;
/** Lean from vertical (radians) where shading is full: about 75 degrees. */
const SHADE_FULL = (75 * Math.PI) / 180;
/** Width of full side shading relative to the tip width. */
const SHADE_WIDTH = 6;
/** Opacity of full side shading relative to a tip line. */
const SHADE_OPACITY = 0.45;
/** Even sample spacing handed to perfect-freehand, as a fraction of the width. */
const SPACING = 0.2;

/** Smooth 0..1 ramp between `a` and `b`. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How far a sample is shading with the side of the lead, 0 (tip) to 1
 * (flat side). Samples without tilt (finger, mouse) count as tip.
 */
export function shadeAmount(p: StrokePoint): number {
  if (p.tiltX === undefined || p.tiltY === undefined) return 0;
  const lean = Math.atan(Math.hypot(Math.tan(p.tiltX), Math.tan(p.tiltY)));
  return smoothstep(SHADE_START, SHADE_FULL, lean);
}

/** Tilt-aware graphite pencil. */
export class PencilBrush implements Brush {
  readonly kind = 'pencil' as const;
  readonly pass = 1;
  readonly blendMode = 'multiply' as const;
  readonly texture = 'graphite' as const;

  /**
   * Lighter when shading: the median shade amount of the stroke maps from
   * full opacity (tip) down to SHADE_OPACITY (flat side).
   */
  opacity(points: readonly StrokePoint[]): number {
    if (points.length === 0) return 1;
    const shades = points.map(shadeAmount).sort((a, b) => a - b);
    const median = shades[Math.floor(shades.length / 2)];
    return 1 - (1 - SHADE_OPACITY) * median;
  }

  /** Outline whose width follows tilt (side shading) and pressure. */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    if (points.length === 0) return [];
    const maxRadius = (style.width / 2) * SHADE_WIDTH;
    if (isSinglePoint(points)) return dotOutline(points[0], this.radius(points[0], style, this.stylus(points)));
    const stylus = this.stylus(points);
    const prepared: PreparedPoint[] = points.map((p) => ({
      x: p.x,
      y: p.y,
      pressure: Math.max(0.01, this.radius(p, style, stylus) / maxRadius),
    }));
    const outline = getStroke(resample(prepared, style.width * SPACING), {
      size: maxRadius,
      thinning: 1,
      smoothing: 0.6,
      streamline: 0.4,
      simulatePressure: false,
      easing: (t) => t,
      start: { cap: true },
      end: { cap: true },
      last: complete,
    });
    return outline.map(([x, y]) => ({ x, y }));
  }

  /** True when the device reported real pressure. */
  private stylus(points: readonly StrokePoint[]): boolean {
    return points.some((p) => p.pressure !== NO_PRESSURE);
  }

  /** Radius at one sample: tip radius widened by shading, scaled by pressure. */
  private radius(p: StrokePoint, style: StrokeStyle, stylus: boolean): number {
    const pressure = stylus ? 0.45 + 0.55 * p.pressure : 0.75;
    const widen = 1 + (SHADE_WIDTH - 1) * shadeAmount(p);
    return (style.width / 2) * pressure * widen;
  }
}
