/**
 * Wander — Zhich, Yu, Justin
 * Adapter from Gesture Handler touch events to PointerSession raw events.
 *
 * Gesture Handler 3.3 reports the pointer type once per event, not per
 * touch, and sets it on iOS only when touches begin (from any one touch of
 * the UIEvent). So each touch's kind is remembered from the event it went
 * down in. If a pen and a finger land in the very same UIEvent the kind
 * may be wrong for one of them; the native Pencil module will remove that
 * limit. Touch events carry no pressure or tilt, so pressure falls back to
 * PointerSession's 0.5 default.
 */

import { PointerType, type GestureTouchEvent } from 'react-native-gesture-handler';
import type { PointerKind, PointerPhase, PointerSession } from '@wander/canvas-core';

/** Maps a Gesture Handler pointer type to an engine pointer kind. */
function kindOf(type: PointerType): PointerKind {
  if (type === PointerType.STYLUS) return 'pen';
  if (type === PointerType.MOUSE) return 'mouse';
  return 'touch';
}

/** Converts Gesture Handler touch events into PointerSession events. */
export class GestureTouchAdapter {
  private readonly session: PointerSession;
  private readonly kinds = new Map<number, PointerKind>();

  /** Creates an adapter that feeds `session`. */
  constructor(session: PointerSession) {
    this.session = session;
  }

  /** Touches went down: remember their kind and forward them. */
  down(e: GestureTouchEvent): void {
    for (const t of e.changedTouches) this.kinds.set(t.id, kindOf(e.pointerType));
    this.forward(e, 'down');
  }

  /** Touches moved. */
  move(e: GestureTouchEvent): void {
    this.forward(e, 'move');
  }

  /** Touches lifted. */
  up(e: GestureTouchEvent): void {
    try {
      this.forward(e, 'up');
    } finally {
      for (const t of e.changedTouches) this.kinds.delete(t.id);
    }
  }

  /** Touches were cancelled by the system. */
  cancel(e: GestureTouchEvent): void {
    try {
      this.forward(e, 'cancel');
    } finally {
      for (const t of e.changedTouches) this.kinds.delete(t.id);
    }
  }

  /** Sends every changed touch to the session with one shared timestamp. */
  private forward(e: GestureTouchEvent, phase: PointerPhase): void {
    const time = performance.now();
    for (const t of e.changedTouches) {
      const kind = this.kinds.get(t.id) ?? kindOf(e.pointerType);
      this.session.handle({ pointerId: t.id, kind, phase, x: t.x, y: t.y, time });
    }
  }
}
