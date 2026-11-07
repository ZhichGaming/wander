/**
 * Wander — Zhich, Yu, Justin
 * Draws the paper: a fill in the paper color and the infinite pattern
 * (grid, dots or ruled lines) in screen space. The pattern path is derived
 * on the UI thread from the camera and view-size shared values.
 */

import { Fill, Path } from '@shopify/react-native-skia';
import type { BackgroundStyle, CameraState } from '@wander/canvas-core';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { backgroundPath } from './background';

/** Props of BackgroundLayer. */
export interface BackgroundLayerProps {
  background: Readonly<BackgroundStyle>;
  camera: SharedValue<CameraState>;
  size: SharedValue<{ width: number; height: number }>;
}

/** Paper fill plus the visible part of the pattern. Must sit outside the camera transform. */
export function BackgroundLayer({ background, camera, size }: BackgroundLayerProps) {
  const { pattern, spacing } = background;
  const path = useDerivedValue(
    () => backgroundPath(pattern, spacing, camera.value, size.value.width, size.value.height),
    [pattern, spacing],
  );
  const isDots = pattern === 'dots';
  return (
    <>
      <Fill color={background.paperColor} />
      <Path
        path={path}
        style="stroke"
        strokeWidth={isDots ? 2.5 : 1}
        strokeCap={isDots ? 'round' : 'butt'}
        color={background.lineColor}
        antiAlias={isDots}
      />
    </>
  );
}
