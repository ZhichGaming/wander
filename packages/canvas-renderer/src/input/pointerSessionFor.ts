/**
 * Wander — Zhich, Yu, Justin
 * One PointerSession per engine, shared by every input source (touch
 * gesture, web wheel, and later the native Pencil module) so they all see
 * the same contacts and the same "a pen was seen" state.
 */

import { PointerSession, type CanvasEngine } from '@wander/canvas-core';

const sessions = new WeakMap<CanvasEngine, PointerSession>();

/** Returns the engine's PointerSession, creating it (mode "auto") on first use. */
export function pointerSessionFor(engine: CanvasEngine): PointerSession {
  let session = sessions.get(engine);
  if (!session) {
    session = new PointerSession(engine, 'auto');
    sessions.set(engine, session);
  }
  return session;
}
