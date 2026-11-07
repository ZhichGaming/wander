/**
 * Wander — Zhich, Yu, Justin
 * Geometry of the infinite paper pattern. Only the lines or dots inside
 * the view are generated, in screen space, so they stay one pixel wide
 * and crisp at every zoom. Runs as a worklet on the UI thread, recomputed
 * whenever the camera shared value changes.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { BackgroundPattern, CameraState } from '@wander/canvas-core';

/** Lines closer than this many screen pixels are thinned out. */
const MIN_LINE_GAP_PX = 6;
/** Dots closer than this many screen pixels are thinned out. */
const MIN_DOT_GAP_PX = 12;

/**
 * World spacing actually drawn: `spacing` doubled until it is at least
 * `minGapPx` on screen, so it is always a multiple of the paper spacing.
 */
export function visibleSpacing(spacing: number, scale: number, minGapPx: number): number {
  'worklet';
  let step = spacing;
  while (step * scale < minGapPx) step *= 2;
  return step;
}

/**
 * Screen-space path of the pattern for a view of `width` x `height`.
 * Grid and ruled lines are hairlines (stroke with width 1); dots are
 * zero-length segments meant to be stroked with a round cap.
 */
export function backgroundPath(
  pattern: BackgroundPattern,
  spacing: number,
  cam: CameraState,
  width: number,
  height: number,
): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  if (pattern === 'blank' || spacing <= 0 || width <= 0 || height <= 0) return builder.detach();
  const step = visibleSpacing(spacing, cam.scale, pattern === 'dots' ? MIN_DOT_GAP_PX : MIN_LINE_GAP_PX);
  const firstCol = Math.ceil(cam.x / step);
  const lastCol = Math.floor((cam.x + width / cam.scale) / step);
  const firstRow = Math.ceil(cam.y / step);
  const lastRow = Math.floor((cam.y + height / cam.scale) / step);
  // Snap hairlines to pixel centres so they render one pixel wide.
  const sx = (col: number) => Math.round((col * step - cam.x) * cam.scale) + 0.5;
  const sy = (row: number) => Math.round((row * step - cam.y) * cam.scale) + 0.5;
  if (pattern === 'grid') {
    for (let c = firstCol; c <= lastCol; c++) builder.moveTo(sx(c), 0).lineTo(sx(c), height);
  }
  if (pattern === 'grid' || pattern === 'lines') {
    for (let r = firstRow; r <= lastRow; r++) builder.moveTo(0, sy(r)).lineTo(width, sy(r));
  }
  if (pattern === 'dots') {
    for (let r = firstRow; r <= lastRow; r++) {
      for (let c = firstCol; c <= lastCol; c++) builder.moveTo(sx(c), sy(r)).lineTo(sx(c), sy(r));
    }
  }
  return builder.detach();
}
