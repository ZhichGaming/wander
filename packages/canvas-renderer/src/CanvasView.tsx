/**
 * Wander — Zhich, Yu, Justin
 * The canvas component. Draws one CanvasEngine with Skia: the paper
 * background in screen space, then, inside a single camera transform, the
 * committed ink as cached pictures and the live tool overlay on top. Input
 * comes from useCanvasGesture; the component itself only renders.
 */

import { Canvas, Group, Picture } from '@shopify/react-native-skia';
import type { BackgroundStyle, CameraState, CanvasEngine, InputMode, Vec2 } from '@wander/canvas-core';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useCanvasGesture } from './input/useCanvasGesture';
import { BackgroundLayer } from './render/BackgroundLayer';
import { OverlayLayer } from './render/OverlayLayer';
import { SceneController, type ScenePictures } from './render/SceneController';

/** Props of CanvasView. */
export interface CanvasViewProps {
  engine: CanvasEngine;
  /** How touches are interpreted (default "auto"). */
  inputMode?: InputMode;
  style?: StyleProp<ViewStyle>;
}

/** Mirrors engine.camera into a shared value so transforms update on the UI thread. */
function useCameraValue(engine: CanvasEngine): SharedValue<CameraState> {
  const camera = useSharedValue<CameraState>(engine.camera.get());
  useEffect(() => {
    camera.value = engine.camera.get();
    return engine.camera.changed.on((state) => {
      camera.value = state;
    });
  }, [engine, camera]);
  return camera;
}

/** The document background, re-read on background changes and document loads. */
function useBackground(engine: CanvasEngine): Readonly<BackgroundStyle> {
  const [background, setBackground] = useState(engine.doc.background);
  useEffect(() => {
    let offDoc = () => {};
    /** Subscribes to the current document and reads its background. */
    const watch = () => {
      offDoc();
      setBackground(engine.doc.background);
      offDoc = engine.doc.changed.on((change) => {
        if (change.kind === 'background') setBackground(engine.doc.background);
      });
    };
    watch();
    const offReplaced = engine.documentReplaced.on(watch);
    return () => {
      offDoc();
      offReplaced();
    };
  }, [engine]);
  return background;
}

/** Infinite ink canvas bound to `engine`. */
export function CanvasView({ engine, inputMode = 'auto', style }: CanvasViewProps) {
  const camera = useCameraValue(engine);
  const background = useBackground(engine);
  const size = useSharedValue({ width: 0, height: 0 });
  const dragOffset = useSharedValue<Vec2>({ x: 0, y: 0 });
  const [pictures, setPictures] = useState<ScenePictures>({ scene: null, dragPreview: null });
  const controller = useRef<SceneController | null>(null);
  const gesture = useCanvasGesture(engine, { mode: inputMode });

  useEffect(() => {
    const c = new SceneController(engine, setPictures, (offset) => {
      dragOffset.value = offset;
    });
    controller.current = c;
    if (size.value.width > 0) c.setViewSize(size.value.width, size.value.height);
    return () => {
      c.dispose();
      controller.current = null;
    };
  }, [engine, size, dragOffset]);

  /** Records the view size for the background and for viewport culling. */
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.value = { width, height };
    controller.current?.setViewSize(width, height);
  };

  // screen = (world - camera) * scale: translate by -camera * scale, then scale.
  const cameraTransform = useDerivedValue(() => [
    { translateX: -camera.value.x * camera.value.scale },
    { translateY: -camera.value.y * camera.value.scale },
    { scale: camera.value.scale },
  ]);
  const dragTransform = useDerivedValue(() => [
    { translateX: dragOffset.value.x },
    { translateY: dragOffset.value.y },
  ]);

  const content = (
    <View style={[styles.fill, style]} onLayout={onLayout}>
      <Canvas style={styles.fill}>
        <BackgroundLayer background={background} camera={camera} size={size} />
        <Group transform={cameraTransform}>
          {pictures.scene && <Picture picture={pictures.scene} />}
          {pictures.dragPreview && (
            <Group transform={dragTransform}>
              <Picture picture={pictures.dragPreview} />
            </Group>
          )}
          <OverlayLayer engine={engine} camera={camera} dragOffset={dragOffset} />
        </Group>
      </Canvas>
    </View>
  );

  if (!gesture) return content;
  return <GestureDetector gesture={gesture}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
