/**
 * Wander — Zhich, Yu, Justin
 * Geometry for the vector eraser. The eraser sweeps a "capsule": every
 * point within `radius` of the segment from the previous pointer sample to
 * the current one. A stroke's point list is cut where it enters and leaves
 * the capsule, leaving the runs of points outside it.
 *
 * The capsule is convex, so a straight segment of a stroke meets it in at
 * most one interval. We find that interval numerically: the distance from a
 * point moving along the segment to the capsule axis is a convex function,
 * so a ternary search finds its minimum and bisection finds the crossings.
 */

import { distanceToSegment, type Vec2 } from './geometry';
import type { StrokePoint } from '../model/StrokeStyle';

/** Region swept by a round eraser moving from `a` to `b`. */
export interface Capsule {
  a: Vec2;
  b: Vec2;
  radius: number;
}

/** Search iterations; 40 halvings is far below a world-unit fraction. */
const ITERATIONS = 40;

/** True when point `p` lies inside or on the capsule. */
export function capsuleContains(c: Capsule, p: Vec2): boolean {
  return distanceToSegment(p, c.a, c.b) <= c.radius;
}

/** Linear interpolation of two stroke points, including pressure, time and tilt. */
export function lerpStrokePoint(p: StrokePoint, q: StrokePoint, t: number): StrokePoint {
  const mix = (u: number, v: number) => u + (v - u) * t;
  const out: StrokePoint = {
    x: mix(p.x, q.x),
    y: mix(p.y, q.y),
    pressure: mix(p.pressure, q.pressure),
    time: mix(p.time, q.time),
  };
  if (p.tiltX !== undefined && q.tiltX !== undefined) out.tiltX = mix(p.tiltX, q.tiltX);
  if (p.tiltY !== undefined && q.tiltY !== undefined) out.tiltY = mix(p.tiltY, q.tiltY);
  return out;
}

/**
 * Parameter interval [t0, t1] of segment p-q that lies inside the capsule,
 * or null when they do not meet. Crossing parameters are rounded to the
 * outside, so interpolated cut points never fall inside the capsule.
 */
export function capsuleInterval(c: Capsule, p: Vec2, q: Vec2): [number, number] | null {
  const pad = c.radius;
  if (
    Math.max(p.x, q.x) < Math.min(c.a.x, c.b.x) - pad ||
    Math.min(p.x, q.x) > Math.max(c.a.x, c.b.x) + pad ||
    Math.max(p.y, q.y) < Math.min(c.a.y, c.b.y) - pad ||
    Math.min(p.y, q.y) > Math.max(c.a.y, c.b.y) + pad
  ) {
    return null;
  }
  const at = (t: number): Vec2 => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const dist = (t: number) => distanceToSegment(at(t), c.a, c.b);

  // Ternary search for the closest approach (dist is convex in t).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < ITERATIONS; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(m1) < dist(m2)) hi = m2;
    else lo = m1;
  }
  const tMin = (lo + hi) / 2;
  if (dist(tMin) > c.radius) return null;

  const t0 = dist(0) <= c.radius ? 0 : bisectBoundary(dist, c.radius, 0, tMin);
  const t1 = dist(1) <= c.radius ? 1 : bisectBoundary(dist, c.radius, 1, tMin);
  return [t0, t1];
}

/**
 * Finds where `dist` crosses `radius` between `outside` (dist > radius) and
 * `inside` (dist <= radius); returns a parameter on the outside side.
 */
function bisectBoundary(dist: (t: number) => number, radius: number, outside: number, inside: number): number {
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (outside + inside) / 2;
    if (dist(mid) > radius) outside = mid;
    else inside = mid;
  }
  return outside;
}

/** Result of cutting a point list with a capsule. */
export interface EraseResult {
  /** False when the capsule did not touch any part of the list. */
  changed: boolean;
  /** Remaining runs of points outside the capsule, each with at least `minPoints` points. */
  runs: StrokePoint[][];
}

/**
 * Removes the parts of a polyline covered by the capsule. Cut points are
 * interpolated where a segment crosses the capsule edge so the ends of the
 * remaining runs are clean. Runs shorter than `minPoints` are dropped.
 */
export function eraseFromPolyline(points: readonly StrokePoint[], c: Capsule, minPoints = 2): EraseResult {
  if (points.length === 0) return { changed: false, runs: [] };
  if (points.length === 1) {
    return capsuleContains(c, points[0])
      ? { changed: true, runs: [] }
      : { changed: false, runs: [[points[0]]] };
  }

  const runs: StrokePoint[][] = [];
  let changed = false;
  let run: StrokePoint[] | null = capsuleContains(c, points[0]) ? null : [points[0]];
  if (!run) changed = true;

  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const hit = capsuleInterval(c, p, q);
    if (!hit) {
      run?.push(q);
      continue;
    }
    changed = true;
    const [t0, t1] = hit;
    if (run) {
      if (t0 > 0) run.push(lerpStrokePoint(p, q, t0));
      runs.push(run);
      run = null;
    }
    if (t1 < 1) run = [lerpStrokePoint(p, q, t1), q];
  }
  if (run) runs.push(run);

  if (!changed) return { changed: false, runs: [points.slice()] };
  return { changed: true, runs: runs.filter((r) => r.length >= minPoints) };
}
