/**
 * Wander — Zhich, Yu, Justin
 * Web stand-in for PencilInputView: renders nothing. The web build takes
 * input through Gesture Handler instead.
 */

import type { PencilInputViewProps } from './PencilInput.types';

/** False: there is no native Pencil view on the web. */
export const isPencilInputAvailable = false;

/** Renders nothing on the web. */
export function PencilInputView(_props: PencilInputViewProps) {
  return null;
}
