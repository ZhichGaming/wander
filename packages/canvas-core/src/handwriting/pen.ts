/**
 * Wander — Zhich, Yu, Justin
 * The hand that draws generated ink. Layouts (text, math, shapes, graphs)
 * decide where things go; the pen makes them look drawn by a person:
 *
 * - Glyphs get their own size, width, lean, rotation and baseline offset,
 *   and their control points wobble, so no two copies of a letter match.
 * - Paths (fraction bars, arrows, circles, axes, curves) bow and wobble a
 *   little along their length instead of being ruler-straight.
 * - Every stroke gets pressure that builds in and tapers out (short marks
 *   are pressed evenly so they stay visible) and time that runs slower on
 *   tight curves, with a pause between strokes.
 *
 * Strokes a person adds after a word (i dots, t bars) are held back until
 * the next flush mark.
 */

import { boundsOfPoints, emptyRect, unionRect, type Rect, type Vec2 } from '../math/geometry';
import type { StrokePoint } from '../model/StrokeStyle';
import { GLYPHS, type GlyphPoint } from './glyphs';
import { gaussian, type Random } from './random';
import type { HandStyle } from './style';

/** Something to draw, in world units (y down). */
export type PenMark =
  /** A glyph with its left edge at `x`, sitting on baseline `y`, with x-height `size`. */
  | { kind: 'glyph'; char: string; x: number; y: number; size: number }
  /** A pen path through `points`; `smooth` curves through them instead of joining them straight. */
  | { kind: 'path'; points: readonly Vec2[]; smooth?: boolean }
  /** Write the held-back strokes now. */
  | { kind: 'flush' };

/** Distance between resampled points along a stroke, in world units. */
const POINT_SPACING = 1.4;

/** Draws marks as strokes with one style and one random stream. */
export class Pen {
  /** Strokes drawn so far, in order. */
  readonly strokes: StrokePoint[][] = [];
  private readonly gauss: () => number;
  private clock: number;
  private held: GlyphPoint[][] = [];

  /** Creates a pen whose first point is just after `startTime`. */
  constructor(
    private readonly style: HandStyle,
    private readonly random: Random,
    private readonly startTime = 0,
  ) {
    this.gauss = gaussian(random);
    this.clock = startTime;
  }

  /** Milliseconds from the start time to the last point. */
  get duration(): number {
    return this.clock - this.startTime;
  }

  /** Bounds of every stroke's centre line. */
  get bounds(): Rect {
    let r = emptyRect();
    for (const s of this.strokes) r = unionRect(r, boundsOfPoints(s));
    return r;
  }

  /** Draws `marks` in order, then writes anything still held back. */
  drawAll(marks: Iterable<PenMark>): void {
    for (const m of marks) this.draw(m);
    this.flush();
  }

  /** Draws one mark. */
  draw(mark: PenMark): void {
    if (mark.kind === 'glyph') this.glyph(mark.char, mark.x, mark.y, mark.size);
    else if (mark.kind === 'path') this.path(mark.points, mark.smooth ?? false);
    else this.flush();
  }

  /** Writes the held-back strokes. */
  flush(): void {
    for (const pts of this.held) this.strokes.push(this.timed(pts));
    this.held = [];
  }

  /** One glyph, varied like handwriting. */
  private glyph(char: string, x: number, baseline: number, S: number): void {
    const glyph = GLYPHS[char];
    if (!glyph) return;
    const { gauss, style } = this;
    const m = style.messiness;
    const size = 1 + gauss() * 0.06 * (0.5 + m);
    const sx = size * style.width * (1 + gauss() * 0.07 * (0.5 + m));
    const rot = (gauss() * 2.2 * (0.4 + m) * Math.PI) / 180;
    const lean = Math.tan(((style.slant + gauss() * 2 * (0.4 + m)) * Math.PI) / 180);
    const base = baseline + gauss() * 0.045 * S * (0.5 + m);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const wobble = 0.028 * (0.4 + m);

    glyph.strokes.forEach((ctrl, i) => {
      const wobbled: GlyphPoint[] = ctrl.map(([px, py]) => [px + gauss() * wobble, py + gauss() * wobble]);
      const world: GlyphPoint[] = cornered(wobbled).map(([px, py]) => {
        const gx = px * sx * cos - py * size * sin;
        const gy = px * sx * sin + py * size * cos;
        return [x + (gx + gy * lean) * S, base - gy * S];
      });
      const pts = resample(world, POINT_SPACING);
      if (glyph.delayed?.includes(i)) this.held.push(pts);
      else this.strokes.push(this.timed(pts));
    });
  }

  /** A path that bows and wobbles slightly along its length. */
  private path(points: readonly Vec2[], smooth: boolean): void {
    if (points.length === 0) return;
    const { gauss, style } = this;
    const m = style.messiness;
    const S = style.xHeight;
    const raw: GlyphPoint[] = points.map((p) => [p.x, p.y]);
    const line = resample(smooth ? catmullRom(raw) : raw, 1);
    let total = 0;
    const along = line.map((p, i) => (i === 0 ? 0 : (total += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]))));
    if (total < 1) {
      this.strokes.push(this.timed(line));
      return;
    }
    const bow = gauss() * Math.min(total * 0.015, S * 0.3) * (0.4 + m);
    const sway = gauss() * Math.min(total * 0.006, S * 0.12) * (0.4 + m);
    const tremor = 0.025 * S * (0.4 + m);
    const phase = this.random() * Math.PI * 2;
    const phase2 = this.random() * Math.PI * 2;
    const shaken: GlyphPoint[] = line.map(([px, py], i) => {
      const u = along[i] / total;
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len;
      const ny = (b[0] - a[0]) / len;
      const off =
        bow * Math.sin(Math.PI * u) +
        sway * Math.sin(2 * Math.PI * u + phase) +
        tremor * Math.sin(along[i] / (S * 0.7) + phase2);
      return [px + nx * off, py + ny * off];
    });
    this.strokes.push(this.timed(resample(shaken, POINT_SPACING)));
  }

  /**
   * Gives a stroke pressure and time. The pen slows on tight curves.
   * Long strokes press in and taper out; short marks are pressed evenly.
   * The taper out is gentle: the pen brush reads a collapse in pressure at
   * the end of a stroke as the pen lifting and leaves that part out.
   */
  private timed(pts: readonly GlyphPoint[]): StrokePoint[] {
    const { gauss, style } = this;
    this.clock += 90 + this.random() * 90;
    const n = pts.length;
    const short = n < 6;
    const out: StrokePoint[] = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      if (i > 0) {
        const a = pts[Math.max(0, i - 2)];
        const c = pts[Math.min(n - 1, i + 2)];
        let turn = Math.abs(Math.atan2(c[1] - y, c[0] - x) - Math.atan2(y - a[1], x - a[0]));
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        const step = Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        this.clock += step / (style.speed * (1 - 0.55 * Math.min(1, turn / 1.2)));
      }
      const u = n > 1 ? i / (n - 1) : 0;
      const envelope = short ? 1.15 : Math.min(1, u / 0.18 + 0.45) * Math.min(1, (1 - u) / 0.25 + 0.75);
      const pressure = Math.max(0.05, Math.min(1, style.pressure * envelope + gauss() * 0.03));
      out.push({ x, y, pressure, time: this.clock });
    }
    return out;
  }
}

/** Turns sharper than this (radians) are kept as corners instead of being smoothed. */
const CORNER = (75 * Math.PI) / 180;

/**
 * A smooth curve through `pts` that keeps sharp turns sharp: the points are
 * split at every corner and each run is curved on its own, so the tips of
 * A, N, z and triangles stay pointed while bowls stay round.
 */
function cornered(pts: readonly GlyphPoint[]): GlyphPoint[] {
  const out: GlyphPoint[] = [];
  let run: GlyphPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    const next = pts[i + 1];
    if (!next) break;
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(next[1] - pts[i][1], next[0] - pts[i][0]);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > CORNER) {
      out.push(...catmullRom(run).slice(out.length > 0 ? 1 : 0));
      run = [pts[i]];
    }
  }
  out.push(...catmullRom(run).slice(out.length > 0 ? 1 : 0));
  return out;
}

/** Uniform Catmull-Rom curve through `pts`, ten samples per segment. */
export function catmullRom(pts: readonly GlyphPoint[]): GlyphPoint[] {
  if (pts.length < 2) return [...pts];
  const out: GlyphPoint[] = [];
  const perSegment = 10;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Points `step` apart along the polyline `pts`, keeping both ends. */
function resample(pts: readonly GlyphPoint[], step: number): GlyphPoint[] {
  const out: GlyphPoint[] = [pts[0]];
  let carried = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (carried + seg >= step) {
      const t = (step - carried) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay);
      carried = 0;
    }
    carried += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail[0] - last[0], tail[1] - last[1]) > step * 0.3) out.push(last);
  return out;
}
