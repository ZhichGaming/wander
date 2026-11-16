/**
 * Wander — Zhich, Yu, Justin
 * Tests for the agent view helpers: content bounds, view rects, grid
 * steps and the text that goes with a view image.
 */

import { describe, expect, it } from 'vitest';
import {
  CanvasDocument,
  contentBounds,
  DEFAULT_PEN_STYLE,
  describeView,
  gridStepFor,
  PageObject,
  Stroke,
  viewRect,
  type StrokePoint,
} from '../src';

/** Pen stroke through the given (x, y) points. */
function stroke(coords: [number, number][]): Stroke {
  const pts: StrokePoint[] = coords.map(([x, y], i) => ({ x, y, pressure: 0.5, time: i * 10 }));
  return new Stroke(pts, DEFAULT_PEN_STYLE);
}

describe('contentBounds', () => {
  it('is null for an empty document', () => {
    expect(contentBounds(new CanvasDocument())).toBeNull();
  });

  it('covers every object with a margin', () => {
    const doc = new CanvasDocument();
    doc.addObject(doc.activeLayer.id, stroke([[100, 100], [300, 200]]));
    doc.addObject(doc.activeLayer.id, stroke([[500, 400], [600, 450]]));
    const r = contentBounds(doc)!;
    expect(r.minX).toBeLessThan(100);
    expect(r.minY).toBeLessThan(100);
    expect(r.maxX).toBeGreaterThan(600);
    expect(r.maxY).toBeGreaterThan(450);
  });
});

describe('viewRect', () => {
  it('orders corners and keeps large rects as they are', () => {
    expect(viewRect({ minX: 400, minY: 300, maxX: 0, maxY: 0 })).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
  });

  it('widens a small rect around its center', () => {
    expect(viewRect({ minX: 90, minY: 95, maxX: 110, maxY: 105 }, 100)).toEqual({
      minX: 50,
      minY: 50,
      maxX: 150,
      maxY: 150,
    });
  });
});

describe('gridStepFor', () => {
  it('doubles the paper spacing so labeled lines are paper lines', () => {
    const step = gridStepFor({ minX: 0, minY: 0, maxX: 1000, maxY: 600 }, 32);
    expect(step).toBe(128);
    expect(step % 32).toBe(0);
  });

  it('uses the paper spacing itself when the view is small', () => {
    expect(gridStepFor({ minX: 0, minY: 0, maxX: 128, maxY: 128 }, 32)).toBe(32);
  });

  it('picks a round step on blank paper', () => {
    expect(gridStepFor({ minX: 0, minY: 0, maxX: 1000, maxY: 600 }, 0)).toBe(200);
    expect(gridStepFor({ minX: 0, minY: 0, maxX: 80, maxY: 80 }, 0)).toBe(10);
  });
});

describe('describeView', () => {
  it('states the frame, the grid and the objects in view', () => {
    const doc = new CanvasDocument();
    const s = stroke([[120, 190], [380, 380]]);
    doc.addObject(doc.activeLayer.id, s);
    doc.addObject(doc.activeLayer.id, stroke([[5000, 5000], [5100, 5100]]));
    const page = new PageObject(
      { sourceId: 'h', fileName: 'lecture3.pdf', kind: 'pdf', pageIndex: 1 },
      { x: 400, y: 200, width: 200, height: 260 },
      'file:///p.png',
    );
    doc.addObject(doc.activeLayer.id, page);

    const text = describeView(doc, {
      rect: { minX: 80, minY: 160, maxX: 1080, maxY: 760 },
      scale: 1.024,
      width: 1024,
      height: 615,
      gridStep: 128,
    });

    expect(text).toContain('View x 80 to 1080, y 160 to 760');
    expect(text).toContain('Image 1024x615 px, 1 px = 0.98 units');
    expect(text).toContain('every 128 units (4 squares of the paper grid, which is 32 units)');
    expect(text).toContain(`${s.id} stroke pen`);
    expect(text).toContain(`${page.id} page "lecture3.pdf, page 2" bbox(400, 200, 600, 460)`);
    expect(text).not.toContain('5000');
  });

  it('says when a view is empty', () => {
    const text = describeView(new CanvasDocument(), {
      rect: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      scale: 10,
      width: 1000,
      height: 1000,
      gridStep: 32,
    });
    expect(text).toContain('No objects in this view.');
  });
});
