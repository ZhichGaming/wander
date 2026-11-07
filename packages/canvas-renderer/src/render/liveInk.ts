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
 */

import {
  brushOpacity,
  brushOutline,
  screenToWorld,
  type CameraState,
  type StrokePoint,
  type StrokeStyle,
} from '@wander/canvas-core';
import type { NativePointerEvent, NativePointerSample } from '@wander/pencil-input';
import type { SkPath } from '@shopify/react-native-skia';
import { outlinesToSkPath } from './strokePath';

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
}

/** Everything the UI thread knows about live ink. */
export interface InkState {
  strokes: InkStroke[];
  /** Pointer ids whose stroke JavaScript cancelled while they were still down. */
  dead: number[];
  /** Pointer ids currently touching the screen. */
  contacts: number[];
}

/** What the UI thread needs to decide whether a new contact draws. */
export interface InkConfig {
  /** Style of the active drawing tool; null when the tool does not draw ink. */
  style: StrokeStyle | null;
  /** True when pens draw and fingers navigate. */
  stylusRules: boolean;
}

/** A fresh, empty state. */
export function emptyInk(): InkState {
  return { strokes: [], dead: [], contacts: [] };
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
        });
        started.push(e.time);
      }
    } else if (e.phase === 'move' || e.phase === 'up') {
      const s = state.dead.includes(e.pointerId) ? undefined : activeStroke(state, e.pointerId);
      if (s) {
        const samples = e.coalesced && e.coalesced.length > 0 ? e.coalesced : [e];
        for (const sample of samples) s.points.push(toPoint(sample, cam));
        s.predicted = e.phase === 'move' && e.predicted ? e.predicted.map((p) => toPoint(p, cam)) : [];
        if (e.phase === 'up') s.active = false;
      }
      if (e.phase === 'up') release(state, e.pointerId);
    } else if (e.phase === 'cancel') {
      state.strokes = state.strokes.filter((s) => !(s.active && s.pointerId === e.pointerId));
      release(state, e.pointerId);
    } else if (e.phase === 'update' && e.updateIndex !== undefined) {
      const fixed = toPoint(e, cam);
      for (const s of state.strokes) {
        for (const p of s.points) {
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
}

/** One path with every live stroke's outline (predicted samples included). Worklet. */
export function inkPath(state: InkState): SkPath {
  'worklet';
  return outlinesToSkPath(
    state.strokes.map((s) => brushOutline(s.predicted.length ? s.points.concat(s.predicted) : s.points, s.style, false)),
  );
}

/** Opacity for the live ink: the newest stroke's style and brush opacity. Worklet. */
export function inkOpacity(state: InkState): number {
  'worklet';
  const s = state.strokes[state.strokes.length - 1];
  return s ? s.style.opacity * brushOpacity(s.points, s.style) : 1;
}
