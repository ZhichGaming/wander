/**
 * Wander — Zhich, Yu, Justin
 * Minimal typed event emitter (Observer pattern) used by the document,
 * camera, selection and overlay to tell the renderer and UI what changed.
 */

/** A listener for events of type T. */
export type Listener<T> = (event: T) => void;

/** Holds listeners for one event type and calls them in subscription order. */
export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  /** Subscribes `fn`; returns a function that unsubscribes it. */
  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Calls every listener with `event`. */
  emit(event: T): void {
    for (const fn of [...this.listeners]) fn(event);
  }
}
