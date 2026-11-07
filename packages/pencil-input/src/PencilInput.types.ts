/**
 * Wander — Zhich, Yu, Justin
 * Event shapes emitted by the native PencilInputView. They mirror
 * RawPointerEvent in @wander/canvas-core structurally, so the canvas can
 * hand them straight to PointerSession without this package depending on
 * the engine.
 */

import type { StyleProp, ViewStyle } from 'react-native';

/** One sample in view points. */
export interface NativePointerSample {
  x: number;
  y: number;
  /** Milliseconds (UITouch timestamp), monotonic. */
  time: number;
  /** 0..1, Apple Pencil only. */
  pressure?: number;
  /** Lean towards +x and +y in radians, Apple Pencil only. */
  tiltX?: number;
  tiltY?: number;
}

/** One contact's event, with optional high-rate and predicted samples. */
export interface NativePointerEvent extends NativePointerSample {
  pointerId: number;
  kind: 'pen' | 'touch' | 'mouse';
  phase: 'down' | 'move' | 'up' | 'cancel';
  /** Samples since the previous event, oldest first, ending with this one. */
  coalesced?: NativePointerSample[];
  /** UIKit's look-ahead samples; display only. */
  predicted?: NativePointerSample[];
}

/** Props of PencilInputView. */
export interface PencilInputViewProps {
  /** Called once per UIKit touch callback with every changed contact. */
  onPointerEvents: (events: NativePointerEvent[]) => void;
  style?: StyleProp<ViewStyle>;
}
