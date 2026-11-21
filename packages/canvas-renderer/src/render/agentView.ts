/**
 * Wander — Zhich, Yu, Justin
 * The image an AI agent sees of the canvas: a world rect rendered with
 * renderRegion, with every grid-step paper line drawn in blue and labeled
 * with its world coordinate, plus the text from describeView. The labels
 * let the model read positions off the image in the same units its tools
 * take.
 */

import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { describeView, gridStepFor, viewRect, type CanvasDocument, type Rect, type ViewFrame } from '@wander/canvas-core';
import { renderRegion } from './renderRegion';

/** Long edge of a view image, in pixels. */
const VIEW_SIZE = 1024;
/** Label height and padding, in image pixels. */
const LABEL_PX = 12;
const LABEL_PAD_PX = 3;

const GRID_COLOR = 'rgba(0, 122, 255, 0.35)';
const LABEL_COLOR = '#0057b8';
const LABEL_BACK = 'rgba(255, 255, 255, 0.85)';
const VIEWPORT_COLOR = 'rgba(240, 120, 0, 0.9)';

/** Options of renderAgentView. */
export interface AgentViewOptions {
  /** Long edge of the image in pixels (default 1024). */
  maxSize?: number;
  /** Smallest width and height of the view in world units (default VIEW_MIN_SPAN). */
  minSpan?: number;
  /**
   * World rect the user has on screen (engine.viewport). It is outlined in
   * orange on the image and described in the text.
   */
  viewport?: Rect | null;
}

/** A view of the canvas for an agent: the image, how it maps to the world, and its text. */
export interface AgentView extends ViewFrame {
  image: SkImage;
  /** The frame, the grid and the objects in view, for the model to read with the image. */
  text: string;
}

/**
 * Renders `rect` of `doc` (widened to the minimum span) with the labeled
 * grid, and describes it.
 */
export async function renderAgentView(
  doc: CanvasDocument,
  rect: Rect,
  opts: AgentViewOptions = {},
): Promise<AgentView> {
  const view = viewRect(rect, opts.minSpan);
  const gridStep = gridStepFor(view, doc.background.spacing);
  const rendered = await renderRegion(doc, view, {
    maxSize: opts.maxSize ?? VIEW_SIZE,
    decorate: (canvas, r, scale) => {
      drawCoordinateGrid(canvas, r, scale, gridStep);
      if (opts.viewport) drawViewport(canvas, opts.viewport, scale);
    },
  });
  const frame: ViewFrame = {
    rect: rendered.rect,
    scale: rendered.scale,
    width: rendered.width,
    height: rendered.height,
    gridStep,
    viewport: opts.viewport,
  };
  return { ...frame, image: rendered.image, text: describeView(doc, frame) };
}

/** Outlines the user's screen: an orange rectangle two pixels wide. */
function drawViewport(canvas: SkCanvas, screen: Rect, scale: number): void {
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(2 / scale);
  paint.setColor(Skia.Color(VIEWPORT_COLOR));
  canvas.drawRect(
    Skia.XYWHRect(screen.minX, screen.minY, screen.maxX - screen.minX, screen.maxY - screen.minY),
    paint,
  );
}

/**
 * Draws a line every `step` world units across `rect`, labeled with its
 * coordinate: x along the top edge, y down the left. The canvas is in
 * world units with `scale` pixels per unit; sizes are divided by `scale`
 * so lines stay one pixel and labels LABEL_PX tall at any zoom.
 */
export function drawCoordinateGrid(canvas: SkCanvas, rect: Rect, scale: number, step: number): void {
  const line = Skia.Paint();
  line.setStyle(PaintStyle.Stroke);
  line.setStrokeWidth(1 / scale);
  line.setColor(Skia.Color(GRID_COLOR));
  const text = Skia.Paint();
  text.setAntiAlias(true);
  text.setStyle(PaintStyle.Stroke);
  text.setStrokeWidth(1.6 / scale);
  text.setStrokeCap(StrokeCap.Round);
  text.setStrokeJoin(StrokeJoin.Round);
  text.setColor(Skia.Color(LABEL_COLOR));
  const back = Skia.Paint();
  back.setColor(Skia.Color(LABEL_BACK));
  const unit = LABEL_PX / GLYPH_HEIGHT / scale;
  const padding = LABEL_PAD_PX / scale;

  // (x, y) is the label's top-left corner.
  const label = (value: number, x: number, y: number) => {
    const s = fmt(value);
    const w = digitsWidth(s) * unit;
    canvas.drawRect(Skia.XYWHRect(x - padding, y - padding, w + 2 * padding, LABEL_PX / scale + 2 * padding), back);
    canvas.drawPath(digitsPath(s, x, y, unit), text);
  };

  const firstX = Math.ceil(rect.minX / step) * step;
  const firstY = Math.ceil(rect.minY / step) * step;
  for (let x = firstX; x <= rect.maxX; x += step) canvas.drawLine(x, rect.minY, x, rect.maxY, line);
  for (let y = firstY; y <= rect.maxY; y += step) canvas.drawLine(rect.minX, y, rect.maxX, y, line);
  for (let x = firstX; x <= rect.maxX; x += step) label(x, x + padding * 2, rect.minY + padding * 2);
  for (let y = firstY; y <= rect.maxY; y += step) label(y, rect.minX + padding * 2, y - LABEL_PX / scale - padding * 2);
}

/**
 * Label digits as stroked polylines on a 4 x 6 cell (y down). Drawn as
 * paths instead of text because Skia on web has no default font, and a
 * path looks the same on every platform.
 */
const GLYPHS: Record<string, number[][][]> = {
  '0': [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  '1': [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  '2': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  '3': [[[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]], [[1, 3], [3, 3]]],
  '4': [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  '5': [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  '6': [[[4, 0], [1, 0], [0, 1], [0, 6], [4, 6], [4, 3], [0, 3]]],
  '7': [[[0, 0], [4, 0], [1, 6]]],
  '8': [
    [[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]],
    [[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]],
  ],
  '9': [[[4, 3], [0, 3], [0, 0], [4, 0], [4, 5], [3, 6], [0, 6]]],
  '-': [[[0.5, 3], [3.5, 3]]],
  '.': [[[1.8, 5.8], [2.2, 6]]],
};
const GLYPH_HEIGHT = 6;
const GLYPH_ADVANCE = 5.5;
const GLYPH_WIDTH = 4;

/** Width of `s` in glyph cells. */
function digitsWidth(s: string): number {
  return s.length === 0 ? 0 : (s.length - 1) * GLYPH_ADVANCE + GLYPH_WIDTH;
}

/** Path of `s` with its top-left corner at (x, y), one cell unit = `unit`. */
function digitsPath(s: string, x: number, y: number, unit: number) {
  const builder = Skia.PathBuilder.Make();
  [...s].forEach((ch, i) => {
    const left = x + i * GLYPH_ADVANCE * unit;
    for (const stroke of GLYPHS[ch] ?? []) {
      stroke.forEach(([gx, gy], j) => {
        if (j === 0) builder.moveTo(left + gx * unit, y + gy * unit);
        else builder.lineTo(left + gx * unit, y + gy * unit);
      });
    }
  });
  return builder.detach();
}

/** Grid coordinate as text: whole when close to whole, else one decimal. */
function fmt(n: number): string {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-6 ? String(r) : n.toFixed(1);
}
