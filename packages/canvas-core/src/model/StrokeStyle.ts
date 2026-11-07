/**
 * Wander — Zhich, Yu, Justin
 * Plain data describing one input sample and the look of a stroke.
 */

/** One input sample in world space. */
export interface StrokePoint {
  x: number;
  y: number;
  /** 0..1; 0.5 when the device reports none (finger, mouse). */
  pressure: number;
  /** Milliseconds since an arbitrary origin; used for velocity. */
  time: number;
  /** Pencil tilt in radians, if known. */
  tiltX?: number;
  tiltY?: number;
}

/** Which brush draws the stroke. Each kind maps to a Brush in the registry. */
export type BrushKind = 'pen' | 'highlighter' | 'pencil';

/** Visual properties of a stroke. */
export interface StrokeStyle {
  brush: BrushKind;
  /** CSS hex color, e.g. "#1e1e1e". */
  color: string;
  /** Base diameter in world units. */
  width: number;
  /** 0..1. */
  opacity: number;
}

/** Default pen style. */
export const DEFAULT_PEN_STYLE: Readonly<StrokeStyle> = Object.freeze({
  brush: 'pen',
  color: '#1e1e1e',
  width: 3,
  opacity: 1,
});

/** Default highlighter style. */
export const DEFAULT_HIGHLIGHTER_STYLE: Readonly<StrokeStyle> = Object.freeze({
  brush: 'highlighter',
  color: '#ffe14d',
  width: 18,
  opacity: 0.45,
});

/** Default pencil style: graphite grey; tilt the Pencil to shade. */
export const DEFAULT_PENCIL_STYLE: Readonly<StrokeStyle> = Object.freeze({
  brush: 'pencil',
  color: '#2b2b2b',
  width: 2.5,
  opacity: 0.9,
});
