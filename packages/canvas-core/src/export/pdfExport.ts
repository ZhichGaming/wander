/**
 * Wander — Zhich, Yu, Justin
 * Writes an annotated PDF from an export plan with pdf-lib. PDF pages are
 * copied from the original file so their text and vectors stay intact; image
 * pages become a new page the size of the image. Ink is drawn on top as
 * filled vector paths, clipped to the page.
 */

import {
  BlendMode as PdfBlendMode,
  PDFDocument,
  type PDFPage,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type RGB,
} from 'pdf-lib';
import type { Vec2 } from '../math/geometry';
import type { ExportAnnotation, ExportPage, ExportPlan } from './exportPlan';

/** Loads the bytes of a file the app keeps (original PDF or image). */
export type BytesLoader = (key: string) => Promise<Uint8Array>;

/** Visible box of an output page in PDF points (origin bottom-left). */
interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Builds a new PDF with one page per plan entry, in plan order.
 * `loadSource` returns the original file for a sourceId. For image pages,
 * `loadImage` (when given) loads the entry's imageUri instead; otherwise the
 * original image is loaded with `loadSource`. Images must be PNG or JPEG.
 */
export async function exportAnnotatedPdf(
  plan: ExportPlan,
  loadSource: BytesLoader,
  loadImage?: BytesLoader,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const sources = new Map<string, PDFDocument>();

  for (const entry of plan) {
    const page =
      entry.source.kind === 'pdf'
        ? await copyPdfPage(out, entry, sources, loadSource)
        : await addImagePage(out, entry, loadImage ? loadImage(entry.imageUri) : loadSource(entry.source.sourceId));
    drawAnnotations(page, page.getCropBox(), entry);
  }
  return out.save();
}

/** Copies the entry's original PDF page into `out`, loading each source file once. */
async function copyPdfPage(
  out: PDFDocument,
  entry: ExportPage,
  sources: Map<string, PDFDocument>,
  loadSource: BytesLoader,
): Promise<PDFPage> {
  let src = sources.get(entry.source.sourceId);
  if (!src) {
    src = await PDFDocument.load(await loadSource(entry.source.sourceId));
    sources.set(entry.source.sourceId, src);
  }
  const [copied] = await out.copyPages(src, [entry.source.pageIndex]);
  return out.addPage(copied);
}

/** Adds a page sized to the image (1 pixel = 1 point) with the image filling it. */
async function addImagePage(out: PDFDocument, entry: ExportPage, bytesPromise: Promise<Uint8Array>): Promise<PDFPage> {
  const bytes = await bytesPromise;
  const image = isPng(bytes) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const page = out.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return page;
}

/**
 * Draws the entry's annotations onto `page`, scaled from page units to the
 * page box and clipped to it. drawSvgPath flips y (SVG y points down), so
 * anchoring it at the box's top-left lets outlines keep their y-down
 * coordinates.
 */
function drawAnnotations(page: PDFPage, box: PageBox, entry: ExportPage): void {
  if (entry.annotations.length === 0) return;
  const sx = box.width / entry.width;
  const sy = box.height / entry.height;
  page.pushOperators(pushGraphicsState(), rectangle(box.x, box.y, box.width, box.height), clip(), endPath());
  for (const a of entry.annotations) {
    if (a.outline.length < 3) continue;
    page.drawSvgPath(polygonToSvgPath(a.outline, sx, sy), {
      x: box.x,
      y: box.y + box.height,
      color: hexToRgb(a.color),
      opacity: a.opacity,
      blendMode: toPdfBlendMode(a),
    });
  }
  page.pushOperators(popGraphicsState());
}

/** Closed SVG path through the polygon's points, each scaled by (sx, sy). */
function polygonToSvgPath(points: readonly Vec2[], sx: number, sy: number): string {
  const parts = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * sx).toFixed(2)} ${(p.y * sy).toFixed(2)}`);
  return `${parts.join(' ')} Z`;
}

/** Maps an engine blend mode to pdf-lib's. */
function toPdfBlendMode(a: ExportAnnotation): PdfBlendMode {
  return a.blendMode === 'multiply' ? PdfBlendMode.Multiply : PdfBlendMode.Normal;
}

/** Parses "#rgb" or "#rrggbb" into a pdf-lib color; black if malformed. */
function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** True when `bytes` start with the PNG signature. */
function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}
