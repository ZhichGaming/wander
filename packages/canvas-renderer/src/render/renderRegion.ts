/**
 * Wander — Zhich, Yu, Justin
 * Renders a world rect of a document to an image without a CanvasView:
 * the paper, then the same scene picture the view draws, then anything the
 * caller adds through `decorate`. Used for snapshots the app sends
 * elsewhere (the AI harness reads the canvas this way).
 */

import { Skia, StrokeCap, PaintStyle, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { isEmptyRect, type CanvasDocument, type Rect } from '@wander/canvas-core';
import { backgroundPath } from './background';
import { ImageCache } from './ImageCache';
import { ensureSkiaWeb } from './loadSkiaWeb';
import { ObjectPainter } from './ObjectPainter';
import { SceneCache } from './SceneCache';

/** Default long edge of the image, in pixels. */
const DEFAULT_MAX_SIZE = 1024;

/** Page images stay decoded between renders. */
const sharedImages = new ImageCache();

/** Options of renderRegion. */
export interface RenderRegionOptions {
  /** Long edge of the image in pixels; the rect is scaled to fit (default 1024). */
  maxSize?: number;
  /** Draw the paper color and pattern under the ink (default true). */
  background?: boolean;
  /**
   * Draws on top of the ink before the image is taken. The canvas is in
   * world units, so one world unit is `scale` pixels; divide pixel sizes
   * by `scale` to keep them constant.
   */
  decorate?: (canvas: SkCanvas, rect: Rect, scale: number) => void;
}

/** An image of a world rect, plus the mapping between the two. */
export interface RenderedRegion {
  image: SkImage;
  /** World rect the image covers. */
  rect: Rect;
  /** Image pixels per world unit. */
  scale: number;
  /** Image size in pixels. */
  width: number;
  height: number;
}

/**
 * Renders world rect `rect` of `doc`. Waits for the page images inside
 * the rect to load first, so pages are never drawn blank.
 */
export async function renderRegion(
  doc: CanvasDocument,
  rect: Rect,
  opts: RenderRegionOptions = {},
): Promise<RenderedRegion> {
  const worldWidth = rect.maxX - rect.minX;
  const worldHeight = rect.maxY - rect.minY;
  if (isEmptyRect(rect) || worldWidth <= 0 || worldHeight <= 0) {
    throw new Error('renderRegion needs a rect with a positive width and height');
  }
  await ensureSkiaWeb();

  const scale = (opts.maxSize ?? DEFAULT_MAX_SIZE) / Math.max(worldWidth, worldHeight);
  const width = Math.max(1, Math.ceil(worldWidth * scale));
  const height = Math.max(1, Math.ceil(worldHeight * scale));

  for (const obj of doc.queryRect(rect)) {
    if (obj.kind === 'page') sharedImages.get((obj as unknown as { imageUri: string }).imageUri);
  }
  await sharedImages.settled();

  const surface = Skia.Surface.Make(width, height) ?? Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error(`Could not create a ${width}x${height} surface`);
  const canvas = surface.getCanvas();

  if (opts.background ?? true) drawPaper(canvas, doc, rect, scale, width, height);

  const scene = new SceneCache(doc, new ObjectPainter(sharedImages)).buildScene(rect, null);
  canvas.save();
  canvas.scale(scale, scale);
  canvas.translate(-rect.minX, -rect.minY);
  canvas.drawPicture(scene);
  opts.decorate?.(canvas, rect, scale);
  canvas.restore();

  surface.flush();
  return { image: surface.makeImageSnapshot(), rect, scale, width, height };
}

/** Paper fill and pattern in pixel space, as BackgroundLayer draws them. */
function drawPaper(canvas: SkCanvas, doc: CanvasDocument, rect: Rect, scale: number, width: number, height: number) {
  const bg = doc.background;
  canvas.drawColor(Skia.Color(bg.paperColor));
  const cam = { x: rect.minX, y: rect.minY, scale };
  const path = backgroundPath(bg.pattern, bg.spacing, cam, width, height);
  const isDots = bg.pattern === 'dots';
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(isDots ? 2.5 : 1);
  paint.setStrokeCap(isDots ? StrokeCap.Round : StrokeCap.Butt);
  paint.setAntiAlias(isDots);
  paint.setColor(Skia.Color(bg.lineColor));
  canvas.drawPath(path, paint);
}
