/**
 * Wander — Zhich, Yu, Justin
 * How the generated hand writes: size, lean, how much it varies, spacing,
 * pressure and speed. Text, math, shapes and graphs all use one style, so
 * everything the agent writes looks like the same hand.
 */

/** How the hand writes. Lengths are in world units unless noted. */
export interface HandStyle {
  /** Height of a lowercase x. Capitals are about 1.6 times this. */
  xHeight: number;
  /** Forward lean in degrees (0 is upright). */
  slant: number;
  /** How much the writing varies, 0 (tidy) to 1 (quick and loose). */
  messiness: number;
  /** Letter width multiplier (1 is the glyphs' own width). */
  width: number;
  /** Space between letters, in x-heights. */
  letterGap: number;
  /** Space between words, in x-heights. */
  wordGap: number;
  /**
   * Typical pen pressure, 0 to 1, on the scale a stylus reports. The pen
   * brush multiplies stylus pressure before drawing (see PenBrush), so about
   * 0.28 draws at the pen's nominal width.
   */
  pressure: number;
  /** Pen speed on straight runs, in world units per millisecond. */
  speed: number;
}

/** Tidy print with a slight lean; reads well at the 32-unit grid. */
export const NEAT_HAND: Readonly<HandStyle> = Object.freeze({
  xHeight: 14,
  slant: 6,
  messiness: 0.45,
  width: 1.18,
  letterGap: 0.2,
  wordGap: 0.42,
  pressure: 0.28,
  speed: 0.16,
});

/**
 * Everyday handwriting: clearly a person's, with uneven size and spacing
 * and a wandering baseline, but still easy to read. A good default for an
 * agent writing next to someone's own notes.
 */
export const CASUAL_HAND: Readonly<HandStyle> = Object.freeze({
  xHeight: 14,
  slant: 9,
  messiness: 0.8,
  width: 1.2,
  letterGap: 0.2,
  wordGap: 0.46,
  pressure: 0.27,
  speed: 0.2,
});

/** Faster, more slanted and more varied. */
export const LOOSE_HAND: Readonly<HandStyle> = Object.freeze({
  xHeight: 14,
  slant: 12,
  messiness: 0.9,
  width: 1.25,
  letterGap: 0.18,
  wordGap: 0.42,
  pressure: 0.26,
  speed: 0.24,
});

/** Upright, larger and slower. */
export const UPRIGHT_HAND: Readonly<HandStyle> = Object.freeze({
  xHeight: 17,
  slant: 0,
  messiness: 0.35,
  width: 1.12,
  letterGap: 0.22,
  wordGap: 0.42,
  pressure: 0.29,
  speed: 0.14,
});
