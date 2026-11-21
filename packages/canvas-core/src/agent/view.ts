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
  /** World rect the user currently has on screen, when known. */
  viewport?: Rect | null;
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
    ...(frame.viewport ? [describeViewport(rect, frame.viewport)] : []),
    describeObjects(doc, rect),
  ].join('\n');
}

/** Where the user's screen is relative to the view. */
function describeViewport(view: Rect, screen: Rect): string {
  const where = `x ${fmt(screen.minX)} to ${fmt(screen.maxX)}, y ${fmt(screen.minY)} to ${fmt(screen.maxY)}`;
  const inside = screen.minX <= view.minX && screen.minY <= view.minY && screen.maxX >= view.maxX && screen.maxY >= view.maxY;
  if (inside) return `The user's screen shows ${where}: all of this view is on it.`;
  const apart = screen.maxX < view.minX || screen.minX > view.maxX || screen.maxY < view.minY || screen.minY > view.maxY;
  if (apart) return `The user's screen shows ${where}: none of this view is on it.`;
  return `The user's screen shows ${where}, outlined in orange.`;
}

/**
 * One line per object in `rect`: id, kind, details and world bounds. The
 * strokes of a group (an agent's answer, see Stroke.group) share one line
 * with the bounds of the members in view, so an answer of a hundred pen
 * strokes does not fill the list.
 */
function describeObjects(doc: CanvasDocument, rect: Rect): string {
  const objects = doc.queryRect(rect);
  if (objects.length === 0) return 'No objects in this view.';
  const box = (b: Rect) => `bbox(${fmt(b.minX)}, ${fmt(b.minY)}, ${fmt(b.maxX)}, ${fmt(b.maxY)})`;
  const groups = new Map<string, { count: number; bounds: Rect; stroke: Stroke }>();
  for (const obj of objects) {
    if (!(obj instanceof Stroke) || obj.group === undefined) continue;
    const g = groups.get(obj.group);
    if (g) {
      g.count++;
      g.bounds = unionRect(g.bounds, obj.bounds);
    } else {
      groups.set(obj.group, { count: 1, bounds: obj.bounds, stroke: obj });
    }
  }
  const lines: string[] = [];
  const written = new Set<string>();
  for (const obj of objects) {
    if (obj instanceof Stroke && obj.group !== undefined) {
      if (written.has(obj.group)) continue;
      written.add(obj.group);
      const g = groups.get(obj.group)!;
      lines.push(`${obj.group} group of ${g.count} strokes ${g.stroke.style.brush} ${g.stroke.style.color} ${box(g.bounds)}`);
    } else if (obj instanceof Stroke) {
      lines.push(`${obj.id} stroke ${obj.style.brush} ${obj.style.color} ${box(obj.bounds)}`);
    } else if (obj instanceof PageObject) {
      lines.push(`${obj.id} page${obj.label ? ` "${obj.label}"` : ''} ${box(obj.bounds)}`);
    } else {
      lines.push(`${obj.id} ${obj.kind} ${box(obj.bounds)}`);
    }
  }
  const shown = lines.slice(0, MAX_LISTED);
  const more = lines.length - shown.length;
  return [
    'Objects in view (id, kind, bbox as minX, minY, maxX, maxY):',
    ...shown,
    ...(more > 0 ? [`and ${more} more`] : []),
  ].join('\n');
}

/** Number without float noise: whole when close to whole, else `digits` decimals. */
function fmt(n: number, digits = 1): string {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-6 ? String(r) : n.toFixed(digits);
}
