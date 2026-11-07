/**
 * Wander — Zhich, Yu, Justin
 * Pen brush: "velocity pen" ink built on perfect-freehand (MIT). Fast
 * movement thins the line. With a stylus the real pressure is used and
 * scaled down by speed; with a finger or mouse (pressure always 0.5)
 * perfect-freehand simulates pressure from the spacing of samples, which
 * also thins fast movement.
 */

import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush } from './Brush';
import { dotOutline, isSinglePoint } from './outlinePath';

/** Pressure reported by devices that have no pressure sensor. */
const NO_PRESSURE = 0.5;
/** Speed, in stroke widths per millisecond, at which thinning is strongest. */
const FAST_SPEED = 0.5;
/** Largest fraction of pressure removed by speed. */
const MAX_SPEED_THINNING = 0.6;
/** Weight of the newest sample in the smoothed speed (0..1). */
const SPEED_SMOOTHING = 0.3;

/** Pressure and velocity sensitive pen. */
export class PenBrush implements Brush {
  readonly kind = 'pen' as const;
  readonly pass = 1;
  readonly blendMode = 'normal' as const;

  /** Round-ended outline whose width follows pressure and speed. */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    if (points.length === 0) return [];
    if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
    const stylus = PenBrush.hasRealPressure(points);
    const options: StrokeOptions = {
      size: style.width,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: !stylus,
      start: { cap: true },
      end: { cap: true },
      last: complete,
    };
    const input = stylus
      ? PenBrush.speedAdjustedPressures(points, style.width)
      : points.map((p) => ({ x: p.x, y: p.y, pressure: NO_PRESSURE }));
    return getStroke(input, options).map(([x, y]) => ({ x, y }));
  }

  /** True when the device reported real pressure (some sample is not 0.5). */
  private static hasRealPressure(points: readonly StrokePoint[]): boolean {
    return points.some((p) => p.pressure !== NO_PRESSURE);
  }

  /**
   * Points with pressure reduced by smoothed drawing speed, measured in
   * stroke widths per millisecond so the feel does not depend on width.
   */
  private static speedAdjustedPressures(
    points: readonly StrokePoint[],
    width: number,
  ): { x: number; y: number; pressure: number }[] {
    let speed = 0;
    return points.map((p, i) => {
      if (i > 0) {
        const prev = points[i - 1];
        const dt = p.time - prev.time;
        if (dt > 0) {
          const instant = Math.hypot(p.x - prev.x, p.y - prev.y) / width / dt;
          speed += (instant - speed) * SPEED_SMOOTHING;
        }
      }
      const thinning = MAX_SPEED_THINNING * Math.min(1, speed / FAST_SPEED);
      return { x: p.x, y: p.y, pressure: p.pressure * (1 - thinning) };
    });
  }
}
