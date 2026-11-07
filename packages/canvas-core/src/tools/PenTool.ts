/**
 * Wander — Zhich, Yu, Justin
 * Draws freehand strokes with the configured style (pen or highlighter).
 * Shows the stroke in the overlay while drawing and commits it to the
 * active layer as one undoable CreateObjects command on lift.
 */

import { CreateObjects } from '../commands/ObjectCommands';
import { Stroke } from '../model/Stroke';
import { DEFAULT_PEN_STYLE, type StrokePoint, type StrokeStyle } from '../model/StrokeStyle';
import type { PointerInput, Tool, ToolContext } from './Tool';

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
  private style: StrokeStyle;
  private points: StrokePoint[] | null = null;
  private pointerId = -1;

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
  }

  /** Starts a stroke if the active layer is editable. */
  onDown(e: PointerInput, ctx: ToolContext): void {
    const layer = ctx.doc.activeLayer;
    if (layer.props.locked || !layer.props.visible) return;
    this.pointerId = e.pointerId;
    this.points = [toPoint(e)];
    ctx.overlay.setLiveStroke({ points: this.points, predicted: [], style: this.style });
  }

  /** Appends a sample, skipping ones that did not move by a quarter screen pixel. */
  onMove(e: PointerInput, ctx: ToolContext, predicted?: readonly PointerInput[]): void {
    if (!this.points || e.pointerId !== this.pointerId) return;
    const last = this.points[this.points.length - 1];
    const minDist = 0.25 / ctx.camera.scale;
    if (Math.hypot(e.x - last.x, e.y - last.y) >= minDist) this.points.push(toPoint(e));
    ctx.overlay.setLiveStroke({
      points: this.points,
      predicted: predicted ? predicted.map(toPoint) : [],
      style: this.style,
    });
  }

  /** Commits the stroke to the active layer. */
  onUp(e: PointerInput, ctx: ToolContext): void {
    if (!this.points || e.pointerId !== this.pointerId) return;
    this.onMove(e, ctx);
    const stroke = new Stroke(this.points, this.style);
    this.points = null;
    ctx.overlay.setLiveStroke(null);
    ctx.history.execute(new CreateObjects(ctx.doc.activeLayer.id, [stroke], 'Draw'));
  }

  /** Drops the stroke in progress. */
  onCancel(ctx: ToolContext): void {
    this.points = null;
    ctx.overlay.setLiveStroke(null);
  }
}
