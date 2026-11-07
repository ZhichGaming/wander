/**
 * Wander — Zhich, Yu, Justin
 * Tool strategy interface and the input event every tool receives. The
 * input layer (Gesture Handler today, the native Pencil module later)
 * converts raw events into PointerInput in world space and hands them to
 * CanvasEngine, which forwards them to the active tool.
 */

import type { Camera } from '../Camera';
import type { History } from '../commands/History';
import type { CanvasDocument } from '../model/CanvasDocument';
import type { Overlay } from './Overlay';
import type { Selection } from './Selection';

/** Device that produced a pointer event. */
export type PointerKind = 'pen' | 'touch' | 'mouse';

/** One pointer sample, already converted to world space. */
export interface PointerInput {
  /** Identifies one contact for the duration of a gesture. */
  pointerId: number;
  kind: PointerKind;
  /** World coordinates. */
  x: number;
  y: number;
  /** 0..1; 0.5 when the device has no pressure. */
  pressure: number;
  /** Milliseconds, monotonic within a gesture. */
  time: number;
  tiltX?: number;
  tiltY?: number;
  /**
   * True while another finger is held on the screen. The lasso uses it to
   * add to the selection instead of replacing it.
   */
  additive: boolean;
}

/** Everything a tool may read or change. */
export interface ToolContext {
  readonly doc: CanvasDocument;
  readonly history: History;
  readonly camera: Camera;
  readonly selection: Selection;
  readonly overlay: Overlay;
}

/** Strategy for what a drag on the canvas does (draw, erase, lasso...). */
export interface Tool {
  /** Stable name for UI and debugging, e.g. "pen". */
  readonly name: string;
  /** A contact went down. */
  onDown(e: PointerInput, ctx: ToolContext): void;
  /**
   * The contact moved. `predicted` are optional look-ahead samples from the
   * device; tools may show them but must not commit them.
   */
  onMove(e: PointerInput, ctx: ToolContext, predicted?: readonly PointerInput[]): void;
  /** The contact lifted; commit the gesture. */
  onUp(e: PointerInput, ctx: ToolContext): void;
  /** The gesture was interrupted (palm, second finger, tool switch); discard it. */
  onCancel(ctx: ToolContext): void;
}
