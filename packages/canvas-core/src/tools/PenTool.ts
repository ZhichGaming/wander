/**
 * Wander — Zhich, Yu, Justin
 * Draws freehand strokes with the configured style (pen or highlighter).
 * Shows the stroke in the overlay while drawing and commits it to the
 * active layer as one undoable CreateObjects command on lift. Apple Pencil
 * estimate corrections (onSampleUpdate) are applied to the matching point
 * of the stroke in progress.
 */

import { CreateObjects } from '../commands/ObjectCommands';
import { Emitter } from '../Emitter';
import { Stroke } from '../model/Stroke';
import { DEFAULT_PEN_STYLE, type StrokePoint, type StrokeStyle } from '../model/StrokeStyle';
import type { PointerInput, PointerSampleUpdate, Tool, ToolContext } from './Tool';

/** Converts a pointer sample to a stroke point. */
function toPoint(e: PointerInput): StrokePoint {
  const p: StrokePoint = { x: e.x, y: e.y, pressure: e.pressure, time: e.time };
  if (e.tiltX !== undefined) p.tiltX = e.tiltX;
  if (e.tiltY !== undefined) p.tiltY = e.tiltY;
  return p;
}

/** Freehand drawing tool. */
export class PenTool implements Tool {
  readonly name: string;
  /** Fires with the new style after setStyle (the renderer mirrors it to the UI thread). */
  readonly styleChanged = new Emitter<Readonly<StrokeStyle>>();
  private style: StrokeStyle;
  private points: StrokePoint[] | null = null;
  private pointerId = -1;
  /** updateIndex of a live sample -> index of its point in `points`. */
  private readonly estimated = new Map<number, number>();
  /** Look-ahead samples last shown, kept so a correction can redraw them. */
  private predicted: StrokePoint[] = [];

  /** Creates a pen with `style` (default black pen). */
  constructor(style: StrokeStyle = DEFAULT_PEN_STYLE) {
    this.style = { ...style };
    this.name = style.brush;
  }

  /** Current style. */
  getStyle(): Readonly<StrokeStyle> {
    return this.style;
  }

  /** Changes the style for the next stroke. */
  setStyle(style: Partial<StrokeStyle>): void {
    this.style = { ...this.style, ...style };
    this.styleChanged.emit(this.style);
  }

  /** Starts a stroke if the active layer is editable. */
  onDown(e: PointerInput, ctx: ToolContext): void {
    const layer = ctx.doc.activeLayer;
    if (layer.props.locked || !layer.props.visible) return;
    this.pointerId = e.pointerId;
    this.points = [toPoint(e)];
    this.estimated.clear();
    this.predicted = [];
    if (e.updateIndex !== undefined) this.estimated.set(e.updateIndex, 0);
    this.showLive(ctx);
  }

  /** Appends a sample, skipping ones that did not move by a quarter screen pixel. */
  onMove(e: PointerInput, ctx: ToolContext, predicted?: readonly PointerInput[]): void {
    if (!this.points || e.pointerId !== this.pointerId) return;
    const last = this.points[this.points.length - 1];
    const minDist = 0.25 / ctx.camera.scale;
    if (Math.hypot(e.x - last.x, e.y - last.y) >= minDist) {
      if (e.updateIndex !== undefined) this.estimated.set(e.updateIndex, this.points.length);
      this.points.push(toPoint(e));
    }
    this.predicted = predicted ? predicted.map(toPoint) : [];
    this.showLive(ctx);
  }

  /** Replaces a live point's estimated values with the corrected ones. */
  onSampleUpdate(u: PointerSampleUpdate, ctx: ToolContext): void {
    const i = this.estimated.get(u.updateIndex);
    if (!this.points || i === undefined) return;
    const p = this.points[i];
    p.x = u.x;
    p.y = u.y;
    if (u.pressure !== undefined) p.pressure = u.pressure;
    if (u.tiltX !== undefined) p.tiltX = u.tiltX;
    if (u.tiltY !== undefined) p.tiltY = u.tiltY;
    this.showLive(ctx);
  }

  /** Publishes the stroke in progress to the overlay. */
  private showLive(ctx: ToolContext): void {
    if (this.points) ctx.overlay.setLiveStroke({ points: this.points, predicted: this.predicted, style: this.style });
  }

  /** Commits the stroke to the active layer. */
  onUp(e: PointerInput, ctx: ToolContext): void {
    if (!this.points || e.pointerId !== this.pointerId) return;
    try {
      this.onMove(e, ctx);
      const stroke = new Stroke(this.points, this.style);
      this.points = null;
      this.estimated.clear();
      // Commit before clearing the live stroke, so a renderer can swap one for
      // the other in the same frame instead of showing neither for a frame.
      ctx.history.execute(new CreateObjects(ctx.doc.activeLayer.id, [stroke], 'Draw'));
    } finally {
      // A failed commit must still drop the live stroke, or the overlay (and
      // on device, UI-thread ink) keeps looking like a stroke is in progress.
      this.points = null;
      this.estimated.clear();
      ctx.overlay.setLiveStroke(null);
    }
  }

  /** Drops the stroke in progress. */
  onCancel(ctx: ToolContext): void {
    this.points = null;
    this.estimated.clear();
    ctx.overlay.setLiveStroke(null);
  }
}
