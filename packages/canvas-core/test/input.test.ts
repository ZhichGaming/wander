/**
 * Wander — Zhich, Yu, Justin
 * Tests for PointerSession: which contacts draw, which navigate, and the
 * additive flag, driven through a real CanvasEngine.
 */

import { describe, expect, it } from 'vitest';
import { PointerSession, type RawPointerEvent } from '../src/input/PointerSession';
import {
  CanvasEngine,
  CreateObjects,
  DEFAULT_PEN_STYLE,
  LassoTool,
  Stroke,
  type PointerInput,
  type Tool,
} from '../src';

/** Builds a raw screen-space event. */
function ev(
  phase: RawPointerEvent['phase'],
  pointerId: number,
  kind: RawPointerEvent['kind'],
  x: number,
  y: number,
  time: number,
): RawPointerEvent {
  return { phase, pointerId, kind, x, y, time };
}

/** Number of committed objects on the active layer. */
function strokeCount(engine: CanvasEngine): number {
  return engine.doc.activeLayer.items.length;
}

/** Drags one contact horizontally from x0 by `steps` moves of 10 px. */
function drag(s: PointerSession, id: number, kind: RawPointerEvent['kind'], x0: number, y: number, t0: number, steps: number): void {
  for (let i = 1; i <= steps; i++) s.handle(ev('move', id, kind, x0 + i * 10, y, t0 + i * 16));
}

/** Tool that records every PointerInput it receives. */
class RecordingTool implements Tool {
  readonly name = 'recorder';
  readonly events: PointerInput[] = [];
  /** Records a down. */
  onDown(e: PointerInput): void {
    this.events.push(e);
  }
  /** Records a move. */
  onMove(e: PointerInput): void {
    this.events.push(e);
  }
  /** Records an up. */
  onUp(e: PointerInput): void {
    this.events.push(e);
  }
  /** Nothing to drop. */
  onCancel(): void {}
}

describe('PointerSession finger mode', () => {
  it('draws a stroke with one finger', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'finger');
    s.handle(ev('down', 1, 'touch', 0, 0, 0));
    drag(s, 1, 'touch', 0, 0, 0, 5);
    s.handle(ev('up', 1, 'touch', 50, 0, 100));
    expect(strokeCount(engine)).toBe(1);
    expect(engine.doc.activeLayer.items[0]).toBeInstanceOf(Stroke);
    expect(engine.camera.get()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('cancels the draw when a second finger lands quickly, then pans and zooms', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'finger');
    s.handle(ev('down', 1, 'touch', 100, 100, 0));
    s.handle(ev('move', 1, 'touch', 102, 100, 16));
    s.handle(ev('down', 2, 'touch', 200, 100, 40));
    // Spread the fingers apart and move them right.
    s.handle(ev('move', 1, 'touch', 80, 100, 60));
    s.handle(ev('move', 2, 'touch', 240, 100, 60));
    s.handle(ev('up', 1, 'touch', 80, 100, 80));
    s.handle(ev('up', 2, 'touch', 240, 100, 80));
    expect(strokeCount(engine)).toBe(0);
    const cam = engine.camera.get();
    expect(cam.scale).toBeCloseTo(160 / 98); // baseline spread 200 - 102
    expect(cam.x !== 0 || cam.y !== 0).toBe(true);
  });

  it('keeps drawing with additive set when a second finger lands late', () => {
    const engine = new CanvasEngine();
    const tool = new RecordingTool();
    engine.setTool(tool);
    const s = new PointerSession(engine, 'finger');
    s.handle(ev('down', 1, 'touch', 0, 0, 0));
    drag(s, 1, 'touch', 0, 0, 0, 10);
    s.handle(ev('down', 2, 'touch', 300, 300, 500));
    s.handle(ev('move', 1, 'touch', 120, 0, 520));
    s.handle(ev('up', 1, 'touch', 120, 0, 540));
    expect(tool.events[0].additive).toBe(false);
    expect(tool.events[tool.events.length - 1].additive).toBe(true);
    expect(engine.camera.get()).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('PointerSession pencilOnly mode', () => {
  it('pans with a finger and draws with the pen', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'pencilOnly');
    s.handle(ev('down', 1, 'touch', 0, 0, 0));
    drag(s, 1, 'touch', 0, 0, 0, 5);
    s.handle(ev('up', 1, 'touch', 50, 0, 100));
    expect(strokeCount(engine)).toBe(0);
    expect(engine.camera.get().x).toBeCloseTo(-50);

    s.handle({ ...ev('down', 2, 'pen', 0, 0, 200), pressure: 0.8 });
    drag(s, 2, 'pen', 0, 0, 200, 5);
    s.handle(ev('up', 2, 'pen', 50, 0, 300));
    expect(strokeCount(engine)).toBe(1);
    const stroke = engine.doc.activeLayer.items[0] as Stroke;
    expect(stroke.points[0].pressure).toBeCloseTo(0.8);
    expect(stroke.points[1].pressure).toBeCloseTo(0.5);
    // The stroke starts at the world point under the pen after the pan.
    expect(stroke.points[0].x).toBeCloseTo(-50);
  });

  it('sets additive on pen events while a finger is held', () => {
    const engine = new CanvasEngine();
    const tool = new RecordingTool();
    engine.setTool(tool);
    const s = new PointerSession(engine, 'pencilOnly');
    s.handle(ev('down', 1, 'pen', 0, 0, 0));
    s.handle(ev('move', 1, 'pen', 10, 0, 16));
    s.handle(ev('down', 2, 'touch', 300, 300, 20));
    s.handle(ev('move', 2, 'touch', 350, 300, 30));
    s.handle(ev('move', 1, 'pen', 20, 0, 32));
    s.handle(ev('up', 2, 'touch', 350, 300, 40));
    s.handle(ev('move', 1, 'pen', 30, 0, 48));
    s.handle(ev('up', 1, 'pen', 30, 0, 64));
    expect(tool.events.map((e) => e.additive)).toEqual([false, false, true, false, false]);
    // The held finger did not move the camera under the stroke.
    expect(engine.camera.get()).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('PointerSession auto mode', () => {
  it('lets fingers draw until a pen is seen, then fingers navigate', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'auto');
    s.handle(ev('down', 1, 'touch', 0, 0, 0));
    drag(s, 1, 'touch', 0, 0, 0, 5);
    s.handle(ev('up', 1, 'touch', 50, 0, 100));
    expect(strokeCount(engine)).toBe(1);
    expect(s.stylusRules).toBe(false);

    s.handle(ev('down', 2, 'pen', 0, 100, 200));
    drag(s, 2, 'pen', 0, 100, 200, 5);
    s.handle(ev('up', 2, 'pen', 50, 100, 300));
    expect(strokeCount(engine)).toBe(2);
    expect(s.stylusRules).toBe(true);

    s.handle(ev('down', 3, 'touch', 0, 0, 400));
    drag(s, 3, 'touch', 0, 0, 400, 5);
    s.handle(ev('up', 3, 'touch', 50, 0, 500));
    expect(strokeCount(engine)).toBe(2);
    expect(engine.camera.get().x).toBeCloseTo(-50);
  });
});

describe('PointerSession navigation and samples', () => {
  it('keeps the world point under the pinch midpoint fixed', () => {
    const engine = new CanvasEngine();
    engine.camera.set({ x: 30, y: -20, scale: 1.5 });
    const s = new PointerSession(engine, 'pencilOnly');
    s.handle(ev('down', 1, 'touch', 100, 200, 0));
    s.handle(ev('down', 2, 'touch', 300, 200, 0));
    const before = engine.camera.screenToWorld({ x: 200, y: 200 });
    // Symmetric pinch-out about a midpoint that also slides to (250, 260).
    s.handle(ev('move', 1, 'touch', 100, 260, 16));
    s.handle(ev('move', 2, 'touch', 400, 260, 16));
    const after = engine.camera.screenToWorld({ x: 250, y: 260 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(engine.camera.scale).toBeGreaterThan(1.5);
  });

  it('feeds coalesced samples one by one and passes predicted samples', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'pencilOnly');
    s.handle(ev('down', 1, 'pen', 0, 0, 0));
    s.handle({
      ...ev('move', 1, 'pen', 30, 0, 12),
      coalesced: [
        { x: 10, y: 0, time: 4, pressure: 0.3 },
        { x: 20, y: 0, time: 8, pressure: 0.4 },
        { x: 30, y: 0, time: 12, pressure: 0.6 },
      ],
      predicted: [{ x: 40, y: 0, time: 16 }],
    });
    const live = engine.overlay.state.liveStroke;
    expect(live?.points.map((p) => p.x)).toEqual([0, 10, 20, 30]);
    expect(live?.predicted.map((p) => p.x)).toEqual([40]);
    s.handle(ev('up', 1, 'pen', 30, 0, 16));
    expect(strokeCount(engine)).toBe(1);
  });

  it('zooms at the cursor with ctrl+wheel and pans otherwise', () => {
    const engine = new CanvasEngine();
    const s = new PointerSession(engine, 'auto');
    const anchor = { x: 120, y: 80 };
    const before = engine.camera.screenToWorld(anchor);
    s.wheel({ ...anchor, deltaX: 0, deltaY: -100, zoom: true });
    const after = engine.camera.screenToWorld(anchor);
    expect(engine.camera.scale).toBeCloseTo(Math.E);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const cam = engine.camera.get();
    s.wheel({ ...anchor, deltaX: 10, deltaY: 20, zoom: false });
    expect(engine.camera.get().x).toBeCloseTo(cam.x + 10 / cam.scale);
    expect(engine.camera.get().y).toBeCloseTo(cam.y + 20 / cam.scale);
  });
});

describe('PointerSession survives a failed commit', () => {
  it('accepts a second stroke when commit throws', () => {
    const engine = new CanvasEngine();
    const session = new PointerSession(engine, 'finger');
    const execute = engine.history.execute.bind(engine.history);
    let failNext = true;
    engine.history.execute = (cmd) => {
      if (failNext) {
        failNext = false;
        throw new Error('commit failed');
      }
      execute(cmd);
    };

    session.handle(ev('down', 1, 'touch', 0, 0, 0));
    drag(session, 1, 'touch', 0, 0, 0, 5);
    expect(() => session.handle(ev('up', 1, 'touch', 50, 0, 100))).toThrow('commit failed');
    expect(strokeCount(engine)).toBe(0);
    expect(engine.overlay.state.liveStroke).toBeNull();

    session.handle(ev('down', 2, 'touch', 0, 100, 200));
    drag(session, 2, 'touch', 0, 100, 200, 5);
    session.handle(ev('up', 2, 'touch', 50, 100, 300));
    expect(strokeCount(engine)).toBe(1);
    expect(engine.doc.activeLayer.items[0]).toBeInstanceOf(Stroke);
  });
});

describe('PointerSession fingers and the selection', () => {
  /** Engine with a lasso tool, one stroke from (100, 100) to (200, 100) selected, and stylus rules on. */
  function setup() {
    const engine = new CanvasEngine();
    const pts = [0, 25, 50, 75, 100].map((dx, i) => ({ x: 100 + dx, y: 100, pressure: 0.5, time: i * 10 }));
    const stroke = new Stroke(pts, DEFAULT_PEN_STYLE);
    engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, [stroke]));
    engine.setTool(new LassoTool());
    engine.selection.set([stroke.id]);
    const pending: (() => void)[] = [];
    const s = new PointerSession(engine, 'pencilOnly', {
      setTimer: (fn) => {
        pending.push(fn);
        return () => {
          const i = pending.indexOf(fn);
          if (i >= 0) pending.splice(i, 1);
        };
      },
    });
    /** Fires the oldest pending timer; false when there is none. */
    const tick = () => {
      const fn = pending.shift();
      fn?.();
      return fn !== undefined;
    };
    const minX = () => engine.doc.getObject(stroke.id)!.bounds.minX;
    return { engine, s, stroke, tick, pending, minX };
  }

  it('moves the selection with a finger that lands on it', () => {
    const { engine, s, minX } = setup();
    const before = minX();
    s.handle(ev('down', 1, 'touch', 150, 100, 0));
    drag(s, 1, 'touch', 150, 100, 0, 5);
    s.handle(ev('up', 1, 'touch', 200, 100, 100));
    expect(minX() - before).toBeCloseTo(50, 6);
    expect(engine.camera.get()).toEqual({ x: 0, y: 0, scale: 1 });
    expect(engine.selection.size).toBe(1);
  });

  it('pans with a finger that lands off the selection, keeping it selected', () => {
    const { engine, s, minX } = setup();
    const before = minX();
    s.handle(ev('down', 1, 'touch', 400, 400, 0));
    drag(s, 1, 'touch', 400, 400, 0, 5);
    s.handle(ev('up', 1, 'touch', 450, 400, 100));
    expect(minX()).toBe(before);
    expect(engine.camera.get().x).toBeCloseTo(-50, 6);
    expect(engine.selection.size).toBe(1);
  });

  it('clears the selection on a finger tap off it, but not on a tap on it', () => {
    const { engine, s } = setup();
    s.handle(ev('down', 1, 'touch', 150, 100, 0));
    s.handle(ev('up', 1, 'touch', 150, 100, 80));
    expect(engine.selection.size).toBe(1);
    s.handle(ev('down', 2, 'touch', 400, 400, 200));
    s.handle(ev('move', 2, 'touch', 403, 402, 220));
    s.handle(ev('up', 2, 'touch', 403, 402, 280));
    expect(engine.selection.size).toBe(0);
  });

  it('does not treat a long press or one finger of a pinch as a tap', () => {
    const { engine, s } = setup();
    s.handle(ev('down', 1, 'touch', 400, 400, 0));
    s.handle(ev('up', 1, 'touch', 400, 400, 900));
    expect(engine.selection.size).toBe(1);
    s.handle(ev('down', 2, 'touch', 400, 400, 1000));
    s.handle(ev('down', 3, 'touch', 500, 400, 1010));
    s.handle(ev('up', 2, 'touch', 400, 400, 1050));
    s.handle(ev('up', 3, 'touch', 500, 400, 1060));
    expect(engine.selection.size).toBe(1);
  });

  it('turns a finger move into a pinch when a second finger lands right away', () => {
    const { engine, s, minX } = setup();
    const before = minX();
    s.handle(ev('down', 1, 'touch', 150, 100, 0));
    s.handle(ev('down', 2, 'touch', 250, 100, 30));
    s.handle(ev('move', 1, 'touch', 130, 100, 60));
    s.handle(ev('move', 2, 'touch', 270, 100, 60));
    s.handle(ev('up', 1, 'touch', 130, 100, 80));
    s.handle(ev('up', 2, 'touch', 270, 100, 80));
    expect(minX()).toBe(before);
    expect(engine.camera.get().scale).toBeGreaterThan(1);
  });

  it('pans the camera while a selection is dragged at the view edge, and the selection keeps up', () => {
    const { engine, s, tick, pending, minX } = setup();
    s.setViewSize(800, 600);
    const before = minX();
    s.handle(ev('down', 1, 'touch', 150, 100, 0));
    // Drag to 10 px from the right edge, then hold still.
    s.handle(ev('move', 1, 'touch', 790, 100, 100));
    const draggedTo = () => (engine.tool as LassoTool).dragOffset!.x;
    const atEdge = draggedTo();
    expect(atEdge).toBeCloseTo(640, 6);
    expect(pending).toHaveLength(1);
    for (let i = 0; i < 10; i++) expect(tick()).toBe(true);
    // The camera moved right, and the drag offset grew by the same world distance.
    const cam = engine.camera.get().x;
    expect(cam).toBeGreaterThan(50);
    expect(draggedTo() - atEdge).toBeCloseTo(cam, 6);
    // Back inside the view: panning stops.
    s.handle(ev('move', 1, 'touch', 400, 100, 400));
    tick();
    expect(pending).toHaveLength(0);
    expect(engine.camera.get().x).toBeCloseTo(cam, 6);
    s.handle(ev('up', 1, 'touch', 400, 100, 420));
    expect(minX() - before).toBeCloseTo(250 + cam, 6);
  });

  it('does not edge pan without a view size or while drawing a lasso', () => {
    const { engine, s, pending } = setup();
    s.handle(ev('down', 1, 'touch', 150, 100, 0));
    s.handle(ev('move', 1, 'touch', 790, 100, 100));
    expect(pending).toHaveLength(0);
    s.handle(ev('up', 1, 'touch', 790, 100, 120));
    s.setViewSize(800, 600);
    // A pen lasso that starts off the selection and runs to the edge.
    s.handle(ev('down', 2, 'pen', 300, 400, 200));
    s.handle(ev('move', 2, 'pen', 795, 400, 260));
    expect(pending).toHaveLength(0);
    expect(engine.camera.get().x).toBe(0);
  });
});
