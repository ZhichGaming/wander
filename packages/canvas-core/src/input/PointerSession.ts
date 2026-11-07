/**
 * Wander — Zhich, Yu, Justin
 * Pointer session: the single entry point for raw input. Receives pointer
 * events in screen space from any source (Gesture Handler today, the
 * native Pencil module later) and decides, per InputMode, whether each
 * contact draws (forwarded to the engine as world-space PointerInput) or
 * navigates (pans and pinch-zooms the camera).
 *
 * Contact roles
 * - draw: the one contact currently drawing. Its samples become engine
 *   pointerDown / pointerMove / pointerUp.
 * - navigate: fingers that pan (one finger) or pan and pinch-zoom (two
 *   fingers, using the first two that landed).
 * - modifier: a finger held while another contact draws. It does not move
 *   the camera; it only sets PointerInput.additive on the drawing contact,
 *   which the lasso uses for multi-select.
 * - ignored: extra pens or mice while something else is drawing.
 *
 * Mode rules
 * - Stylus present ("pencilOnly", or "auto" after a pen was seen): the pen
 *   draws and fingers navigate. A finger that lands while the pen draws is
 *   a modifier, and fingers already navigating become modifiers when the
 *   pen lands, so the camera never moves under a stroke in progress.
 * - No stylus ("finger", or "auto" before any pen): one finger draws. A
 *   second finger means one of two things, told apart by timing:
 *   - It landed soon after the first (within SECOND_FINGER_WINDOW_MS) or
 *     before the first moved more than SECOND_FINGER_SLOP_PX: the user
 *     meant a two-finger pan or pinch, so the draw is cancelled (nothing is
 *     committed) and both fingers navigate.
 *   - The drawing finger is well underway: cancelling would throw away
 *     real ink, so the second finger becomes a modifier and the draw goes
 *     on with additive = true (hold a finger, lasso with another).
 * - Mouse: draws (the source should only report the left button). Wheel
 *   and trackpad scrolling go through `wheel`.
 * - A pen always draws, in every mode; in "auto" its first touch switches
 *   the session to stylus rules for good.
 *
 * Estimated values (Apple Pencil)
 * - Samples may carry `updateIndex`: the device will correct their
 *   pressure, tilt or position later with an "update" event of the same
 *   index, which goes to the engine as pointerUpdate.
 * - Corrections can arrive after lift. When a drawing contact lifts with
 *   corrections still outstanding, its pointerUp is deferred until the last
 *   final update arrives or ESTIMATE_TIMEOUT_MS passes. A new drawing
 *   contact flushes (commits) a deferred up first.
 */

import type { Vec2 } from '../math/geometry';
import type { CanvasEngine } from '../engine/CanvasEngine';
import type { PointerInput, PointerKind, PointerSampleUpdate } from '../tools/Tool';
import type { InputMode } from './InputMode';

/** Lifecycle phase of a raw pointer event. */
export type PointerPhase = 'down' | 'move' | 'up' | 'cancel' | 'update';

/** One raw sample in screen space (view pixels). */
export interface RawPointerSample {
  x: number;
  y: number;
  /** 0..1; missing means the device has no pressure (treated as 0.5). */
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  /** Milliseconds, monotonic. */
  time: number;
  /**
   * Set while the device still expects to correct this sample's estimated
   * values; an "update" event with the same index carries the corrections.
   */
  updateIndex?: number;
}

/** One raw pointer event in screen space. */
export interface RawPointerEvent extends RawPointerSample {
  /** Identifies one contact from down to up or cancel. */
  pointerId: number;
  kind: PointerKind;
  phase: PointerPhase;
  /**
   * High-rate samples since the previous event, oldest first, ending with
   * this event's own sample (as UIKit coalescedTouches does). When given,
   * they are fed to the engine instead of the event's own position.
   */
  coalesced?: readonly RawPointerSample[];
  /** Look-ahead samples the device predicts; shown but never committed. */
  predicted?: readonly RawPointerSample[];
  /** On "update": true when the sample expects no further corrections. */
  final?: boolean;
}

/** Schedules `fn` after `ms` milliseconds; returns a function that cancels it. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

/** Optional dependencies of a PointerSession. */
export interface PointerSessionOptions {
  /** Timer used for deferred lifts; defaults to globalThis.setTimeout. */
  setTimer?: SetTimer;
}

/** A mouse wheel or trackpad scroll in screen space. */
export interface WheelInput {
  /** Cursor position in view pixels (the zoom anchor). */
  x: number;
  y: number;
  /** Scroll deltas in pixels. */
  deltaX: number;
  deltaY: number;
  /** True for ctrl+wheel or a trackpad pinch: zoom instead of pan. */
  zoom: boolean;
}

/** A second finger landing this soon after the first starts navigation. */
export const SECOND_FINGER_WINDOW_MS = 120;
/** ...or landing before the first finger moved this far (screen px). */
export const SECOND_FINGER_SLOP_PX = 6;
/** Zoom factor per wheel pixel: factor = exp(-deltaY * WHEEL_ZOOM_SPEED). */
export const WHEEL_ZOOM_SPEED = 0.01;
/** Longest a lift waits for outstanding estimate corrections (ms). */
export const ESTIMATE_TIMEOUT_MS = 150;

/** setTimeout and clearTimeout as typed globals (core has no DOM or Node types). */
const timerGlobals = globalThis as unknown as {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

/** Default SetTimer backed by the global setTimeout. */
function defaultSetTimer(fn: () => void, ms: number): () => void {
  const handle = timerGlobals.setTimeout(fn, ms);
  return () => timerGlobals.clearTimeout(handle);
}

/** What a contact is doing for its whole lifetime. */
type Role = 'draw' | 'navigate' | 'modifier' | 'ignored';

/** Book-keeping for one contact on the screen. */
interface Contact {
  kind: PointerKind;
  role: Role;
  /** Last screen position. */
  x: number;
  y: number;
  downX: number;
  downY: number;
  downTime: number;
}

/** Pan and pinch baseline: centroid and spread of the navigating fingers. */
interface NavBaseline {
  center: Vec2;
  /** Distance between the two fingers; 0 when only one navigates. */
  spread: number;
  /** How many fingers the baseline was measured with. */
  count: number;
}

/** A drawing lift waiting for estimate corrections before it commits. */
interface DeferredUp {
  pointerId: number;
  /** The lift sample; corrections addressed to it are applied here. */
  input: PointerInput;
  cancelTimer: () => void;
}

/** Routes raw pointer events to drawing or camera navigation. */
export class PointerSession {
  private readonly engine: CanvasEngine;
  private mode: InputMode;
  private penSeen = false;
  private readonly contacts = new Map<number, Contact>();
  private nav: NavBaseline | null = null;
  private readonly setTimer: SetTimer;
  /** updateIndex values still awaiting a final correction, per drawing contact. */
  private readonly outstanding = new Map<number, Set<number>>();
  private deferred: DeferredUp | null = null;

  /** Creates a session that drives `engine` under input `mode`. */
  constructor(engine: CanvasEngine, mode: InputMode, options: PointerSessionOptions = {}) {
    this.engine = engine;
    this.mode = mode;
    this.setTimer = options.setTimer ?? defaultSetTimer;
    // Undo, redo, tool switches and loads must not drop a lifted stroke
    // that is still waiting for Pencil corrections: commit it first.
    engine.flushRequested.on(() => this.flushDeferredUp());
  }

  /** Changes the input mode; contacts already down keep their role. */
  setMode(mode: InputMode): void {
    this.mode = mode;
  }

  /** True when pens draw and fingers navigate. */
  get stylusRules(): boolean {
    return this.mode === 'pencilOnly' || (this.mode === 'auto' && this.penSeen);
  }

  /** Handles one raw pointer event. This is the main entry point. */
  handle(e: RawPointerEvent): void {
    switch (e.phase) {
      case 'down':
        this.onDown(e);
        break;
      case 'move':
        this.onMove(e);
        break;
      case 'up':
        this.onUp(e);
        break;
      case 'cancel':
        this.onCancel(e.pointerId);
        break;
      case 'update':
        this.onUpdate(e);
        break;
    }
  }

  /** Applies a wheel or trackpad scroll: zoom at the cursor, or pan. */
  wheel(w: WheelInput): void {
    if (w.zoom) this.engine.camera.zoomAt({ x: w.x, y: w.y }, Math.exp(-w.deltaY * WHEEL_ZOOM_SPEED));
    else this.engine.camera.panBy(-w.deltaX, -w.deltaY);
  }

  /** Cancels every contact (view unmounted, engine swapped, system cancel). */
  cancelAll(): void {
    this.flushDeferredUp();
    for (const id of [...this.contacts.keys()]) this.onCancel(id);
  }

  /** Assigns a role to a new contact and starts drawing or navigation. */
  private onDown(e: RawPointerEvent): void {
    if (e.kind === 'pen') this.penSeen = true;
    const contact: Contact = {
      kind: e.kind,
      role: 'ignored',
      x: e.x,
      y: e.y,
      downX: e.x,
      downY: e.y,
      downTime: e.time,
    };
    contact.role = this.roleForNewContact(contact);
    this.contacts.set(e.pointerId, contact);
    if (contact.role === 'draw') {
      this.flushDeferredUp();
      this.noteEstimate(e, e.pointerId);
      this.engine.pointerDown(this.toWorld(e, e.pointerId));
    }
    if (contact.role === 'navigate') this.resetNav();
  }

  /** Decides what a contact that just landed should do (may demote others). */
  private roleForNewContact(c: Contact): Role {
    const drawer = this.drawingContact();
    if (c.kind !== 'touch') {
      if (drawer) {
        // A pen takes over from a finger that started drawing before any
        // pen was seen; anything else waits its turn.
        if (c.kind !== 'pen' || drawer.kind !== 'touch') return 'ignored';
        this.engine.cancelGesture();
        drawer.role = 'modifier';
      }
      if (c.kind === 'pen') this.demoteNavigators();
      return 'draw';
    }
    if (drawer) {
      if (this.stylusRules || drawer.kind !== 'touch') return 'modifier';
      if (this.isSecondFingerForNavigation(drawer, c)) {
        this.engine.cancelGesture();
        drawer.role = 'navigate';
        return 'navigate';
      }
      return 'modifier';
    }
    if (this.stylusRules) return 'navigate';
    // No stylus: a finger draws unless others are already navigating.
    return this.hasRole('navigate') ? 'navigate' : 'draw';
  }

  /** True when a second finger means "pan or pinch" rather than "modifier". */
  private isSecondFingerForNavigation(first: Contact, second: Contact): boolean {
    const quick = second.downTime - first.downTime <= SECOND_FINGER_WINDOW_MS;
    const still = Math.hypot(first.x - first.downX, first.y - first.downY) <= SECOND_FINGER_SLOP_PX;
    return quick || still;
  }

  /** Turns navigating fingers into modifiers when a pen starts drawing. */
  private demoteNavigators(): void {
    for (const c of this.contacts.values()) if (c.role === 'navigate') c.role = 'modifier';
    this.nav = null;
  }

  /** Feeds a move to the engine (drawing) or the camera (navigation). */
  private onMove(e: RawPointerEvent): void {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    c.x = e.x;
    c.y = e.y;
    if (c.role === 'draw') this.feedMoves(e);
    else if (c.role === 'navigate') this.navigate();
  }

  /** Sends coalesced samples one by one, predicted samples with the last. */
  private feedMoves(e: RawPointerEvent): void {
    const samples = e.coalesced && e.coalesced.length > 0 ? e.coalesced : [e];
    const predicted = e.predicted?.map((s) => this.toWorld(s, e.pointerId));
    samples.forEach((s, i) => {
      this.noteEstimate(s, e.pointerId);
      const last = i === samples.length - 1;
      this.engine.pointerMove(this.toWorld(s, e.pointerId), last ? predicted : undefined);
    });
  }

  /** Ends a contact: commits a draw, or re-baselines navigation. */
  private onUp(e: RawPointerEvent): void {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    if (c.role === 'draw') {
      if (e.coalesced && e.coalesced.length > 0) this.feedMoves({ ...e, predicted: undefined });
      this.noteEstimate(e, e.pointerId);
      const input = this.toWorld(e, e.pointerId);
      if (this.outstanding.has(e.pointerId)) this.deferUp(e.pointerId, input);
      else this.engine.pointerUp(input);
    }
    this.contacts.delete(e.pointerId);
    if (c.role === 'navigate') this.resetNav();
  }

  /** Waits for outstanding corrections (or the timeout) before committing. */
  private deferUp(pointerId: number, input: PointerInput): void {
    const cancelTimer = this.setTimer(() => {
      if (this.deferred?.pointerId === pointerId) this.flushDeferredUp();
    }, ESTIMATE_TIMEOUT_MS);
    this.deferred = { pointerId, input, cancelTimer };
  }

  /** Commits a deferred lift now, if there is one. */
  private flushDeferredUp(): void {
    const d = this.deferred;
    if (!d) return;
    this.deferred = null;
    d.cancelTimer();
    this.outstanding.delete(d.pointerId);
    this.engine.pointerUp(d.input);
  }

  /** Remembers that sample `s` of a drawing contact awaits corrections. */
  private noteEstimate(s: RawPointerSample, pointerId: number): void {
    if (s.updateIndex === undefined) return;
    let set = this.outstanding.get(pointerId);
    if (!set) this.outstanding.set(pointerId, (set = new Set()));
    set.add(s.updateIndex);
  }

  /** Applies corrected values for a drawing (or deferred) contact's sample. */
  private onUpdate(e: RawPointerEvent): void {
    const index = e.updateIndex;
    const set = this.outstanding.get(e.pointerId);
    if (index === undefined || !set || !set.has(index)) return;
    const w = this.engine.camera.screenToWorld(e);
    const u: PointerSampleUpdate = { updateIndex: index, x: w.x, y: w.y };
    if (e.pressure !== undefined) u.pressure = e.pressure;
    if (e.tiltX !== undefined) u.tiltX = e.tiltX;
    if (e.tiltY !== undefined) u.tiltY = e.tiltY;
    const d = this.deferred;
    if (d?.pointerId === e.pointerId && d.input.updateIndex === index) Object.assign(d.input, u);
    this.engine.pointerUpdate(u);
    if (!e.final) return;
    set.delete(index);
    if (set.size > 0) return;
    this.outstanding.delete(e.pointerId);
    if (d?.pointerId === e.pointerId) this.flushDeferredUp();
  }

  /** Drops a contact without committing anything. */
  private onCancel(pointerId: number): void {
    const c = this.contacts.get(pointerId);
    if (!c) return;
    this.contacts.delete(pointerId);
    this.outstanding.delete(pointerId);
    if (c.role === 'draw') this.engine.cancelGesture();
    if (c.role === 'navigate') this.resetNav();
  }

  /** Pans by the centroid delta and zooms by the spread ratio around it. */
  private navigate(): void {
    const next = this.measureNav();
    const prev = this.nav;
    this.nav = next;
    if (!next || !prev || prev.count !== next.count) return;
    const cam = this.engine.camera;
    cam.panBy(next.center.x - prev.center.x, next.center.y - prev.center.y);
    // Zooming at the new centroid after panning keeps the world point that
    // was under the old pinch midpoint under the new one.
    if (prev.spread > 0 && next.spread > 0) cam.zoomAt(next.center, next.spread / prev.spread);
  }

  /** Starts a fresh baseline after fingers were added or lifted. */
  private resetNav(): void {
    this.nav = this.measureNav();
  }

  /** Centroid and spread of the first two navigating fingers. */
  private measureNav(): NavBaseline | null {
    const fingers: Contact[] = [];
    for (const c of this.contacts.values()) {
      if (c.role === 'navigate') fingers.push(c);
      if (fingers.length === 2) break;
    }
    if (fingers.length === 0) return null;
    if (fingers.length === 1) return { center: { x: fingers[0].x, y: fingers[0].y }, spread: 0, count: 1 };
    const [a, b] = fingers;
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      spread: Math.hypot(a.x - b.x, a.y - b.y),
      count: 2,
    };
  }

  /** The contact currently drawing, if any. */
  private drawingContact(): Contact | null {
    for (const c of this.contacts.values()) if (c.role === 'draw') return c;
    return null;
  }

  /** True when any contact has `role`. */
  private hasRole(role: Role): boolean {
    for (const c of this.contacts.values()) if (c.role === role) return true;
    return false;
  }

  /** Converts a screen sample of `pointerId` to a world-space PointerInput. */
  private toWorld(s: RawPointerSample, pointerId: number): PointerInput {
    const kind = this.contacts.get(pointerId)?.kind ?? 'touch';
    const w = this.engine.camera.screenToWorld(s);
    const input: PointerInput = {
      pointerId,
      kind,
      x: w.x,
      y: w.y,
      pressure: s.pressure ?? 0.5,
      time: s.time,
      additive: this.hasRole('modifier'),
    };
    if (s.tiltX !== undefined) input.tiltX = s.tiltX;
    if (s.tiltY !== undefined) input.tiltY = s.tiltY;
    if (s.updateIndex !== undefined) input.updateIndex = s.updateIndex;
    return input;
  }
}
