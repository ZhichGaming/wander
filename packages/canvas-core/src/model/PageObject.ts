/**
 * Wander — Zhich, Yu, Justin
 * An imported page placed on the canvas: one page of a PDF or a single
 * image. The engine only stores where it sits and which file it came from;
 * the rasterized image the renderer draws is produced by the app's import
 * step and referenced by `imageUri`.
 */

import { applyMatrix, matrixScale, type Matrix, type Rect, type Vec2 } from '../math/geometry';
import { newId } from '../ids';
import { CanvasObject, type ObjectJSON } from './CanvasObject';

/** Identifies the original file a page was imported from. */
export interface PageSource {
  /** Key the app uses to find the original file again (a hash or file uri). */
  sourceId: string;
  /** Original file name shown in the label, e.g. "lecture3.pdf". */
  fileName: string;
  /** Whether the original is a PDF or a single image. */
  kind: 'pdf' | 'image';
  /** 0-based page number inside the PDF; always 0 for images. */
  pageIndex: number;
}

/** Placement of a page in world space: top-left corner plus size. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Serialized page object. */
export interface PageJSON extends ObjectJSON {
  kind: 'page';
  source: PageSource;
  rect: PageRect;
  imageUri: string;
}

/**
 * Immutable imported page. Like Stroke, an edit returns a new object with
 * the same id.
 */
export class PageObject extends CanvasObject {
  readonly kind = 'page' as const;
  readonly source: Readonly<PageSource>;
  readonly rect: Readonly<PageRect>;
  /** Rasterized page image drawn by the renderer. */
  readonly imageUri: string;

  /** Creates a page; pass no id to get a fresh one. */
  constructor(source: PageSource, rect: PageRect, imageUri: string, id: string = newId('p')) {
    super(id);
    this.source = { ...source };
    this.rect = { ...rect };
    this.imageUri = imageUri;
  }

  /** Text the renderer draws at the top-left, e.g. "lecture3.pdf, page 4". */
  get label(): string {
    if (this.source.kind === 'image') return this.source.fileName;
    return `${this.source.fileName}, page ${this.source.pageIndex + 1}`;
  }

  /** The page rectangle in min/max form. */
  get bounds(): Rect {
    const r = this.rect;
    return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
  }

  /** True when a circle at `p` touches the page rectangle. */
  hitTest(p: Vec2, radius: number): boolean {
    const b = this.bounds;
    return (
      p.x >= b.minX - radius && p.x <= b.maxX + radius && p.y >= b.minY - radius && p.y <= b.maxY + radius
    );
  }

  /**
   * Same page moved and scaled by `m`. Only translation and uniform scale
   * are supported: the top-left corner is mapped through `m` and the size is
   * multiplied by the matrix's average scale, so the page stays axis-aligned.
   * Rotation and skew in `m` are ignored.
   */
  transformed(m: Matrix): PageObject {
    const corner = applyMatrix(m, { x: this.rect.x, y: this.rect.y });
    const s = matrixScale(m);
    const rect = { x: corner.x, y: corner.y, width: this.rect.width * s, height: this.rect.height * s };
    return new PageObject(this.source, rect, this.imageUri, this.id);
  }

  /** Plain JSON record. */
  toJSON(): PageJSON {
    return {
      kind: 'page',
      id: this.id,
      source: { ...this.source },
      rect: { ...this.rect },
      imageUri: this.imageUri,
    };
  }

  /** Rebuilds a page from its JSON record. */
  static fromJSON(json: PageJSON): PageObject {
    return new PageObject(json.source, json.rect, json.imageUri, json.id);
  }
}
