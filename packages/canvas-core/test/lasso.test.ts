/**
 * Wander — Zhich, Yu, Justin
 * Tests for the lasso tool (select, multi-select, tap to clear, move,
 * delete) and the polygon helpers it uses.
 */

import { describe, expect, it } from 'vitest';
import { CanvasEngine, CreateObjects, Stroke, DEFAULT_PEN_STYLE, type PointerInput } from '../src';
import { pointInPolygon, polygonBounds } from '../src/math/polygon';
import { deleteSelection, LassoTool } from '../src/tools/LassoTool';

/** Builds a pointer sample at world (x, y). */
function ptr(x: number, y: number, additive = false): PointerInput {
  return { pointerId: 1, kind: 'pen', x, y, pressure: 0.5, time: 0, additive };
}

/** Adds a horizontal 40-unit stroke starting at (x, y) to the active layer; returns its id. */
function addStroke(engine: CanvasEngine, x: number, y: number): string {
  const points = Array.from({ length: 5 }, (_, i) => ({ x: x + i * 10, y, pressure: 0.5, time: i }));
  const stroke = new Stroke(points, DEFAULT_PEN_STYLE);
  engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, [stroke]));
  return stroke.id;
}

/** Drags the lasso around the axis-aligned box (x0, y0)-(x1, y1). */
function lassoBox(engine: CanvasEngine, x0: number, y0: number, x1: number, y1: number, additive = false): void {
  engine.pointerDown(ptr(x0, y0, additive));
  engine.pointerMove(ptr(x1, y0, additive));
  engine.pointerMove(ptr(x1, y1, additive));
  engine.pointerMove(ptr(x0, y1, additive));
  engine.pointerUp(ptr(x0, y0, additive));
}

/** Engine with a lasso and three strokes at y = 0, 100 and 200. */
function setup(): { engine: CanvasEngine; tool: LassoTool; ids: string[] } {
  const engine = new CanvasEngine();
  const ids = [addStroke(engine, 0, 0), addStroke(engine, 0, 100), addStroke(engine, 0, 200)];
  const tool = new LassoTool();
  engine.setTool(tool);
  return { engine, tool, ids };
}

describe('polygon helpers', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('tests points against a polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 5 }, [])).toBe(false);
  });

  it('computes polygon bounds', () => {
    expect(polygonBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('LassoTool', () => {
  it('selects exactly the strokes mostly inside the lasso', () => {
    const { engine, ids } = setup();
    lassoBox(engine, -10, -10, 25, 110);
    // Each stroke spans x 0..40; x <= 25 covers 3 of its 5 points.
    expect(engine.selection.items).toEqual([ids[0], ids[1]]);
    expect(engine.overlay.state.lasso).toBeNull();
  });

  it('does not select a stroke with only a minority of points inside', () => {
    const { engine } = setup();
    lassoBox(engine, -10, -10, 15, 10);
    expect(engine.selection.size).toBe(0);
  });

  it('adds to the selection when additive and replaces it otherwise', () => {
    const { engine, ids } = setup();
    lassoBox(engine, -10, -10, 50, 10);
    lassoBox(engine, -10, 190, 50, 210, true);
    expect(engine.selection.items).toEqual([ids[0], ids[2]]);
    lassoBox(engine, -10, 90, 50, 110);
    expect(engine.selection.items).toEqual([ids[1]]);
  });

  it('clears the selection on a tap outside it', () => {
    const { engine } = setup();
    lassoBox(engine, -10, -10, 50, 10);
    expect(engine.selection.size).toBe(1);
    engine.pointerDown(ptr(500, 500));
    engine.pointerUp(ptr(501, 500));
    expect(engine.selection.size).toBe(0);
  });

  it('moves the selection by the drag delta in one undo step', () => {
    const { engine, tool, ids } = setup();
    lassoBox(engine, -10, -10, 50, 110);
    engine.pointerDown(ptr(20, 0));
    engine.pointerMove(ptr(40, 30));
    expect(tool.dragOffset).toEqual({ x: 20, y: 30 });
    expect((engine.doc.getObject(ids[0]) as Stroke).points[0]).toMatchObject({ x: 0, y: 0 });
    engine.pointerUp(ptr(50, 50));
    expect(tool.dragOffset).toBeNull();
    expect((engine.doc.getObject(ids[0]) as Stroke).points[0]).toMatchObject({ x: 30, y: 50 });
    expect((engine.doc.getObject(ids[1]) as Stroke).points[0]).toMatchObject({ x: 30, y: 150 });
    expect((engine.doc.getObject(ids[2]) as Stroke).points[0]).toMatchObject({ x: 0, y: 200 });
    expect(engine.history.state.undoLabel).toBe('Move');
    engine.undo();
    expect((engine.doc.getObject(ids[0]) as Stroke).points[0]).toMatchObject({ x: 0, y: 0 });
    expect((engine.doc.getObject(ids[1]) as Stroke).points[0]).toMatchObject({ x: 0, y: 100 });
  });

  it('restores everything when a move is cancelled', () => {
    const { engine, tool, ids } = setup();
    lassoBox(engine, -10, -10, 50, 10);
    engine.pointerDown(ptr(20, 0));
    engine.pointerMove(ptr(80, 80));
    engine.cancelGesture();
    expect(tool.dragOffset).toBeNull();
    expect((engine.doc.getObject(ids[0]) as Stroke).points[0]).toMatchObject({ x: 0, y: 0 });
    expect(engine.history.state.undoLabel).toBe('Draw');
  });

  it('skips objects on hidden and locked layers', () => {
    const { engine, ids } = setup();
    const layerId = engine.doc.activeLayer.id;
    engine.doc.updateLayer(layerId, { visible: false });
    lassoBox(engine, -10, -10, 50, 210);
    expect(engine.selection.size).toBe(0);
    engine.doc.updateLayer(layerId, { visible: true, locked: true });
    lassoBox(engine, -10, -10, 50, 210);
    expect(engine.selection.size).toBe(0);
    engine.doc.updateLayer(layerId, { locked: false });
    lassoBox(engine, -10, -10, 50, 210);
    expect(engine.selection.items).toEqual(ids);
  });

  it('deletes the selection in one undo step', () => {
    const { engine, ids } = setup();
    lassoBox(engine, -10, -10, 50, 110);
    expect(deleteSelection(engine)).toBe(true);
    expect(engine.selection.size).toBe(0);
    expect(engine.doc.activeLayer.items.map((o) => o.id)).toEqual([ids[2]]);
    engine.undo();
    expect(engine.doc.activeLayer.items.map((o) => o.id)).toEqual(ids);
    expect(deleteSelection(engine)).toBe(false);
  });
});
