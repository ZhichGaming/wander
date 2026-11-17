/**
 * Wander — Zhich, Yu, Justin
 * Tests for handwritten math (the LaTeX subset inside $...$), hand-drawn
 * shapes, and graphs.
 */

import { describe, expect, it } from 'vitest';
import {
  layoutGraph,
  layoutHandwriting,
  layoutSketch,
  MATH_COMMANDS,
  NEAT_HAND,
  type Ink,
  type Rect,
} from '../src';

const at = { x: 100, baseline: 300, seed: 2 };
const S = NEAT_HAND.xHeight;

/** Bounds of one stroke. */
function boundsOf(points: { x: number; y: number }[]): Rect {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

const height = (r: Rect) => r.maxY - r.minY;
const width = (r: Rect) => r.maxX - r.minX;

describe('math in handwriting', () => {
  it('writes inline math between words', () => {
    const w = layoutHandwriting('so $x = 2$ here', at);
    expect(w.missing).toEqual([]);
    expect(w.lines).toBe(1);
    // s, o, x (two strokes), = (two lines), 2, h, e, r, e.
    expect(w.strokes.length).toBe(11);
  });

  it('raises superscripts and shrinks them', () => {
    const w = layoutHandwriting('$x^2$', at);
    const [x1, x2, two] = w.strokes.map(boundsOf);
    expect(two.maxY).toBeLessThan(Math.min(x1.minY, x2.minY) + S * 0.3);
    expect(height(two)).toBeLessThan(height(boundsOf([...w.strokes[0], ...w.strokes[1]])) * 1.6);
  });

  it('drops subscripts below the baseline', () => {
    const w = layoutHandwriting('$a_1$', at);
    const one = boundsOf(w.strokes[w.strokes.length - 1]);
    expect(one.maxY).toBeGreaterThan(at.baseline + S * 0.15);
  });

  it('puts the numerator above the bar above the denominator', () => {
    const w = layoutHandwriting('$\\frac{1}{2}$', at);
    const [num, bar, den] = w.strokes.map(boundsOf);
    expect(width(bar)).toBeGreaterThan(height(bar) * 3);
    expect(num.maxY).toBeLessThan(bar.minY + 2);
    expect(den.minY).toBeGreaterThan(bar.maxY - 2);
    // The bar sits about halfway up the x-height.
    expect((bar.minY + bar.maxY) / 2).toBeGreaterThan(at.baseline - S * 0.75);
    expect((bar.minY + bar.maxY) / 2).toBeLessThan(at.baseline - S * 0.25);
  });

  it('draws the root sign over its contents', () => {
    const w = layoutHandwriting('$\\sqrt{2gh}$', at);
    const sign = boundsOf(w.strokes[0]);
    const rest = boundsOf(w.strokes.slice(1).flat());
    expect(sign.minY).toBeLessThan(rest.minY);
    expect(sign.maxX).toBeGreaterThan(rest.maxX - S * 0.2);
  });

  it('places integral limits and sum limits', () => {
    const integral = layoutHandwriting('$\\int_0^1 x\\,dx$', at);
    expect(integral.missing).toEqual([]);
    const sign = boundsOf(integral.strokes[0]);
    expect(height(sign)).toBeGreaterThan(S * 2.5);

    const sum = layoutHandwriting('$\\sum_{n=1}^{\\infty} a_n$', at);
    expect(sum.missing).toEqual([]);
    const sigma = boundsOf(sum.strokes.find((s) => s.length > 20)!);
    const all = sum.bounds;
    // Limits above and below the sign.
    expect(all.minY).toBeLessThan(sigma.minY - S * 0.3);
    expect(all.maxY).toBeGreaterThan(sigma.maxY + S * 0.3);
  });

  it('stretches \\left and \\right brackets to their contents', () => {
    const plain = layoutHandwriting('$(x)$', at);
    const tall = layoutHandwriting('$\\left(\\frac{a}{b}\\right)$', at);
    expect(height(boundsOf(tall.strokes[0]))).toBeGreaterThan(height(boundsOf(plain.strokes[0])));
  });

  it('writes Greek letters, operators and accents', () => {
    const w = layoutHandwriting(
      '$\\vec{F} = -\\nabla V$, $\\Delta x \\Delta p \\geq \\frac{\\hbar}{2}$, $\\omega = 2\\pi f$, $\\hat{x} \\cdot \\dot{y}$',
      at,
    );
    expect(w.missing).toEqual([]);
  });

  it('writes function names upright and reports unknown commands', () => {
    const w = layoutHandwriting('$\\sin x + \\foo y$', at);
    expect(w.missing).toEqual(['\\foo']);
  });

  it('puts display math on its own centred line and continues after it', () => {
    const w = layoutHandwriting('Then $$E = mc^2$$ so it holds.', { ...at, maxWidth: 600 });
    expect(w.lines).toBe(3);
    // The display line is centred in the 600 wide column.
    // Strokes between the first line and the tops of the last line's letters.
    const mid = w.strokes.filter((s) => s.every((p) => p.y > at.baseline + S && p.y < w.end.baseline - 2 * S));
    const display = boundsOf(mid.flat());
    expect(Math.abs((display.minX + display.maxX) / 2 - (at.x + 300))).toBeLessThan(S * 2);
  });

  it('gives lines with tall math more room', () => {
    const plain = layoutHandwriting('a\nb', { ...at, lineHeight: 30 });
    const tall = layoutHandwriting('a\n$\\frac{\\frac{1}{2}}{3}$', { ...at, lineHeight: 30 });
    expect(tall.end.baseline - at.baseline).toBeGreaterThan(plain.end.baseline - at.baseline);
  });

  it('writes a dollar sign with \\$ and lists its math commands', () => {
    expect(layoutHandwriting('costs \\$5', at).missing).toEqual(['$']);
    expect(MATH_COMMANDS).toContain('frac');
    expect(MATH_COMMANDS).toContain('alpha');
  });
});

describe('layoutSketch', () => {
  const rect: Rect = { minX: 100, minY: 100, maxX: 200, maxY: 140 };

  it('draws an arrow with a head at the end', () => {
    const ink = layoutSketch([{ type: 'arrow', from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }]);
    expect(ink.strokes).toHaveLength(2);
    const head = boundsOf(ink.strokes[1]);
    expect(head.maxX).toBeGreaterThan(190);
    expect(head.minX).toBeGreaterThan(150);
  });

  it('draws two heads and curves when asked', () => {
    const ink = layoutSketch([{ type: 'arrow', from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, bend: 0.2, heads: 'both' }]);
    expect(ink.strokes).toHaveLength(3);
    // Bending left of travel (rightwards) moves the middle up the screen.
    expect(boundsOf(ink.strokes[0]).minY).toBeLessThan(-20);
  });

  it('circles around a rect with room to spare', () => {
    const ink = layoutSketch([{ type: 'circle', around: rect }]);
    const b = ink.bounds;
    expect(b.minX).toBeLessThan(rect.minX);
    expect(b.maxX).toBeGreaterThan(rect.maxX);
    expect(b.minY).toBeLessThan(rect.minY);
    expect(b.maxY).toBeGreaterThan(rect.maxY);
  });

  it('underlines below, crosses over and boxes around', () => {
    const under = layoutSketch([{ type: 'underline', under: rect }]).bounds;
    expect(under.minY).toBeGreaterThan(rect.maxY);
    const cross = layoutSketch([{ type: 'cross', over: rect }]);
    expect(cross.strokes).toHaveLength(2);
    const box = layoutSketch([{ type: 'box', around: rect }]).bounds;
    expect(box.minX).toBeLessThan(rect.minX);
    expect(box.maxY).toBeGreaterThan(rect.maxY);
  });

  it('bows straight lines a little but keeps their ends', () => {
    const ink = layoutSketch([{ type: 'line', from: { x: 0, y: 0 }, to: { x: 300, y: 0 } }], { seed: 4 });
    const pts = ink.strokes[0];
    expect(pts[0].x).toBeCloseTo(0, 0);
    expect(pts[pts.length - 1].x).toBeCloseTo(300, 0);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeGreaterThan(0.1);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeLessThan(S * 0.6);
  });
});

describe('layoutGraph', () => {
  const rect: Rect = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const parabola: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = -2 + i / 10;
    parabola.push([x, x * x]);
  }

  /** Strokes longer than `n` points. */
  const long = (ink: Ink, n: number) => ink.strokes.filter((s) => s.length > n);

  it('draws axes through the origin and the curve inside the plot', () => {
    const ink = layoutGraph({ rect, x: [-2, 2], y: [-1, 4], series: [{ points: parabola }] });
    expect(ink.missing).toEqual([]);
    const [xAxis, , yAxis] = ink.strokes.map(boundsOf);
    // y = 0 is a fifth of the way up from the bottom; x = 0 is in the middle.
    expect((xAxis.minY + xAxis.maxY) / 2).toBeCloseTo(240, -1);
    expect((yAxis.minX + yAxis.maxX) / 2).toBeCloseTo(200, -1);
    const curve = boundsOf(ink.strokes[ink.strokes.length - 1]);
    expect(curve.minX).toBeGreaterThan(-5);
    expect(curve.maxX).toBeLessThan(405);
  });

  it('splits a series where it leaves the range', () => {
    const ink = layoutGraph({ rect, x: [-2, 2], y: [0, 1], series: [{ points: parabola }], xStep: 0, yStep: 0 });
    // The parabola is above 1 at both ends, so only the middle part is drawn.
    expect(long(ink, 30).length).toBeGreaterThanOrEqual(1);
    const curve = boundsOf(ink.strokes[ink.strokes.length - 1]);
    expect(width(curve)).toBeLessThan(250);
  });

  it('puts the axes on the edges when 0 is out of range', () => {
    const ink = layoutGraph({ rect, x: [1, 5], y: [2, 6], xStep: 0, yStep: 0, xLabel: '', yLabel: '' });
    const [xAxis, , yAxis] = ink.strokes.map(boundsOf);
    expect((xAxis.minY + xAxis.maxY) / 2).toBeCloseTo(300, -1);
    expect((yAxis.minX + yAxis.maxX) / 2).toBeCloseTo(0, -1);
  });
});
