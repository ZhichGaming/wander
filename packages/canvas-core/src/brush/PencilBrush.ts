/**
 * Wander — Zhich, Yu, Justin
 * Pencil brush: graphite that responds to Apple Pencil tilt like a real
 * pencil. Held upright it draws a thin line from the tip; tilted towards
 * the paper it shades with the side of the lead, giving a much wider,
 * lighter stroke. Pressure darkens and widens a little. The renderer fills
 * the outline with a graphite grain texture and multiplies it onto the
 * paper, so overlapping shading builds up like real graphite.
 *
 * Built on the vendored perfect-freehand (MIT, see freehand.ts) with thinning 1, so each point's
 * "pressure" is exactly its radius as a fraction of the largest radius,
 * which lets this brush control width directly. The math lives in worklet
 * functions so the live stroke can be drawn on the UI thread.
 */

import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush, FreehandCall } from './Brush';
import { freehandOutline } from './freehand';
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
  'worklet';
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How far a sample is shading with the side of the lead, 0 (tip) to 1
 * (flat side). Samples without tilt (finger, mouse) count as tip.
 */
export function shadeAmount(p: StrokePoint): number {
  'worklet';
  if (p.tiltX === undefined || p.tiltY === undefined) return 0;
  const lean = Math.atan(Math.hypot(Math.tan(p.tiltX), Math.tan(p.tiltY)));
  return smoothstep(SHADE_START, SHADE_FULL, lean);
}

/** True when the device reported real pressure. Worklet. */
function hasPressure(points: readonly StrokePoint[]): boolean {
  'worklet';
  for (const p of points) if (p.pressure !== NO_PRESSURE) return true;
  return false;
}

/** Radius at one sample: tip radius widened by shading, scaled by pressure. Worklet. */
function pencilRadius(p: StrokePoint, style: StrokeStyle, stylus: boolean): number {
  'worklet';
  const pressure = stylus ? 0.45 + 0.55 * p.pressure : 0.75;
  const widen = 1 + (SHADE_WIDTH - 1) * shadeAmount(p);
  return (style.width / 2) * pressure * widen;
}

/**
 * Opacity multiplier: the median shade amount of the stroke maps from full
 * opacity (tip) down to SHADE_OPACITY (flat side). Worklet.
 */
export function pencilOpacity(points: readonly StrokePoint[]): number {
  'worklet';
  if (points.length === 0) return 1;
  const shades = points.map((p) => shadeAmount(p)).sort((a, b) => a - b);
  const median = shades[Math.floor(shades.length / 2)];
  return 1 - (1 - SHADE_OPACITY) * median;
}

/** Samples and options the pencil hands to freehandOutline. Worklet. */
function pencilFreehand(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): FreehandCall {
  'worklet';
  const stylus = hasPressure(points);
  const maxRadius = (style.width / 2) * SHADE_WIDTH;
  const prepared: PreparedPoint[] = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: Math.max(0.01, pencilRadius(p, style, stylus) / maxRadius),
  }));
  return {
    input: resample(prepared, style.width * SPACING),
    options: {
      size: maxRadius,
      thinning: 1,
      smoothing: 0.6,
      streamline: 0.4,
      capStart: true,
      capEnd: true,
      last: complete,
    },
  };
}

/** Outline whose width follows tilt (side shading) and pressure. Worklet. */
export function pencilOutline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (points.length === 0) return [];
  if (isSinglePoint(points)) return dotOutline(points[0], pencilRadius(points[0], style, hasPressure(points)));
  const call = pencilFreehand(points, style, complete);
  return freehandOutline(call.input, call.options);
}

/** Tilt-aware graphite pencil. */
export class PencilBrush implements Brush {
  readonly kind = 'pencil' as const;
  readonly pass = 1;
  readonly blendMode = 'multiply' as const;
  readonly texture = 'graphite' as const;

  /** Lighter when shading (see pencilOpacity). */
  opacity(points: readonly StrokePoint[]): number {
    return pencilOpacity(points);
  }

  /** Outline whose width follows tilt and pressure (see pencilOutline). */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    return pencilOutline(points, style, complete);
  }

  /** The freehand call behind a finished pencil stroke; null for a tap. */
  freehand(points: readonly StrokePoint[], style: StrokeStyle): FreehandCall | null {
    return points.length === 0 || isSinglePoint(points) ? null : pencilFreehand(points, style, true);
  }
}
