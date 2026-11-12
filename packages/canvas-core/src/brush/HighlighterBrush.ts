/**
 * Wander — Zhich, Yu, Justin
 * Highlighter brush: flat, constant width, multiplied onto ink beneath it
 * and drawn in an earlier pass so pen ink stays crisp on top. Opacity comes
 * from the stroke style and is applied by the renderer. The outline is a
 * worklet function so the live stroke can be drawn on the UI thread.
 */

import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush, FreehandCall } from './Brush';
import { freehandOutline } from './freehand';
import { dotOutline, isSinglePoint } from './outlinePath';

/**
 * Samples and options the highlighter hands to freehandOutline. JavaScript
 * only (Stroke.toBaked); the live outline inlines the same call. See penFreehand.
 */
function highlighterFreehand(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): FreehandCall {
  return {
    input: points.map((p) => ({ x: p.x, y: p.y, pressure: 0.5 })),
    options: {
      size: style.width,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.5,
      capStart: false,
      capEnd: false,
      last: complete,
    },
  };
}

/** Constant-width outline with flat ends; pressure is ignored. Worklet. */
export function highlighterOutline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (points.length === 0) return [];
  if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
  const input = points.map((p) => ({ x: p.x, y: p.y, pressure: 0.5 }));
  return freehandOutline(input, {
    size: style.width,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.5,
    capStart: false,
    capEnd: false,
    last: complete,
  });
}

/** Flat translucent highlighter. */
export class HighlighterBrush implements Brush {
  readonly kind = 'highlighter' as const;
  readonly pass = 0;
  readonly blendMode = 'multiply' as const;
  readonly texture = 'none' as const;

  /** Full opacity: speed and pressure change width, not darkness. */
  opacity(): number {
    return 1;
  }

  /** Constant-width outline with flat ends (see highlighterOutline). */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    return highlighterOutline(points, style, complete);
  }

  /** The freehand call behind a finished highlighter stroke; null for a tap. */
  freehand(points: readonly StrokePoint[], style: StrokeStyle): FreehandCall | null {
    return points.length === 0 || isSinglePoint(points) ? null : highlighterFreehand(points, style, true);
  }
}
