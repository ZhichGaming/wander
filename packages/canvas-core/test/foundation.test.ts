/**
 * Wander — Zhich, Yu, Justin
 * Tests for the core foundation: camera, document, commands and serializer.
 */

import { describe, expect, it } from 'vitest';
import {
  Camera,
  CanvasEngine,
  DeleteObjects,
  Stroke,
  TransformObjects,
  translation,
  type PointerInput,
} from '../src';

/** Builds a pointer sample at world (x, y). */
function ptr(x: number, y: number, time: number): PointerInput {
  return { pointerId: 1, kind: 'touch', x, y, pressure: 0.5, time, additive: false };
}

/** Draws a straight stroke through the engine and returns its id. */
function draw(engine: CanvasEngine, x0: number, y0: number): string {
  engine.pointerDown(ptr(x0, y0, 0));
  for (let i = 1; i <= 10; i++) engine.pointerMove(ptr(x0 + i * 5, y0, i * 8));
  engine.pointerUp(ptr(x0 + 50, y0, 90));
  const items = engine.doc.activeLayer.items;
  return items[items.length - 1].id;
}

describe('Camera', () => {
  it('round-trips world and screen points', () => {
    const cam = new Camera({ x: 100, y: -50, scale: 2.5 });
    const w = { x: 123.4, y: 567.8 };
    const back = cam.screenToWorld(cam.worldToScreen(w));
    expect(back.x).toBeCloseTo(w.x);
    expect(back.y).toBeCloseTo(w.y);
  });

  it('keeps the anchor fixed when zooming and clamps scale', () => {
    const cam = new Camera();
    const anchor = { x: 300, y: 200 };
    const before = cam.screenToWorld(anchor);
    cam.zoomAt(anchor, 3);
    const after = cam.screenToWorld(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    cam.zoomAt(anchor, 1e6);
    expect(cam.scale).toBe(64);
  });
});

describe('CanvasEngine drawing and undo', () => {
  it('draws, undoes and redoes a stroke', () => {
    const engine = new CanvasEngine();
    const id = draw(engine, 0, 0);
    expect(engine.doc.getObject(id)).toBeInstanceOf(Stroke);
    expect(engine.doc.queryRect({ minX: 10, minY: -5, maxX: 20, maxY: 5 }).map((o) => o.id)).toEqual([id]);
    engine.undo();
    expect(engine.doc.getObject(id)).toBeUndefined();
    engine.redo();
    expect(engine.doc.getObject(id)).toBeDefined();
  });

  it('restores deleted objects at their original z position', () => {
    const engine = new CanvasEngine();
    const ids = [draw(engine, 0, 0), draw(engine, 0, 10), draw(engine, 0, 20)];
    engine.history.execute(new DeleteObjects([ids[0], ids[2]]));
    expect(engine.doc.activeLayer.items.map((o) => o.id)).toEqual([ids[1]]);
    engine.undo();
    expect(engine.doc.activeLayer.items.map((o) => o.id)).toEqual(ids);
  });

  it('groups several commands into one undo step', () => {
    const engine = new CanvasEngine();
    const a = draw(engine, 0, 0);
    engine.history.group('AI answer', () => {
      engine.history.execute(new TransformObjects([a], translation(100, 0)));
      draw(engine, 0, 50);
    });
    expect(engine.doc.activeLayer.items).toHaveLength(2);
    engine.undo();
    expect(engine.doc.activeLayer.items).toHaveLength(1);
    expect((engine.doc.getObject(a) as Stroke).points[0].x).toBe(0);
  });
});

describe('Serializer', () => {
  it('round-trips a document through JSON', () => {
    const engine = new CanvasEngine();
    draw(engine, 0, 0);
    draw(engine, 5, 30);
    const json = JSON.parse(JSON.stringify(engine.save()));
    const other = new CanvasEngine();
    other.load(json);
    expect(other.save()).toEqual(engine.save());
  });
});
