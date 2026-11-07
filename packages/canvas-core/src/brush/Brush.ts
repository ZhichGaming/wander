/**
 * Wander — Zhich, Yu, Justin
 * Brush strategy interface. A brush turns raw input points into a filled
 * outline polygon (never a stroked path) and says how it is composited.
 */

import type { Vec2 } from '../math/geometry';
import type { BrushKind, StrokePoint, StrokeStyle } from '../model/StrokeStyle';

/** How a brush's strokes are blended onto what is beneath them. */
export type BlendMode = 'normal' | 'multiply';

/** Surface the renderer paints inside the outline: flat color or pencil grain. */
export type BrushTexture = 'none' | 'graphite';

/** Strategy that defines how one kind of stroke looks. */
export interface Brush {
  /** Kind this brush draws; matches StrokeStyle.brush. */
  readonly kind: BrushKind;
  /**
   * Draw pass within a layer: lower passes are drawn first. Highlighter is 0
   * so it always sits behind pen ink of the same layer.
   */
  readonly pass: number;
  /** Blend mode the renderer uses for this brush. */
  readonly blendMode: BlendMode;
  /** Texture the renderer paints inside the outline. */
  readonly texture: BrushTexture;
  /**
   * Opacity multiplier for a stroke with these points, applied on top of
   * style.opacity (the pencil draws lighter when shading with its side).
   */
  opacity(points: readonly StrokePoint[], style: StrokeStyle): number;
  /**
   * Filled outline polygon in world space for the given points.
   * `complete` is false while the stroke is still being drawn.
   */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[];
}
