import { SceneCache } from "@wander/canvas-renderer/src/render/SceneCache";
import { CanvasEngine, Rect } from "../canvas-engine";

export function getPaddedSelection(engine: CanvasEngine, padding: number) {
    const selection = engine.selection.bounds(engine.doc);
    
    const paddedRect: Rect = {
        minX: selection.minX - padding,
        minY: selection.minY - padding,
        maxX: selection.maxX + padding,
        maxY: selection.maxY + padding
    }

    new SceneCache(engine.doc, paddedRect)
}

export function writeText(engine: CanvasEngine, text: string, x: number, y: number) {

}

export function deleteSelection(engine: CanvasEngine) {

}

export function undo(engine: CanvasEngine) {

}

export function redo(engine: CanvasEngine) {

}
