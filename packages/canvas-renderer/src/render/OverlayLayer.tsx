/**
 * Wander — Zhich, Yu, Justin
 * Draws transient tool feedback on top of the ink, in world space inside
 * the camera transform: the live ink, the lasso polygon, the eraser cursor
 * and the selection outline (a contour around every selected stroke). The live ink's path is derived on the UI thread
 * from the shared live-ink state (see liveInk.ts), which native input
 * extends directly; this component mirrors JavaScript-driven strokes into
 * that state and clears strokes once PenTool commits or cancels them.
 */

import { DashPathEffect, Group, Paint, Path, Shader, Skia, type SkPath } from '@shopify/react-native-skia';
import {
  DEFAULT_PEN_STYLE,
  getBrush,
  PenTool,
  Stroke,
  type CameraState,
  type CanvasEngine,
  type OverlayState,
  type StrokeStyle,
  type Vec2,
} from '@wander/canvas-core';
import { useEffect, useState } from 'react';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { uiOwnedInkKeys } from '../input/useLiveInkInput';
import { graphiteEffect, graphiteUniforms } from './graphite';
import {
  clearInkStroke,
  inkFrozenPath,
  inkOpacity,
  inkPath,
  upsertJsStroke,
  type InkState,
  type InkStroke,
} from './liveInk';
import { outlinesToSkPath } from './strokePath';

/** Color of lasso, eraser and selection outlines. */
const GUIDE_COLOR = '#2f6fed';
/** Width of guide outlines in screen pixels. */
const GUIDE_WIDTH_PX = 1.5;
/** Dash and gap length of guide outlines in screen pixels. */
const DASH_PX = 6;
/** Width of the line drawn around selected ink, in screen pixels. */
const SELECTION_RING_PX = 1.5;
/** Width of the soft glow outside that line, in screen pixels. */
const SELECTION_GLOW_PX = 5;
/** Opacity of the glow. */
const SELECTION_GLOW_OPACITY = 0.25;

/** Props of OverlayLayer. */
export interface OverlayLayerProps {
  engine: CanvasEngine;
  camera: SharedValue<CameraState>;
  /** World offset of a selection being dragged; the selection outline follows it. */
  dragOffset: SharedValue<Vec2>;
  /** Shared live-ink state (written by native input and by this component). */
  ink: SharedValue<InkState>;
}

/** Paint of the live ink, taken from the drawing tool's style. */
interface LiveLook {
  color: string;
  multiply: boolean;
  graphite: boolean;
}

/** An empty path. */
function emptyPath(): SkPath {
  return Skia.Path.Make();
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

/** Paint for a stroke style. */
function lookOf(style: Readonly<StrokeStyle>): LiveLook {
  const brush = getBrush(style.brush);
  return { color: style.color, multiply: brush.blendMode === 'multiply', graphite: brush.texture === 'graphite' };
}

/** Paint of the most recent drawing tool, following tool and style changes. */
function useToolLook(engine: CanvasEngine): LiveLook {
  const [look, setLook] = useState<LiveLook>(() =>
    lookOf(engine.tool instanceof PenTool ? engine.tool.getStyle() : DEFAULT_PEN_STYLE),
  );
  useEffect(() => {
    let offStyle = () => {};
    /** Tracks the current tool; non-drawing tools keep the last pen look. */
    const watch = () => {
      offStyle();
      offStyle = () => {};
      const tool = engine.tool;
      if (!(tool instanceof PenTool)) return;
      setLook(lookOf(tool.getStyle()));
      offStyle = tool.styleChanged.on((style) => setLook(lookOf(style)));
    };
    watch();
    const offTool = engine.toolChanged.on(watch);
    return () => {
      offStyle();
      offTool();
    };
  }, [engine]);
  return look;
}

/** Live stroke, lasso, eraser cursor and selection outline. */
export function OverlayLayer({ engine, camera, dragOffset, ink }: OverlayLayerProps) {
  const lasso = useSharedValue<SkPath>(emptyPath());
  const eraser = useSharedValue<SkPath>(emptyPath());
  const selection = useSharedValue<SkPath>(emptyPath());
  const look = useToolLook(engine);

  useEffect(() => {
    let liveKey: number | null = null;
    /**
     * Mirrors PenTool's live stroke into the shared ink state unless the UI
     * thread already draws it, and clears it once it is committed or
     * cancelled. PenTool commits before clearing its live stroke, so the
     * clear is queued to the UI thread right after the committed picture.
     */
    const syncLive = (state: OverlayState) => {
      const live = state.liveStroke;
      if (live && live.points.length > 0) {
        const key = live.points[0].time;
        liveKey = key;
        if (uiOwnedInkKeys(engine).has(key)) return;
        const stroke: InkStroke = {
          key,
          pointerId: -1,
          source: 'js',
          active: true,
          style: { ...live.style },
          points: live.points.map((p) => ({ ...p })),
          predicted: live.predicted.map((p) => ({ ...p })),
          frozen: [],
          frozenTo: 0,
        };
        scheduleOnUI((s: InkStroke) => {
          'worklet';
          ink.modify((v) => {
            'worklet';
            upsertJsStroke(v, s);
            return v;
          }, true);
        }, stroke);
      } else if (liveKey !== null) {
        const key = liveKey;
        liveKey = null;
        uiOwnedInkKeys(engine).delete(key);
        scheduleOnUI((k: number) => {
          'worklet';
          ink.modify((v) => {
            'worklet';
            clearInkStroke(v, k);
            return v;
          }, true);
        }, key);
      }
    };
    /** Rebuilds the overlay paths from the overlay state. */
    const onOverlay = (state: OverlayState) => {
      syncLive(state);
      lasso.value = lassoPath(state);
      eraser.value = eraserPath(state);
    };
    /**
     * Rebuilds the selection outline: the ink outline of every selected
     * stroke, and the bounds rectangle of any other object (pages).
     */
    const onSelection = () => {
      const objects = engine.selection.objects(engine.doc);
      if (objects.length === 0) {
        selection.value = emptyPath();
        return;
      }
      const outlines = [];
      const builder = Skia.PathBuilder.Make();
      for (const obj of objects) {
        if (obj instanceof Stroke) outlines.push(obj.outline);
        else {
          const b = obj.bounds;
          builder.addRect(Skia.XYWHRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY));
        }
      }
      builder.addPath(outlinesToSkPath(outlines));
      selection.value = builder.detach();
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
  }, [engine, ink, lasso, eraser, selection]);

  const livePath = useDerivedValue(() => inkPath(ink.value));
  // The finished part of long strokes: the same path object until another block freezes.
  const frozenPath = useDerivedValue(() => inkFrozenPath(ink.value));
  const liveOpacity = useDerivedValue(() => inkOpacity(ink.value));
  const guideWidth = useDerivedValue(() => GUIDE_WIDTH_PX / camera.value.scale);
  // Both are stroked centred on the ink's edge and clipped to its outside, so half the width shows.
  const ringWidth = useDerivedValue(() => (2 * SELECTION_RING_PX) / camera.value.scale);
  const glowWidth = useDerivedValue(() => (2 * SELECTION_GLOW_PX) / camera.value.scale);
  const dashes = useDerivedValue(() => [DASH_PX / camera.value.scale, DASH_PX / camera.value.scale]);
  const selectionTransform = useDerivedValue(() => [
    { translateX: dragOffset.value.x },
    { translateY: dragOffset.value.y },
  ]);

  const graphite = look.graphite && graphiteEffect() && (
    <Shader source={graphiteEffect()!} uniforms={graphiteUniforms(look.color)} />
  );

  return (
    <>
      {look.multiply ? (
        // Translucent brushes: the frozen part and the live tail overlap where they
        // join, so both are drawn solid into one layer that is then blended once.
        <Group layer={<Paint opacity={liveOpacity} blendMode="multiply" />}>
          <Path path={frozenPath} color={look.color}>
            {graphite}
          </Path>
          <Path path={livePath} color={look.color}>
            {graphite}
          </Path>
        </Group>
      ) : (
        <>
          <Path path={frozenPath} color={look.color} opacity={liveOpacity} />
          <Path path={livePath} color={look.color} opacity={liveOpacity} />
        </>
      )}
      {/* Clipped to the outside of the ink, so selected strokes keep their own color. */}
      <Group transform={selectionTransform} clip={selection} invertClip>
        <Path
          path={selection}
          style="stroke"
          strokeJoin="round"
          strokeWidth={glowWidth}
          color={GUIDE_COLOR}
          opacity={SELECTION_GLOW_OPACITY}
        />
        <Path path={selection} style="stroke" strokeJoin="round" strokeWidth={ringWidth} color={GUIDE_COLOR} />
      </Group>
      <Path path={lasso} style="stroke" strokeWidth={guideWidth} color={GUIDE_COLOR}>
        <DashPathEffect intervals={dashes} />
      </Path>
      <Path path={eraser} style="stroke" strokeWidth={guideWidth} color={GUIDE_COLOR} />
    </>
  );
}
