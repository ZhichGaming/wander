/**
 * Wander — Zhich, Yu, Justin
 * Tests for what an agent needs to write on the canvas well: block layout
 * from a top edge, aligned equation rows, grouped strokes, staged reveal
 * (writeInk), and the on-screen area in a view's text.
 */

import { describe, expect, it } from 'vitest';
import {
  CanvasEngine,
  CreateObjects,
  DEFAULT_PEN_STYLE,
  describeView,
  EraserTool,
  inkStrokes,
  LassoTool,
  layoutHandwriting,
  NEAT_HAND,
  objectFromJSON,
  Stroke,
  translation,
  writeInk,
  type PointerInput,
  type Rect,
  type StrokePoint,
} from '../src';

const S = NEAT_HAND.xHeight;

/** Bounds of one stroke's points. */
function boundsOf(points: readonly { x: number; y: number }[]): Rect {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** A pointer sample at world (x, y). */
function ptr(x: number, y: number, time: number): PointerInput {
  return { pointerId: 1, kind: 'pen', x, y, pressure: 0.5, time, additive: false };
}

describe('block layout', () => {
  it('starts the ink at the top edge, whatever the first line holds', () => {
    const plain = layoutHandwriting('hello', { x: 100, top: 300, seed: 1 });
    const tall = layoutHandwriting('$\\frac{a}{b}$ hello', { x: 100, top: 300, seed: 1 });
    for (const w of [plain, tall]) {
      expect(w.bounds.minY).toBeGreaterThan(300 - S * 0.4);
      expect(w.bounds.minY).toBeLessThan(300 + S * 0.9);
    }
  });

  it('reports where the next line and the next block go', () => {
    const w = layoutHandwriting('one\ntwo', { x: 100, top: 300, lineHeight: 40 });
    expect(w.nextLine).toEqual({ x: 100, baseline: w.end.baseline + 40 });
    expect(w.below).toBeGreaterThan(w.bounds.maxY - 1);
    expect(w.below).toBeLessThan(w.end.baseline + S);
    const next = layoutHandwriting('three', { x: 100, top: w.below + 24 });
    expect(next.bounds.minY).toBeGreaterThan(w.bounds.maxY);
  });

  it('needs a baseline or a top', () => {
    expect(() => layoutHandwriting('x', { x: 0 })).toThrow();
  });

  it('puts display math at the left edge when asked', () => {
    const centred = layoutHandwriting('$$x = 1$$', { x: 100, top: 0, maxWidth: 600 });
    const left = layoutHandwriting('$$x = 1$$', { x: 100, top: 0, maxWidth: 600, displayAlign: 'left' });
    expect(left.bounds.minX).toBeLessThan(100 + S);
    expect(centred.bounds.minX).toBeGreaterThan(300);
  });
});

describe('aligned rows', () => {
  /**
   * Left edge of each row's "=": its two bars are the only short flat
   * strokes when the rows use letters without bars of their own.
   */
  function equalsXs(strokes: StrokePoint[][]): number[] {
    const bars = strokes
      .map(boundsOf)
      .filter((b) => b.maxY - b.minY < S * 0.25 && b.maxX - b.minX > S * 0.4)
      .sort((a, b) => a.minY - b.minY);
    const xs: number[] = [];
    for (let i = 0; i + 1 < bars.length; i += 2) xs.push(Math.min(bars[i].minX, bars[i + 1].minX));
    return xs;
  }

  it('lines every row up on its alignment mark', () => {
    const w = layoutHandwriting('$$ a &= b \\\\ ccc &= d \\\\ nnnnn &= o $$', { x: 100, top: 100, seed: 3 });
    expect(w.missing).toEqual([]);
    const xs = equalsXs(w.strokes);
    expect(xs).toHaveLength(3);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(S * 0.3);
    // The left sides are right-aligned to it, so the longest one starts furthest left.
    expect(w.bounds.minX).toBeLessThan(xs[0] - S * 3);
  });

  it('stacks rows downward with room for fractions', () => {
    const one = layoutHandwriting('$$ y = \\frac{1}{2} $$', { x: 100, top: 100, seed: 3 });
    const two = layoutHandwriting('$$ y &= \\frac{1}{2} \\\\ &= \\frac{2}{4} $$', { x: 100, top: 100, seed: 3 });
    const height = (r: Rect) => r.maxY - r.minY;
    // The second row sits a full fraction height plus a gap below the first.
    expect(height(two.bounds)).toBeGreaterThan(height(one.bounds) * 2);
    expect(two.missing).toEqual([]);
  });

  it('accepts \\begin{aligned} and rows without an alignment mark', () => {
    const a = layoutHandwriting('$$\\begin{aligned} a &= b \\\\ &= c \\end{aligned}$$', { x: 0, top: 0 });
    expect(a.missing).toEqual([]);
    const b = layoutHandwriting('$$ a + b \\\\ c + d $$', { x: 0, top: 0 });
    expect(b.missing).toEqual([]);
    expect(b.bounds.maxY - b.bounds.minY).toBeGreaterThan(S * 2.5);
  });

  it('writes a note just after its own row, wherever other rows end', () => {
    const w = layoutHandwriting('$$ a &= b \\\\ a &= c + c + c + c + c + c \\note{oc} $$', { x: 0, top: 0, seed: 2 });
    expect(w.missing).toEqual([]);
    const second = w.strokes.map(boundsOf).filter((b) => b.minY > S * 2);
    const sorted = [...second].sort((p, q) => p.minX - q.minX);
    // The note's two letters (one stroke each) are the rightmost strokes of the second row, after a clear gap.
    const note = sorted.slice(-2);
    const rest = sorted.slice(0, -2);
    const gap = Math.min(...note.map((b) => b.minX)) - Math.max(...rest.map((b) => b.maxX));
    expect(gap).toBeGreaterThan(S);
    expect(gap).toBeLessThan(S * 2.5);
    const short = layoutHandwriting('$$ a &= b \\note{oc} \\\\ a &= c + c + c + c + c + c $$', { x: 0, top: 0, seed: 2 });
    const first = short.strokes.map(boundsOf).filter((b) => b.maxY < S * 2);
    // On the short row the note stays near its row, well left of where the long row ends.
    expect(Math.max(...first.map((b) => b.maxX))).toBeLessThan(short.bounds.maxX - S * 3);
  });

  it('writes subscripts and superscripts inside a note', () => {
    const w = layoutHandwriting('$$ x = 1 \\note{K_b or x^2} $$', { x: 0, top: 0 });
    expect(w.missing).toEqual([]);
  });

  it('writes reaction arrows and keeps spaces at the edges of text', () => {
    const w = layoutHandwriting('$$ BH^+ + H_2O \\rightleftharpoons B + H_3O^+ $$', { x: 0, top: 0 });
    expect(w.missing).toEqual([]);
    const tight = layoutHandwriting('$\\text{salt}x$', { x: 0, top: 0, seed: 4 });
    const spaced = layoutHandwriting('$\\text{salt }x$', { x: 0, top: 0, seed: 4 });
    expect(spaced.bounds.maxX - tight.bounds.maxX).toBeGreaterThan(S * 0.4);
  });

  it('keeps a bracket that starts a row, and drops a row-spacing length', () => {
    const plain = layoutHandwriting('$$ a &= b \\\\ c &= d $$', { x: 0, top: 0, seed: 1 });
    const bracket = layoutHandwriting('$$ a &= b \\\\ [c] &= d $$', { x: 0, top: 0, seed: 1 });
    const spaced = layoutHandwriting('$$ a &= b \\\\[4pt] c &= d $$', { x: 0, top: 0, seed: 1 });
    expect(bracket.strokes.length).toBe(plain.strokes.length + 2);
    expect(spaced.strokes.length).toBe(plain.strokes.length);
    expect(spaced.missing).toEqual([]);
  });

  it('does not split on \\\\ or & inside braces', () => {
    const w = layoutHandwriting('$$ \\frac{a}{b} = c $$', { x: 0, top: 0 });
    expect(w.lines).toBe(1);
    expect(w.missing).toEqual([]);
  });
});

describe('stroke groups', () => {
  /** Engine with two grouped strokes and one loose stroke, each a short horizontal line. */
  function setup() {
    const engine = new CanvasEngine();
    const line = (y: number, group?: string) =>
      new Stroke(
        [0, 10, 20, 30, 40].map((x, i) => ({ x, y, pressure: 0.5, time: i * 10 })),
        DEFAULT_PEN_STYLE,
        undefined,
        undefined,
        group,
      );
    const a = line(0, 'g1');
    const b = line(100, 'g1');
    const c = line(200);
    engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, [a, b, c]));
    return { engine, a, b, c };
  }

  it('keeps the group through moves, splits and save/load', () => {
    const { a } = setup();
    expect(a.transformed(translation(5, 5)).group).toBe('g1');
    expect(a.withPoints(a.points.slice(0, 3)).group).toBe('g1');
    expect(a.toBaked().group).toBe('g1');
    expect((objectFromJSON(a.toJSON()) as Stroke).group).toBe('g1');
  });

  it('selects the whole group when the lasso catches part of it', () => {
    const { engine, a, b } = setup();
    engine.setTool(new LassoTool());
    const loop: [number, number][] = [[-10, -10], [50, -10], [50, 10], [-10, 10], [-10, -10]];
    engine.pointerDown(ptr(loop[0][0], loop[0][1], 0));
    loop.slice(1).forEach(([x, y], i) => engine.pointerMove(ptr(x, y, (i + 1) * 16)));
    engine.pointerUp(ptr(-10, -10, 100));
    expect([...engine.selection.items].sort()).toEqual([a.id, b.id].sort());
  });

  it('removes the whole group with the object eraser, and leaves other ink', () => {
    const { engine, c } = setup();
    engine.setTool(new EraserTool({ mode: 'object', radius: 8 }));
    engine.pointerDown(ptr(20, 0, 0));
    engine.pointerMove(ptr(22, 0, 16));
    engine.pointerUp(ptr(22, 0, 32));
    expect(engine.doc.activeLayer.items.map((o) => o.id)).toEqual([c.id]);
  });

  it('lists a group as one line in a view', () => {
    const { engine, c } = setup();
    const text = describeView(engine.doc, {
      rect: { minX: -50, minY: -50, maxX: 300, maxY: 300 },
      scale: 1,
      width: 350,
      height: 350,
      gridStep: 64,
    });
    const lines = text.split('\n').filter((l) => l.includes('bbox('));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^g1 group of 2 strokes pen #1e1e1e bbox\(/);
    expect(lines[1]).toContain(`${c.id} stroke pen`);
  });

  it('gives inkStrokes a shared group when asked', () => {
    const ink = layoutHandwriting('hi', { x: 0, top: 0 });
    expect(inkStrokes(ink).every((s) => s.group === undefined)).toBe(true);
    expect(inkStrokes(ink, DEFAULT_PEN_STYLE, 'g9').every((s) => s.group === 'g9')).toBe(true);
  });
});

describe('writeInk', () => {
  /** A fake clock and timer queue. */
  function clock() {
    let t = 0;
    const timers: (() => void)[] = [];
    return {
      now: () => t,
      setTimer: (fn: () => void) => {
        timers.push(fn);
        return () => {
          const i = timers.indexOf(fn);
          if (i >= 0) timers.splice(i, 1);
        };
      },
      /** Moves time forward and runs the pending timer, if any. */
      advance(ms: number) {
        t += ms;
        timers.shift()?.();
      },
      pending: () => timers.length,
    };
  }

  it('adds everything at once as one undo step and one group, and reveals it in order', async () => {
    const engine = new CanvasEngine();
    const ink = layoutHandwriting('abc def', { x: 0, top: 0 });
    const c = clock();
    const w = writeInk(engine, ink, { speed: 2, maxDuration: Infinity, now: c.now, setTimer: c.setTimer });

    expect(engine.doc.activeLayer.items).toHaveLength(ink.strokes.length);
    expect(new Set(w.strokes.map((s) => s.group))).toEqual(new Set([w.group]));
    // The first stroke is not finished at time 0, so everything starts concealed.
    expect(engine.overlay.state.concealed).toHaveLength(ink.strokes.length);

    c.advance(ink.duration / 4);
    const midway = engine.overlay.state.concealed.length;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(ink.strokes.length);
    // What is still concealed is the end of the writing, not the start.
    expect(engine.overlay.state.concealed).toContain(w.strokes[w.strokes.length - 1].id);
    expect(engine.overlay.state.concealed).not.toContain(w.strokes[0].id);

    c.advance(ink.duration);
    expect(engine.overlay.state.concealed).toHaveLength(0);
    expect(c.pending()).toBe(0);
    await w.done;

    engine.undo();
    expect(engine.doc.activeLayer.items).toHaveLength(0);
  });

  it('never takes longer than maxDuration, however long the ink is', () => {
    const engine = new CanvasEngine();
    const text = Array.from({ length: 8 }, () => 'the quick brown fox jumps over the lazy dog').join('\n');
    const ink = layoutHandwriting(text, { x: 0, top: 0 });
    // Far longer than the cap even at the default speed.
    expect(ink.duration / 6).toBeGreaterThan(5000);
    const c = clock();
    writeInk(engine, ink, { now: c.now, setTimer: c.setTimer });
    c.advance(750);
    const half = engine.overlay.state.concealed.length;
    expect(half).toBeGreaterThan(ink.strokes.length * 0.3);
    expect(half).toBeLessThan(ink.strokes.length * 0.7);
    c.advance(760);
    expect(engine.overlay.state.concealed).toHaveLength(0);
  });

  it('shows everything at once with speed 0, or on finish', async () => {
    const engine = new CanvasEngine();
    const ink = layoutHandwriting('hello', { x: 0, top: 0 });
    const now = writeInk(engine, ink, { speed: 0 });
    expect(engine.overlay.state.concealed).toHaveLength(0);
    await now.done;

    const c = clock();
    const later = writeInk(engine, ink, { now: c.now, setTimer: c.setTimer });
    expect(engine.overlay.state.concealed.length).toBeGreaterThan(0);
    later.finish();
    expect(engine.overlay.state.concealed).toHaveLength(0);
    expect(c.pending()).toBe(0);
    await later.done;
  });

  it('leaves other concealed ink alone', () => {
    const engine = new CanvasEngine();
    const c = clock();
    const first = writeInk(engine, layoutHandwriting('one', { x: 0, top: 0 }), { now: c.now, setTimer: c.setTimer });
    const second = writeInk(engine, layoutHandwriting('two', { x: 0, top: 100 }), { now: c.now, setTimer: c.setTimer });
    second.finish();
    expect(engine.overlay.state.concealed).toEqual(first.strokes.map((s) => s.id));
  });
});

describe('the on-screen area', () => {
  it('is null until a view reports its size, then follows the camera', () => {
    const engine = new CanvasEngine();
    expect(engine.viewport).toBeNull();
    engine.setViewSize(800, 600);
    expect(engine.viewport).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 });
    engine.camera.panBy(-100, -50);
    expect(engine.viewport).toEqual({ minX: 100, minY: 50, maxX: 900, maxY: 650 });
  });

  it('is described in a view when given', () => {
    const engine = new CanvasEngine();
    const frame = { rect: { minX: 0, minY: 0, maxX: 1000, maxY: 800 }, scale: 1, width: 1000, height: 800, gridStep: 128 };
    const partly = describeView(engine.doc, { ...frame, viewport: { minX: 200, minY: 100, maxX: 700, maxY: 500 } });
    expect(partly).toContain("The user's screen shows x 200 to 700, y 100 to 500, outlined in orange.");
    const all = describeView(engine.doc, { ...frame, viewport: { minX: -50, minY: -50, maxX: 2000, maxY: 2000 } });
    expect(all).toContain('all of this view is on it');
    const none = describeView(engine.doc, { ...frame, viewport: { minX: 5000, minY: 0, maxX: 6000, maxY: 800 } });
    expect(none).toContain('none of this view is on it');
    expect(describeView(engine.doc, frame)).not.toContain("user's screen");
  });
});
