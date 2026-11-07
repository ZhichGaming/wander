/**
 * Wander — Zhich, Yu, Justin
 * Android stand-in for PencilInputView: renders nothing. Android takes
 * input through Gesture Handler instead.
 */

import type { PencilInputViewProps } from './PencilInput.types';

/** False: the native view is iOS only for now. */
export const isPencilInputAvailable = false;

/** Renders nothing on Android. */
export function PencilInputView(_props: PencilInputViewProps) {
  return null;
}
