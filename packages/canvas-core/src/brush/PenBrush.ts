/**
 * Wander — Zhich, Yu, Justin
 * Pen brush: pressure and velocity sensitive ink.
 *
 * PLACEHOLDER: replaced by the brush implementation. Draws nothing yet.
 */

import type { Brush } from './Brush';

/** Pressure and velocity sensitive pen. */
export class PenBrush implements Brush {
  readonly kind = 'pen' as const;
  readonly pass = 1;
  readonly blendMode = 'normal' as const;

  /** Placeholder outline: empty polygon. */
  outline() {
    return [];
  }
}
