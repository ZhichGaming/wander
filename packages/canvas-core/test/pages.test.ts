/**
 * Wander — Zhich, Yu, Justin
 * Tests for imported page objects, the export plan and annotated PDF export.
 */

import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Brush } from '../src/brush/Brush';
import { getBrush, registerBrush } from '../src/brush/registry';
import { buildExportPlan } from '../src/export/exportPlan';
import { exportAnnotatedPdf } from '../src/export/pdfExport';
import { translation, scaleAbout } from '../src/math/geometry';
import { CanvasDocument } from '../src/model/CanvasDocument';
import { Layer } from '../src/model/Layer';
import { PageObject } from '../src/model/PageObject';
import { Stroke } from '../src/model/Stroke';
import { DEFAULT_HIGHLIGHTER_STYLE, DEFAULT_PEN_STYLE, type StrokePoint } from '../src/model/StrokeStyle';
import { deserializeDocument, serializeDocument } from '../src/serialize/Serializer';

/** Test pen whose outline is a 2x2 square around each point, so outlines are never empty. */
const squarePen: Brush = {
  kind: 'pen',
  pass: 1,
  blendMode: 'normal',
  texture: 'none',
  /** Full opacity. */
  opacity: () => 1,
  /** Square corners around every input point. */
  outline(points) {
    return points.flatMap((p) => [
      { x: p.x - 1, y: p.y - 1 },
      { x: p.x + 1, y: p.y - 1 },
      { x: p.x + 1, y: p.y + 1 },
      { x: p.x - 1, y: p.y + 1 },
    ]);
  },
};
const realPen = getBrush('pen');
beforeAll(() => registerBrush(squarePen));
afterAll(() => registerBrush(realPen));

/** Stroke through the given (x, y) points. */
function stroke(coords: [number, number][], style = DEFAULT_PEN_STYLE): Stroke {
  const pts: StrokePoint[] = coords.map(([x, y], i) => ({ x, y, pressure: 0.5, time: i * 10 }));
  return new Stroke(pts, style);
}

/** PDF page of `lecture3.pdf` at `pageIndex`, placed at (x, y) with the given size. */
function pdfPage(pageIndex: number, x: number, y: number, width: number, height: number): PageObject {
  return new PageObject(
    { sourceId: 'hash-1', fileName: 'lecture3.pdf', kind: 'pdf', pageIndex },
    { x, y, width, height },
    `file:///pages/${pageIndex}.png`,
  );
}

describe('PageObject', () => {
  it('builds labels for PDF pages and images', () => {
    expect(pdfPage(3, 0, 0, 10, 10).label).toBe('lecture3.pdf, page 4');
    const img = new PageObject(
      { sourceId: 'h', fileName: 'board.jpg', kind: 'image', pageIndex: 0 },
      { x: 0, y: 0, width: 10, height: 10 },
      'file:///board.jpg',
    );
    expect(img.label).toBe('board.jpg');
  });

  it('hit tests inside its rect and transforms by translate and uniform scale', () => {
    const page = pdfPage(0, 10, 20, 100, 200);
    expect(page.hitTest({ x: 50, y: 50 }, 0)).toBe(true);
    expect(page.hitTest({ x: 5, y: 50 }, 0)).toBe(false);
    expect(page.hitTest({ x: 5, y: 50 }, 5)).toBe(true);
    const moved = page.transformed(translation(5, -5));
    expect(moved.rect).toEqual({ x: 15, y: 15, width: 100, height: 200 });
    expect(moved.id).toBe(page.id);
    const scaled = page.transformed(scaleAbout(2, 2, { x: 10, y: 20 }));
    expect(scaled.rect).toEqual({ x: 10, y: 20, width: 200, height: 400 });
  });

  it('round-trips through the document serializer', () => {
    const doc = new CanvasDocument();
    const page = pdfPage(1, 10, 20, 300, 400);
    doc.addObject(doc.activeLayer.id, page);
    const json = JSON.parse(JSON.stringify(serializeDocument(doc)));
    const back = deserializeDocument(json).getObject(page.id);
    expect(back).toBeInstanceOf(PageObject);
    expect((back as PageObject).toJSON()).toEqual(page.toJSON());
    expect((back as PageObject).label).toBe('lecture3.pdf, page 2');
  });
});

describe('buildExportPlan', () => {
  it('selects overlapping strokes in draw order and maps them to page units', () => {
    const doc = new CanvasDocument();
    const layer = doc.activeLayer.id;
    const p1 = pdfPage(0, 0, 0, 100, 100);
    const p2 = pdfPage(1, 200, 0, 100, 100);
    doc.addObject(layer, p1);
    doc.addObject(layer, p2);
    const onP2 = stroke([[210, 10], [220, 20]]);
    const hl = stroke([[250, 50], [260, 50]], DEFAULT_HIGHLIGHTER_STYLE);
    const outside = stroke([[500, 500], [510, 510]]);
    doc.addObject(layer, onP2);
    doc.addObject(layer, hl);
    doc.addObject(layer, outside);
    const hidden = new Layer({ visible: false, name: 'hidden' });
    doc.addLayer(hidden);
    doc.addObject(hidden.id, stroke([[230, 30], [240, 40]]));

    const plan = buildExportPlan(doc, [p2.id, p1.id]);
    expect(plan.map((e) => e.pageId)).toEqual([p2.id, p1.id]);
    expect(plan[1].annotations).toHaveLength(0);
    const anns = plan[0].annotations;
    expect(anns).toHaveLength(2);
    // Highlighter (pass 0) comes before the pen stroke of the same layer.
    expect(anns[0].blendMode).toBe('multiply');
    expect(anns[1].blendMode).toBe('normal');
    expect(anns[1].color).toBe(DEFAULT_PEN_STYLE.color);
    // First square corner of the pen stroke: (210 - 1, 10 - 1) in world, minus page origin.
    expect(anns[1].outline[0]).toEqual({ x: 9, y: 9 });
    expect(plan[0].width).toBe(100);
    expect(plan[0].source.pageIndex).toBe(1);
  });

  it('rejects ids that are not pages', () => {
    const doc = new CanvasDocument();
    const s = stroke([[0, 0], [1, 1]]);
    doc.addObject(doc.activeLayer.id, s);
    expect(() => buildExportPlan(doc, [s.id])).toThrow();
  });
});

describe('exportAnnotatedPdf', () => {
  it('exports only the selected PDF page with ink on top', async () => {
    const src = await PDFDocument.create();
    src.addPage([200, 300]);
    src.addPage([400, 500]);
    const srcBytes = await src.save();

    const doc = new CanvasDocument();
    const page = pdfPage(1, 0, 0, 800, 1000);
    doc.addObject(doc.activeLayer.id, page);
    doc.addObject(doc.activeLayer.id, stroke([[100, 100], [700, 900]]));
    const plan = buildExportPlan(doc, [page.id]);

    const requested: string[] = [];
    const bytes = await exportAnnotatedPdf(plan, async (id) => {
      requested.push(id);
      return srcBytes;
    });
    const out = await PDFDocument.load(bytes);
    expect(requested).toEqual(['hash-1']);
    expect(out.getPageCount()).toBe(1);
    expect(out.getPage(0).getSize()).toEqual({ width: 400, height: 500 });
  });

  it('exports an image page sized to the image', async () => {
    // 1x1 red PNG.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xfc, 0xcf, 0xc0, 0xf0,
      0x1f, 0x00, 0x05, 0x05, 0x02, 0x00, 0x5f, 0xc8, 0xf1, 0xd2, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const doc = new CanvasDocument();
    const img = new PageObject(
      { sourceId: 'img-1', fileName: 'dot.png', kind: 'image', pageIndex: 0 },
      { x: 0, y: 0, width: 10, height: 10 },
      'file:///dot.png',
    );
    doc.addObject(doc.activeLayer.id, img);
    doc.addObject(doc.activeLayer.id, stroke([[2, 2], [8, 8]]));
    const bytes = await exportAnnotatedPdf(
      buildExportPlan(doc, [img.id]),
      async () => {
        throw new Error('source should not be read when loadImage is given');
      },
      async () => png,
    );
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    expect(out.getPage(0).getSize()).toEqual({ width: 1, height: 1 });
  });
});
