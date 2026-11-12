/**
 * Wander — Zhich, Yu, Justin
 * Low-latency input path for the native touch view (iOS development
 * builds). Native touch events are handled first on the UI thread, which
 * extends the live ink and redraws it in the same frame, and are then
 * forwarded to the JavaScript thread, where PointerSession and the tools
 * decide what is committed. Also keeps the UI thread's copy of the inputs
 * it needs (active pen style, stylus rules) up to date.
 */

import { PenTool, type CanvasEngine, type PointerSession, type StrokeStyle } from '@wander/canvas-core';
import type { NativePointerEvent } from '@wander/pencil-input';
import { useCallback, useEffect, useRef } from 'react';
import { useEvent, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { CameraState } from '@wander/canvas-core';
import { applyNativeEvents, type InkConfig, type InkState } from '../render/liveInk';

const owned = new WeakMap<CanvasEngine, Set<number>>();

/**
 * Keys of live strokes the UI thread started for `engine`. The overlay does
 * not mirror these from JavaScript; it only clears them on commit.
 */
export function uiOwnedInkKeys(engine: CanvasEngine): Set<number> {
  let set = owned.get(engine);
  if (!set) {
    set = new Set();
    owned.set(engine, set);
  }
  return set;
}

/** Style of the engine's tool when it draws ink on an editable layer, else null. */
function drawingStyle(engine: CanvasEngine): StrokeStyle | null {
  const layer = engine.doc.activeLayer;
  if (!(engine.tool instanceof PenTool) || layer.props.locked || !layer.props.visible) return null;
  return { ...engine.tool.getStyle() };
}

/** Writes the UI thread's input config whenever the tool, its style, the layer or the mode changes. */
export function useInkConfig(engine: CanvasEngine, session: PointerSession, config: SharedValue<InkConfig>): () => void {
  // Last published config, kept on the JS side: reading a shared value from
  // JavaScript would block on the UI thread.
  const last = useRef('');
  /** Recomputes the config and publishes it when it changed. */
  const sync = useCallback(() => {
    const next: InkConfig = { style: drawingStyle(engine), stylusRules: session.stylusRules };
    const key = JSON.stringify(next);
    if (key === last.current) return;
    last.current = key;
    config.value = next;
  }, [engine, session, config]);

  useEffect(() => {
    let offStyle = () => {};
    let offDoc = () => {};
    /** Follows the active tool's style changes. */
    const watchTool = () => {
      offStyle();
      offStyle = engine.tool instanceof PenTool ? engine.tool.styleChanged.on(sync) : () => {};
      sync();
    };
    /** Follows layer changes of the current document. */
    const watchDoc = () => {
      offDoc();
      offDoc = engine.doc.changed.on((c) => {
        if (c.kind === 'layers') sync();
      });
      sync();
    };
    watchTool();
    watchDoc();
    const offTool = engine.toolChanged.on(watchTool);
    const offReplaced = engine.documentReplaced.on(watchDoc);
    return () => {
      offStyle();
      offDoc();
      offTool();
      offReplaced();
    };
  }, [engine, sync]);

  return sync;
}

/**
 * Event handler for the native view's onInputSamples, running on the UI
 * thread: updates live ink immediately, then forwards the events to
 * PointerSession on the JavaScript thread.
 */
export function useLiveInkHandler(
  engine: CanvasEngine,
  session: PointerSession,
  ink: SharedValue<InkState>,
  config: SharedValue<InkConfig>,
  camera: SharedValue<CameraState>,
  syncConfig: () => void,
) {
  /** JavaScript side: records UI-owned strokes, then feeds the session. */
  const forward = useCallback(
    (events: NativePointerEvent[], started: number[]) => {
      const keys = uiOwnedInkKeys(engine);
      for (const k of started) keys.add(k);
      try {
        for (const e of events) session.handle(e);
      } finally {
        // Keep the UI-thread config in sync even if a commit throws; the
        // session has already released the contact in its own finally.
        syncConfig();
      }
    },
    [engine, session, syncConfig],
  );

  return useEvent<{ events: NativePointerEvent[] }>(
    (e) => {
      'worklet';
      let started: number[] = [];
      ink.modify((state) => {
        'worklet';
        started = applyNativeEvents(state, e.events, config.value, camera.value);
        return state;
      }, true);
      scheduleOnRN(forward, e.events, started);
    },
    ['onInputSamples'],
  );
}
