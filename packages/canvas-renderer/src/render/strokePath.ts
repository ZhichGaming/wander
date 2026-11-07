/**
 * Wander — Zhich, Yu, Justin
 * Converts a brush outline polygon (world-space points) into a Skia path.
 * Neighbouring points are joined with quadratic curves through their
 * midpoints, which smooths the polygon without adding points. The idea
 * follows getSvgPathFromStroke from perfect-freehand (MIT, Steve Ruiz).
 * Worklet functions, so the UI thread can build the live stroke's path.
 */

import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';
import type { Vec2 } from '@wander/canvas-core';

/** Appends one closed, smoothed contour through `outline` to `builder`. Worklet. */
function addOutline(builder: SkPathBuilder, outline: readonly Vec2[]): void {
  'worklet';
  const n = outline.length;
  if (n === 0) return;
  builder.moveTo(outline[0].x, outline[0].y);
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    builder.quadTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  builder.close();
}

/**
 * Closed, smoothed SkPath through `outline`. Each point is used as the
 * control point of a quad that ends at the midpoint to the next point.
 * Returns an empty path for an empty outline. Worklet.
 */
export function outlineToSkPath(outline: readonly Vec2[]): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  addOutline(builder, outline);
  return builder.detach();
}

/** One path holding a closed contour per outline. Worklet. */
export function outlinesToSkPath(outlines: readonly (readonly Vec2[])[]): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  for (const o of outlines) addOutline(builder, o);
  return builder.detach();
}
