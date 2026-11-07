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
import { penOutline } from './PenBrush';
import { pencilOpacity, pencilOutline } from './PencilBrush';

/** Outline of `points` drawn with `style`. Worklet. */
export function brushOutline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (style.brush === 'highlighter') return highlighterOutline(points, style, complete);
  if (style.brush === 'pencil') return pencilOutline(points, style, complete);
  return penOutline(points, style, complete);
}

/** Brush opacity multiplier for `points` (only the pencil varies). Worklet. */
export function brushOpacity(points: readonly StrokePoint[], style: StrokeStyle): number {
  'worklet';
  return style.brush === 'pencil' ? pencilOpacity(points) : 1;
}
