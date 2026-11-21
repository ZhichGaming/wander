/**
 * Wander — Zhich, Yu, Justin
 * Tests for drawing a long live stroke in segments (brushOutlineFrom):
 * segments must match the whole stroke where they join, and the work per
 * frame must not grow with the stroke.
 */

import { describe, expect, it } from 'vitest';
import {
  brushOutline,
  brushOutlineFrom,
  DEFAULT_HIGHLIGHTER_STYLE,
  DEFAULT_PEN_STYLE,
  DEFAULT_PENCIL_STYLE,
  type StrokePoint,
  type StrokeStyle,
  type Vec2,
} from '../src';
import { pointInPolygon } from '../src/math/polygon';

// The scheme the renderer uses (liveInk.ts).
const BLOCK = 120;
const WARM_UP = 48;
const OVERLAP = 8;

/** A mostly horizontal stroke at 240 Hz whose speed and pressure keep changing. */
function longStroke(n: number): StrokePoint[] {
  const pts: StrokePoint[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    x += 1.2 + 0.9 * Math.sin(i / 37);
    pts.push({
      x,
      y: 6 * Math.sin(i / 55),
      pressure: 0.45 + 0.25 * Math.sin(i / 23),
      time: (i * 1000) / 240,
      tiltX: 0.3,
      tiltY: 0.2,
    });
  }
  return pts;
}

/** Outlines of `points` cut into frozen blocks plus a live tail from `frozenTo`. */
function segments(points: StrokePoint[], style: StrokeStyle, blocks: number): Vec2[][] {
  const out: Vec2[][] = [];
  const startOf = (from: number) => Math.max(0, from - WARM_UP);
  for (let b = 0; b < blocks; b++) {
    const from = b * BLOCK;
    const start = startOf(from);
    out.push(brushOutlineFrom(points.slice(start, from + BLOCK + OVERLAP), style, from - start, false));
  }
  const from = blocks * BLOCK;
  const start = startOf(from);
  out.push(brushOutlineFrom(points.slice(start), style, from - start, false));
  return out;
}

/** Top and bottom of the ink on the vertical line at `x`: the y range covered by any outline. */
function extentAt(outlines: Vec2[][], x: number, around: number): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = around - 40; y <= around + 40; y += 0.05) {
    if (!outlines.some((o) => pointInPolygon({ x, y }, o))) continue;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

describe('brushOutlineFrom', () => {
  const styles: [string, StrokeStyle][] = [
    ['pen', DEFAULT_PEN_STYLE],
    ['pencil', DEFAULT_PENCIL_STYLE],
    ['highlighter', DEFAULT_HIGHLIGHTER_STYLE],
  ];

  it.each(styles)('%s: segments cover the same ink as the whole stroke, joins included', (_name, style) => {
    const points = longStroke(700);
    const whole = [brushOutline(points, style, false)];
    const parts = segments(points, style, 4);
    // Sample along the stroke, densely around every join.
    const at: number[] = [];
    for (let i = 20; i < points.length - 20; i += 11) at.push(i);
    for (let b = 1; b <= 4; b++) for (let d = -10; d <= 10; d += 2) at.push(b * BLOCK + d);
    let worst = 0;
    for (const i of at) {
      const a = extentAt(whole, points[i].x, points[i].y);
      const c = extentAt(parts, points[i].x, points[i].y);
      worst = Math.max(worst, Math.abs(a.top - c.top), Math.abs(a.bottom - c.bottom));
    }
    // Within a third of a unit everywhere: no bump or notch where segments meet.
    expect(worst).toBeLessThan(0.35);
  });

  it('gives a fast pen stroke the right width at a segment start, unlike a cold start', () => {
    // 4 units per sample at 240 Hz is fast enough for speed to thin the line.
    const points: StrokePoint[] = Array.from({ length: 400 }, (_, i) => ({
      x: i * 4,
      y: 0,
      pressure: 0.6,
      time: (i * 1000) / 240,
    }));
    const whole = [brushOutline(points, DEFAULT_PEN_STYLE, false)];
    const x = points[206].x;
    const width = (o: Vec2[][]) => {
      const e = extentAt(o, x, 0);
      return e.bottom - e.top;
    };
    const warm = [brushOutlineFrom(points.slice(200 - WARM_UP), DEFAULT_PEN_STYLE, WARM_UP, false)];
    const cold = [brushOutline(points.slice(200), DEFAULT_PEN_STYLE, false)];
    expect(Math.abs(width(warm) - width(whole))).toBeLessThan(0.15);
    // Without the warm-up the speed filter starts at rest and the line comes out too wide.
    expect(width(cold) - width(whole)).toBeGreaterThan(0.2);
  });

  it('with skip 0 is the same as the ordinary live outline', () => {
    const points = longStroke(150);
    expect(brushOutlineFrom(points, DEFAULT_PEN_STYLE, 0, false)).toEqual(brushOutline(points, DEFAULT_PEN_STYLE, false));
  });

  it('draws a complete tail exactly like the end of the complete stroke', () => {
    const points = longStroke(400);
    const whole = [brushOutline(points, DEFAULT_PEN_STYLE, true)];
    const from = 240;
    const tail = [brushOutlineFrom(points.slice(from - WARM_UP), DEFAULT_PEN_STYLE, WARM_UP, true)];
    const reach = (o: Vec2[][]) => Math.max(...o[0].map((p) => p.x));
    expect(reach(tail)).toBeCloseTo(reach(whole), 6);
    // The last few samples can be left out as the pen's lift, so probe short of the end.
    for (const i of [300, 360, 385]) {
      const a = extentAt(whole, points[i].x, points[i].y);
      const c = extentAt(tail, points[i].x, points[i].y);
      expect(Math.abs(a.top - c.top)).toBeLessThan(0.35);
      expect(Math.abs(a.bottom - c.bottom)).toBeLessThan(0.35);
    }
  });

  it('returns nothing for a segment with fewer than two points of its own', () => {
    const points = longStroke(60);
    expect(brushOutlineFrom(points, DEFAULT_PEN_STYLE, 59, false)).toEqual([]);
  });

  it('keeps the tail small however long the stroke is', () => {
    const tailVertices = (n: number) => {
      const points = longStroke(n);
      const blocks = Math.floor((n - 72) / BLOCK);
      const from = blocks * BLOCK;
      const start = Math.max(0, from - WARM_UP);
      return brushOutlineFrom(points.slice(start), DEFAULT_PEN_STYLE, from - start, false).length;
    };
    expect(tailVertices(4800)).toBeLessThan(450);
    expect(Math.abs(tailVertices(4800) - tailVertices(600))).toBeLessThan(250);
  });
});
