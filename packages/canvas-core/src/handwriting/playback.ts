/**
 * Wander — Zhich, Yu, Justin
 * Puts generated ink on the canvas so that it appears to be written.
 *
 * The strokes are added to the document at once, as one undo step and one
 * group, so the document is right from the start: saving, undo and an
 * agent's next look at the canvas all see the whole answer. Only the
 * drawing is staged: every stroke starts concealed (Overlay.concealed) and
 * is revealed in writing order, following the times in the ink but
 * compressed: `speed` times faster, and never longer than `maxDuration`
 * in total, so a long answer sweeps in instead of taking as long as it
 * would take to write.
 */

import { CreateObjects } from '../commands/ObjectCommands';
import type { CanvasEngine } from '../engine/CanvasEngine';
import { newId } from '../ids';
import { Stroke } from '../model/Stroke';
import { DEFAULT_PEN_STYLE, type StrokeStyle } from '../model/StrokeStyle';
import type { Ink } from './handwriting';

/** How writeInk puts ink on the canvas. */
export interface WriteInkOptions {
  /** Pen to draw with (default: the black pen). */
  style?: StrokeStyle;
  /** Layer to write on (default: the active layer). */
  layerId?: string;
  /** Group id for the strokes (default: a fresh one), so the answer moves and erases as one. */
  group?: string;
  /** Undo label (default "Write"). */
  label?: string;
  /**
   * How many times faster than the ink's own timing the strokes appear
   * (default 6). 0 shows everything at once.
   */
  speed?: number;
  /**
   * Longest the whole reveal may take, in milliseconds (default 1500).
   * Ink that would take longer at `speed` is sped up further to fit.
   */
  maxDuration?: number;
  /** Timer used for the reveal; defaults to globalThis.setTimeout. */
  setTimer?: (fn: () => void, ms: number) => () => void;
  /** Clock in milliseconds; defaults to Date.now. */
  now?: () => number;
}

/** Ink being written onto the canvas. */
export interface InkWriting {
  /** The strokes that were added, in writing order. */
  strokes: Stroke[];
  /** Their group id. */
  group: string;
  /** Resolves when every stroke is visible. */
  done: Promise<void>;
  /** Shows everything that is still concealed, now. */
  finish(): void;
}

/** Time between reveal steps, in milliseconds: one per frame. */
const STEP_MS = 16;

const timerGlobals = globalThis as unknown as {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

/** setTimeout that returns its own cancel function. */
function defaultSetTimer(fn: () => void, ms: number): () => void {
  const handle = timerGlobals.setTimeout(fn, ms);
  return () => timerGlobals.clearTimeout(handle);
}

/**
 * Adds `ink` to `engine`'s document as one group and one undo step, and
 * reveals it stroke by stroke in writing order.
 */
export function writeInk(engine: CanvasEngine, ink: Ink, opts: WriteInkOptions = {}): InkWriting {
  const style = opts.style ?? DEFAULT_PEN_STYLE;
  const group = opts.group ?? newId('g');
  const speed = opts.speed ?? 6;
  const maxDuration = opts.maxDuration ?? 1500;
  const setTimer = opts.setTimer ?? defaultSetTimer;
  const now = opts.now ?? (() => Date.now());
  const strokes = ink.strokes.map((points) => new Stroke(points, style, undefined, undefined, group));
  const layerId = opts.layerId ?? engine.doc.activeLayer.id;

  // When each stroke is finished, in milliseconds from the start of the
  // reveal: the ink's own times divided by `speed`, squeezed into maxDuration.
  const first = ink.strokes[0]?.[0]?.time ?? 0;
  const lastStroke = ink.strokes[ink.strokes.length - 1];
  const total = lastStroke ? lastStroke[lastStroke.length - 1].time - first : 0;
  const rate = speed > 0 && total > 0 ? Math.min(1 / speed, maxDuration / total) : 0;
  const waiting =
    rate > 0
      ? strokes.map((s, i) => {
          const points = ink.strokes[i];
          return { id: s.id, at: (points[points.length - 1].time - first) * rate };
        })
      : [];

  const overlay = engine.overlay;
  if (waiting.length > 0) overlay.setConcealed([...overlay.state.concealed, ...waiting.map((w) => w.id)]);
  engine.history.execute(new CreateObjects(layerId, strokes, opts.label ?? 'Write'));

  let cancel: (() => void) | null = null;
  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolve = r;
  });
  const started = now();

  /** Reveals every stroke due by `elapsed` and reports whether any are left. */
  const reveal = (elapsed: number): boolean => {
    const due = new Set<string>();
    while (waiting.length > 0 && waiting[0].at <= elapsed) due.add(waiting.shift()!.id);
    if (due.size > 0) overlay.setConcealed(overlay.state.concealed.filter((id) => !due.has(id)));
    return waiting.length > 0;
  };
  const step = () => {
    cancel = null;
    if (reveal(now() - started)) cancel = setTimer(step, STEP_MS);
    else resolve();
  };
  const finish = () => {
    cancel?.();
    cancel = null;
    reveal(Infinity);
    resolve();
  };

  if (waiting.length > 0) step();
  else resolve();
  return { strokes, group, done, finish };
}
