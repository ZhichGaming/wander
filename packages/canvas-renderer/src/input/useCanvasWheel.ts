/**
 * Wander — Zhich, Yu, Justin
 * Mouse wheel and trackpad zoom and pan on web. Gesture Handler 3.3 has no
 * gesture that reports wheel deltas with the ctrl key, so on web this
 * listens to the DOM "wheel" event on the canvas element (React Native Web
 * renders a View as a DOM element). Browsers report a trackpad pinch as a
 * wheel event with ctrlKey set, so that zooms too. Native platforms do
 * nothing here: they pan and zoom with touches.
 */

import { useEffect, type RefObject } from 'react';
import { Platform, type View } from 'react-native';
import type { CanvasEngine } from '@wander/canvas-core';
import { pointerSessionFor } from './pointerSessionFor';

/** Pixels per line when the browser reports wheel deltas in lines. */
const LINE_HEIGHT_PX = 16;

/** Attaches wheel zoom and pan to the view behind `ref` (web only). */
export function useCanvasWheel(engine: CanvasEngine, ref: RefObject<View | null>): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    const session = pointerSessionFor(engine);

    /** Converts one DOM wheel event into a PointerSession wheel call. */
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT_PX : 1;
      const rect = el.getBoundingClientRect();
      session.wheel({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
        zoom: e.ctrlKey,
      });
    };

    // passive: false so preventDefault stops the browser's own page zoom.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [engine, ref]);
}
