/**
 * Wander — Zhich, Yu, Justin
 * Converts a brush outline polygon (world-space points) into a Skia path.
 * Neighbouring points are joined with quadratic curves through their
 * midpoints, which smooths the polygon without adding points. The idea
 * follows getSvgPathFromStroke from perfect-freehand (MIT, Steve Ruiz).
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { Vec2 } from '@wander/canvas-core';

/**
 * Closed, smoothed SkPath through `outline`. Each point is used as the
 * control point of a quad that ends at the midpoint to the next point.
 * Returns an empty path for an empty outline.
 */
export function outlineToSkPath(outline: readonly Vec2[]): SkPath {
  const builder = Skia.PathBuilder.Make();
  const n = outline.length;
  if (n === 0) return builder.detach();
  builder.moveTo(outline[0].x, outline[0].y);
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    builder.quadTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  builder.close();
  return builder.detach();
}
