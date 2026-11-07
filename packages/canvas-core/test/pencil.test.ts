/**
 * Wander — Zhich, Yu, Justin
 * Tests for the Apple Pencil path: raw events shaped like the native
 * PencilInputView's (pressure, tilt, coalesced and predicted samples) must
 * reach the committed stroke intact, and pressure must change ink width.
 */

import { describe, expect, it } from 'vitest';
import {
  CanvasEngine,
  PointerSession,
  Stroke,
  boundsOfPoints,
  DEFAULT_PEN_STYLE,
  PenBrush,
  type RawPointerEvent,
  type RawPointerSample,
} from '../src';

/** A pen sample at (x, y) with the given pressure and a fixed tilt. */
function sample(x: number, y: number, time: number, pressure: number): RawPointerSample {
  return { x, y, time, pressure, tiltX: 0.3, tiltY: -0.2 };
}

/** Draws a horizontal pen line through a session, two coalesced samples per event. */
function drawPenLine(session: PointerSession, pressure: number, y = 100): void {
  const down: RawPointerEvent = { ...sample(0, y, 0, pressure), pointerId: 7, kind: 'pen', phase: 'down' };
  session.handle(down);
  for (let i = 1; i <= 20; i++) {
    const a = sample(i * 10 - 5, y, i * 8 - 4, pressure);
    const b = sample(i * 10, y, i * 8, pressure);
    session.handle({
      ...b,
      pointerId: 7,
      kind: 'pen',
      phase: 'move',
      coalesced: [a, b],
      predicted: [sample(i * 10 + 40, y + 30, i * 8 + 16, pressure)],
    });
  }
  session.handle({ ...sample(200, y, 170, pressure), pointerId: 7, kind: 'pen', phase: 'up' });
}

/** The single stroke on the active layer. */
function onlyStroke(engine: CanvasEngine): Stroke {
  const items = engine.doc.activeLayer.items;
  expect(items).toHaveLength(1);
  return items[0] as Stroke;
}

describe('Apple Pencil input', () => {
  it('keeps pressure, tilt and every coalesced sample on the stroke', () => {
    const engine = new CanvasEngine();
    drawPenLine(new PointerSession(engine, 'auto'), 0.8);
    const stroke = onlyStroke(engine);
    // down + 2 coalesced per move x 20 (the up sample repeats the last one and is skipped).
    expect(stroke.points.length).toBe(41);
    for (const p of stroke.points) {
      expect(p.pressure).toBeCloseTo(0.8);
      expect(p.tiltX).toBeCloseTo(0.3);
      expect(p.tiltY).toBeCloseTo(-0.2);
    }
  });

  it('never commits predicted samples', () => {
    const engine = new CanvasEngine();
    drawPenLine(new PointerSession(engine, 'auto'), 0.8);
    const ys = onlyStroke(engine).points.map((p) => p.y);
    expect(Math.max(...ys)).toBe(100);
  });

  it('shows predicted samples in the overlay while drawing', () => {
    const engine = new CanvasEngine();
    const session = new PointerSession(engine, 'auto');
    session.handle({ ...sample(0, 0, 0, 0.5), pointerId: 1, kind: 'pen', phase: 'down' });
    session.handle({
      ...sample(10, 0, 8, 0.6),
      pointerId: 1,
      kind: 'pen',
      phase: 'move',
      predicted: [sample(20, 0, 16, 0.6)],
    });
    expect(engine.overlay.state.liveStroke?.predicted.map((p) => p.x)).toEqual([20]);
  });

  it('draws wider ink under harder pressure', () => {
    const width = (pressure: number) => {
      const engine = new CanvasEngine();
      drawPenLine(new PointerSession(engine, 'auto'), pressure);
      const b = boundsOfPoints(onlyStroke(engine).outline);
      return b.maxY - b.minY;
    };
    expect(width(0.9)).toBeGreaterThan(width(0.2) * 1.5);
  });

  it('round-trips tilt through save and load', () => {
    const engine = new CanvasEngine();
    drawPenLine(new PointerSession(engine, 'auto'), 0.7);
    const copy = new CanvasEngine();
    copy.load(JSON.parse(JSON.stringify(engine.save())));
    expect(onlyStroke(copy).points[3].tiltX).toBeCloseTo(0.3);
  });

  it('spreads light and firm writing at least 2x apart in width', () => {
    // Calibrated Pencil pressure: sqrt(force / 4.17) for force 0.3 (light) and 2.0 (firm).
    const width = (pressure: number) => {
      const pts = Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0, pressure, time: i * 16 }));
      const b = boundsOfPoints(new PenBrush().outline(pts, DEFAULT_PEN_STYLE, true));
      return b.maxY - b.minY;
    };
    expect(width(Math.sqrt(2 / 4.17)) / width(Math.sqrt(0.3 / 4.17))).toBeGreaterThan(2);
  });
});
