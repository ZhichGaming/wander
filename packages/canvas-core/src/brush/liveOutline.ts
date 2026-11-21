/**
 * Wander — Zhich, Yu, Justin
 * Worklet entry points for drawing a stroke on the UI thread. Brush
 * objects cannot cross into a worklet runtime, so these switch on the
 * brush kind and call the same outline functions the Brush classes use;
 * live and committed ink therefore come from identical code.
 */

import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import { highlighterOutline } from './HighlighterBrush';
import { penOutline, penOutlineFrom } from './PenBrush';
import { pencilOpacity, pencilOutline } from './PencilBrush';

/** Outline of `points` drawn with `style`. Worklet. */
export function brushOutline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (style.brush === 'highlighter') return highlighterOutline(points, style, complete);
  if (style.brush === 'pencil') return pencilOutline(points, style, complete);
  return penOutline(points, style, complete);
}

/**
 * Outline of a live stroke segment: `points` without its first `skip`
 * points, which only give the brush context (the pen's speed filter), so a
 * segment starting mid-stroke matches the whole stroke there. Used to
 * freeze the finished part of a long live stroke and redraw only its tail.
 * `complete` is true once the contact has lifted. Worklet.
 */
export function brushOutlineFrom(
  points: readonly StrokePoint[],
  style: StrokeStyle,
  skip: number,
  complete: boolean,
): Vec2[] {
  'worklet';
  if (style.brush === 'highlighter') return highlighterOutline(points.slice(skip), style, complete);
  if (style.brush === 'pencil') return pencilOutline(points.slice(skip), style, complete);
  return penOutlineFrom(points, style, skip, complete);
}

/** Brush opacity multiplier for `points` (only the pencil varies). Worklet. */
export function brushOpacity(points: readonly StrokePoint[], style: StrokeStyle): number {
  'worklet';
  return style.brush === 'pencil' ? pencilOpacity(points) : 1;
}
