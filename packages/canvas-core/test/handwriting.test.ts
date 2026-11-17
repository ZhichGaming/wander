/**
 * Wander — Zhich, Yu, Justin
 * Tests for generated handwriting: layout, wrapping, variation, timing,
 * pressure, and the strokes it hands to the document.
 */

import { describe, expect, it } from 'vitest';
import {
  CanvasEngine,
  CreateObjects,
  DEFAULT_PEN_STYLE,
  HANDWRITING_CHARACTERS,
  inkStrokes,
  layoutHandwriting,
  NEAT_HAND,
} from '../src';

const at = { x: 100, baseline: 200 };

describe('layoutHandwriting', () => {
  it('writes every supported character', () => {
    const w = layoutHandwriting(HANDWRITING_CHARACTERS, { ...at, maxWidth: 2000 });
    expect(w.missing).toEqual([]);
    expect(w.strokes.length).toBeGreaterThanOrEqual(HANDWRITING_CHARACTERS.length);
    for (const s of w.strokes) expect(s.length).toBeGreaterThan(1);
  });

  it('starts at x and sits on the baseline', () => {
    const w = layoutHandwriting('mum', at);
    const xh = NEAT_HAND.xHeight;
    expect(w.bounds.minX).toBeGreaterThan(at.x - xh * 0.3);
    expect(w.bounds.minX).toBeLessThan(at.x + xh * 0.3);
    // x-height letters only: from about one x-height above the baseline down to it.
    expect(w.bounds.maxY).toBeGreaterThan(at.baseline - xh * 0.3);
    expect(w.bounds.maxY).toBeLessThan(at.baseline + xh * 0.3);
    expect(w.bounds.minY).toBeGreaterThan(at.baseline - xh * 1.5);
    expect(w.bounds.minY).toBeLessThan(at.baseline - xh * 0.6);
  });

  it('is the same for the same seed and differs for another', () => {
    const a = layoutHandwriting('hello there', { ...at, seed: 5 });
    const b = layoutHandwriting('hello there', { ...at, seed: 5 });
    const c = layoutHandwriting('hello there', { ...at, seed: 6 });
    expect(b.strokes).toEqual(a.strokes);
    expect(c.strokes).not.toEqual(a.strokes);
  });

  it('never writes two copies of a letter identically', () => {
    const w = layoutHandwriting('o o', { ...at, seed: 1 });
    const [first, second] = w.strokes;
    const shape = (s: { x: number; y: number }[]) => s.map((p) => [p.x - s[0].x, p.y - s[0].y]);
    expect(shape(second)).not.toEqual(shape(first));
  });

  it('wraps words at maxWidth onto the next line', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const one = layoutHandwriting(text, at);
    const wrapped = layoutHandwriting(text, { ...at, maxWidth: 200, lineHeight: 40 });
    expect(one.lines).toBe(1);
    expect(wrapped.lines).toBeGreaterThan(1);
    expect(wrapped.bounds.maxX).toBeLessThan(at.x + 200 + NEAT_HAND.xHeight);
    expect(wrapped.end.baseline).toBe(at.baseline + 40 * (wrapped.lines - 1));
  });

  it('starts a new line at each newline', () => {
    const w = layoutHandwriting('one\ntwo\nthree', { ...at, lineHeight: 50 });
    expect(w.lines).toBe(3);
    expect(w.end.baseline).toBe(at.baseline + 100);
  });

  it('reports where to keep writing', () => {
    const w = layoutHandwriting('abc', at);
    expect(w.end.baseline).toBe(at.baseline);
    expect(w.end.x).toBeGreaterThan(w.bounds.maxX - NEAT_HAND.xHeight * 0.5);
    const more = layoutHandwriting(' def', { ...at, x: w.end.x, baseline: w.end.baseline });
    expect(more.bounds.minX).toBeGreaterThan(w.bounds.maxX);
  });

  it('leaves a gap for characters it cannot write and reports them', () => {
    const w = layoutHandwriting('a€b€', at);
    expect(w.missing).toEqual(['€']);
    expect(w.strokes.length).toBe(2);
  });

  it('gives points increasing time from startTime and pressure in range', () => {
    const w = layoutHandwriting('Hi there.', { ...at, startTime: 1000 });
    const points = w.strokes.flat();
    expect(points[0].time).toBeGreaterThan(1000);
    for (let i = 1; i < points.length; i++) expect(points[i].time).toBeGreaterThanOrEqual(points[i - 1].time);
    for (const p of points) {
      expect(p.pressure).toBeGreaterThan(0);
      expect(p.pressure).toBeLessThanOrEqual(1);
    }
    expect(w.duration).toBeCloseTo(points[points.length - 1].time - 1000, 6);
  });

  it('dots the i after the rest of the word', () => {
    const w = layoutHandwriting('in', at);
    // Stroke order: i stem, n, then the dot.
    expect(w.strokes).toHaveLength(3);
    const dot = w.strokes[2];
    expect(dot.length).toBeLessThan(6);
    expect(Math.min(...dot.map((p) => p.y))).toBeLessThan(at.baseline - NEAT_HAND.xHeight);
  });

  it('scales with the style', () => {
    const small = layoutHandwriting('word', { ...at, style: { xHeight: 10 }, seed: 3 });
    const large = layoutHandwriting('word', { ...at, style: { xHeight: 20 }, seed: 3 });
    const width = (r: { minX: number; maxX: number }) => r.maxX - r.minX;
    expect(width(large.bounds) / width(small.bounds)).toBeCloseTo(2, 0);
  });
});

describe('inkStrokes', () => {
  it('makes pen strokes that can be added and undone', () => {
    const engine = new CanvasEngine();
    const strokes = inkStrokes(layoutHandwriting('Hello', at));
    expect(strokes[0].style).toEqual(DEFAULT_PEN_STYLE);
    for (const s of strokes) expect(s.outline.length).toBeGreaterThan(2);

    engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, strokes, 'Write'));
    expect(engine.doc.activeLayer.items).toHaveLength(strokes.length);
    engine.undo();
    expect(engine.doc.activeLayer.items).toHaveLength(0);
  });
});
