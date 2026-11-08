/**
 * Wander — Zhich, Yu, Justin
 * Gesture Handler binding: turns touches, Pencil and mouse events into
 * engine pointer events (draw) or camera moves (pan, pinch zoom, wheel).
 *
 * All decisions live in PointerSession (canvas-core); this file only wires
 * Gesture Handler 3.3's hook API to it. One manual gesture receives every
 * raw touch on the UI thread and forwards it to the JS thread, where the
 * engine lives. This is the input path on web, Android and Expo Go; iOS
 * development builds use the native Pencil view instead, which feeds the
 * same PointerSession through pointerSessionFor(engine).
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  GestureStateManager,
  MouseButton,
  useManualGesture,
  type GestureTouchEvent,
  type ManualGesture,
} from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import type { CanvasEngine, InputMode } from '@wander/canvas-core';
import { GestureTouchAdapter } from './GestureTouchAdapter';
import { pointerSessionFor } from './pointerSessionFor';

/** The touch callbacks the adapter handles. */
type TouchPhase = 'down' | 'move' | 'up' | 'cancel';

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

  /** JavaScript side: hands one touch event to the adapter. */
  const forward = useCallback((phase: TouchPhase, e: GestureTouchEvent) => adapter[phase](e), [adapter]);
  // On web the callbacks already run on the JavaScript thread; calling the
  // adapter directly keeps touches ordered with taps on other elements.
  const send = useMemo(
    () =>
      Platform.OS === 'web'
        ? forward
        : (phase: TouchPhase, e: GestureTouchEvent) => {
            'worklet';
            scheduleOnRN(forward, phase, e);
          },
    [forward],
  );

  // On iOS and Android the callbacks run on the UI thread so the gesture's
  // state changes take effect at once; touches are then forwarded to the
  // JavaScript thread. The gesture must end as soon as the last touch is gone: while it stays
  // active, Gesture Handler cancels React Native's touches, so buttons
  // outside the canvas would ignore taps. The lift is forwarded before the
  // gesture ends, because ending it with a touch still down reports that
  // touch as cancelled (on web), which would drop the stroke.
  return useManualGesture({
    mouseButton: MouseButton.LEFT,
    onTouchesDown: (e) => {
      'worklet';
      // Activate so this gesture owns the touches (blocks parent scrolls).
      GestureStateManager.activate(e.handlerTag);
      send('down', e);
    },
    onTouchesMove: (e) => {
      'worklet';
      send('move', e);
    },
    onTouchesUp: (e) => {
      'worklet';
      send('up', e);
      if (e.numberOfTouches === 0) GestureStateManager.deactivate(e.handlerTag);
    },
    onTouchesCancel: (e) => {
      'worklet';
      send('cancel', e);
      if (e.numberOfTouches === 0) GestureStateManager.deactivate(e.handlerTag);
    },
  });
}
