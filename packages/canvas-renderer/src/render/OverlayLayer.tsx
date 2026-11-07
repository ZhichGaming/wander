/**
 * Wander — Zhich, Yu, Justin
 * Draws transient tool feedback on top of the ink, in world space inside
 * the camera transform: the stroke being drawn, the lasso polygon, the
 * eraser cursor and the selection bounds. Geometry lives in shared values
 * that are replaced at input rate, so the committed-ink layers never
 * re-render while the user draws.
 */

import { DashPathEffect, Path, Shader, Skia, type SkPath } from '@shopify/react-native-skia';
import {
  getBrush,
  isEmptyRect,
  type CameraState,
  type CanvasEngine,
  type OverlayState,
  type LiveStroke,
  type Vec2,
} from '@wander/canvas-core';
import { useEffect, useState } from 'react';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { graphiteEffect, graphiteUniforms } from './graphite';
import { outlineToSkPath } from './strokePath';

/** Color of lasso, eraser and selection outlines. */
const GUIDE_COLOR = '#2f6fed';
/** Width of guide outlines in screen pixels. */
const GUIDE_WIDTH_PX = 1.5;
/** Dash and gap length of guide outlines in screen pixels. */
const DASH_PX = 6;

/** Props of OverlayLayer. */
export interface OverlayLayerProps {
  engine: CanvasEngine;
  camera: SharedValue<CameraState>;
  /** World offset of a selection being dragged; the selection outline follows it. */
  dragOffset: SharedValue<Vec2>;
}

/** Look of the live stroke; changes only when a new stroke starts or its brush opacity changes. */
interface LiveLook {
  color: string;
  opacity: number;
  multiply: boolean;
  graphite: boolean;
}

/** An empty path. */
function emptyPath(): SkPath {
  return Skia.Path.Make();
}

/** Filled outline of the stroke in progress, including predicted points. */
function liveStrokePath(state: OverlayState): SkPath {
  const live = state.liveStroke;
  if (!live) return emptyPath();
  const points = [...live.points, ...live.predicted];
  return outlineToSkPath(getBrush(live.style.brush).outline(points, live.style, false));
}

/** Open polyline through the lasso points. */
function lassoPath(state: OverlayState): SkPath {
  if (!state.lasso || state.lasso.length < 2) return emptyPath();
  return Skia.PathBuilder.Make().addPoly(state.lasso, false).detach();
}

/** Circle outline of the eraser cursor. */
function eraserPath(state: OverlayState): SkPath {
  if (!state.eraser) return emptyPath();
  const { center, radius } = state.eraser;
  return Skia.PathBuilder.Make().addCircle(center.x, center.y, radius).detach();
}

/** Look of the live stroke, for comparing and drawing. */
function lookOf(live: LiveStroke): LiveLook {
  const brush = getBrush(live.style.brush);
  // Rounded so a pencil's tilt-driven opacity does not re-render every sample.
  const opacity = Math.round(live.style.opacity * brush.opacity(live.points, live.style) * 20) / 20;
  return {
    color: live.style.color,
    opacity,
    multiply: brush.blendMode === 'multiply',
    graphite: brush.texture === 'graphite',
  };
}

/** Live stroke, lasso, eraser cursor and selection outline. */
export function OverlayLayer({ engine, camera, dragOffset }: OverlayLayerProps) {
  const live = useSharedValue<SkPath>(emptyPath());
  const lasso = useSharedValue<SkPath>(emptyPath());
  const eraser = useSharedValue<SkPath>(emptyPath());
  const selection = useSharedValue<SkPath>(emptyPath());
  const [look, setLook] = useState<LiveLook | null>(null);

  useEffect(() => {
    /** Rebuilds every overlay path from the overlay state. */
    const onOverlay = (state: OverlayState) => {
      // When the stroke ends, leave the old path in place: the Path element is
      // unmounted by setLook(null) in the same React commit that adds the
      // committed ink, so the stroke never disappears for a frame.
      if (state.liveStroke) live.value = liveStrokePath(state);
      lasso.value = lassoPath(state);
      eraser.value = eraserPath(state);
      const next = state.liveStroke ? lookOf(state.liveStroke) : null;
      setLook((prev) =>
        prev &&
        next &&
        prev.color === next.color &&
        prev.opacity === next.opacity &&
        prev.multiply === next.multiply &&
        prev.graphite === next.graphite
          ? prev
          : next,
      );
    };
    /** Rebuilds the selection rectangle from the selected objects' bounds. */
    const onSelection = () => {
      const b = engine.selection.bounds(engine.doc);
      selection.value = isEmptyRect(b)
        ? emptyPath()
        : Skia.PathBuilder.Make()
            .addRect(Skia.XYWHRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY))
            .detach();
    };
    let offDoc = engine.doc.changed.on(onSelection);
    const offs = [
      engine.overlay.changed.on(onOverlay),
      engine.selection.changed.on(onSelection),
      engine.documentReplaced.on((doc) => {
        offDoc();
        offDoc = doc.changed.on(onSelection);
        onSelection();
      }),
    ];
    onOverlay(engine.overlay.state);
    onSelection();
    return () => {
      offDoc();
      for (const off of offs) off();
    };
  }, [engine, live, lasso, eraser, selection]);

  const guideWidth = useDerivedValue(() => GUIDE_WIDTH_PX / camera.value.scale);
  const dashes = useDerivedValue(() => [DASH_PX / camera.value.scale, DASH_PX / camera.value.scale]);
  const selectionTransform = useDerivedValue(() => [
    { translateX: dragOffset.value.x },
    { translateY: dragOffset.value.y },
  ]);

  return (
    <>
      {look && (
        <Path
          path={live}
          color={look.color}
          opacity={look.opacity}
          blendMode={look.multiply ? 'multiply' : 'srcOver'}
        >
          {look.graphite && graphiteEffect() && (
            <Shader source={graphiteEffect()!} uniforms={graphiteUniforms(look.color)} />
          )}
        </Path>
      )}
      <Path path={selection} transform={selectionTransform} style="stroke" strokeWidth={guideWidth} color={GUIDE_COLOR}>
        <DashPathEffect intervals={dashes} />
      </Path>
      <Path path={lasso} style="stroke" strokeWidth={guideWidth} color={GUIDE_COLOR}>
        <DashPathEffect intervals={dashes} />
      </Path>
      <Path path={eraser} style="stroke" strokeWidth={guideWidth} color={GUIDE_COLOR} />
    </>
  );
}
