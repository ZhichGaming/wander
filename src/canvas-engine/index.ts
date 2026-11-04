/**
 * Wander — Zhich, Yu, Justin
 * Canvas engine boundary. The engine (rendering, camera, strokes, tools,
 * undo, persistence) is treated as an internal library and will live
 * behind this module. Nothing outside src/canvas-engine imports its
 * internals directly.
 *
 * Placeholder: the real engine is not wired in yet.
 */

/** Public surface of the canvas engine. Filled in when the engine lands. */
export type CanvasEngine = Record<string, never>;
