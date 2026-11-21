/**
 * Wander — Zhich, Yu, Justin
 * Live ink: the strokes being drawn, held in a Reanimated shared value so
 * the UI thread can extend and draw them the moment a touch arrives,
 * without waiting for the JavaScript thread.
 *
 * Two writers share the state, and every write runs on the UI thread:
 * - The native touch handler (iOS development builds) starts and extends
 *   strokes directly from Apple Pencil and finger events ("ui" strokes).
 * - The JavaScript overlay mirrors strokes the UI thread did not start
 *   (web, Expo Go, or a contact the UI rules did not pick) ("js" strokes).
 * JavaScript stays in charge of what is committed: when PenTool commits
 * or cancels a stroke, the overlay calls clearInkStroke with its key, in
 * the same task that publishes the committed picture.
 *
 * A stroke's key is the timestamp of its first sample, which the UI thread
 * and PenTool (points[0].time) both see.
 *
 * Long strokes: rebuilding a stroke's whole outline every frame costs more
 * the longer it gets. Ink behind the pen no longer changes, so once a
 * UI-thread stroke has grown by FREEZE_BLOCK points beyond the newest
 * KEEP_LIVE, that block's outline is computed once and kept ("frozen"),
 * and each frame only rebuilds the tail after it. The frozen outlines of
 * all strokes are also kept as one ready-made path (`frozenPath`), extended
 * when a block freezes, so nothing per frame grows with the stroke.
 * Segments overlap by a few points, so the joins do not show; translucent
 * brushes must draw the frozen path and the tail in one layer (OverlayLayer)
 * or the overlap would be darker.
 */

import {
  brushOpacity,
  brushOutline,
  brushOutlineFrom,
  screenToWorld,
  type CameraState,
  type StrokePoint,
  type StrokeStyle,
} from '@wander/canvas-core';
import type { NativePointerEvent, NativePointerSample } from '@wander/pencil-input';
import type { SkPath } from '@shopify/react-native-skia';
import type { Vec2 } from '@wander/canvas-core';
import { appendOutlines, outlinesToSkPath } from './strokePath';

/**
 * How far ahead of the pen predicted samples are drawn, in milliseconds.
 * UIKit predicts about a frame ahead; the first few milliseconds are
 * reliable and hide latency, the rest guesses wrong on handwriting.
 */
const PREDICT_AHEAD_MS = 6;
/** Samples closer than this to the last kept one (screen px) are dropped, as in PenTool. */
const MIN_SAMPLE_PX = 0.25;
/** Points frozen at a time. */
const FREEZE_BLOCK = 120;
/** Newest points that are never frozen: Apple Pencil may still correct them. */
const KEEP_LIVE = 72;
/** Points before a segment that only give the brush context (settle the pen's speed filter). */
const WARM_UP = 48;
/** Points a frozen segment runs past its end, so the next segment's start is covered. */
const OVERLAP = 8;
/** Pencil corrections older than this many points are not searched for. */
const UPDATE_SCAN = 512;

/** A stroke point that may still receive an Apple Pencil correction. */
export interface InkPoint extends StrokePoint {
  updateIndex?: number;
}

/** One stroke being drawn or waiting to be committed. */
export interface InkStroke {
  key: number;
  pointerId: number;
  source: 'ui' | 'js';
  /** True until the contact lifts. */
  active: boolean;
  style: StrokeStyle;
  points: InkPoint[];
  predicted: InkPoint[];
  /** Outlines of the finished segments of a long stroke, oldest first. */
  frozen: Vec2[][];
  /** Index of the first point not covered by `frozen`; the live tail starts here. */
  frozenTo: number;
}

/** Everything the UI thread knows about live ink. */
export interface InkState {
  strokes: InkStroke[];
  /** Pointer ids whose stroke JavaScript cancelled while they were still down. */
  dead: number[];
  /** Pointer ids currently touching the screen. */
  contacts: number[];
  /** Every stroke's frozen outlines as one path; null when nothing is frozen. */
  frozenPath: SkPath | null;
}

/** What the UI thread needs to decide whether a new contact draws. */
export interface InkConfig {
  /** Style of the active drawing tool; null when the tool does not draw ink. */
  style: StrokeStyle | null;
  /** True when pens draw and fingers navigate. */
  stylusRules: boolean;
  /** True when the pen's later corrections revise live ink (PointerSession.appliesCorrections). */
  corrections: boolean;
}

/** A fresh, empty state. */
export function emptyInk(): InkState {
  return { strokes: [], dead: [], contacts: [], frozenPath: null };
}

/** A sample converted to a world-space stroke point. Worklet. */
function toPoint(s: NativePointerSample, cam: CameraState): InkPoint {
  'worklet';
  const w = screenToWorld(cam, s);
  const p: InkPoint = { x: w.x, y: w.y, pressure: s.pressure ?? 0.5, time: s.time };
  if (s.tiltX !== undefined) p.tiltX = s.tiltX;
  if (s.tiltY !== undefined) p.tiltY = s.tiltY;
  if (s.updateIndex !== undefined) p.updateIndex = s.updateIndex;
  return p;
}

/** The active stroke of `pointerId`, if any. Worklet. */
function activeStroke(state: InkState, pointerId: number): InkStroke | undefined {
  'worklet';
  for (const s of state.strokes) if (s.active && s.pointerId === pointerId) return s;
  return undefined;
}

/** Drops `pointerId` from the contact and dead lists. Worklet. */
function release(state: InkState, pointerId: number): void {
  'worklet';
  state.contacts = state.contacts.filter((id) => id !== pointerId);
  state.dead = state.dead.filter((id) => id !== pointerId);
}

/**
 * True when a contact going down should start live ink, following the same
 * rules as PointerSession: a pen always draws; a finger draws only without
 * a stylus and when it is the only contact. Worklet.
 */
function shouldDraw(state: InkState, e: NativePointerEvent, cfg: InkConfig): boolean {
  'worklet';
  if (!cfg.style) return false;
  for (const s of state.strokes) if (s.active && s.source === 'ui') return false;
  if (e.kind === 'pen') return true;
  if (e.kind === 'touch') return !cfg.stylusRules && state.contacts.length === 1;
  return e.kind === 'mouse';
}

/** The points segment [from, to) is built from: WARM_UP points of context first. Worklet. */
function segmentStart(from: number): number {
  'worklet';
  return from > WARM_UP ? from - WARM_UP : 0;
}

/**
 * Freezes whole blocks of `s` while more than FREEZE_BLOCK + KEEP_LIVE
 * points are still live, and adds them to the state's frozen path. Worklet.
 */
function freezeFinished(state: InkState, s: InkStroke): void {
  'worklet';
  const added: Vec2[][] = [];
  while (s.points.length - s.frozenTo >= FREEZE_BLOCK + KEEP_LIVE) {
    const from = s.frozenTo;
    const to = from + FREEZE_BLOCK;
    const start = segmentStart(from);
    const outline = brushOutlineFrom(s.points.slice(start, to + OVERLAP), s.style, from - start, false);
    s.frozen.push(outline);
    added.push(outline);
    s.frozenTo = to;
  }
  if (added.length > 0) state.frozenPath = appendOutlines(state.frozenPath, added);
}

/** Rebuilds the frozen path from the strokes that remain (after one was removed). Worklet. */
function rebuildFrozenPath(state: InkState): void {
  'worklet';
  let outlines: Vec2[][] = [];
  for (const s of state.strokes) outlines = outlines.concat(s.frozen);
  state.frozenPath = outlines.length > 0 ? outlinesToSkPath(outlines) : null;
}

/**
 * Applies a batch of native events to the live ink and returns the keys of
 * strokes it started, so JavaScript knows which strokes the UI owns. Worklet.
 */
export function applyNativeEvents(
  state: InkState,
  events: readonly NativePointerEvent[],
  cfg: InkConfig,
  cam: CameraState,
): number[] {
  'worklet';
  const started: number[] = [];
  for (const e of events) {
    if (e.phase === 'down') {
      state.contacts.push(e.pointerId);
      if (shouldDraw(state, e, cfg) && cfg.style) {
        state.strokes.push({
          key: e.time,
          pointerId: e.pointerId,
          source: 'ui',
          active: true,
          style: cfg.style,
          points: [toPoint(e, cam)],
          predicted: [],
          frozen: [],
          frozenTo: 0,
        });
        started.push(e.time);
      }
    } else if (e.phase === 'move' || e.phase === 'up') {
      const s = state.dead.includes(e.pointerId) ? undefined : activeStroke(state, e.pointerId);
      if (s) {
        const samples = e.coalesced && e.coalesced.length > 0 ? e.coalesced : [e];
        // Same rule as PenTool.onMove: a sample that moved less than a quarter of a
        // screen pixel is dropped, so the live ink is built from exactly the points
        // the committed stroke will have and its end does not change on commit.
        const minDist = MIN_SAMPLE_PX / cam.scale;
        for (const sample of samples) {
          const p = toPoint(sample, cam);
          const last = s.points[s.points.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) s.points.push(p);
        }
        // Only the nearest predicted samples: further ahead they overshoot on tight
        // curves, so the tip wanders off the pen and snaps back.
        const ahead: InkPoint[] = [];
        if (e.phase === 'move' && e.predicted) {
          for (const p of e.predicted) {
            if (p.time - e.time <= PREDICT_AHEAD_MS) ahead.push(toPoint(p, cam));
          }
        }
        s.predicted = ahead;
        if (e.phase === 'move') freezeFinished(state, s);
        if (e.phase === 'up') s.active = false;
      }
      if (e.phase === 'up') release(state, e.pointerId);
    } else if (e.phase === 'cancel') {
      state.strokes = state.strokes.filter((s) => !(s.active && s.pointerId === e.pointerId));
      rebuildFrozenPath(state);
      release(state, e.pointerId);
    } else if (e.phase === 'update' && e.updateIndex !== undefined && cfg.corrections) {
      const fixed = toPoint(e, cam);
      for (const s of state.strokes) {
        // Corrections arrive soon after their sample: only the newest points are searched.
        for (let i = s.points.length - 1; i >= 0 && i >= s.points.length - UPDATE_SCAN; i--) {
          const p = s.points[i];
          if (p.updateIndex !== e.updateIndex) continue;
          p.x = fixed.x;
          p.y = fixed.y;
          if (e.pressure !== undefined) p.pressure = fixed.pressure;
          if (fixed.tiltX !== undefined) p.tiltX = fixed.tiltX;
          if (fixed.tiltY !== undefined) p.tiltY = fixed.tiltY;
        }
      }
    }
  }
  return started;
}

/**
 * Outline of the part of `s` that is not frozen, with predicted samples.
 * The end is always drawn complete: the last point is where the pen is,
 * not a smoothed point trailing behind it. The ink then reaches the pen
 * while drawing, and is already what the committed stroke will be when
 * the pen lifts, so nothing shifts on release. Worklet.
 */
function tailOutline(s: InkStroke): Vec2[] {
  'worklet';
  if (s.frozenTo === 0) {
    return brushOutline(s.predicted.length ? s.points.concat(s.predicted) : s.points, s.style, true);
  }
  const start = segmentStart(s.frozenTo);
  const tail = s.points.slice(start).concat(s.predicted);
  return brushOutlineFrom(tail, s.style, s.frozenTo - start, true);
}

/** Adds or replaces a stroke mirrored from JavaScript. Worklet. */
export function upsertJsStroke(state: InkState, stroke: InkStroke): void {
  'worklet';
  const i = state.strokes.findIndex((s) => s.key === stroke.key);
  if (i >= 0) state.strokes[i] = stroke;
  else state.strokes.push(stroke);
}

/**
 * Removes the stroke with `key` (committed or cancelled by JavaScript). If
 * its contact is still down, later samples from it are ignored. Worklet.
 */
export function clearInkStroke(state: InkState, key: number): void {
  'worklet';
  const s = state.strokes.find((t) => t.key === key);
  if (!s) return;
  if (s.active && s.source === 'ui' && state.contacts.includes(s.pointerId)) state.dead.push(s.pointerId);
  state.strokes = state.strokes.filter((t) => t.key !== key);
  if (s.frozen.length > 0) rebuildFrozenPath(state);
}

/**
 * One path with the unfrozen part of every live stroke (predicted samples
 * included). Rebuilt every frame; draw it together with inkFrozenPath. Worklet.
 */
export function inkPath(state: InkState): SkPath {
  'worklet';
  return outlinesToSkPath(state.strokes.map((s) => tailOutline(s)));
}

/** The frozen part of every live stroke: the same path object until a block freezes. Worklet. */
export function inkFrozenPath(state: InkState): SkPath {
  'worklet';
  return state.frozenPath ?? outlinesToSkPath([]);
}

/** Opacity for the live ink: the newest stroke's style and brush opacity. Worklet. */
export function inkOpacity(state: InkState): number {
  'worklet';
  const s = state.strokes[state.strokes.length - 1];
  return s ? s.style.opacity * brushOpacity(s.points, s.style) : 1;
}
