/**
 * Wander — Zhich, Yu, Justin
 * Gesture Handler binding: turns touches, Pencil and mouse events into
 * engine pointer events (draw) or camera moves (pan, pinch zoom, wheel).
 *
 * All decisions live in PointerSession (canvas-core); this file only wires
 * Gesture Handler 3.3's hook API to it. One manual gesture receives every
 * raw touch, and its callbacks run on the JS thread (runOnJS) because the
 * engine lives there. The future native Swift Pencil module (240 Hz
 * coalesced and predicted samples) will call the same PointerSession
 * directly through pointerSessionFor(engine), bypassing this hook for pen
 * input.
 */

import { useEffect, useMemo } from 'react';
import {
  GestureStateManager,
  MouseButton,
  useManualGesture,
  type ManualGesture,
} from 'react-native-gesture-handler';
import type { CanvasEngine, InputMode } from '@wander/canvas-core';
import { GestureTouchAdapter } from './GestureTouchAdapter';
import { pointerSessionFor } from './pointerSessionFor';

/** Options for the canvas gesture. */
export interface CanvasGestureOptions {
  mode: InputMode;
}

/**
 * Returns the gesture to attach to the canvas with GestureDetector. The
 * PointerSession is shared per engine, so a new engine gets a new session.
 */
export function useCanvasGesture(engine: CanvasEngine, opts: CanvasGestureOptions): ManualGesture {
  const session = pointerSessionFor(engine);
  const adapter = useMemo(() => new GestureTouchAdapter(session), [session]);

  useEffect(() => {
    session.setMode(opts.mode);
  }, [session, opts.mode]);

  // Drop half-finished strokes when the view unmounts or the engine changes.
  useEffect(() => () => session.cancelAll(), [session]);

  return useManualGesture({
    runOnJS: true,
    mouseButton: MouseButton.LEFT,
    onTouchesDown: (e) => {
      // Activate so this gesture owns the touches (blocks parent scrolls).
      GestureStateManager.activate(e.handlerTag);
      adapter.down(e);
    },
    onTouchesMove: (e) => adapter.move(e),
    onTouchesUp: (e) => adapter.up(e),
    onTouchesCancel: (e) => adapter.cancel(e),
  });
}
