/**
 * Wander — Zhich, Yu, Justin
 * Tests for Apple Pencil estimated-property corrections: "update" events
 * fix earlier samples of the stroke in progress, and a lift waits (up to
 * ESTIMATE_TIMEOUT_MS) for outstanding corrections before committing.
 */

import { describe, expect, it } from 'vitest';
import { CanvasEngine, ESTIMATE_TIMEOUT_MS, PointerSession, Stroke, type RawPointerEvent } from '../src';

/** Manually driven timer: run() fires every pending callback. */
class FakeTimer {
  private pending = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  /** SetTimer implementation for PointerSession. */
  readonly setTimer = (fn: () => void, ms: number): (() => void) => {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return () => this.pending.delete(id);
  };
  /** Number of timers not yet fired or cancelled. */
  get count(): number {
    return this.pending.size;
  }
  /** Delays of the pending timers. */
  get delays(): number[] {
    return [...this.pending.values()].map((t) => t.ms);
  }
  /** Fires every pending timer. */
  run(): void {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const t of all) t.fn();
  }
}

/** A pen event with pressure and an optional updateIndex. */
function pen(
  phase: RawPointerEvent['phase'],
  x: number,
  time: number,
  pressure: number,
  updateIndex?: number,
  pointerId = 1,
): RawPointerEvent {
  const e: RawPointerEvent = { phase, pointerId, kind: 'pen', x, y: 100, time, pressure, tiltX: 0.1, tiltY: 0.2 };
  if (updateIndex !== undefined) e.updateIndex = updateIndex;
  return e;
}

/** A correction for sample `updateIndex`. */
function update(updateIndex: number, x: number, pressure: number, final = true, pointerId = 1): RawPointerEvent {
  return { phase: 'update', pointerId, kind: 'pen', x, y: 100, time: 0, pressure, tiltX: 0.5, tiltY: -0.5, updateIndex, final };
}

/** Creates an engine and a pencil-only session using a fake timer. */
function setup(): { engine: CanvasEngine; session: PointerSession; timer: FakeTimer } {
  const engine = new CanvasEngine();
  const timer = new FakeTimer();
  const session = new PointerSession(engine, 'pencilOnly', { setTimer: timer.setTimer });
  return { engine, session, timer };
}

/** Committed strokes on the active layer. */
function strokes(engine: CanvasEngine): Stroke[] {
  return engine.doc.activeLayer.items.filter((o): o is Stroke => o instanceof Stroke);
}

/** Draws a three-sample pen line whose samples have update indices 10, 11, 12. */
function drawEstimated(session: PointerSession, pointerId = 1, x0 = 0): void {
  session.handle(pen('down', x0, 0, 0.2, 10, pointerId));
  session.handle(pen('move', x0 + 10, 8, 0.2, 11, pointerId));
  session.handle(pen('up', x0 + 20, 16, 0.2, 12, pointerId));
}

describe('Estimated property corrections', () => {
  it('applies corrected pressure, tilt and position to the committed stroke', () => {
    const { engine, session } = setup();
    drawEstimated(session);
    session.handle(update(10, 1, 0.9));
    session.handle(update(11, 11, 0.8));
    expect(strokes(engine)).toHaveLength(0);
    session.handle(update(12, 21, 0.7));
    const [s] = strokes(engine);
    expect(s.points.map((p) => p.pressure)).toEqual([0.9, 0.8, 0.7]);
    expect(s.points.map((p) => p.x)).toEqual([1, 11, 21]);
    expect(s.points[1].tiltX).toBe(0.5);
    expect(s.points[1].tiltY).toBe(-0.5);
  });

  it('defers the lift until the final update arrives', () => {
    const { engine, session, timer } = setup();
    drawEstimated(session);
    expect(timer.delays).toEqual([ESTIMATE_TIMEOUT_MS]);
    session.handle(update(10, 0, 0.9));
    session.handle(update(11, 10, 0.9));
    session.handle(update(12, 20, 0.6, false));
    expect(strokes(engine)).toHaveLength(0);
    session.handle(update(12, 20, 0.5, true));
    expect(strokes(engine)).toHaveLength(1);
    expect(strokes(engine)[0].points[2].pressure).toBe(0.5);
    expect(timer.count).toBe(0);
  });

  it('commits after the timeout when updates never come', () => {
    const { engine, session, timer } = setup();
    drawEstimated(session);
    expect(strokes(engine)).toHaveLength(0);
    timer.run();
    const [s] = strokes(engine);
    expect(s.points.map((p) => p.pressure)).toEqual([0.2, 0.2, 0.2]);
    // A late correction after the commit changes nothing.
    session.handle(update(10, 0, 0.9));
    expect(strokes(engine)[0].points[0].pressure).toBe(0.2);
  });

  it('ignores updates for unknown indices', () => {
    const { engine, session } = setup();
    session.handle(pen('down', 0, 0, 0.2, 10));
    session.handle(pen('move', 10, 8, 0.2, 11));
    session.handle(update(99, 500, 1));
    session.handle(update(10, 0, 0.9));
    session.handle(update(11, 10, 0.9));
    session.handle(pen('up', 20, 16, 0.2));
    const [s] = strokes(engine);
    expect(s.points.map((p) => p.x)).toEqual([0, 10, 20]);
    expect(s.points.map((p) => p.pressure)).toEqual([0.9, 0.9, 0.2]);
  });

  it('commits immediately when nothing is outstanding', () => {
    const { engine, session, timer } = setup();
    session.handle(pen('down', 0, 0, 0.4));
    session.handle(pen('move', 10, 8, 0.4));
    session.handle(pen('up', 20, 16, 0.4));
    expect(strokes(engine)).toHaveLength(1);
    expect(timer.count).toBe(0);
  });

  it('flushes a deferred stroke when a new stroke starts', () => {
    const { engine, session, timer } = setup();
    drawEstimated(session, 1, 0);
    session.handle(update(10, 0, 0.9));
    session.handle(pen('down', 100, 40, 0.3, undefined, 2));
    expect(strokes(engine)).toHaveLength(1);
    expect(strokes(engine)[0].points[0].pressure).toBe(0.9);
    expect(timer.count).toBe(0);
    session.handle(pen('move', 110, 48, 0.3, undefined, 2));
    session.handle(pen('up', 120, 56, 0.3, undefined, 2));
    expect(strokes(engine)).toHaveLength(2);
    expect(strokes(engine)[1].points[0].x).toBe(100);
  });

  it('commits a waiting stroke before an undo or tool switch instead of dropping it', () => {
    const { engine, session } = setup();
    drawEstimated(session);
    drawEstimated(session, 2, 100);
    expect(strokes(engine)).toHaveLength(1);
    engine.undo();
    // The second stroke was committed first, then that commit was undone.
    expect(strokes(engine)).toHaveLength(1);
    engine.redo();
    expect(strokes(engine)).toHaveLength(2);
  });
});
