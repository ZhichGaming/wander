/**
 * Wander — Zhich, Yu, Justin
 * Picture cache for committed canvas objects (the "tile cache").
 *
 * Scheme: per layer and per draw pass (pages, highlighter, pen), objects
 * are split into CHUNKS: runs of consecutive objects in the layer's draw
 * order, at most MAX_CHUNK long. Each chunk caches one SkPicture of its
 * objects, recorded with the chunk's bounds as the cull rect. The scene is
 * then one small picture that, per visible layer, draws every chunk of
 * pass 0, then pass 1, and so on, skipping chunks outside the viewport.
 *
 * Why chunks of draw order rather than spatial tiles: a spatial grid draws
 * tile by tile, so two overlapping strokes in different tiles can come out
 * in the wrong z-order, and a stroke split across tiles would be drawn
 * twice (doubling translucent highlighter). Chunks are contiguous in draw
 * order, so playing them back in order is exactly the layer's z-order and
 * every object is drawn once. Culling still works because consecutive
 * strokes are usually written near each other, so chunk bounds are small.
 *
 * Cost: a new stroke goes to the end of its pass's last chunk, so only that
 * chunk (at most MAX_CHUNK cached paths) is re-recorded. An erase, undo or
 * move re-records only the chunks that hold the touched objects. With 5000
 * strokes that is about 40 chunks per pass, and rebuilding the scene
 * picture is about 40 drawPicture calls. Trade-off: an object moved far
 * away stays in its chunk and widens its bounds, which only weakens
 * culling, never correctness.
 */

import { Skia, type SkCanvas, type SkPicture, type SkRect } from '@shopify/react-native-skia';
import {
  emptyRect,
  inflateRect,
  isEmptyRect,
  rectsIntersect,
  unionRect,
  type CanvasDocument,
  type CanvasObject,
  type DocumentChange,
  type Layer,
  type Rect,
} from '@wander/canvas-core';
import type { ObjectPainter } from './ObjectPainter';

/** Largest number of objects in one chunk; a fuller chunk is split in two. */
const MAX_CHUNK = 128;
/** Extra world units around chunk bounds (page labels sit above their rect). */
const CHUNK_MARGIN = 32;

/** Converts an engine rect to a Skia rect. */
function toSkRect(r: Rect): SkRect {
  return Skia.XYWHRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
}

/** A run of consecutive same-pass objects of one layer and its cached picture. */
interface Chunk {
  ids: string[];
  /** Null when the chunk changed and must be re-recorded. */
  picture: SkPicture | null;
  /** Null when the chunk changed and its bounds must be recomputed. */
  bounds: Rect | null;
}

/** The chunks of one draw pass of one layer, in draw order. */
class PassChunks {
  readonly chunks: Chunk[] = [];
  private chunkOf = new Map<string, Chunk>();

  /** True when object `id` is in this pass. */
  has(id: string): boolean {
    return this.chunkOf.has(id);
  }

  /** Appends `id` at the end of the pass (used for initial builds). */
  append(id: string): void {
    let last = this.chunks[this.chunks.length - 1];
    if (!last || last.ids.length >= MAX_CHUNK) {
      last = { ids: [], picture: null, bounds: null };
      this.chunks.push(last);
    }
    last.ids.push(id);
    this.chunkOf.set(id, last);
    this.dirty(last);
  }

  /** Inserts `id` right after `prevId` (or first when prevId is null). */
  insertAfter(id: string, prevId: string | null): void {
    const chunk = prevId ? this.chunkOf.get(prevId) : this.chunks[0];
    if (!chunk) {
      if (prevId) throw new Error(`SceneCache: ${prevId} is not in this pass`);
      this.append(id);
      return;
    }
    const at = prevId ? chunk.ids.indexOf(prevId) + 1 : 0;
    chunk.ids.splice(at, 0, id);
    this.chunkOf.set(id, chunk);
    this.dirty(chunk);
    if (chunk.ids.length > MAX_CHUNK) this.split(chunk);
  }

  /** Removes `id`; drops its chunk when it becomes empty. */
  remove(id: string): void {
    const chunk = this.chunkOf.get(id);
    if (!chunk) return;
    chunk.ids.splice(chunk.ids.indexOf(id), 1);
    this.chunkOf.delete(id);
    if (chunk.ids.length === 0) this.chunks.splice(this.chunks.indexOf(chunk), 1);
    else this.dirty(chunk);
  }

  /** Marks the chunk holding `id` for re-recording. */
  invalidate(id: string): void {
    const chunk = this.chunkOf.get(id);
    if (chunk) this.dirty(chunk);
  }

  /** Marks every chunk for re-recording. */
  invalidateAll(): void {
    for (const c of this.chunks) this.dirty(c);
  }

  /** Clears a chunk's cached picture and bounds. */
  private dirty(chunk: Chunk): void {
    chunk.picture = null;
    chunk.bounds = null;
  }

  /** Splits an over-full chunk into two halves. */
  private split(chunk: Chunk): void {
    const half = chunk.ids.splice(Math.floor(chunk.ids.length / 2));
    const next: Chunk = { ids: half, picture: null, bounds: null };
    for (const id of half) this.chunkOf.set(id, next);
    this.chunks.splice(this.chunks.indexOf(chunk) + 1, 0, next);
  }
}

/** Chunked pictures of one layer, one PassChunks per draw pass. */
class LayerChunks {
  private passes = new Map<number, PassChunks>();

  /** Builds chunks for every object currently in `layer`. */
  constructor(layer: Layer, private readonly painter: ObjectPainter) {
    for (const obj of layer.items) {
      const pass = painter.passOf(obj);
      if (pass !== null) this.pass(pass).append(obj.id);
    }
  }

  /** Passes in draw order (lowest first). */
  get orderedPasses(): PassChunks[] {
    return [...this.passes.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  /** The PassChunks for `pass`, created when missing. */
  private pass(pass: number): PassChunks {
    let p = this.passes.get(pass);
    if (!p) {
      p = new PassChunks();
      this.passes.set(pass, p);
    }
    return p;
  }

  /** The pass currently holding `id`, if any. */
  private passHolding(id: string): PassChunks | undefined {
    for (const p of this.passes.values()) if (p.has(id)) return p;
    return undefined;
  }

  /** Applies added, removed and updated ids from one document change. */
  apply(layer: Layer, change: { added: string[]; removed: string[]; updated: string[] }): void {
    for (const id of change.removed) this.passHolding(id)?.remove(id);
    for (const id of change.updated) {
      const obj = layer.items[layer.indexOf(id)];
      const holder = this.passHolding(id);
      const pass = obj ? this.painter.passOf(obj) : null;
      if (holder && pass !== null && holder === this.passes.get(pass)) {
        holder.invalidate(id);
      } else {
        holder?.remove(id);
        if (obj) this.insert(layer, obj);
      }
    }
    for (const id of change.added) {
      const obj = layer.items[layer.indexOf(id)];
      if (obj) this.insert(layer, obj);
    }
  }

  /** Marks every chunk of `pass` for re-recording (e.g. a page image loaded). */
  invalidatePass(pass: number): void {
    this.passes.get(pass)?.invalidateAll();
  }

  /** Inserts `obj` after the nearest object below it in the same pass. */
  private insert(layer: Layer, obj: CanvasObject): void {
    const pass = this.painter.passOf(obj);
    if (pass === null) return;
    const chunks = this.pass(pass);
    const items = layer.items;
    let prevId: string | null = null;
    for (let i = layer.indexOf(obj.id) - 1; i >= 0; i--) {
      if (chunks.has(items[i].id)) {
        prevId = items[i].id;
        break;
      }
    }
    chunks.insertAfter(obj.id, prevId);
  }
}

/** Every layer's chunk pictures for one document, plus scene assembly. */
export class SceneCache {
  private layers = new Map<string, LayerChunks>();

  /** Creates the cache and chunks every layer of `doc`. */
  constructor(private readonly doc: CanvasDocument, private readonly painter: ObjectPainter) {
    this.syncLayers();
  }

  /** Updates chunk membership for one document change. */
  applyChange(change: DocumentChange): void {
    if (change.kind === 'layers') {
      this.syncLayers();
    } else if (change.kind === 'objects') {
      const layer = this.doc.getLayer(change.layerId);
      const chunks = this.layers.get(change.layerId);
      if (layer && chunks) chunks.apply(layer, change);
    }
  }

  /** Marks every chunk of `pass` in every layer for re-recording. */
  invalidatePass(pass: number): void {
    for (const l of this.layers.values()) l.invalidatePass(pass);
  }

  /**
   * Records the scene picture covering world rect `cull`: visible layers
   * bottom to top, each layer's passes in order, chunks that intersect
   * `cull` in draw order. Objects in `hidden` are left out (the selection
   * while it is being dragged); chunks holding them are recorded without
   * them for this frame only.
   */
  buildScene(cull: Rect, hidden: ReadonlySet<string> | null): SkPicture {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(toSkRect(cull));
    const layerPaint = Skia.Paint();
    for (const layer of this.doc.layers) {
      const chunks = this.layers.get(layer.id);
      if (!layer.props.visible || !chunks) continue;
      const isolated = layer.props.opacity < 1;
      if (isolated) {
        layerPaint.setAlphaf(layer.props.opacity);
        canvas.saveLayer(layerPaint);
      }
      for (const pass of chunks.orderedPasses) {
        for (const chunk of pass.chunks) this.drawChunk(canvas, chunk, cull, hidden);
      }
      if (isolated) canvas.restore();
    }
    return recorder.finishRecordingAsPicture();
  }

  /** Records the given objects (in the given order) into one picture. */
  recordObjects(objects: readonly CanvasObject[]): SkPicture {
    const bounds = objects.reduce((r, o) => unionRect(r, o.bounds), emptyRect());
    return this.record(objects, inflateRect(bounds, CHUNK_MARGIN));
  }

  /** Draws one chunk into the scene if it is on screen, recording it if needed. */
  private drawChunk(canvas: SkCanvas, chunk: Chunk, cull: Rect, hidden: ReadonlySet<string> | null): void {
    const bounds = chunk.bounds ?? (chunk.bounds = this.chunkBounds(chunk));
    if (isEmptyRect(bounds) || !rectsIntersect(bounds, cull)) return;
    if (hidden && chunk.ids.some((id) => hidden.has(id))) {
      canvas.drawPicture(this.record(this.objectsOf(chunk, hidden), bounds));
      return;
    }
    if (!chunk.picture) chunk.picture = this.record(this.objectsOf(chunk, null), bounds);
    canvas.drawPicture(chunk.picture);
  }

  /** Union of the chunk's object bounds plus a margin. */
  private chunkBounds(chunk: Chunk): Rect {
    let r = emptyRect();
    for (const id of chunk.ids) {
      const o = this.doc.getObject(id);
      if (o) r = unionRect(r, o.bounds);
    }
    return isEmptyRect(r) ? r : inflateRect(r, CHUNK_MARGIN);
  }

  /** The chunk's live objects in order, minus any in `hidden`. */
  private objectsOf(chunk: Chunk, hidden: ReadonlySet<string> | null): CanvasObject[] {
    const out: CanvasObject[] = [];
    for (const id of chunk.ids) {
      if (hidden?.has(id)) continue;
      const o = this.doc.getObject(id);
      if (o) out.push(o);
    }
    return out;
  }

  /** Records `objects` into a picture whose cull rect is `bounds`. */
  private record(objects: readonly CanvasObject[], bounds: Rect): SkPicture {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(toSkRect(bounds));
    for (const o of objects) this.painter.draw(canvas, o);
    return recorder.finishRecordingAsPicture();
  }

  /** Creates chunks for new layers and drops those of removed layers. */
  private syncLayers(): void {
    const live = new Set<string>();
    for (const layer of this.doc.layers) {
      live.add(layer.id);
      if (!this.layers.has(layer.id)) this.layers.set(layer.id, new LayerChunks(layer, this.painter));
    }
    for (const id of [...this.layers.keys()]) if (!live.has(id)) this.layers.delete(id);
  }
}
