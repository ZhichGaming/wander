/**
 * Wander — Zhich, Yu, Justin
 * Pen brush: "velocity pen" ink built on perfect-freehand (MIT). Fast
 * movement thins the line. With a stylus the real pressure is used and
 * scaled down by speed; with a finger or mouse (pressure always 0.5) a
 * fixed base pressure is scaled down by speed the same way. Speed comes
 * from timestamps and samples are evened out first (see samplePrep), so
 * the ink looks the same at any input rate.
 */

import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush } from './Brush';
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
/** Even sample spacing handed to perfect-freehand, as a fraction of the width. */
const SPACING = 0.2;

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

  /** Round-ended outline whose width follows pressure and speed. */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    if (points.length === 0) return [];
    if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
    const options: StrokeOptions = {
      size: style.width,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: false,
      start: { cap: true },
      end: { cap: true },
      last: complete,
    };
    const input = resample(PenBrush.pressures(points, style.width), style.width * SPACING);
    return getStroke(input, options).map(([x, y]) => ({ x, y }));
  }

  /** Per-point pressure: device pressure (or a fixed finger pressure) reduced by speed. */
  private static pressures(points: readonly StrokePoint[], width: number): PreparedPoint[] {
    const stylus = points.some((p) => p.pressure !== NO_PRESSURE);
    const speeds = smoothedSpeeds(points, width);
    return points.map((p, i) => {
      const base = stylus ? p.pressure : FINGER_PRESSURE;
      const thinning = MAX_SPEED_THINNING * Math.min(1, speeds[i] / FAST_SPEED);
      return { x: p.x, y: p.y, pressure: base * (1 - thinning) };
    });
  }
}
