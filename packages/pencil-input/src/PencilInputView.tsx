/**
 * Wander — Zhich, Yu, Justin
 * React wrapper for the native PencilInputView (iOS).
 */

import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import type { NativePointerEvent, PencilInputViewProps } from './PencilInput.types';

/** Props of the raw native component. */
interface NativeProps {
  onInputSamples: (e: NativeSyntheticEvent<{ events: NativePointerEvent[] }>) => void;
  style?: PencilInputViewProps['style'];
}

const NativeView: ComponentType<NativeProps> = requireNativeView('WanderPencilInput');

/** True on platforms where the native view exists. */
export const isPencilInputAvailable = true;

/** Transparent view that reports every touch with Pencil pressure and tilt. */
export function PencilInputView({ onPointerEvents, style }: PencilInputViewProps) {
  return <NativeView style={style} onInputSamples={(e) => onPointerEvents(e.nativeEvent.events)} />;
}
