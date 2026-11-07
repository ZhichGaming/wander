/**
 * Wander — Zhich, Yu, Justin
 * Factory registry from an object kind ("stroke", "page"...) to the
 * function that rebuilds it from JSON. Lets the serializer load any object
 * kind without knowing the concrete classes.
 */

import type { CanvasObject, ObjectJSON } from './CanvasObject';
import { Stroke, type StrokeJSON } from './Stroke';

/** Rebuilds an object from its JSON record. */
export type ObjectFactory = (json: ObjectJSON) => CanvasObject;

const factories = new Map<string, ObjectFactory>([
  ['stroke', (json) => Stroke.fromJSON(json as StrokeJSON)],
]);

/** Registers the factory for `kind`, replacing any previous one. */
export function registerObjectKind(kind: string, factory: ObjectFactory): void {
  factories.set(kind, factory);
}

/** Rebuilds an object from JSON. Throws for an unregistered kind. */
export function objectFromJSON(json: ObjectJSON): CanvasObject {
  const f = factories.get(json.kind);
  if (!f) throw new Error(`Unknown object kind: ${json.kind}`);
  return f(json);
}
