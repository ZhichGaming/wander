/**
 * Wander — Zhich, Yu, Justin
 * Gesture Handler binding: turns touches, Pencil and mouse events into
 * engine pointer events (draw) or camera moves (pan, pinch zoom, wheel).
 *
 * STUB: replaced by the input implementation.
 */

import type { CanvasEngine, InputMode } from '@wander/canvas-core';

/** Options for the canvas gesture. */
export interface CanvasGestureOptions {
  mode: InputMode;
}

/** Returns the composed gesture to attach to the canvas with GestureDetector. */
export function useCanvasGesture(_engine: CanvasEngine, _opts: CanvasGestureOptions): unknown {
  return null;
}
