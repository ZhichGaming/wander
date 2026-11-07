/**
 * Wander — Zhich, Yu, Justin
 * Tests for the pen and highlighter brushes and the outline-to-SVG helper.
 */

import { describe, expect, it } from 'vitest';
import { HighlighterBrush } from '../src/brush/HighlighterBrush';
import { PenBrush } from '../src/brush/PenBrush';
import { outlineToSvgPath } from '../src/brush/outlinePath';
import type { Vec2 } from '../src/math/geometry';
import type { StrokePoint, StrokeStyle } from '../src/model/StrokeStyle';

const PEN: StrokeStyle = { brush: 'pen', color: '#1e1e1e', width: 4, opacity: 1 };
const HIGHLIGHTER: StrokeStyle = { brush: 'highlighter', color: '#ffe14d', width: 18, opacity: 0.45 };

/**
 * Horizontal line of samples along y = 0 from x = 0 to `length`, one sample
 * every 8 ms. `pressureAt` gives each sample's pressure.
 */
function line(length: number, samples: number, pressureAt: (i: number) => number = () => 0.5): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i < samples; i++) {
    pts.push({ x: (length * i) / (samples - 1), y: 0, pressure: pressureAt(i), time: i * 8 });
  }
  return pts;
}

/** Largest |y| of outline points whose x lies in the middle half of [0, length]: the half-width there. */
function midHalfWidth(outline: Vec2[], length: number): number {
  const mid = outline.filter((p) => p.x > length * 0.25 && p.x < length * 0.75);
  expect(mid.length).toBeGreaterThan(0);
  return Math.max(...mid.map((p) => Math.abs(p.y)));
}

/** True when `p` is inside the polygon (even-odd ray casting). */
function insidePolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('PenBrush', () => {
  const pen = new PenBrush();

  it('produces an outline that encloses the input points', () => {
    const pts = line(100, 40);
    const outline = pen.outline(pts, PEN, true);
    expect(outline.length).toBeGreaterThan(4);
    for (const p of pts.slice(5, -5)) expect(insidePolygon(p, outline)).toBe(true);
    for (const p of outline) expect(Math.abs(p.y)).toBeLessThanOrEqual(PEN.width);
  });

  it('draws a visible dot for a single point', () => {
    const outline = pen.outline([{ x: 10, y: 20, pressure: 0.5, time: 0 }], PEN, true);
    expect(outline.length).toBeGreaterThan(4);
    expect(insidePolygon({ x: 10, y: 20 }, outline)).toBe(true);
  });

  it('draws a dot for a tap with repeated samples at one spot', () => {
    const tap = [0, 8, 16].map((time) => ({ x: 5, y: 5, pressure: 0.3, time }));
    const outline = pen.outline(tap, PEN, true);
    expect(insidePolygon({ x: 5, y: 5 }, outline)).toBe(true);
  });

  it('thins fast finger strokes', () => {
    const slow = midHalfWidth(pen.outline(line(100, 101), PEN, true), 100);
    const fast = midHalfWidth(pen.outline(line(100, 11), PEN, true), 100);
    expect(fast).toBeLessThan(slow);
  });

  it('thins fast stylus strokes at the same pressure', () => {
    const slow = midHalfWidth(pen.outline(line(100, 101, () => 0.7), PEN, true), 100);
    const fast = midHalfWidth(pen.outline(line(100, 11, () => 0.7), PEN, true), 100);
    expect(fast).toBeLessThan(slow);
  });

  it('uses stylus pressure', () => {
    const light = midHalfWidth(pen.outline(line(100, 101, () => 0.2), PEN, true), 100);
    const heavy = midHalfWidth(pen.outline(line(100, 101, () => 0.9), PEN, true), 100);
    expect(heavy).toBeGreaterThan(light);
  });
});

describe('HighlighterBrush', () => {
  const hl = new HighlighterBrush();

  it('has constant width regardless of pressure', () => {
    const light = hl.outline(line(200, 50, () => 0.1), HIGHLIGHTER, true);
    const heavy = hl.outline(line(200, 50, (i) => (i % 2 ? 1 : 0.3)), HIGHLIGHTER, true);
    expect(midHalfWidth(light, 200)).toBeCloseTo(HIGHLIGHTER.width / 2, 1);
    expect(midHalfWidth(heavy, 200)).toBeCloseTo(HIGHLIGHTER.width / 2, 1);
  });

  it('draws a visible dot for a single point and sits behind ink', () => {
    const outline = hl.outline([{ x: 0, y: 0, pressure: 0.5, time: 0 }], HIGHLIGHTER, true);
    expect(insidePolygon({ x: 0, y: 0 }, outline)).toBe(true);
    expect(hl.pass).toBeLessThan(new PenBrush().pass);
    expect(hl.blendMode).toBe('multiply');
  });
});

describe('outlineToSvgPath', () => {
  it('returns a closed path starting with M and ending with Z', () => {
    const outline = new PenBrush().outline(line(50, 20), PEN, true);
    const path = outlineToSvgPath(outline);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('Q');
  });

  it('returns an empty string for a degenerate outline', () => {
    expect(outlineToSvgPath([])).toBe('');
  });
});
