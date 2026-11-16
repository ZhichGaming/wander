/**
 * Wander — Zhich, Yu, Justin
 * Canvas engine boundary for the app. The engine lives in the workspace
 * packages @wander/canvas-core (model, tools, undo, serialization) and
 * @wander/canvas-renderer (Skia drawing, input, CanvasView). App code
 * imports the engine from here so there is one place to change if the
 * packaging moves.
 */

import { Skia } from '@shopify/react-native-skia';
import { CanvasEngine, Rect } from '@wander/canvas-renderer';
import { ImageCache } from '@wander/canvas-renderer/src/render/ImageCache';
import { ObjectPainter } from '@wander/canvas-renderer/src/render/ObjectPainter';
import { SceneCache } from '@wander/canvas-renderer/src/render/SceneCache';

export * from '@wander/canvas-renderer';

export function exportRectToImage(engine: CanvasEngine, rect: Rect) {
    const images = new ImageCache();
    const painter = new ObjectPainter(images);
    const cache = new SceneCache(engine.doc, painter);
    const picture = cache.buildScene(rect, null);

    const width = rect.maxX - rect.minX;
    const height = rect.maxY - rect.minY;
    const surface = Skia.Surface.MakeOffscreen(width, height);
    const canvas = surface?.getCanvas();

    if (!canvas) {
        throw new Error('Failed to get canvas');
    }

    canvas.translate(-rect.minX, -rect.minY);
    canvas.drawPicture(picture);
    const png = surface?.makeImageSnapshot().encodeToBytes();

    if (!png) {
        throw new Error('Failed to encode image');
    }

    return png;
}
