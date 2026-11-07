/**
 * Wander — Zhich, Yu, Justin
 * Tests for the tilt-aware pencil brush: upright draws a thin tip line,
 * tilted shades wide and light, and stroke bounds cover the shading.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PENCIL_STYLE,
  PencilBrush,
  Stroke,
  boundsOfPoints,
  shadeAmount,
  type StrokePoint,
} from '../src';

/** A horizontal Pencil line with the given lean from vertical (degrees) towards +y. */
function line(leanDeg: number, pressure = 0.6): StrokePoint[] {
  const lean = (leanDeg * Math.PI) / 180;
  return Array.from({ length: 40 }, (_, i) => ({
    x: i * 2,
    y: 0,
    pressure,
    time: i * 8,
    tiltX: 0,
    tiltY: lean,
  }));
}

/** Height of the outline's bounds (the stroke's visible width for a horizontal line). */
function thickness(points: StrokePoint[]): number {
  const b = boundsOfPoints(new PencilBrush().outline(points, DEFAULT_PENCIL_STYLE, true));
  return b.maxY - b.minY;
}

describe('PencilBrush', () => {
  const pencil = new PencilBrush();

  it('measures shading from tilt and treats no tilt as the tip', () => {
    expect(shadeAmount(line(10)[0])).toBe(0);
    expect(shadeAmount(line(85)[0])).toBe(1);
    expect(shadeAmount({ x: 0, y: 0, pressure: 0.5, time: 0 })).toBe(0);
  });

  it('shades much wider when tilted than when upright', () => {
    expect(thickness(line(80))).toBeGreaterThan(thickness(line(15)) * 3);
  });

  it('shades lighter than a tip line', () => {
    expect(pencil.opacity(line(80))).toBeLessThan(0.6);
    expect(pencil.opacity(line(15))).toBe(1);
  });

  it('draws darker and wider under harder pressure', () => {
    expect(thickness(line(15, 1))).toBeGreaterThan(thickness(line(15, 0.1)));
  });

  it('gives a shading stroke bounds that cover its full width', () => {
    const stroke = new Stroke(line(80), DEFAULT_PENCIL_STYLE);
    const b = stroke.bounds;
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(thickness(line(80)));
    expect(stroke.opacity).toBeCloseTo(DEFAULT_PENCIL_STYLE.opacity * pencil.opacity(line(80)));
  });
});
