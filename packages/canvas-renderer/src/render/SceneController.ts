/**
 * Wander — Zhich, Yu, Justin
 * Keeps the committed-ink picture in sync with the engine. Listens to
 * document, camera, image and lasso-drag events, updates the SceneCache,
 * and rebuilds the scene picture at most once per animation frame. Camera
 * moves only trigger a rebuild when the view leaves the area the current
 * picture covers (the visible rect plus a margin), so plain panning and
 * zooming cost no JavaScript work.
 */

import type { SkPicture } from '@shopify/react-native-skia';
import {
  inflateRect,
  type CanvasDocument,
  type CanvasEngine,
  type CanvasObject,
  type Emitter,
  type Rect,
  type Tool,
  type Vec2,
} from '@wander/canvas-core';
import { ImageCache } from './ImageCache';
import { ObjectPainter, PAGE_PASS } from './ObjectPainter';
import { SceneCache } from './SceneCache';

/** The cull window extends this share of the view size beyond each edge. */
const CULL_MARGIN = 0.5;

/** What the view draws for committed objects. */
export interface ScenePictures {
  /** Every committed object except a selection being dragged. */
  scene: SkPicture | null;
  /** The dragged selection, drawn translated by the drag offset; null when not dragging. */
  dragPreview: SkPicture | null;
}

/** A tool that publishes a move-in-progress offset (the LassoTool does). */
interface DraggingTool extends Tool {
  readonly dragChanged: Emitter<Vec2 | null>;
}

/** True when `tool` exposes dragChanged. */
function isDraggingTool(tool: Tool): tool is DraggingTool {
  return 'dragChanged' in tool;
}

/** True when `outer` fully contains `inner`. */
function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY
  );
}

/** Owns the scene cache for one engine and publishes pictures to the view. */
export class SceneController {
  private readonly painter: ObjectPainter;
  private cache: SceneCache;
  private doc: CanvasDocument;
  private viewW = 0;
  private viewH = 0;
  private cull: Rect | null = null;
  private hidden: Set<string> | null = null;
  private dragPreview: SkPicture | null = null;
  private frame: number | null = null;
  private unsubscribers: (() => void)[] = [];
  private unsubscribeDoc: () => void = () => {};
  private unsubscribeTool: () => void = () => {};

  /**
   * Starts listening to `engine`. `onPictures` receives new pictures and
   * `onDragOffset` the live offset of a selection being moved.
   */
  constructor(
    private readonly engine: CanvasEngine,
    private readonly onPictures: (pictures: ScenePictures) => void,
    private readonly onDragOffset: (offset: Vec2) => void,
  ) {
    const images = new ImageCache();
    this.painter = new ObjectPainter(images);
    this.doc = engine.doc;
    this.cache = new SceneCache(this.doc, this.painter);
    this.watchDocument();
    this.watchTool(engine.tool);
    this.unsubscribers.push(
      engine.documentReplaced.on(() => this.replaceDocument()),
      engine.camera.changed.on(() => this.onCameraChanged()),
      engine.toolChanged.on((tool) => this.watchTool(tool)),
      images.loaded.on(() => {
        this.cache.invalidatePass(PAGE_PASS);
        this.schedule();
      }),
    );
  }

  /** Records the view size in screen pixels; rebuilds for the new viewport. */
  setViewSize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.cull = null;
    this.schedule();
  }

  /** Stops listening and cancels any pending rebuild. */
  dispose(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribeDoc();
    this.unsubscribeTool();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /** Subscribes to the current document's changes. */
  private watchDocument(): void {
    this.unsubscribeDoc();
    this.unsubscribeDoc = this.doc.changed.on((change) => {
      this.cache.applyChange(change);
      if (change.kind === 'background') return;
      // A newly drawn stroke is published at once, in the same tick as the
      // live stroke is cleared, so the two swap in one React commit with no
      // empty frame between them. Other edits (erasing, moving) coalesce
      // per animation frame.
      const isNewInk = change.kind === 'objects' && change.added.length > 0 && change.removed.length === 0;
      if (isNewInk) this.rebuildNow();
      else this.schedule();
    });
  }

  /** Starts a fresh cache for a document loaded with engine.load. */
  private replaceDocument(): void {
    this.doc = this.engine.doc;
    this.cache = new SceneCache(this.doc, this.painter);
    this.endDrag();
    this.watchDocument();
    this.schedule();
  }

  /** Follows the drag offset of `tool` when it is a dragging tool. */
  private watchTool(tool: Tool): void {
    this.unsubscribeTool();
    this.unsubscribeTool = () => {};
    this.endDrag();
    if (isDraggingTool(tool)) {
      this.unsubscribeTool = tool.dragChanged.on((offset) => this.onDrag(offset));
    }
  }

  /**
   * On drag start, hides the selection from the scene and records it as a
   * separate preview picture; afterwards only the offset changes.
   */
  private onDrag(offset: Vec2 | null): void {
    if (!offset) {
      this.endDrag();
      this.schedule();
      return;
    }
    this.onDragOffset(offset);
    if (this.hidden) return;
    this.hidden = new Set(this.engine.selection.items);
    const selected: CanvasObject[] = [];
    for (const obj of this.doc.allObjects()) if (this.hidden.has(obj.id)) selected.push(obj);
    this.dragPreview = this.cache.recordObjects(selected);
    this.schedule();
  }

  /** Clears drag state. */
  private endDrag(): void {
    this.hidden = null;
    this.dragPreview = null;
    this.onDragOffset({ x: 0, y: 0 });
  }

  /** Rebuilds when the visible rect leaves the area the scene covers. */
  private onCameraChanged(): void {
    if (this.cull && containsRect(this.cull, this.visibleRect())) return;
    this.cull = null;
    this.schedule();
  }

  /** World rect currently on screen. */
  private visibleRect(): Rect {
    return this.engine.camera.visibleRect(this.viewW, this.viewH);
  }

  /** Requests a rebuild on the next animation frame (coalesces bursts of events). */
  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.rebuild();
    });
  }

  /** Rebuilds immediately, dropping any rebuild already scheduled. */
  private rebuildNow(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.rebuild();
  }

  /** Records the scene for the current cull window and publishes it. */
  private rebuild(): void {
    if (this.viewW <= 0 || this.viewH <= 0) return;
    if (!this.cull) {
      const visible = this.visibleRect();
      const pad = Math.max(visible.maxX - visible.minX, visible.maxY - visible.minY) * CULL_MARGIN;
      this.cull = inflateRect(visible, pad);
    }
    const scene = this.cache.buildScene(this.cull, this.hidden);
    this.onPictures({ scene, dragPreview: this.dragPreview });
  }
}
