/**
 * Wander — Zhich, Yu, Justin
 * Tests for how the pen draws stylus pressure: blunt starts and ends, a
 * floor for light touches, and ink that does not change behind the pen.
 */

import { describe, expect, it } from 'vitest';
import { brushOutline, brushOutlineFrom, DEFAULT_PEN_STYLE, type StrokePoint, type Vec2 } from '../src';
import { pointInPolygon } from '../src/math/polygon';

/** A straight stroke along y = 0 at 240 Hz, 1.25 units per sample, with the given pressures. */
function stroke(pressures: number[]): StrokePoint[] {
  return pressures.map((pressure, i) => ({ x: i * 1.25, y: 0, pressure, time: (i * 1000) / 240 }));
}

/** Width of the ink on the vertical line at `x`. */
function widthAt(outline: Vec2[], x: number): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = -8; y <= 8; y += 0.02) {
    if (!pointInPolygon({ x, y }, outline)) continue;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return bottom > top ? bottom - top : 0;
}

const steady = (n: number, p = 0.55) => Array.from({ length: n }, () => p);

describe('pen stylus pressure', () => {
  it('keeps the end blunt when the pressure drops away as the pen lifts', () => {
    const lift = [0.4, 0.25, 0.12, 0.05, 0.02];
    const points = stroke([...steady(240), ...lift]);
    const outline = brushOutline(points, DEFAULT_PEN_STYLE, true);
    const mid = widthAt(outline, points[120].x);
    const nearEnd = widthAt(outline, points[points.length - 1].x - 3);
    expect(nearEnd).toBeGreaterThan(mid * 0.8);
  });

  it('barely changes the end when the lift samples arrive', () => {
    const before = stroke(steady(240));
    const after = stroke([...steady(240), 0.4, 0.25, 0.12, 0.05, 0.02]);
    const x = before[230].x;
    const live = widthAt(brushOutline(before, DEFAULT_PEN_STYLE, false), x);
    const done = widthAt(brushOutline(after, DEFAULT_PEN_STYLE, true), x);
    expect(Math.abs(done - live)).toBeLessThan(0.15);
  });

  it('tapers in over the first few samples without thinning to a hair', () => {
    const points = stroke([0.03, 0.1, 0.25, 0.4, ...steady(240)]);
    const outline = brushOutline(points, DEFAULT_PEN_STYLE, true);
    const mid = widthAt(outline, points[120].x);
    // A few samples in, the line is well on its way to full width; by 20 samples it is there.
    expect(widthAt(outline, 4)).toBeGreaterThan(mid * 0.5);
    expect(widthAt(outline, points[20].x)).toBeGreaterThan(mid * 0.9);
  });

  it('does not change the start of a stroke as more of it is drawn', () => {
    const all = stroke([0.03, 0.1, 0.25, 0.4, ...steady(120)]);
    const early = brushOutline(all.slice(0, 16), DEFAULT_PEN_STYLE, false);
    const later = brushOutline(all.slice(0, 100), DEFAULT_PEN_STYLE, false);
    for (const x of [3, 6, 9]) expect(widthAt(later, x)).toBeCloseTo(widthAt(early, x), 6);
  });

  it('draws a light stroke light from its start', () => {
    const light = brushOutline(stroke(steady(40, 0.12)), DEFAULT_PEN_STYLE, true);
    const firm = brushOutline(stroke(steady(40, 0.6)), DEFAULT_PEN_STYLE, true);
    expect(widthAt(firm, 20)).toBeGreaterThan(widthAt(light, 20) * 1.8);
  });

  it('draws a very light touch thin but not as a hair', () => {
    const points = stroke(steady(200, 0.03));
    const w = widthAt(brushOutline(points, DEFAULT_PEN_STYLE, true), points[100].x);
    expect(w).toBeGreaterThan(1.1);
    expect(w).toBeLessThan(2);
  });

  it('still follows pressure: pressing harder draws wider, easing off slowly draws thinner', () => {
    const ramp = Array.from({ length: 480 }, (_, i) => (i < 240 ? 0.3 + (0.5 * i) / 240 : 0.8 - (0.5 * (i - 240)) / 240));
    const points = stroke(ramp);
    const outline = brushOutline(points, DEFAULT_PEN_STYLE, true);
    const light = widthAt(outline, points[30].x);
    const firm = widthAt(outline, points[250].x);
    const eased = widthAt(outline, points[460].x);
    expect(firm).toBeGreaterThan(light * 1.6);
    expect(eased).toBeLessThan(firm * 0.75);
  });

  it('draws ordinary writing pressure at about the nominal width, and scales the rest with it', () => {
    // Slow enough that speed thins the line very little.
    const slow = (p: number) =>
      Array.from({ length: 300 }, (_, i) => ({ x: i * 0.4, y: 0, pressure: p, time: (i * 1000) / 240 }));
    const w = (p: number) => widthAt(brushOutline(slow(p), DEFAULT_PEN_STYLE, true), 60);
    expect(w(0.35)).toBeGreaterThan(2.6);
    expect(w(0.35)).toBeLessThan(3.3);
    expect(w(0.25)).toBeLessThan(w(0.35));
    // 0.52, not 0.5: a stroke of exactly 0.5 throughout counts as a finger, which has no pressure.
    expect(w(0.52)).toBeGreaterThan(w(0.35) * 1.25);
    expect(w(0.8)).toBeGreaterThan(w(0.52));
  });

  it('reaches the pen when complete, where the unfinished tip trails a fast stroke', () => {
    // 6 units per sample at 240 Hz: a quick flick.
    const points: StrokePoint[] = Array.from({ length: 60 }, (_, i) => ({
      x: i * 6,
      y: 0,
      pressure: 0.5,
      time: (i * 1000) / 240,
    }));
    const penX = points[points.length - 1].x;
    const reach = (o: Vec2[]) => Math.max(...o.map((p) => p.x));
    const live = reach(brushOutline(points, DEFAULT_PEN_STYLE, false));
    const done = reach(brushOutline(points, DEFAULT_PEN_STYLE, true));
    expect(done).toBeGreaterThan(penX);
    expect(done - live).toBeGreaterThan(2);
  });

  it('does not change ink behind the pen as the stroke grows', () => {
    const pressures = Array.from({ length: 400 }, (_, i) => 0.45 + 0.25 * Math.sin(i / 17));
    const all = stroke(pressures);
    const shorter = brushOutline(all.slice(0, 300), DEFAULT_PEN_STYLE, false);
    const longer = brushOutline(all.slice(0, 380), DEFAULT_PEN_STYLE, false);
    for (const i of [40, 120, 200, 260]) {
      expect(widthAt(longer, all[i].x)).toBeCloseTo(widthAt(shorter, all[i].x), 6);
    }
  });
});

describe('pen dots', () => {
  /** A mark shorter than the pen is wide, like the dot of an i. */
  const dot: StrokePoint[] = [
    { x: 10, y: 10, pressure: 0.5, time: 0 },
    { x: 10.6, y: 10.9, pressure: 0.5, time: 8 },
    { x: 11, y: 11.2, pressure: 0.5, time: 16 },
  ];

  it('draws a stroke smaller than the pen width as a round dot at its middle', () => {
    const outline = brushOutline(dot, DEFAULT_PEN_STYLE, true);
    const cx = 10.5;
    const cy = 10.6;
    const radii = outline.map((p) => Math.hypot(p.x - cx, p.y - cy));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
    expect(radii[0]).toBeGreaterThan(DEFAULT_PEN_STYLE.width * 0.4);
    expect(radii[0]).toBeLessThan(DEFAULT_PEN_STYLE.width * 0.6);
  });

  it('shows the same dot while the pen is down as after it lifts', () => {
    expect(brushOutlineFrom(dot, DEFAULT_PEN_STYLE, 0, true)).toEqual(brushOutline(dot, DEFAULT_PEN_STYLE, true));
  });

  it('leaves a stroke longer than the pen width as a line', () => {
    const line = stroke(steady(12));
    const outline = brushOutline(line, DEFAULT_PEN_STYLE, true);
    const xs = outline.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(12);
  });
});

describe('pen lift', () => {
  it('does not ink the samples a lifting stylus reports with no pressure', () => {
    const drawn = stroke(steady(30));
    const end = drawn[drawn.length - 1];
    // The lift sample: no pressure, several units off the line.
    const lifted = [...drawn, { x: end.x + 4, y: 6, pressure: 0, time: end.time + 4 }];
    expect(brushOutline(lifted, DEFAULT_PEN_STYLE, true)).toEqual(brushOutline(drawn, DEFAULT_PEN_STYLE, true));
    expect(brushOutlineFrom(lifted, DEFAULT_PEN_STYLE, 0, true)).toEqual(brushOutlineFrom(drawn, DEFAULT_PEN_STYLE, 0, true));
  });
});

describe('pen landing and lift skids', () => {
  /** Rightmost and lowest reach of an outline. */
  const reach = (o: Vec2[]) => ({ right: Math.max(...o.map((p) => p.x)), down: Math.max(...o.map((p) => p.y)) });

  it('leaves out a short skid as the pressure collapses at the end', () => {
    const drawn = stroke(steady(30));
    const end = drawn[drawn.length - 1];
    // Four samples sliding down off the line while the pressure falls away.
    const skid = [0.3, 0.2, 0.12, 0.06].map((pressure, i) => ({
      x: end.x + 0.2,
      y: (i + 1) * 0.6,
      pressure,
      time: end.time + (i + 1) * 4,
    }));
    expect(brushOutline([...drawn, ...skid], DEFAULT_PEN_STYLE, true)).toEqual(brushOutline(drawn, DEFAULT_PEN_STYLE, true));
  });

  it('keeps a long fading flick', () => {
    const pressures = [...steady(30), ...Array.from({ length: 12 }, (_, i) => 0.3 - i * 0.022)];
    const flick = stroke(pressures);
    expect(reach(brushOutline(flick, DEFAULT_PEN_STYLE, true)).right).toBeGreaterThan(flick[flick.length - 1].x);
  });

  it('leaves out a short hook where the pen landed', () => {
    const line = stroke(steady(30)).map((p) => ({ ...p, time: p.time + 20 }));
    // The pen lands ahead of and below the line's start, slides back up to it, then sets off.
    const landing = [0, 1, 2, 3].map((i) => ({ x: 2 - i * 0.5, y: 2 - i * 0.5, pressure: 0.55, time: i * 4 }));
    const hooked = brushOutline([...landing, ...line], DEFAULT_PEN_STYLE, true);
    expect(reach(hooked).down).toBeLessThan(reach(brushOutline(line, DEFAULT_PEN_STYLE, true)).down + 0.6);
  });

  it('keeps a first leg longer than a skid', () => {
    const leg = Array.from({ length: 12 }, (_, i) => ({ x: 0, y: 8 - i * 0.7, pressure: 0.55, time: i * 4 }));
    const line = stroke(steady(30)).map((p) => ({ ...p, time: p.time + 60 }));
    expect(reach(brushOutline([...leg, ...line], DEFAULT_PEN_STYLE, true)).down).toBeGreaterThan(8);
  });
});
