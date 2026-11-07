/**
 * Wander — Zhich, Yu, Justin
 * A layer: an ordered list of canvas objects plus visibility, lock and
 * opacity. Object order inside a layer is its z-order (later is on top).
 * Layers are only mutated through CanvasDocument so the spatial index and
 * change events stay in sync.
 */

import { newId } from '../ids';
import type { CanvasObject } from './CanvasObject';

/** Editable layer properties. */
export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1, applied to the whole layer. */
  opacity: number;
}

/** Ordered container of canvas objects. */
export class Layer {
  readonly id: string;
  props: LayerProps;
  private objects: CanvasObject[] = [];

  /** Creates an empty layer. */
  constructor(props: Partial<LayerProps> = {}, id: string = newId('l')) {
    this.id = id;
    this.props = { name: 'Layer', visible: true, locked: false, opacity: 1, ...props };
  }

  /** Objects in draw order (bottom first). Do not mutate the returned array. */
  get items(): readonly CanvasObject[] {
    return this.objects;
  }

  /** Index of the object with `id`, or -1. */
  indexOf(id: string): number {
    return this.objects.findIndex((o) => o.id === id);
  }

  /** Inserts `obj` at `index` (default: on top). Used by CanvasDocument only. */
  insert(obj: CanvasObject, index: number = this.objects.length): void {
    this.objects.splice(Math.min(index, this.objects.length), 0, obj);
  }

  /** Removes the object at `index` and returns it. Used by CanvasDocument only. */
  removeAt(index: number): CanvasObject {
    return this.objects.splice(index, 1)[0];
  }

  /** Replaces the object at `index`. Used by CanvasDocument only. */
  replaceAt(index: number, obj: CanvasObject): void {
    this.objects[index] = obj;
  }
}
