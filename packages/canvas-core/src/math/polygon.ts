/**
 * Wander — Zhich, Yu, Justin
 * Pure helpers for simple polygons given as point lists (the lasso path).
 * The polygon is treated as closed: the last point connects to the first.
 */

import { boundsOfPoints, type Rect, type Vec2 } from './geometry';

/**
 * True when `p` lies inside `polygon` by the even-odd rule: a ray cast to
 * the right crosses the outline an odd number of times. Self-intersecting
 * lasso paths therefore leave their doubly-wrapped regions outside.
 */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Bounding rectangle of the polygon; empty for an empty list. */
export function polygonBounds(polygon: readonly Vec2[]): Rect {
  return boundsOfPoints(polygon);
}

