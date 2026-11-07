/**
 * Wander — Zhich, Yu, Justin
 * How touches are interpreted.
 */

/**
 * - "auto": fingers draw until a stylus is seen, then the stylus draws and
 *   fingers pan and zoom.
 * - "pencilOnly": only the stylus draws; fingers always pan and zoom.
 * - "finger": one finger draws, two fingers pan and zoom.
 */
export type InputMode = 'auto' | 'pencilOnly' | 'finger';
