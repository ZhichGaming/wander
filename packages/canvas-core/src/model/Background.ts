/**
 * Wander — Zhich, Yu, Justin
 * Configurable paper background drawn behind every layer (blank, grid,
 * dots or ruled lines). It is document data, not a layer.
 */

/** Pattern drawn on the paper. */
export type BackgroundPattern = 'blank' | 'grid' | 'dots' | 'lines';

/** Background configuration, stored in the document. */
export interface BackgroundStyle {
  pattern: BackgroundPattern;
  /** Distance between grid lines, dots or rules, in world units. */
  spacing: number;
  /** Paper fill color. */
  paperColor: string;
  /** Color of the pattern. */
  lineColor: string;
}

/** Default background: white paper with a light grid. */
export const DEFAULT_BACKGROUND: Readonly<BackgroundStyle> = Object.freeze({
  pattern: 'grid',
  spacing: 32,
  paperColor: '#ffffff',
  lineColor: '#e3e6ea',
});
