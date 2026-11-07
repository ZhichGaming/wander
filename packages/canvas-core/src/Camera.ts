/**
 * Wander — Zhich, Yu, Justin
 * The camera: which part of the infinite world is on screen and at what
 * zoom. Converts between world space (f64 document coordinates) and screen
 * space (device-independent pixels of the canvas view).
 *
 * screen = (world - (x, y)) * scale, so (x, y) is the world point shown at
 * the top-left corner of the view.
 */

import type { Rect, Vec2 } from './math/geometry';
import { Emitter } from './Emitter';

/** Plain camera state; what gets serialized and mirrored into the renderer. */
export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

/** Smallest allowed zoom (2%). */
export const MIN_SCALE = 0.02;
/** Largest allowed zoom (6400%). */
export const MAX_SCALE = 64;

/** Clamps a zoom factor into the allowed range. */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Pure world-to-screen conversion on plain state (worklet friendly). */
export function worldToScreen(cam: CameraState, p: Vec2): Vec2 {
  return { x: (p.x - cam.x) * cam.scale, y: (p.y - cam.y) * cam.scale };
}

/** Pure screen-to-world conversion on plain state (worklet friendly). */
export function screenToWorld(cam: CameraState, p: Vec2): Vec2 {
  return { x: p.x / cam.scale + cam.x, y: p.y / cam.scale + cam.y };
}

/** Mutable camera with change notification. */
export class Camera {
  private state: CameraState;
  /** Fires after every change with the new state. */
  readonly changed = new Emitter<CameraState>();

  /** Creates a camera at the given state (default: origin, 100%). */
  constructor(initial: CameraState = { x: 0, y: 0, scale: 1 }) {
    this.state = { ...initial, scale: clampScale(initial.scale) };
  }

  /** Current state as a fresh plain object. */
  get(): CameraState {
    return { ...this.state };
  }

  /** Current zoom factor. */
  get scale(): number {
    return this.state.scale;
  }

  /** Replaces the whole state (scale is clamped). */
  set(next: CameraState): void {
    this.state = { x: next.x, y: next.y, scale: clampScale(next.scale) };
    this.changed.emit(this.get());
  }

  /** Converts a world point to screen space. */
  worldToScreen(p: Vec2): Vec2 {
    return worldToScreen(this.state, p);
  }

  /** Converts a screen point to world space. */
  screenToWorld(p: Vec2): Vec2 {
    return screenToWorld(this.state, p);
  }

  /** Moves the view by a screen-space delta (dragging content with a finger). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.set({
      x: this.state.x - dxScreen / this.state.scale,
      y: this.state.y - dyScreen / this.state.scale,
      scale: this.state.scale,
    });
  }

  /**
   * Multiplies the zoom by `factor`, keeping the world point under
   * `screenAnchor` fixed on screen (zoom centred on the cursor or pinch).
   */
  zoomAt(screenAnchor: Vec2, factor: number): void {
    const anchorWorld = this.screenToWorld(screenAnchor);
    const scale = clampScale(this.state.scale * factor);
    this.set({
      x: anchorWorld.x - screenAnchor.x / scale,
      y: anchorWorld.y - screenAnchor.y / scale,
      scale,
    });
  }

  /** World-space rectangle visible in a view of the given screen size. */
  visibleRect(viewWidth: number, viewHeight: number): Rect {
    const { x, y, scale } = this.state;
    return { minX: x, minY: y, maxX: x + viewWidth / scale, maxY: y + viewHeight / scale };
  }
}
