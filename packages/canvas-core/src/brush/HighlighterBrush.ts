/**
 * Wander — Zhich, Yu, Justin
 * Highlighter brush: flat, translucent, drawn behind ink.
 *
 * PLACEHOLDER: replaced by the brush implementation. Draws nothing yet.
 */

import type { Brush } from './Brush';

/** Flat translucent highlighter. */
export class HighlighterBrush implements Brush {
  readonly kind = 'highlighter' as const;
  readonly pass = 0;
  readonly blendMode = 'multiply' as const;

  /** Placeholder outline: empty polygon. */
  outline() {
    return [];
  }
}
