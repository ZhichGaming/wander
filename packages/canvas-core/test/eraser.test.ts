/**
 * Wander — Zhich, Yu, Justin
 * Tests for the vector eraser: object mode, partial (splitting) mode,
 * one-step undo and locked layers.
 */

import { describe, expect, it } from 'vitest';
import { CanvasEngine, CreateObjects, Layer, Stroke, UpdateLayer, DEFAULT_PEN_STYLE, type PointerInput } from '../src';
import { EraserTool } from '../src/tools/EraserTool';
import { SplitStroke } from '../src/commands/EraseCommands';
import { distanceToSegment } from '../src/math/geometry';

/** Builds a pointer sample at world (x, y). */
function ptr(x: number, y: number, time = 0): PointerInput {
  return { pointerId: 1, kind: 'pen', x, y, pressure: 0.5, time, additive: false };
}

/** Horizontal stroke from (x0, y) to (x0 + 100, y) with a point every 5 units. */
function line(x0: number, y: number): Stroke {
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: x0 + i * 5, y, pressure: 0.5, time: i });
  return new Stroke(pts, DEFAULT_PEN_STYLE);
}

/** Adds strokes to the active layer as one command and returns them. */
function addStrokes(engine: CanvasEngine, strokes: Stroke[]): Stroke[] {
  engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, strokes));
  return strokes;
}

/** Drags the active tool from (x0, y0) to (x1, y1) in a single fast move. */
function drag(engine: CanvasEngine, x0: number, y0: number, x1: number, y1: number): void {
  engine.pointerDown(ptr(x0, y0, 0));
  engine.pointerMove(ptr(x1, y1, 10));
  engine.pointerUp(ptr(x1, y1, 20));
}

/** Ids of the active layer's objects in z order. */
function ids(engine: CanvasEngine): string[] {
  return engine.doc.activeLayer.items.map((o) => o.id);
}

describe('EraserTool object mode', () => {
  it('removes only touched strokes and undoes the whole drag in one step', () => {
    const engine = new CanvasEngine();
    const [a, b, c] = addStrokes(engine, [line(0, 0), line(0, 50), line(0, 100)]);
    engine.setTool(new EraserTool({ mode: 'object', radius: 5 }));
    // One fast vertical drag across a and b, stopping well above c.
    drag(engine, 50, -20, 50, 60);
    expect(ids(engine)).toEqual([c.id]);
    expect(engine.overlay.state.eraser).toBeNull();
    engine.undo();
    expect(ids(engine)).toEqual([a.id, b.id, c.id]);
  });

  it('leaves strokes on locked layers alone', () => {
    const engine = new CanvasEngine();
    const [a] = addStrokes(engine, [line(0, 0)]);
    engine.history.execute(new UpdateLayer(engine.doc.activeLayer.id, { locked: true }));
    engine.setTool(new EraserTool({ mode: 'object', radius: 5 }));
    drag(engine, 50, -20, 50, 20);
    expect(ids(engine)).toEqual([a.id]);
  });

  it('scales the radius with the camera zoom', () => {
    const engine = new CanvasEngine();
    addStrokes(engine, [line(0, 0)]);
    engine.camera.set({ x: 0, y: 0, scale: 0.25 }); // 5 px is 20 world units
    engine.setTool(new EraserTool({ mode: 'object', radius: 5 }));
    drag(engine, 50, 20, 50, 20);
    expect(ids(engine)).toEqual([]);
  });
});

describe('EraserTool partial mode', () => {
  it('splits a stroke into two pieces that avoid the eraser, keeping z order', () => {
    const engine = new CanvasEngine();
    const [below, target, above] = addStrokes(engine, [line(0, 30), line(0, 0), line(0, -30)]);
    const radius = 5;
    engine.setTool(new EraserTool({ mode: 'partial', radius }));
    drag(engine, 50, 0, 50, 0);

    const items = engine.doc.activeLayer.items;
    expect(items).toHaveLength(4);
    expect(items[0].id).toBe(below.id);
    expect(items[3].id).toBe(above.id);
    const pieces = [items[1], items[2]] as Stroke[];
    expect(pieces.every((p) => p instanceof Stroke && p.id !== target.id)).toBe(true);
    const reach = radius + DEFAULT_PEN_STYLE.width / 2;
    for (const p of pieces) {
      for (const pt of p.points) expect(Math.hypot(pt.x - 50, pt.y)).toBeGreaterThan(reach - 1e-6);
    }
    // Clean cuts: each piece ends right at the eraser edge.
    expect(pieces[0].points[pieces[0].points.length - 1].x).toBeCloseTo(50 - reach, 3);
    expect(pieces[1].points[0].x).toBeCloseTo(50 + reach, 3);

    engine.undo();
    expect(ids(engine)).toEqual([below.id, target.id, above.id]);
    expect(engine.doc.getObject(target.id)).toBe(target);
  });

  it('erases along a fast swept segment and undoes in one step', () => {
    const engine = new CanvasEngine();
    const [target] = addStrokes(engine, [line(0, 0)]);
    engine.setTool(new EraserTool({ mode: 'partial', radius: 2 }));
    // Two crossings in one drag (down at x=20, then across at x=80 via a bend).
    engine.pointerDown(ptr(20, -20));
    engine.pointerMove(ptr(20, 20, 1));
    engine.pointerMove(ptr(80, 20, 2));
    engine.pointerMove(ptr(80, -20, 3));
    engine.pointerUp(ptr(80, -20, 4));
    const pieces = engine.doc.activeLayer.items as Stroke[];
    expect(pieces).toHaveLength(3);
    for (const p of pieces) {
      for (const pt of p.points) {
        expect(distanceToSegment(pt, { x: 20, y: -20 }, { x: 20, y: 20 })).toBeGreaterThan(3.5 - 1e-6);
        expect(distanceToSegment(pt, { x: 80, y: -20 }, { x: 80, y: 20 })).toBeGreaterThan(3.5 - 1e-6);
      }
    }
    engine.undo();
    expect(ids(engine)).toEqual([target.id]);
  });

  it('skips locked layers and drops pieces that are too short', () => {
    const engine = new CanvasEngine();
    const locked = new Layer({ name: 'Locked', locked: true });
    engine.doc.addLayer(locked, 0);
    const kept = line(0, 0);
    engine.doc.addObject(locked.id, kept);
    const short = new Stroke(
      [
        { x: 0, y: 0, pressure: 0.5, time: 0 },
        { x: 1, y: 0, pressure: 0.5, time: 1 },
      ],
      DEFAULT_PEN_STYLE,
    );
    addStrokes(engine, [short]);
    engine.setTool(new EraserTool({ mode: 'partial', radius: 10 }));
    drag(engine, 0, 0, 0, 0);
    expect(engine.doc.activeLayer.items).toHaveLength(0);
    expect(engine.doc.getObject(kept.id)).toBe(kept);
  });
});

describe('SplitStroke', () => {
  it('redoes with the same pieces after undo', () => {
    const engine = new CanvasEngine();
    const [s] = addStrokes(engine, [line(0, 0)]);
    const pieces = [s.withPoints(s.points.slice(0, 5)), s.withPoints(s.points.slice(10))];
    engine.history.execute(new SplitStroke(s.id, pieces));
    expect(ids(engine)).toEqual(pieces.map((p) => p.id));
    engine.undo();
    expect(ids(engine)).toEqual([s.id]);
    engine.redo();
    expect(ids(engine)).toEqual(pieces.map((p) => p.id));
  });
});
