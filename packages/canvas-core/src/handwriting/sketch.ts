/**
 * Wander — Zhich, Yu, Justin
 * Hand-drawn shapes and graphs in the same hand as the handwriting:
 * lines, arrows, curves, a circle or box around something, underlines,
 * crossing out, check marks, and function graphs with axes, ticks and
 * labels. Shapes are given in world units; the pen makes lines bow a
 * little, circles overshoot where they close, and so on.
 */

import type { Rect, Vec2 } from '../math/geometry';
import { layoutMath } from './math';
import { Pen, type PenMark } from './pen';
import { gaussian, hashSeed, seededRandom } from './random';
import { NEAT_HAND, type HandStyle } from './style';
import { placeBox, wordBox, type Ink } from './handwriting';

/** A hand-drawn shape, in world units. */
export type Shape =
  /** A straight line. */
  | { type: 'line'; from: Vec2; to: Vec2 }
  /**
   * An arrow from `from` to `to`. `bend` curves it: the middle moves
   * sideways by `bend` times the length (positive curves to the left of the
   * direction of travel, in screen terms). `heads: 'both'` adds a head at the start.
   */
  | { type: 'arrow'; from: Vec2; to: Vec2; bend?: number; heads?: 'end' | 'both' }
  /** A smooth curve through the points. */
  | { type: 'curve'; points: Vec2[] }
  /** An ellipse drawn around `around` with `padding` (default 0.4 x-heights) of room. */
  | { type: 'circle'; around: Rect; padding?: number }
  /** A rectangle drawn around `around`. */
  | { type: 'box'; around: Rect; padding?: number }
  /** A line under `under`. */
  | { type: 'underline'; under: Rect }
  /** A cross over `over`, for marking something wrong. */
  | { type: 'cross'; over: Rect }
  /** A check mark filling `at`, for marking something right. */
  | { type: 'check'; at: Rect };

/** Options shared by sketches and graphs. */
export interface SketchOptions {
  /** Hand to draw with; missing fields come from NEAT_HAND. */
  style?: Partial<HandStyle>;
  /** Seed for the variation. Default: from the shapes. */
  seed?: number;
  /** Time of the first point, in milliseconds (default 0). */
  startTime?: number;
}

/** Draws `shapes` in order, in the hand of `opts.style`. */
export function layoutSketch(shapes: readonly Shape[], opts: SketchOptions = {}): Ink {
  const style: HandStyle = { ...NEAT_HAND, ...opts.style };
  const seed = opts.seed ?? hashSeed(JSON.stringify(shapes));
  const random = seededRandom(seed);
  const marks: PenMark[] = [];
  for (const shape of shapes) marks.push(...shapeMarks(shape, style, random));
  const pen = new Pen(style, seededRandom(seed ^ 0x9e3779b9), opts.startTime);
  pen.drawAll(marks);
  return { strokes: pen.strokes, bounds: pen.bounds, duration: pen.duration, missing: [] };
}

/** A series of points to plot, in graph units. */
export interface GraphSeries {
  /** Points in order along the curve. Sample densely for curves; two points make a straight line. */
  points: readonly (readonly [number, number])[];
  /** Join the points with straight lines instead of a smooth curve. */
  straight?: boolean;
}

/** A hand-drawn graph. */
export interface Graph {
  /** World rect the plot area fills. */
  rect: Rect;
  /** Visible range of x, in graph units. */
  x: readonly [number, number];
  /** Visible range of y, in graph units. */
  y: readonly [number, number];
  /** Curves and lines to plot. Parts outside the ranges are clipped. */
  series?: readonly GraphSeries[];
  /** Axis labels, in the same LaTeX subset as handwriting (default "x" and "y"; "" for none). */
  xLabel?: string;
  yLabel?: string;
  /** Distance between ticks in graph units (default: about five ticks per axis; 0 for none). */
  xStep?: number;
  yStep?: number;
}

/**
 * Draws a graph: x and y axes with arrow heads (through 0 when it is in
 * range, otherwise along the edge), numbered ticks, axis labels, and each
 * series as a curve.
 */
export function layoutGraph(graph: Graph, opts: SketchOptions = {}): Ink {
  const style: HandStyle = { ...NEAT_HAND, ...opts.style };
  const seed = opts.seed ?? hashSeed(JSON.stringify(graph));
  const random = seededRandom(seed);
  const missing = new Set<string>();
  const S = style.xHeight;
  const { rect } = graph;
  const [x0, x1] = graph.x;
  const [y0, y1] = graph.y;
  const toX = (gx: number) => rect.minX + ((gx - x0) / (x1 - x0)) * (rect.maxX - rect.minX);
  const toY = (gy: number) => rect.maxY - ((gy - y0) / (y1 - y0)) * (rect.maxY - rect.minY);
  const axisY = y0 <= 0 && 0 <= y1 ? toY(0) : rect.maxY;
  const axisX = x0 <= 0 && 0 <= x1 ? toX(0) : rect.minX;
  const head = Math.min(S * 0.6, (rect.maxX - rect.minX) * 0.05);
  const marks: PenMark[] = [];

  // Axes, each with a head at its positive end.
  marks.push({ kind: 'path', points: [{ x: rect.minX, y: axisY }, { x: rect.maxX, y: axisY }] });
  marks.push({ kind: 'path', points: arrowHead({ x: rect.minX, y: axisY }, { x: rect.maxX, y: axisY }, head) });
  marks.push({ kind: 'path', points: [{ x: axisX, y: rect.maxY }, { x: axisX, y: rect.minY }] });
  marks.push({ kind: 'path', points: arrowHead({ x: axisX, y: rect.maxY }, { x: axisX, y: rect.minY }, head) });

  // Ticks with numbers, small enough not to crowd the curve.
  const labelScale = 0.6;
  const tick = S * 0.25;
  const number = (v: number) => wordBox(formatTick(v), style, random, missing, labelScale);
  const xStep = graph.xStep ?? niceStep(x1 - x0);
  if (xStep > 0) {
    for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 - xStep * 0.2; v += xStep) {
      if (Math.abs(v) < xStep * 1e-6) continue;
      const wx = toX(v);
      marks.push({ kind: 'path', points: [{ x: wx, y: axisY - tick }, { x: wx, y: axisY + tick }] });
      const box = number(v);
      marks.push(...placeBox(box, wx - (box.w * S) / 2, axisY + tick + S * 1.2, S));
    }
  }
  const yStep = graph.yStep ?? niceStep(y1 - y0);
  if (yStep > 0) {
    for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1 - yStep * 0.2; v += yStep) {
      if (Math.abs(v) < yStep * 1e-6) continue;
      const wy = toY(v);
      marks.push({ kind: 'path', points: [{ x: axisX - tick, y: wy }, { x: axisX + tick, y: wy }] });
      const box = number(v);
      marks.push(...placeBox(box, axisX - tick - S * 0.3 - box.w * S, wy + S * 0.35, S));
    }
  }

  // Axis labels by the arrow heads.
  const ctx = { widthScale: style.width, missing };
  const xLabel = layoutMath(graph.xLabel ?? 'x', 1, ctx);
  if (xLabel.marks.length) marks.push(...placeBox(xLabel, rect.maxX - xLabel.w * S, axisY + S * 1.9, S));
  const yLabel = layoutMath(graph.yLabel ?? 'y', 1, ctx);
  if (yLabel.marks.length) marks.push(...placeBox(yLabel, axisX + S * 0.5, rect.minY + S * 1.1, S));
  marks.push({ kind: 'flush' });

  // Series, split where they leave the visible range.
  for (const series of graph.series ?? []) {
    let run: Vec2[] = [];
    const end = () => {
      if (run.length > 1) marks.push({ kind: 'path', points: run, smooth: !series.straight });
      run = [];
    };
    for (const [gx, gy] of series.points) {
      if (gx < x0 || gx > x1 || gy < y0 || gy > y1 || !Number.isFinite(gy)) end();
      else run.push({ x: toX(gx), y: toY(gy) });
    }
    end();
  }

  const pen = new Pen(style, seededRandom(seed ^ 0x9e3779b9), opts.startTime);
  pen.drawAll(marks);
  return { strokes: pen.strokes, bounds: pen.bounds, duration: pen.duration, missing: [...missing] };
}

/** Pen marks for one shape. */
function shapeMarks(shape: Shape, style: HandStyle, random: () => number): PenMark[] {
  const S = style.xHeight;
  const gauss = gaussian(random);
  const path = (points: Vec2[], smooth = false): PenMark => ({ kind: 'path', points, smooth });
  switch (shape.type) {
    case 'line':
      return [path([shape.from, shape.to])];
    case 'curve':
      return [path([...shape.points], true)];
    case 'arrow': {
      const { from, to } = shape;
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const headLen = Math.min(S * 0.9, len * 0.3);
      const bend = shape.bend ?? 0;
      let body: Vec2[];
      let tailDir: Vec2 = from;
      let tipDir: Vec2 = from;
      if (bend === 0) {
        body = [from, to];
      } else {
        // Quadratic curve with its control point off to the side.
        const c = {
          x: (from.x + to.x) / 2 + ((to.y - from.y) / len) * bend * len * 2,
          y: (from.y + to.y) / 2 - ((to.x - from.x) / len) * bend * len * 2,
        };
        body = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          body.push({
            x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * c.x + t * t * to.x,
            y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * c.y + t * t * to.y,
          });
        }
        tipDir = c;
        tailDir = c;
      }
      const marks: PenMark[] = [path(body, bend !== 0), path(arrowHead(tipDir, to, headLen))];
      if (shape.heads === 'both') marks.push(path(arrowHead(bend === 0 ? to : tailDir, from, headLen)));
      return marks;
    }
    case 'circle': {
      const pad = (shape.padding ?? 0.4) * S;
      const r = shape.around;
      const cx = (r.minX + r.maxX) / 2;
      const cy = (r.minY + r.maxY) / 2;
      const rx = (r.maxX - r.minX) / 2 + pad;
      const ry = (r.maxY - r.minY) / 2 + pad;
      // Start upper left and go round a bit more than once, slightly spiralling, as people do.
      const start = Math.PI * (1.15 + gauss() * 0.1);
      const sweep = Math.PI * 2 * (1.08 + random() * 0.06);
      const pts: Vec2[] = [];
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = start - sweep * t;
        const grow = 1 + 0.05 * t;
        pts.push({ x: cx + rx * grow * Math.cos(a), y: cy + ry * grow * Math.sin(a) });
      }
      return [path(pts, true)];
    }
    case 'box': {
      const pad = (shape.padding ?? 0.3) * S;
      const r = shape.around;
      const over = S * 0.2;
      return [
        path([
          { x: r.minX - pad, y: r.minY - pad },
          { x: r.maxX + pad, y: r.minY - pad },
          { x: r.maxX + pad, y: r.maxY + pad },
          { x: r.minX - pad, y: r.maxY + pad },
          { x: r.minX - pad, y: r.minY - pad - over },
        ]),
      ];
    }
    case 'underline': {
      const r = shape.under;
      const y = r.maxY + S * 0.25;
      return [path([{ x: r.minX - S * 0.1, y: y + S * 0.05 }, { x: r.maxX + S * 0.15, y: y - S * 0.08 }])];
    }
    case 'cross': {
      const r = shape.over;
      return [
        path([{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.maxY }]),
        path([{ x: r.maxX, y: r.minY }, { x: r.minX, y: r.maxY }]),
      ];
    }
    case 'check': {
      const r = shape.at;
      const w = r.maxX - r.minX;
      const h = r.maxY - r.minY;
      return [
        path([
          { x: r.minX, y: r.minY + h * 0.55 },
          { x: r.minX + w * 0.35, y: r.maxY },
          { x: r.maxX, y: r.minY },
        ]),
      ];
    }
  }
}

/** The two wings and tip of an arrow head at `tip`, pointing away from `from`. */
function arrowHead(from: Vec2, tip: Vec2, size: number): Vec2[] {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = 0.45;
  return [
    { x: tip.x - size * Math.cos(a - spread), y: tip.y - size * Math.sin(a - spread) },
    tip,
    { x: tip.x - size * Math.cos(a + spread), y: tip.y - size * Math.sin(a + spread) },
  ];
}

/** A round tick step giving about five ticks over `span`. */
function niceStep(span: number): number {
  const raw = Math.abs(span) / 5;
  if (!(raw > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** A tick value without float noise; negatives use a hyphen, which reads as a minus at this size. */
function formatTick(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return String(r);
}
