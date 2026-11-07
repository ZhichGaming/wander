/**
 * Wander — Zhich, Yu, Justin
 * Turns a brush outline polygon into a closed, smooth SVG path string that
 * both Skia (Skia.Path.MakeFromSVGString) and pdf-lib (drawSvgPath) accept.
 *
 * Technique adapted from the perfect-freehand README (MIT, Steve Ruiz):
 * walk the polygon and draw a quadratic curve through each vertex, ending at
 * the midpoint to the next vertex, so corners become smooth.
 */

import type { Vec2 } from '../math/geometry';

/** Formats a coordinate with two decimals, enough for screen and print. */
function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * Closed smooth SVG path through the outline polygon, starting with "M" and
 * ending with "Z". Returns an empty string for fewer than three points.
 */
export function outlineToSvgPath(outline: readonly Vec2[]): string {
  const len = outline.length;
  if (len < 3) return '';
  const first = outline[0];
  const second = outline[1];
  const parts: string[] = [`M${fmt((first.x + second.x) / 2)},${fmt((first.y + second.y) / 2)}`];
  for (let i = 1; i <= len; i++) {
    const p = outline[i % len];
    const next = outline[(i + 1) % len];
    parts.push(`Q${fmt(p.x)},${fmt(p.y)} ${fmt((p.x + next.x) / 2)},${fmt((p.y + next.y) / 2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Number of vertices used for a dot; enough to look round once smoothed. */
const DOT_SEGMENTS = 16;

/**
 * Circle polygon used when a stroke is a single tap. perfect-freehand offsets
 * a lone point by one unit, so brushes draw taps with this instead.
 */
export function dotOutline(center: Vec2, radius: number): Vec2[] {
  const outline: Vec2[] = [];
  for (let i = 0; i < DOT_SEGMENTS; i++) {
    const a = (i / DOT_SEGMENTS) * Math.PI * 2;
    outline.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return outline;
}

/** True when every point sits on the first one, as in a tap. */
export function isSinglePoint(points: readonly Vec2[]): boolean {
  return points.every((p) => p.x === points[0].x && p.y === points[0].y);
}
