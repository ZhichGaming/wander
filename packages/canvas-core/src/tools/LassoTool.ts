/**
 * Wander — Zhich, Yu, Justin
 * Lasso selection tool. Dragging outside the selection draws a free-form
 * polygon and selects the objects mostly inside it (adding to the selection
 * while another finger is held). Dragging inside the selection's bounds
 * moves the selected objects as one undoable step. Also exports a helper
 * that deletes the selection.
 */

import { DeleteObjects, TransformObjects } from '../commands/ObjectCommands';
import { Emitter } from '../Emitter';
import { rectContainsPoint, translation, type Vec2 } from '../math/geometry';
import { pointInPolygon, polygonBounds } from '../math/polygon';
import type { CanvasObject } from '../model/CanvasObject';
import { Stroke } from '../model/Stroke';
import type { PointerInput, Tool, ToolContext } from './Tool';

/** A lasso whose bounds are smaller than this many screen pixels is a tap. */
const TAP_SIZE_PX = 6;

/** Share of a stroke's points that must lie inside the lasso to select it. */
const STROKE_INSIDE_RATIO = 0.5;

/** True when enough of `obj` lies inside `polygon` to be selected by it. */
function isLassoed(obj: CanvasObject, polygon: readonly Vec2[]): boolean {
  if (obj instanceof Stroke) {
    let inside = 0;
    for (const p of obj.points) if (pointInPolygon(p, polygon)) inside++;
    return inside >= obj.points.length * STROKE_INSIDE_RATIO;
  }
  const b = obj.bounds;
  return pointInPolygon({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, polygon);
}

/**
 * Ids of the objects on visible, unlocked layers that `polygon` selects.
 * Candidates come from the spatial index using the polygon's bounds.
 */
export function objectsInLasso(ctx: Pick<ToolContext, 'doc'>, polygon: readonly Vec2[]): string[] {
  if (polygon.length < 3) return [];
  const candidates = ctx.doc.queryRect(polygonBounds(polygon), { includeLocked: false });
  return candidates.filter((o) => isLassoed(o, polygon)).map((o) => o.id);
}

/**
 * Deletes every selected object as one undoable step and clears the
 * selection. Returns false when nothing was selected. The engine itself
 * satisfies the context type, so UI code can call deleteSelection(engine).
 */
export function deleteSelection(ctx: Pick<ToolContext, 'doc' | 'history' | 'selection'>): boolean {
  const ids = ctx.selection.objects(ctx.doc).map((o) => o.id);
  ctx.selection.clear();
  if (ids.length === 0) return false;
  ctx.history.execute(new DeleteObjects(ids));
  return true;
}

/** Lasso select, multi-select and move tool. */
export class LassoTool implements Tool {
  readonly name = 'lasso';
  /**
   * Fires whenever `dragOffset` changes (including back to null), so the
   * renderer can redraw the selection without polling.
   */
  readonly dragChanged = new Emitter<Vec2 | null>();
  private path: Vec2[] | null = null;
  private moveStart: Vec2 | null = null;
  private offset: Vec2 | null = null;
  private pointerId = -1;

  /**
   * World-space offset of the selection move in progress, or null when not
   * moving. The document is only changed on lift, so while this is set the
   * renderer should draw the selected objects translated by it.
   */
  get dragOffset(): Readonly<Vec2> | null {
    return this.offset;
  }

  /** Starts a move when the contact lands inside the selection, else a lasso. */
  onDown(e: PointerInput, ctx: ToolContext): void {
    this.pointerId = e.pointerId;
    const p = { x: e.x, y: e.y };
    if (ctx.selection.size > 0 && rectContainsPoint(ctx.selection.bounds(ctx.doc), p)) {
      this.moveStart = p;
      this.setOffset({ x: 0, y: 0 });
      return;
    }
    this.path = [p];
    ctx.overlay.setLasso(this.path);
  }

  /** Extends the lasso path or updates the move offset. */
  onMove(e: PointerInput, ctx: ToolContext): void {
    if (e.pointerId !== this.pointerId) return;
    if (this.moveStart) {
      this.setOffset({ x: e.x - this.moveStart.x, y: e.y - this.moveStart.y });
    } else if (this.path) {
      this.path.push({ x: e.x, y: e.y });
      ctx.overlay.setLasso(this.path);
    }
  }

  /** Commits the move as one TransformObjects, or applies the lasso to the selection. */
  onUp(e: PointerInput, ctx: ToolContext): void {
    if (e.pointerId !== this.pointerId) return;
    this.onMove(e, ctx);
    if (this.moveStart) this.finishMove(ctx);
    else if (this.path) this.finishLasso(e.additive, ctx);
  }

  /** Drops the lasso or move in progress; the document is untouched. */
  onCancel(ctx: ToolContext): void {
    if (this.path) ctx.overlay.setLasso(null);
    this.path = null;
    this.moveStart = null;
    this.setOffset(null);
  }

  /** Translates the selection by the drag offset in one undo step. */
  private finishMove(ctx: ToolContext): void {
    const offset = this.offset;
    this.moveStart = null;
    this.setOffset(null);
    if (!offset || (offset.x === 0 && offset.y === 0)) return;
    const ids = ctx.selection.objects(ctx.doc).map((o) => o.id);
    ctx.history.execute(new TransformObjects(ids, translation(offset.x, offset.y), 'Move'));
  }

  /** Selects what the lasso encloses, or clears the selection on a plain tap. */
  private finishLasso(additive: boolean, ctx: ToolContext): void {
    const polygon = this.path ?? [];
    this.path = null;
    ctx.overlay.setLasso(null);
    const b = polygonBounds(polygon);
    const tapSize = TAP_SIZE_PX / ctx.camera.scale;
    if (b.maxX - b.minX < tapSize && b.maxY - b.minY < tapSize) {
      if (!additive) ctx.selection.clear();
      return;
    }
    const ids = objectsInLasso(ctx, polygon);
    if (additive) ctx.selection.add(ids);
    else ctx.selection.set(ids);
  }

  /** Stores the drag offset and notifies listeners. */
  private setOffset(offset: Vec2 | null): void {
    if (offset === null && this.offset === null) return;
    this.offset = offset;
    this.dragChanged.emit(offset);
  }
}
