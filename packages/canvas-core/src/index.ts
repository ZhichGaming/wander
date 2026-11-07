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

export type { Brush, BlendMode } from './brush/Brush';
export { getBrush, registerBrush } from './brush/registry';

export { SpatialIndex } from './spatial/SpatialIndex';

export { Command, CommandGroup } from './commands/Command';
export { History, type HistoryState } from './commands/History';
export * from './commands/ObjectCommands';
export * from './commands/LayerCommands';

export * from './serialize/Serializer';

export type { Tool, ToolContext, PointerInput, PointerKind } from './tools/Tool';
export * from './tools/Overlay';
export { Selection } from './tools/Selection';
export { PenTool } from './tools/PenTool';

export { CanvasEngine } from './engine/CanvasEngine';
