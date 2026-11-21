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
 * - Under stylus rules a finger still acts on the tool when the tool asks
 *   for it (`wantsTouch`): a finger on the lasso's selection moves it. A
 *   second finger landing early turns that into a pan or pinch as usual.
 * - A lone finger tap that navigated nowhere clears the selection.
 *
 * Edge pan
 * - While the tool reports `edgePan` (the lasso moving a selection) and
 *   the drawing contact is within EDGE_PAN_ZONE_PX of the view's edge, the
 *   camera pans towards that edge on a timer and the contact's position is
 *   re-sent, so the dragged objects keep up. Needs `setViewSize`.
 *
 * Estimated values (Apple Pencil)
 * - By default corrections are ignored (`corrections: 'ignore'`): ink is
 *   drawn with the values the pen reported at the time, and a lift commits
 *   at once. On a real Pencil the corrections only change pressure, arrive
 *   a few hundred milliseconds late (after most handwriting strokes have
 *   already lifted), and applying them visibly reshapes ink the user has
 *   finished. The rest of this section describes `corrections: 'apply'`.
 * - Samples may carry `updateIndex`: the device will correct their
 *   pressure, tilt or position later with an "update" event of the same
 *   index, which goes to the engine as pointerUpdate.
 * - Corrections can arrive after lift. When a drawing contact lifts with
 *   corrections still outstanding, its pointerUp is deferred until the last
 *   final update arrives or ESTIMATE_TIMEOUT_MS passes. A new drawing
 *   contact flushes (commits) a deferred up first.
 * - A failed commit still releases the drawing contact and any deferred
 *   lift, so a later stroke can start. Pointer-up cleanup runs in `finally`
 *   (including after a deferred Pencil pointer-up throws).
 */

import { Emitter } from '../Emitter';
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
  /**
   * What to do with a pen's later corrections to samples it first reported
   * as estimates. `'ignore'` (the default) keeps ink exactly as drawn and
   * commits on lift. `'apply'` revises live samples and holds a lift until
   * its corrections arrive or ESTIMATE_TIMEOUT_MS passes.
   */
  corrections?: 'ignore' | 'apply';
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
/** A navigating finger that moved no further than this (screen px) and lifted within TAP_MAX_MS is a tap. */
export const TAP_SLOP_PX = 10;
/** Longest contact that still counts as a tap (ms). */
export const TAP_MAX_MS = 350;
/** Width of the band along the view's edges that pans the camera during a drag (screen px). */
export const EDGE_PAN_ZONE_PX = 56;
/** Pan speed at the very edge (screen px per second); it falls to 0 at the inner side of the band. */
export const EDGE_PAN_SPEED = 900;
/** Time between edge-pan steps (ms). */
const EDGE_PAN_TICK_MS = 16;

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
  /** Furthest it has been from where it landed (screen px). */
  moved: number;
  /** False once another contact was down at the same time. */
  alone: boolean;
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
  /**
   * Fires with every pen sample (after corrections too), so tools or a
   * diagnostics readout can show live pressure and tilt.
   */
  readonly penSample = new Emitter<RawPointerSample>();
  private readonly contacts = new Map<number, Contact>();
  private nav: NavBaseline | null = null;
  private readonly setTimer: SetTimer;
  /** True when the pen's later corrections revise ink (see PointerSessionOptions.corrections). */
  readonly appliesCorrections: boolean;
  /** updateIndex values still awaiting a final correction, per drawing contact. */
  private readonly outstanding = new Map<number, Set<number>>();
  private deferred: DeferredUp | null = null;
  private viewSize = { width: 0, height: 0 };
  /** Stops the running edge-pan timer; null when none runs. */
  private stopEdgePan: (() => void) | null = null;
  /** Time of the drawing contact's last sample, advanced by edge-pan steps. */
  private drawTime = 0;

  /** Creates a session that drives `engine` under input `mode`. */
  constructor(engine: CanvasEngine, mode: InputMode, options: PointerSessionOptions = {}) {
    this.engine = engine;
    this.mode = mode;
    this.setTimer = options.setTimer ?? defaultSetTimer;
    this.appliesCorrections = options.corrections === 'apply';
    // Undo, redo, tool switches and loads must not drop a lifted stroke
    // that is still waiting for Pencil corrections: commit it first.
    engine.flushRequested.on(() => this.flushDeferredUp());
  }

  /** Changes the input mode; contacts already down keep their role. */
  setMode(mode: InputMode): void {
    this.mode = mode;
  }

  /** Tells the session how large the view is (screen px), which edge pan needs. */
  setViewSize(width: number, height: number): void {
    this.viewSize = { width, height };
  }

  /** True when pens draw and fingers navigate. */
  get stylusRules(): boolean {
    return this.mode === 'pencilOnly' || (this.mode === 'auto' && this.penSeen);
  }

  /** Handles one raw pointer event. This is the main entry point. */
  handle(e: RawPointerEvent): void {
    if (e.kind === 'pen') this.penSample.emit(e);
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
      moved: 0,
      alone: this.contacts.size === 0,
    };
    for (const other of this.contacts.values()) other.alone = false;
    contact.role = this.roleForNewContact(contact);
    this.contacts.set(e.pointerId, contact);
    if (contact.role === 'draw') {
      this.flushDeferredUp();
      this.noteEstimate(e, e.pointerId);
      this.drawTime = e.time;
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
      if (drawer.kind !== 'touch') return 'modifier';
      if (this.isSecondFingerForNavigation(drawer, c)) {
        this.engine.cancelGesture();
        drawer.role = 'navigate';
        return 'navigate';
      }
      return 'modifier';
    }
    if (this.hasRole('navigate')) return 'navigate';
    // With a stylus a finger navigates, unless the tool wants it (a finger on the selection).
    if (this.stylusRules) {
      return this.engine.toolWantsTouch(this.engine.camera.screenToWorld(c)) ? 'draw' : 'navigate';
    }
    // No stylus: a finger draws.
    return 'draw';
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
    c.moved = Math.max(c.moved, Math.hypot(e.x - c.downX, e.y - c.downY));
    if (c.role === 'draw') {
      this.feedMoves(e);
      this.drawTime = e.time;
      this.checkEdgePan();
    } else if (c.role === 'navigate') this.navigate();
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
    try {
      if (c.role === 'draw') {
        this.endEdgePan();
        if (e.coalesced && e.coalesced.length > 0) this.feedMoves({ ...e, predicted: undefined });
        this.noteEstimate(e, e.pointerId);
        const input = this.toWorld(e, e.pointerId);
        if (this.outstanding.has(e.pointerId)) this.deferUp(e.pointerId, input);
        else this.engine.pointerUp(input);
      } else if (c.role === 'navigate' && this.isTap(c, e)) {
        this.engine.selection.clear();
      }
    } finally {
      // Always drop the contact, even if commit throws: a leftover 'draw'
      // contact would make every later pen or finger ignored.
      this.contacts.delete(e.pointerId);
      if (c.role === 'navigate') this.resetNav();
    }
  }

  /** Waits for outstanding corrections (or the timeout) before committing. */
  private deferUp(pointerId: number, input: PointerInput): void {
    const cancelTimer = this.setTimer(() => {
      if (this.deferred?.pointerId === pointerId) this.flushDeferredUp();
    }, ESTIMATE_TIMEOUT_MS);
    this.deferred = { pointerId, input, cancelTimer };
  }

  /**
   * Commits a deferred lift now, if there is one. Errors from the commit are
   * swallowed after clearing session state: a failed Pencil flush must not
   * block the next stroke (this is also called from onDown).
   */
  private flushDeferredUp(): void {
    const d = this.deferred;
    if (!d) return;
    this.deferred = null;
    d.cancelTimer();
    this.outstanding.delete(d.pointerId);
    try {
      this.engine.pointerUp(d.input);
    } catch {
      this.engine.cancelGesture();
    }
  }

  /** Remembers that sample `s` of a drawing contact awaits corrections. */
  private noteEstimate(s: RawPointerSample, pointerId: number): void {
    if (!this.appliesCorrections || s.updateIndex === undefined) return;
    let set = this.outstanding.get(pointerId);
    if (!set) this.outstanding.set(pointerId, (set = new Set()));
    set.add(s.updateIndex);
  }

  /** Applies corrected values for a drawing (or deferred) contact's sample. */
  private onUpdate(e: RawPointerEvent): void {
    if (!this.appliesCorrections) return;
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
    try {
      if (c.role === 'draw') {
        this.endEdgePan();
        this.engine.cancelGesture();
      }
    } finally {
      if (c.role === 'navigate') this.resetNav();
    }
  }

  /** True when a navigating finger lifted as a lone, short tap that went nowhere. */
  private isTap(c: Contact, up: RawPointerEvent): boolean {
    return c.kind === 'touch' && c.alone && c.moved <= TAP_SLOP_PX && up.time - c.downTime <= TAP_MAX_MS;
  }

  /**
   * Screen velocity (px per second) the camera should pan at for a drag at
   * (x, y): towards each edge the point is near, faster the closer it is.
   */
  private edgePanVelocity(x: number, y: number): Vec2 {
    const { width, height } = this.viewSize;
    /** -1..1: how deep `v` is in the band at 0 (negative) or at `size` (positive). */
    const depth = (v: number, size: number) => {
      if (v < EDGE_PAN_ZONE_PX) return -Math.min(1, (EDGE_PAN_ZONE_PX - v) / EDGE_PAN_ZONE_PX);
      if (v > size - EDGE_PAN_ZONE_PX) return Math.min(1, (v - (size - EDGE_PAN_ZONE_PX)) / EDGE_PAN_ZONE_PX);
      return 0;
    };
    return { x: depth(x, width) * EDGE_PAN_SPEED, y: depth(y, height) * EDGE_PAN_SPEED };
  }

  /** Starts the edge-pan timer when the drawing contact enters the band during an edge-pan drag. */
  private checkEdgePan(): void {
    if (this.stopEdgePan || this.viewSize.width <= 0 || !this.engine.tool.edgePan) return;
    const c = this.drawingContact();
    if (!c) return;
    const v = this.edgePanVelocity(c.x, c.y);
    if (v.x !== 0 || v.y !== 0) this.scheduleEdgePan();
  }

  /** Queues the next edge-pan step. */
  private scheduleEdgePan(): void {
    this.stopEdgePan = this.setTimer(() => {
      this.stopEdgePan = null;
      this.stepEdgePan();
    }, EDGE_PAN_TICK_MS);
  }

  /**
   * One edge-pan step: moves the camera towards the edge, then re-sends the
   * contact's position, which is now over a different world point, so the
   * tool moves what it drags by the same amount.
   */
  private stepEdgePan(): void {
    const id = this.drawingId();
    const c = id === null ? undefined : this.contacts.get(id);
    if (id === null || !c || !this.engine.tool.edgePan) return;
    const v = this.edgePanVelocity(c.x, c.y);
    if (v.x === 0 && v.y === 0) return;
    const dt = EDGE_PAN_TICK_MS / 1000;
    // panBy moves the content with the finger; to reveal what lies past an edge it moves the other way.
    this.engine.camera.panBy(-v.x * dt, -v.y * dt);
    this.drawTime += EDGE_PAN_TICK_MS;
    this.engine.pointerMove(this.toWorld({ x: c.x, y: c.y, time: this.drawTime }, id));
    this.scheduleEdgePan();
  }

  /** Stops edge panning. */
  private endEdgePan(): void {
    this.stopEdgePan?.();
    this.stopEdgePan = null;
  }

  /** Pointer id of the contact currently drawing, if any. */
  private drawingId(): number | null {
    for (const [id, c] of this.contacts) if (c.role === 'draw') return id;
    return null;
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
