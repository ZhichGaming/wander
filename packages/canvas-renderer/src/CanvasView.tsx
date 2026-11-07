/**
 * Wander — Zhich, Yu, Justin
 * The canvas component. Draws one CanvasEngine with Skia: the paper
 * background in screen space, then, inside a single camera transform, the
 * committed ink as cached pictures and the live tool overlay on top. Input
 * comes from the native PencilInputView on iOS (Pencil pressure, tilt,
 * coalesced and predicted samples) and from useCanvasGesture elsewhere;
 * both feed the engine's PointerSession. On iOS the native events are
 * handled on the UI thread first, so live ink is drawn in the same frame
 * the touch arrives (see useLiveInkInput). Committed pictures are shared
 * values too, so a committed stroke and the clearing of its live ink reach
 * the UI thread together.
 */

import { Canvas, Group, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import type { BackgroundStyle, CameraState, CanvasEngine, InputMode, Vec2 } from '@wander/canvas-core';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { isPencilInputAvailable, NativePencilInputView } from '@wander/pencil-input';
import { pointerSessionFor } from './input/pointerSessionFor';
import { useCanvasGesture } from './input/useCanvasGesture';
import { useCanvasWheel } from './input/useCanvasWheel';
import { useInkConfig, useLiveInkHandler } from './input/useLiveInkInput';
import { emptyInk, type InkConfig, type InkState } from './render/liveInk';
import { BackgroundLayer } from './render/BackgroundLayer';
import { OverlayLayer } from './render/OverlayLayer';
import { SceneController } from './render/SceneController';

/** The native touch view wrapped so Reanimated can handle its events on the UI thread. */
const AnimatedPencilInput = NativePencilInputView ? Animated.createAnimatedComponent(NativePencilInputView) : null;

/** A picture with nothing in it. */
function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

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
  const scene = useSharedValue<SkPicture>(emptyPicture());
  const dragPreview = useSharedValue<SkPicture>(emptyPicture());
  const ink = useSharedValue<InkState>(emptyInk());
  const inkConfig = useSharedValue<InkConfig>({ style: null, stylusRules: false });
  const controller = useRef<SceneController | null>(null);
  // Plain copy of the layout size: on native, onLayout can fire before the
  // controller exists, and a shared value written on the JS thread does not
  // read back synchronously there, so the controller is seeded from this.
  const layoutSize = useRef({ width: 0, height: 0 });
  const gesture = useCanvasGesture(engine, { mode: inputMode });
  const viewRef = useRef<ComponentRef<typeof View>>(null);
  const session = pointerSessionFor(engine);
  const syncInkConfig = useInkConfig(engine, session, inkConfig);
  const onInputSamples = useLiveInkHandler(engine, session, ink, inkConfig, camera, syncInkConfig);
  useCanvasWheel(engine, viewRef);

  useEffect(() => {
    const empty = emptyPicture();
    const c = new SceneController(
      engine,
      (pictures) => {
        scene.value = pictures.scene ?? empty;
        dragPreview.value = pictures.dragPreview ?? empty;
      },
      (offset) => {
        dragOffset.value = offset;
      },
    );
    controller.current = c;
    const { width, height } = layoutSize.current;
    if (width > 0) c.setViewSize(width, height);
    return () => {
      c.dispose();
      controller.current = null;
    };
  }, [engine, size, dragOffset, scene, dragPreview]);

  /** Records the view size for the background and for viewport culling. */
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.value = { width, height };
    layoutSize.current = { width, height };
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
    <View ref={viewRef} style={[styles.fill, style]} onLayout={onLayout}>
      <Canvas style={styles.fill}>
        <BackgroundLayer background={background} camera={camera} size={size} />
        <Group transform={cameraTransform}>
          <Picture picture={scene} />
          <Group transform={dragTransform}>
            <Picture picture={dragPreview} />
          </Group>
          <OverlayLayer engine={engine} camera={camera} dragOffset={dragOffset} ink={ink} />
        </Group>
      </Canvas>
      {AnimatedPencilInput && (
        <AnimatedPencilInput
          style={StyleSheet.absoluteFill}
          // A Reanimated worklet handler receives the native payload directly;
          // the prop's type describes a JS synthetic event, hence the cast.
          onInputSamples={onInputSamples as never}
        />
      )}
    </View>
  );

  if (!gesture || isPencilInputAvailable) return content;
  return <GestureDetector gesture={gesture}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
