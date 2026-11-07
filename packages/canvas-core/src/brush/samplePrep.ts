/**
 * Wander — Zhich, Yu, Justin
 * Input preparation shared by the brushes, so ink looks the same whatever
 * rate the device samples at (60 Hz mouse, 120 Hz touch, 240 Hz Pencil).
 *
 * perfect-freehand's own smoothing ("streamline") and simulated pressure
 * work per sample: the same hand movement captured at 4x the rate is
 * smoothed less and gets a different width. So the brushes (1) measure
 * speed from timestamps, not from the gap between samples, and (2) thin
 * the samples to an even spacing before handing them to perfect-freehand.
 */

import type { StrokePoint } from '../model/StrokeStyle';

/** Time constant of the speed filter in milliseconds. */
const SPEED_TIME_CONSTANT_MS = 30;

/** A sample ready for perfect-freehand, with any extra per-point data. */
export interface PreparedPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * Smoothed drawing speed at each point, in stroke widths per millisecond.
 * The filter weights samples by elapsed time, so the result does not
 * depend on how many samples the device sends.
 */
export function smoothedSpeeds(points: readonly StrokePoint[], width: number): number[] {
  'worklet';
  const speeds: number[] = [];
  let speed = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const dt = points[i].time - prev.time;
      if (dt > 0) {
        const instant = Math.hypot(points[i].x - prev.x, points[i].y - prev.y) / width / dt;
        speed += (instant - speed) * (1 - Math.exp(-dt / SPEED_TIME_CONSTANT_MS));
      }
    }
    speeds.push(speed);
  }
  return speeds;
}

/**
 * Keeps the first and last point and every point at least `spacing` away
 * from the previously kept one; a dropped run's pressure is averaged into
 * the next kept point so short presses still count.
 */
export function resample(points: readonly PreparedPoint[], spacing: number): PreparedPoint[] {
  'worklet';
  if (points.length <= 2) return [...points];
  const out: PreparedPoint[] = [points[0]];
  let sum = 0;
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const last = out[out.length - 1];
    sum += p.pressure;
    count++;
    const isLast = i === points.length - 1;
    if (isLast || Math.hypot(p.x - last.x, p.y - last.y) >= spacing) {
      out.push({ x: p.x, y: p.y, pressure: sum / count });
      sum = 0;
      count = 0;
    }
  }
  return out;
}
