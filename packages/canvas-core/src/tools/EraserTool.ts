/**
 * Wander — Zhich, Yu, Justin
 * Vector eraser with two modes. "object" removes every stroke the eraser
 * touches; "partial" cuts away only the covered part of each stroke and
 * keeps the rest as new strokes. Both work on stroke geometry, never on
 * pixels, and only affect strokes (not imported pages) on visible,
 * unlocked layers.
 *
 * Each drag is one undo step: the tool opens a history group on down and
 * closes it on up or cancel, executing small commands as it goes so erased
 * ink disappears immediately under the pen.
 */

import { DeleteObjects } from '../commands/ObjectCommands';
import { SplitStroke } from '../commands/EraseCommands';
import { eraseFromPolyline, type Capsule } from '../math/eraseGeometry';
import { inflateRect, type Vec2 } from '../math/geometry';
import { Stroke } from '../model/Stroke';
import type { PointerInput, Tool, ToolContext } from './Tool';

/** How the eraser treats a stroke it touches. */
export type EraserMode = 'object' | 'partial';

/** Eraser settings. */
export interface EraserOptions {
  mode: EraserMode;
  /** Eraser radius in screen pixels (stays the same size on screen at any zoom). */
  radius: number;
}

/** Default eraser: whole-stroke erase with a 10 px radius. */
export const DEFAULT_ERASER_OPTIONS: Readonly<EraserOptions> = Object.freeze({ mode: 'object', radius: 10 });

/** Eraser tool (strategy for the Tool interface). */
export class EraserTool implements Tool {
  readonly name = 'eraser';
  private options: EraserOptions;
  private last: Vec2 | null = null;
  private pointerId = -1;

  /** Creates an eraser; missing options fall back to the defaults. */
  constructor(options: Partial<EraserOptions> = {}) {
    this.options = { ...DEFAULT_ERASER_OPTIONS, ...options };
  }

  /** Current mode. */
  get mode(): EraserMode {
    return this.options.mode;
  }

  /** Current radius in screen pixels. */
  get radius(): number {
    return this.options.radius;
  }

  /** Switches between object and partial erasing. */
  setMode(mode: EraserMode): void {
    this.options.mode = mode;
  }

  /** Changes the radius in screen pixels. */
  setRadius(radius: number): void {
    this.options.radius = radius;
  }

  /** Opens the undo group and erases under the first contact point. */
  onDown(e: PointerInput, ctx: ToolContext): void {
    if (this.last) return; // a second contact while erasing is ignored
    this.pointerId = e.pointerId;
    this.last = { x: e.x, y: e.y };
    ctx.history.beginGroup('Erase');
    this.sweep(this.last, this.last, ctx);
  }

  /** Erases along the segment from the previous sample to this one. */
  onMove(e: PointerInput, ctx: ToolContext): void {
    if (!this.last || e.pointerId !== this.pointerId) return;
    const next = { x: e.x, y: e.y };
    this.sweep(this.last, next, ctx);
    this.last = next;
  }

  /** Erases the final segment and closes the undo group. */
  onUp(e: PointerInput, ctx: ToolContext): void {
    if (!this.last || e.pointerId !== this.pointerId) return;
    this.onMove(e, ctx);
    this.finish(ctx);
  }

  /**
   * Stops erasing. What was already erased stays erased (it is visible and
   * the user expects it), and the group is closed so it undoes in one step.
   */
  onCancel(ctx: ToolContext): void {
    if (this.last) this.finish(ctx);
  }

  /** Ends the gesture: closes the group and hides the cursor. */
  private finish(ctx: ToolContext): void {
    this.last = null;
    ctx.history.endGroup();
    ctx.overlay.setEraser(null);
  }

  /** Shows the cursor at `b` and erases everything in the capsule a-b. */
  private sweep(a: Vec2, b: Vec2, ctx: ToolContext): void {
    const radius = this.options.radius / ctx.camera.scale;
    ctx.overlay.setEraser({ center: b, radius });
    const capsule: Capsule = { a, b, radius };
    const area = inflateRect(
      { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) },
      radius,
    );
    const strokes = ctx.doc
      .queryRect(area, { includeHidden: false, includeLocked: false })
      .filter((o): o is Stroke => o instanceof Stroke);
    if (this.options.mode === 'object') this.eraseWhole(strokes, capsule, ctx);
    else this.erasePartial(strokes, capsule, ctx);
  }

  /**
   * Deletes every candidate stroke touched by the capsule. The capsule is
   * sampled every half radius with Stroke.hitTest so fast drags do not skip
   * strokes between pointer samples.
   */
  private eraseWhole(strokes: Stroke[], c: Capsule, ctx: ToolContext): void {
    const length = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    const steps = Math.max(1, Math.ceil(length / (c.radius / 2)));
    const hit = strokes.filter((s) => {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = { x: c.a.x + (c.b.x - c.a.x) * t, y: c.a.y + (c.b.y - c.a.y) * t };
        if (s.hitTest(p, c.radius)) return true;
      }
      return false;
    });
    if (hit.length) ctx.history.execute(new DeleteObjects(hit.map((s) => s.id), 'Erase'));
  }

  /**
   * Cuts the covered part out of each candidate stroke. The capsule is
   * widened by half the stroke width so the remaining ink ends at the
   * eraser edge rather than overlapping it.
   */
  private erasePartial(strokes: Stroke[], c: Capsule, ctx: ToolContext): void {
    for (const s of strokes) {
      const result = eraseFromPolyline(s.points, { ...c, radius: c.radius + s.style.width / 2 });
      if (!result.changed) continue;
      const pieces = result.runs.map((run) => s.withPoints(run));
      ctx.history.execute(new SplitStroke(s.id, pieces));
    }
  }
}
