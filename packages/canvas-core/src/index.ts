/**
 * Wander — Zhich, Yu, Justin
 * Public surface of @wander/canvas-core. Everything outside this package
 * imports from here, never from internal files.
 */

export * from './math/geometry';
export * from './Camera';
export { Emitter, type Listener } from './Emitter';
export { newId } from './ids';

export { CanvasObject, type ObjectJSON } from './model/CanvasObject';
export * from './model/StrokeStyle';
export { Stroke, type StrokeJSON } from './model/Stroke';
export { Layer, type LayerProps } from './model/Layer';
export * from './model/Background';
export * from './model/CanvasDocument';
export { registerObjectKind, objectFromJSON, type ObjectFactory } from './model/objectRegistry';

export type { Brush, BlendMode, BrushTexture } from './brush/Brush';
export { getBrush, registerBrush } from './brush/registry';

export { SpatialIndex } from './spatial/SpatialIndex';

export { Command, CommandGroup } from './commands/Command';
export { History, type HistoryState } from './commands/History';
export * from './commands/ObjectCommands';
export * from './commands/LayerCommands';

export * from './serialize/Serializer';

export type { Tool, ToolContext, PointerInput, PointerKind, PointerSampleUpdate } from './tools/Tool';
export * from './tools/Overlay';
export { Selection } from './tools/Selection';
export { PenTool } from './tools/PenTool';

export { CanvasEngine } from './engine/CanvasEngine';
export type { InputMode } from './input/InputMode';

export { PenBrush } from './brush/PenBrush';
export { HighlighterBrush } from './brush/HighlighterBrush';
export { PencilBrush, shadeAmount } from './brush/PencilBrush';
export { outlineToSvgPath, dotOutline, isSinglePoint } from './brush/outlinePath';
export { brushOutline, brushOpacity } from './brush/liveOutline';
export { freehandOutline, type FreehandInput, type FreehandOptions } from './brush/freehand';

export { EraserTool, DEFAULT_ERASER_OPTIONS, type EraserMode, type EraserOptions } from './tools/EraserTool';
export { SplitStroke } from './commands/EraseCommands';

export { pointInPolygon, polygonBounds } from './math/polygon';
export { LassoTool, deleteSelection, objectsInLasso } from './tools/LassoTool';

export { PageObject, type PageJSON, type PageSource, type PageRect } from './model/PageObject';
export { buildExportPlan, type ExportPlan, type ExportPage, type ExportAnnotation } from './export/exportPlan';
export { exportAnnotatedPdf, type BytesLoader } from './export/pdfExport';

export {
  PointerSession,
  SECOND_FINGER_WINDOW_MS,
  SECOND_FINGER_SLOP_PX,
  WHEEL_ZOOM_SPEED,
  ESTIMATE_TIMEOUT_MS,
  type PointerSessionOptions,
  type PointerPhase,
  type RawPointerSample,
  type RawPointerEvent,
  type WheelInput,
} from './input/PointerSession';
