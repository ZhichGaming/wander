/**
 * Wander — Zhich, Yu, Justin
 * Highlighter brush: flat, constant width, multiplied onto ink beneath it
 * and drawn in an earlier pass so pen ink stays crisp on top. Opacity comes
 * from the stroke style and is applied by the renderer.
 */

import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush } from './Brush';
import { dotOutline, isSinglePoint } from './outlinePath';

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

  /** Constant-width outline with flat ends; pressure is ignored. */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    if (points.length === 0) return [];
    if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
    const options: StrokeOptions = {
      size: style.width,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: false,
      start: { cap: false },
      end: { cap: false },
      last: complete,
    };
    const input = points.map((p) => ({ x: p.x, y: p.y }));
    return getStroke(input, options).map(([x, y]) => ({ x, y }));
  }
}
