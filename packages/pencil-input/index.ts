/**
 * Wander — Zhich, Yu, Justin
 * Public surface of @wander/pencil-input: the native touch view and the
 * event types it emits. On platforms without the native view (web,
 * Android) PencilInputView renders nothing and isPencilInputAvailable is
 * false.
 */

export { PencilInputView, NativePencilInputView, isPencilInputAvailable } from './src/PencilInputView';
export type * from './src/PencilInput.types';
