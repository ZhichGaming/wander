/**
 * Wander — Zhich, Yu, Justin
 * The document: ordered layers of canvas objects, the background, and a
 * spatial index over every object. All mutations go through this class so
 * the index and change events stay consistent. Commands call these methods;
 * UI code should go through commands (History) so edits can be undone.
 */

import { Emitter } from '../Emitter';
import type { Rect } from '../math/geometry';
import { SpatialIndex } from '../spatial/SpatialIndex';
import { DEFAULT_BACKGROUND, type BackgroundStyle } from './Background';
import type { CanvasObject } from './CanvasObject';
import { Layer, type LayerProps } from './Layer';

/** What changed in a document mutation. */
export type DocumentChange =
  | { kind: 'objects'; layerId: string; added: string[]; removed: string[]; updated: string[] }
  | { kind: 'layers' }
  | { kind: 'background' };

/** Where an object sat before it was removed; enough to put it back. */
export interface ObjectLocation {
  layerId: string;
  index: number;
  object: CanvasObject;
}

/** Options for spatial queries. */
export interface QueryOptions {
  /** Include objects on hidden layers (default false). */
  includeHidden?: boolean;
  /** Include objects on locked layers (default true). */
  includeLocked?: boolean;
}

/** The canvas document model. */
export class CanvasDocument {
  /** Fires after every mutation. */
  readonly changed = new Emitter<DocumentChange>();
  private layerList: Layer[] = [];
  private owner = new Map<string, Layer>();
  private index = new SpatialIndex();
  private bg: BackgroundStyle = { ...DEFAULT_BACKGROUND };
  private activeId: string;

  /** Creates a document with one empty layer. */
  constructor() {
    const first = new Layer({ name: 'Layer 1' });
    this.layerList.push(first);
    this.activeId = first.id;
  }

  // ---- layers -------------------------------------------------------------

  /** Layers bottom to top. Do not mutate the returned array. */
  get layers(): readonly Layer[] {
    return this.layerList;
  }

  /** Layer with `id`, or undefined. */
  getLayer(id: string): Layer | undefined {
    return this.layerList.find((l) => l.id === id);
  }

  /** Layer that new strokes go to. */
  get activeLayer(): Layer {
    return this.getLayer(this.activeId) ?? this.layerList[this.layerList.length - 1];
  }

  /** Makes `id` the active layer. */
  setActiveLayer(id: string): void {
    if (!this.getLayer(id)) throw new Error(`No layer ${id}`);
    this.activeId = id;
    this.changed.emit({ kind: 'layers' });
  }

  /** Inserts `layer` at `index` (default: on top) and indexes its objects. */
  addLayer(layer: Layer, index: number = this.layerList.length): void {
    this.layerList.splice(index, 0, layer);
    for (const o of layer.items) {
      this.owner.set(o.id, layer);
      this.index.set(o.id, o.bounds);
    }
    this.changed.emit({ kind: 'layers' });
  }

  /** Removes layer `id` with its objects; returns it and its position. */
  removeLayer(id: string): { layer: Layer; index: number } {
    const index = this.layerList.findIndex((l) => l.id === id);
    if (index < 0) throw new Error(`No layer ${id}`);
    if (this.layerList.length === 1) throw new Error('Cannot remove the last layer');
    const [layer] = this.layerList.splice(index, 1);
    for (const o of layer.items) {
      this.owner.delete(o.id);
      this.index.delete(o.id);
    }
    if (this.activeId === id) this.activeId = this.layerList[Math.max(0, index - 1)].id;
    this.changed.emit({ kind: 'layers' });
    return { layer, index };
  }

  /** Moves layer `id` to position `toIndex`. */
  moveLayer(id: string, toIndex: number): void {
    const from = this.layerList.findIndex((l) => l.id === id);
    if (from < 0) throw new Error(`No layer ${id}`);
    const [layer] = this.layerList.splice(from, 1);
    this.layerList.splice(toIndex, 0, layer);
    this.changed.emit({ kind: 'layers' });
  }

  /** Changes some properties of layer `id`; returns the previous values. */
  updateLayer(id: string, props: Partial<LayerProps>): Partial<LayerProps> {
    const layer = this.getLayer(id);
    if (!layer) throw new Error(`No layer ${id}`);
    const prev: Partial<LayerProps> = {};
    for (const k of Object.keys(props) as (keyof LayerProps)[]) {
      (prev as Record<string, unknown>)[k] = layer.props[k];
    }
    layer.props = { ...layer.props, ...props };
    this.changed.emit({ kind: 'layers' });
    return prev;
  }

  // ---- background ----------------------------------------------------------

  /** Current background. */
  get background(): Readonly<BackgroundStyle> {
    return this.bg;
  }

  /** Replaces the background. */
  setBackground(bg: BackgroundStyle): void {
    this.bg = { ...bg };
    this.changed.emit({ kind: 'background' });
  }

  // ---- objects -------------------------------------------------------------

  /** Object with `id`, or undefined. */
  getObject(id: string): CanvasObject | undefined {
    const layer = this.owner.get(id);
    if (!layer) return undefined;
    return layer.items[layer.indexOf(id)];
  }

  /** Layer that holds object `id`, or undefined. */
  layerOf(id: string): Layer | undefined {
    return this.owner.get(id);
  }

  /** Adds `obj` to layer `layerId` at `index` (default: on top). */
  addObject(layerId: string, obj: CanvasObject, index?: number): void {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`No layer ${layerId}`);
    if (this.owner.has(obj.id)) throw new Error(`Duplicate object id ${obj.id}`);
    layer.insert(obj, index);
    this.owner.set(obj.id, layer);
    this.index.set(obj.id, obj.bounds);
    this.changed.emit({ kind: 'objects', layerId, added: [obj.id], removed: [], updated: [] });
  }

  /** Removes object `id`; returns where it was so it can be restored. */
  removeObject(id: string): ObjectLocation {
    const layer = this.owner.get(id);
    if (!layer) throw new Error(`No object ${id}`);
    const index = layer.indexOf(id);
    const object = layer.removeAt(index);
    this.owner.delete(id);
    this.index.delete(id);
    this.changed.emit({ kind: 'objects', layerId: layer.id, added: [], removed: [id], updated: [] });
    return { layerId: layer.id, index, object };
  }

  /** Replaces the object that has `obj.id` with `obj` in place; returns the old one. */
  replaceObject(obj: CanvasObject): CanvasObject {
    const layer = this.owner.get(obj.id);
    if (!layer) throw new Error(`No object ${obj.id}`);
    const index = layer.indexOf(obj.id);
    const old = layer.items[index];
    layer.replaceAt(index, obj);
    this.index.set(obj.id, obj.bounds);
    this.changed.emit({ kind: 'objects', layerId: layer.id, added: [], removed: [], updated: [obj.id] });
    return old;
  }

  /** Every object, bottom layer first, in draw order. */
  *allObjects(): Generator<CanvasObject> {
    for (const layer of this.layerList) yield* layer.items;
  }

  /** Objects whose bounds intersect `rect`, in draw order. */
  queryRect(rect: Rect, opts: QueryOptions = {}): CanvasObject[] {
    const includeHidden = opts.includeHidden ?? false;
    const includeLocked = opts.includeLocked ?? true;
    const hits = new Set(this.index.search(rect));
    const out: CanvasObject[] = [];
    for (const layer of this.layerList) {
      if (!includeHidden && !layer.props.visible) continue;
      if (!includeLocked && layer.props.locked) continue;
      for (const o of layer.items) if (hits.has(o.id)) out.push(o);
    }
    return out;
  }
}
