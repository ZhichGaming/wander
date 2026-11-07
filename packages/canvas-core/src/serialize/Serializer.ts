/**
 * Wander — Zhich, Yu, Justin
 * Converts a CanvasDocument to and from plain JSON. One record per object,
 * grouped by layer, so a later per-object-file layout only has to change
 * where records are written, not their shape.
 */

import type { BackgroundStyle } from '../model/Background';
import { CanvasDocument } from '../model/CanvasDocument';
import type { ObjectJSON } from '../model/CanvasObject';
import { Layer, type LayerProps } from '../model/Layer';
import { objectFromJSON } from '../model/objectRegistry';

/** Current file format version. Bump when the shape changes. */
export const FORMAT_VERSION = 1;

/** Serialized layer. */
export interface LayerJSON extends LayerProps {
  id: string;
  objects: ObjectJSON[];
}

/** Serialized document. */
export interface DocumentJSON {
  format: 'wander-canvas';
  version: number;
  background: BackgroundStyle;
  activeLayerId: string;
  layers: LayerJSON[];
}

/** Turns a document into a JSON-safe object. */
export function serializeDocument(doc: CanvasDocument): DocumentJSON {
  return {
    format: 'wander-canvas',
    version: FORMAT_VERSION,
    background: { ...doc.background },
    activeLayerId: doc.activeLayer.id,
    layers: doc.layers.map((l) => ({
      id: l.id,
      ...l.props,
      objects: l.items.map((o) => o.toJSON()),
    })),
  };
}

/** Rebuilds a document from JSON produced by serializeDocument. */
export function deserializeDocument(json: DocumentJSON): CanvasDocument {
  if (json.format !== 'wander-canvas') throw new Error('Not a Wander canvas file');
  if (json.version > FORMAT_VERSION) throw new Error(`Unsupported format version ${json.version}`);
  const doc = new CanvasDocument();
  const placeholder = doc.layers[0];
  for (const lj of json.layers) {
    const { id, objects, ...props } = lj;
    const layer = new Layer(props, id);
    for (const oj of objects) layer.insert(objectFromJSON(oj));
    doc.addLayer(layer);
  }
  if (json.layers.length > 0) doc.removeLayer(placeholder.id);
  if (doc.getLayer(json.activeLayerId)) doc.setActiveLayer(json.activeLayerId);
  doc.setBackground(json.background);
  return doc;
}
