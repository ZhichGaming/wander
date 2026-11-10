/**
 * Wander — Zhich, Yu, Justin
 * Pen brush: "velocity pen" ink built on perfect-freehand (MIT). Fast
 * movement thins the line. With a stylus the real pressure is used and
 * scaled down by speed; with a finger or mouse (pressure always 0.5) a
 * fixed base pressure is scaled down by speed the same way. Speed comes
 * from timestamps and samples are evened out first (see samplePrep), so
 * the ink looks the same at any input rate. The math lives in worklet
 * functions so the live stroke can be drawn on the UI thread.
 */

import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush, FreehandCall } from './Brush';
import { freehandOutline } from './freehand';
import { dotOutline, isSinglePoint } from './outlinePath';
import { resample, smoothedSpeeds, type PreparedPoint } from './samplePrep';

/** Pressure reported by devices that have no pressure sensor. */
const NO_PRESSURE = 0.5;
/** Pressure used for finger and mouse strokes before speed thinning. */
const FINGER_PRESSURE = 0.6;
/** Speed, in stroke widths per millisecond, at which thinning is strongest. */
const FAST_SPEED = 0.5;
/** Largest fraction of pressure removed by speed. */
const MAX_SPEED_THINNING = 0.6;
/** How strongly pressure changes the pen's width with a stylus (0..1). */
const STYLUS_THINNING = 0.9;
/** How strongly speed-reduced pressure changes the width with a finger or mouse. */
const FINGER_THINNING = 0.6;
/** Even sample spacing handed to perfect-freehand, as a fraction of the width. */
const SPACING = 0.2;

/** True when the device reported real pressure (some sample is not 0.5). Worklet. */
function hasPressure(points: readonly StrokePoint[]): boolean {
  'worklet';
  for (const p of points) if (p.pressure !== NO_PRESSURE) return true;
  return false;
}

/** Per-point pressure: device pressure (or a fixed finger pressure) reduced by speed. Worklet. */
function penPressures(points: readonly StrokePoint[], width: number, stylus: boolean): PreparedPoint[] {
  'worklet';
  const speeds = smoothedSpeeds(points, width);
  return points.map((p, i) => {
    const base = stylus ? p.pressure : FINGER_PRESSURE;
    const thinning = MAX_SPEED_THINNING * Math.min(1, speeds[i] / FAST_SPEED);
    return { x: p.x, y: p.y, pressure: base * (1 - thinning) };
  });
}

/** Samples and options the pen hands to freehandOutline. Worklet. */
function penFreehand(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): FreehandCall {
  'worklet';
  const stylus = hasPressure(points);
  return {
    input: resample(penPressures(points, style.width, stylus), style.width * SPACING),
    options: {
      size: style.width,
      // A stylus gets a wider pressure range than a finger's speed-only response.
      thinning: stylus ? STYLUS_THINNING : FINGER_THINNING,
      smoothing: 0.5,
      streamline: 0.45,
      capStart: true,
      capEnd: true,
      last: complete,
    },
  };
}

/** Round-ended outline whose width follows pressure and speed. Worklet. */
export function penOutline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (points.length === 0) return [];
  if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
  const call = penFreehand(points, style, complete);
  return freehandOutline(call.input, call.options);
}

/** Pressure and velocity sensitive pen. */
export class PenBrush implements Brush {
  readonly kind = 'pen' as const;
  readonly pass = 1;
  readonly blendMode = 'normal' as const;
  readonly texture = 'none' as const;

  /** Full opacity: speed and pressure change width, not darkness. */
  opacity(): number {
    return 1;
  }

  /** Round-ended outline whose width follows pressure and speed (see penOutline). */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    return penOutline(points, style, complete);
  }

  /** The freehand call behind a finished pen stroke; null for a tap. */
  freehand(points: readonly StrokePoint[], style: StrokeStyle): FreehandCall | null {
    return points.length === 0 || isSinglePoint(points) ? null : penFreehand(points, style, true);
  }
}
