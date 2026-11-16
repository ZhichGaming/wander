/**
 * Wander — Zhich, Yu, Justin
 * What an AI agent is told about a view of the canvas. A view is a world
 * rect shown as an image with labeled grid lines; these helpers pick that
 * rect and the grid step, and write the text that goes with the image:
 * which rect it is, how image pixels map to world units, and the objects
 * inside with their bounds. Everything is in world units, so a position
 * the model reads off the image can go straight into a tool call.
 * The image itself is drawn by the renderer (renderAgentView).
 */

import { emptyRect, inflateRect, isEmptyRect, unionRect, type Rect } from '../math/geometry';
import type { CanvasDocument } from '../model/CanvasDocument';
import { PageObject } from '../model/PageObject';
import { Stroke } from '../model/Stroke';

/** A view is never narrower than this, in world units, so tiny rects aren't blown up. */
export const VIEW_MIN_SPAN = 128;
/** About this many labeled grid lines across the longer side of a view. */
export const VIEW_GRID_LINES = 8;
/** Objects listed per view; the rest are counted. */
const MAX_LISTED = 150;

/** How a view's image maps to the world, as rendered. */
export interface ViewFrame {
  /** World rect the image covers. */
  rect: Rect;
  /** Image pixels per world unit. */
  scale: number;
  /** Image size in pixels. */
  width: number;
  height: number;
  /** World distance between labeled grid lines. */
  gridStep: number;
}

/** Bounds of every object on visible layers plus a 5% margin, or null when there are none. */
export function contentBounds(doc: CanvasDocument): Rect | null {
  let r = emptyRect();
  for (const layer of doc.layers) {
    if (!layer.props.visible) continue;
    for (const obj of layer.items) r = unionRect(r, obj.bounds);
  }
  if (isEmptyRect(r)) return null;
  return inflateRect(r, 0.05 * Math.max(r.maxX - r.minX, r.maxY - r.minY, VIEW_MIN_SPAN));
}

/** `rect` with its corners in order, widened around its center to at least `minSpan` each way. */
export function viewRect(rect: Rect, minSpan = VIEW_MIN_SPAN): Rect {
  const minX = Math.min(rect.minX, rect.maxX);
  const maxX = Math.max(rect.minX, rect.maxX);
  const minY = Math.min(rect.minY, rect.maxY);
  const maxY = Math.max(rect.minY, rect.maxY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hw = Math.max(maxX - minX, minSpan) / 2;
  const hh = Math.max(maxY - minY, minSpan) / 2;
  return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
}

/**
 * Labeled grid step for `rect`, about `lines` lines across its longer
 * side. With a paper `spacing` it is that spacing doubled until wide
 * enough, the same thinning the background uses, so every labeled line is
 * also a paper line. On blank paper (spacing 0) it is a round 1, 2, 2.5 or
 * 5 times a power of ten.
 */
export function gridStepFor(rect: Rect, spacing: number, lines = VIEW_GRID_LINES): number {
  const raw = Math.max(rect.maxX - rect.minX, rect.maxY - rect.minY) / lines;
  if (spacing > 0) {
    let step = spacing;
    while (step < raw) step *= 2;
    return step;
  }
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** The text that goes with a view's image: the frame, the grid and the objects in view. */
export function describeView(doc: CanvasDocument, frame: ViewFrame): string {
  const { rect, scale, width, height, gridStep } = frame;
  const spacing = doc.background.spacing;
  const onPaper =
    spacing > 0 ? ` (${fmt(gridStep / spacing)} squares of the paper grid, which is ${fmt(spacing)} units)` : '';
  return [
    `View x ${fmt(rect.minX)} to ${fmt(rect.maxX)}, y ${fmt(rect.minY)} to ${fmt(rect.maxY)} (canvas units).`,
    `Image ${width}x${height} px, 1 px = ${fmt(1 / scale, 2)} units. ` +
      `Blue lines every ${fmt(gridStep)} units${onPaper}, labeled with their canvas coordinate. y grows downward.`,
    describeObjects(doc, rect),
  ].join('\n');
}

/** One line per object in `rect`: id, kind, details and world bounds. */
function describeObjects(doc: CanvasDocument, rect: Rect): string {
  const objects = doc.queryRect(rect);
  if (objects.length === 0) return 'No objects in this view.';
  const lines = objects.slice(0, MAX_LISTED).map((obj) => {
    const b = obj.bounds;
    const box = `bbox(${fmt(b.minX)}, ${fmt(b.minY)}, ${fmt(b.maxX)}, ${fmt(b.maxY)})`;
    if (obj instanceof Stroke) return `${obj.id} stroke ${obj.style.brush} ${obj.style.color} ${box}`;
    if (obj instanceof PageObject) return `${obj.id} page${obj.label ? ` "${obj.label}"` : ''} ${box}`;
    return `${obj.id} ${obj.kind} ${box}`;
  });
  const more = objects.length - lines.length;
  return [
    'Objects in view (id, kind, bbox as minX, minY, maxX, maxY):',
    ...lines,
    ...(more > 0 ? [`and ${more} more`] : []),
  ].join('\n');
}

/** Number without float noise: whole when close to whole, else `digits` decimals. */
function fmt(n: number, digits = 1): string {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-6 ? String(r) : n.toFixed(digits);
}
