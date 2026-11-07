/**
 * Wander — Zhich, Yu, Justin
 * Draws single canvas objects onto a Skia canvas (usually a picture
 * recorder's canvas). Knows each object kind's look: strokes are filled
 * outline paths with their brush's blend mode, pages are an image in their
 * rect with a label. Also says which draw pass an object belongs to.
 */

import {
  BlendMode,
  matchFont,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkFont,
  type SkPaint,
  type SkPath,
} from '@shopify/react-native-skia';
import { getBrush, Stroke, type CanvasObject } from '@wander/canvas-core';
import type { ImageCache } from './ImageCache';
import { graphiteShader } from './graphite';
import { outlineToSkPath } from './strokePath';

/** Draw pass of imported pages: beneath every stroke of their layer. */
export const PAGE_PASS = -1;

/** Font size of page labels, in world units. */
const LABEL_SIZE = 14;
/** Gap between a page's top edge and its label baseline, in world units. */
const LABEL_GAP = 6;

/**
 * The fields of a page object the renderer needs. Read duck-typed through
 * `kind === 'page'` so the renderer does not depend on PageObject's class.
 */
interface PageLike {
  kind: 'page';
  rect: { x: number; y: number; width: number; height: number };
  imageUri: string;
  label?: string;
}

/** True when `obj` is an imported page. */
function isPage(obj: CanvasObject): boolean {
  return obj.kind === 'page';
}

/**
 * Font for page labels. matchFont needs a system font manager, which
 * CanvasKit on web does not provide, so fall back to Skia's default font.
 */
function makeLabelFont(): SkFont {
  try {
    return matchFont({ fontFamily: 'System', fontSize: LABEL_SIZE });
  } catch {
    return Skia.Font(undefined, LABEL_SIZE);
  }
}

/** Stateful painter: owns reusable paints and per-object path cache. */
export class ObjectPainter {
  /** Stroke outlines keyed by object; objects are immutable so entries never go stale. */
  private paths = new WeakMap<CanvasObject, SkPath>();
  private fill: SkPaint;
  private pageBorder: SkPaint;
  private font: SkFont | null = null;

  /** Creates a painter that reads page images from `images`. */
  constructor(private readonly images: ImageCache) {
    this.fill = Skia.Paint();
    this.fill.setAntiAlias(true);
    this.pageBorder = Skia.Paint();
    this.pageBorder.setAntiAlias(true);
    this.pageBorder.setStyle(PaintStyle.Stroke);
    this.pageBorder.setStrokeWidth(1);
    this.pageBorder.setColor(Skia.Color('#c9ced6'));
  }

  /** Draw pass of `obj` within its layer (lower first), or null if it is not drawable. */
  passOf(obj: CanvasObject): number | null {
    if (obj instanceof Stroke) return getBrush(obj.style.brush).pass;
    if (isPage(obj)) return PAGE_PASS;
    return null;
  }

  /** Draws `obj` in world coordinates onto `canvas`. Unknown kinds are skipped. */
  draw(canvas: SkCanvas, obj: CanvasObject): void {
    if (obj instanceof Stroke) this.drawStroke(canvas, obj);
    else if (isPage(obj)) this.drawPage(canvas, obj as unknown as PageLike);
  }

  /**
   * Fills the stroke's cached outline with its color (or graphite grain),
   * opacity and blend mode.
   */
  private drawStroke(canvas: SkCanvas, stroke: Stroke): void {
    const path = this.pathOf(stroke);
    if (path.isEmpty()) return;
    const brush = getBrush(stroke.style.brush);
    this.fill.setColor(Skia.Color(stroke.style.color));
    this.fill.setAlphaf(stroke.opacity);
    this.fill.setBlendMode(brush.blendMode === 'multiply' ? BlendMode.Multiply : BlendMode.SrcOver);
    this.fill.setShader(brush.texture === 'graphite' ? graphiteShader(stroke.style.color) : null);
    canvas.drawPath(path, this.fill);
    this.fill.setShader(null);
  }

  /** Cached SkPath of a stroke's outline. */
  private pathOf(stroke: Stroke): SkPath {
    let path = this.paths.get(stroke);
    if (!path) {
      path = outlineToSkPath(stroke.outline);
      this.paths.set(stroke, path);
    }
    return path;
  }

  /**
   * Draws the page image stretched to its rect (a white sheet while the
   * image loads), a thin border, and the label above the top-left corner.
   */
  private drawPage(canvas: SkCanvas, page: PageLike): void {
    const { x, y, width, height } = page.rect;
    const dest = Skia.XYWHRect(x, y, width, height);
    const image = this.images.get(page.imageUri);
    this.fill.setBlendMode(BlendMode.SrcOver);
    this.fill.setColor(Skia.Color('#ffffff'));
    if (image) {
      const src = Skia.XYWHRect(0, 0, image.width(), image.height());
      canvas.drawImageRect(image, src, dest, this.fill);
    } else {
      canvas.drawRect(dest, this.fill);
    }
    canvas.drawRect(dest, this.pageBorder);
    if (page.label) {
      this.fill.setColor(Skia.Color('#6b7280'));
      canvas.drawText(page.label, x, y - LABEL_GAP, this.fill, this.labelFont());
    }
  }

  /** Label font, created on first use. */
  private labelFont(): SkFont {
    if (!this.font) this.font = makeLabelFont();
    return this.font;
  }
}
