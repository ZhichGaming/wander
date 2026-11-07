/**
 * Wander — Zhich, Yu, Justin
 * React wrapper for the native PencilInputView (iOS). When the app runs
 * in a binary without this module (Expo Go), the view is unavailable and
 * the canvas falls back to Gesture Handler input (no pressure or tilt).
 */

import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import type { NativePointerEvent, PencilInputViewProps } from './PencilInput.types';

/** Props of the raw native component. */
interface NativeProps {
  onInputSamples: (e: NativeSyntheticEvent<{ events: NativePointerEvent[] }>) => void;
  style?: PencilInputViewProps['style'];
}

/** True when this binary contains the native module (a development or release build, not Expo Go). */
export const isPencilInputAvailable = requireOptionalNativeModule('WanderPencilInput') !== null;

const NativeView: ComponentType<NativeProps> | null = isPencilInputAvailable
  ? requireNativeView('WanderPencilInput')
  : null;

/**
 * The raw native component (null when unavailable). Its `onInputSamples`
 * event carries `{ events: NativePointerEvent[] }`; wrap it with
 * Reanimated's createAnimatedComponent to handle that event on the UI
 * thread.
 */
export const NativePencilInputView = NativeView;

/** Transparent view that reports every touch with Pencil pressure and tilt; renders nothing when unavailable. */
export function PencilInputView({ onPointerEvents, style }: PencilInputViewProps) {
  if (!NativeView) return null;
  return <NativeView style={style} onInputSamples={(e) => onPointerEvents(e.nativeEvent.events)} />;
}
