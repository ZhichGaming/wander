/**
 * Wander — Zhich, Yu, Justin
 * Lookup from BrushKind to the Brush strategy that draws it.
 */

import type { Brush } from './Brush';
import type { BrushKind } from '../model/StrokeStyle';
import { HighlighterBrush } from './HighlighterBrush';
import { PenBrush } from './PenBrush';

const brushes = new Map<BrushKind, Brush>([
  ['pen', new PenBrush()],
  ['highlighter', new HighlighterBrush()],
]);

/** Returns the brush for `kind`. Throws for an unknown kind. */
export function getBrush(kind: BrushKind): Brush {
  const b = brushes.get(kind);
  if (!b) throw new Error(`Unknown brush kind: ${kind}`);
  return b;
}

/** Replaces or adds a brush (for custom brushes and tests). */
export function registerBrush(brush: Brush): void {
  brushes.set(brush.kind, brush);
}
