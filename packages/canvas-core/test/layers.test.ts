/**
 * Wander — Zhich, Yu, Justin
 * Tests for layer and background commands and the active-layer rules.
 */

import { describe, expect, it } from 'vitest';
import {
  AddLayer,
  CanvasEngine,
  DEFAULT_BACKGROUND,
  Layer,
  MoveLayer,
  RemoveLayer,
  SetBackground,
  UpdateLayer,
  type PointerInput,
} from '../src';

/** Builds a pointer sample at world (x, y). */
function ptr(x: number, y: number, time: number): PointerInput {
  return { pointerId: 1, kind: 'touch', x, y, pressure: 0.5, time, additive: false };
}

/** Draws a short horizontal stroke. */
function draw(engine: CanvasEngine, y: number): void {
  engine.pointerDown(ptr(0, y, 0));
  engine.pointerMove(ptr(20, y, 10));
  engine.pointerUp(ptr(40, y, 20));
}

describe('layers', () => {
  it('draws on the active layer and undoes layer creation', () => {
    const engine = new CanvasEngine();
    const base = engine.doc.activeLayer.id;
    const top = new Layer({ name: 'Notes' });
    engine.history.execute(new AddLayer(top));
    expect(engine.doc.activeLayer.id).toBe(top.id);
    draw(engine, 0);
    expect(top.items).toHaveLength(1);
    engine.undo(); // stroke
    engine.undo(); // layer
    expect(engine.doc.layers.map((l) => l.id)).toEqual([base]);
    expect(engine.doc.activeLayer.id).toBe(base);
  });

  it('removes a layer with its objects and restores both on undo', () => {
    const engine = new CanvasEngine();
    const top = new Layer({ name: 'Top' });
    engine.history.execute(new AddLayer(top));
    draw(engine, 0);
    const strokeId = top.items[0].id;
    engine.history.execute(new RemoveLayer(top.id));
    expect(engine.doc.getObject(strokeId)).toBeUndefined();
    expect(engine.doc.queryRect({ minX: -10, minY: -10, maxX: 50, maxY: 10 })).toHaveLength(0);
    engine.undo();
    expect(engine.doc.getObject(strokeId)).toBeDefined();
    expect(engine.doc.activeLayer.id).toBe(top.id);
  });

  it('reorders layers and hides them from queries', () => {
    const engine = new CanvasEngine();
    const base = engine.doc.activeLayer.id;
    const top = new Layer();
    engine.history.execute(new AddLayer(top));
    engine.history.execute(new MoveLayer(top.id, 0));
    expect(engine.doc.layers.map((l) => l.id)).toEqual([top.id, base]);
    draw(engine, 0);
    engine.history.execute(new UpdateLayer(top.id, { visible: false }));
    expect(engine.doc.queryRect({ minX: -10, minY: -10, maxX: 50, maxY: 10 })).toHaveLength(0);
    engine.undo();
    expect(engine.doc.queryRect({ minX: -10, minY: -10, maxX: 50, maxY: 10 })).toHaveLength(1);
  });

  it('does not draw on a locked layer', () => {
    const engine = new CanvasEngine();
    engine.history.execute(new UpdateLayer(engine.doc.activeLayer.id, { locked: true }));
    draw(engine, 0);
    expect(engine.doc.activeLayer.items).toHaveLength(0);
  });

  it('changes and restores the background', () => {
    const engine = new CanvasEngine();
    engine.history.execute(new SetBackground({ ...DEFAULT_BACKGROUND, pattern: 'dots', spacing: 20 }));
    expect(engine.doc.background.pattern).toBe('dots');
    engine.undo();
    expect(engine.doc.background).toEqual(DEFAULT_BACKGROUND);
  });
});
