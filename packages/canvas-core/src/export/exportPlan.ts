/**
 * Wander — Zhich, Yu, Justin
 * Builds the export plan for "export annotated pages": for each selected
 * page, its source and the ink to draw on top of it. Pure data, no PDF
 * code, so it can be tested and reused by other writers.
 *
 * Units: annotation outlines are in PAGE units, meaning world units with the
 * origin moved to the page's top-left corner (y still points down). A page
 * rect of width W maps to an output page of width P points by scaling every
 * coordinate by P / W; the writer does that because only it knows the real
 * size of the original page.
 */

import { getBrush } from '../brush/registry';
import type { BlendMode } from '../brush/Brush';
import { rectsIntersect, type Vec2 } from '../math/geometry';
import type { CanvasDocument } from '../model/CanvasDocument';
import { PageObject, type PageSource } from '../model/PageObject';
import { Stroke } from '../model/Stroke';

/** One stroke to draw on an exported page. */
export interface ExportAnnotation {
  /** Filled outline polygon in page units (origin at the page's top-left). */
  outline: Vec2[];
  /** CSS hex color. */
  color: string;
  /** 0..1, stroke opacity times its layer's opacity. */
  opacity: number;
  blendMode: BlendMode;
}

/** Everything needed to export one page. */
export interface ExportPage {
  pageId: string;
  source: PageSource;
  /** Rasterized page image (used for image sources). */
  imageUri: string;
  /** Page rect size in world units; the outline coordinate space. */
  width: number;
  height: number;
  /** Annotations in draw order (bottom first). */
  annotations: ExportAnnotation[];
}

/** Ordered list of pages to export. */
export type ExportPlan = ExportPage[];

/**
 * Builds the plan for `pageIds`, in the order given. Each page gets every
 * stroke on a visible layer whose bounds intersect the page rect, ordered by
 * layer, then by brush pass (highlighter before pen), then by z-order.
 * Strokes are not cut geometrically; the writer clips them to the page.
 * Throws if an id is not a page in `doc`.
 */
export function buildExportPlan(doc: CanvasDocument, pageIds: readonly string[]): ExportPlan {
  return pageIds.map((id) => {
    const page = doc.getObject(id);
    if (!(page instanceof PageObject)) throw new Error(`Not a page: ${id}`);
    return {
      pageId: page.id,
      source: { ...page.source },
      imageUri: page.imageUri,
      width: page.rect.width,
      height: page.rect.height,
      annotations: annotationsFor(doc, page),
    };
  });
}

/** Strokes overlapping `page`, converted to page units, in draw order. */
function annotationsFor(doc: CanvasDocument, page: PageObject): ExportAnnotation[] {
  const out: ExportAnnotation[] = [];
  const { x: ox, y: oy } = page.rect;
  for (const layer of doc.layers) {
    if (!layer.props.visible) continue;
    const strokes = layer.items.filter(
      (o): o is Stroke => o instanceof Stroke && rectsIntersect(o.bounds, page.bounds),
    );
    // Array.prototype.sort is stable, so z-order is kept within a pass.
    strokes.sort((a, b) => getBrush(a.style.brush).pass - getBrush(b.style.brush).pass);
    for (const s of strokes) {
      out.push({
        outline: s.outline.map((p) => ({ x: p.x - ox, y: p.y - oy })),
        color: s.style.color,
        opacity: s.style.opacity * layer.props.opacity,
        blendMode: getBrush(s.style.brush).blendMode,
      });
    }
  }
  return out;
}
