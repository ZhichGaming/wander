/**
 * Wander — Zhich, Yu, Justin
 * Tests that ink does not depend on the device's sample rate: the same
 * hand movement captured at 60 Hz and at 240 Hz must give the same width,
 * and slow hand jitter must not make the outline lumpier at 240 Hz.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_PEN_STYLE, PenBrush, boundsOfPoints, type StrokePoint, type Vec2 } from '../src';

/** Samples a slow wavy line (with a little hand jitter) at `hz` for `ms`. */
function capture(hz: number, ms: number, pressure: number): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let t = 0; t <= ms; t += 1000 / hz) {
    const jitter = Math.sin(t * 0.9) * 0.15;
    pts.push({ x: t * 0.08, y: 20 * Math.sin(t / 300) + jitter, pressure, time: t });
  }
  return pts;
}

/** Average stroke width: outline area divided by centre-line length. */
function meanWidth(outline: Vec2[], pts: StrokePoint[]): number {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    area += a.x * b.y - b.x * a.y;
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return Math.abs(area) / 2 / length;
}

describe('sample-rate independence', () => {
  const pen = new PenBrush();

  for (const [label, pressure] of [
    ['finger', 0.5],
    ['stylus', 0.7],
  ] as const) {
    it(`gives the same width at 60 Hz and 240 Hz (${label})`, () => {
      const slow60 = capture(60, 2000, pressure);
      const slow240 = capture(240, 2000, pressure);
      const w60 = meanWidth(pen.outline(slow60, DEFAULT_PEN_STYLE, true), slow60);
      const w240 = meanWidth(pen.outline(slow240, DEFAULT_PEN_STYLE, true), slow240);
      expect(Math.abs(w60 - w240) / w60).toBeLessThan(0.1);
    });
  }

  it('keeps the outline the same size at both rates', () => {
    const a = boundsOfPoints(pen.outline(capture(60, 2000, 0.7), DEFAULT_PEN_STYLE, true));
    const b = boundsOfPoints(pen.outline(capture(240, 2000, 0.7), DEFAULT_PEN_STYLE, true));
    expect(Math.abs(a.maxY - a.minY - (b.maxY - b.minY))).toBeLessThan(0.5);
  });
});
