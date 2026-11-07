/**
 * Wander — Zhich, Yu, Justin
 * Public surface of @wander/canvas-renderer: the CanvasView component and
 * the input hook, plus a re-export of the whole core so the app needs one
 * import path.
 */

export * from '@wander/canvas-core';
export { useCanvasGesture, type CanvasGestureOptions } from './input/useCanvasGesture';
