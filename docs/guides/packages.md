# Packages and imports

The canvas library is three npm workspace packages under `packages/`. The root `package.json` lists `packages/*` as workspaces, so each one resolves by its `@wander/...` name. All three are private, version `0.1.0`, and point `main` and `types` straight at a TypeScript entry file; nothing is built before import.

Dependencies run in one direction:

```
app (src/)  ──>  @wander/canvas-renderer  ──>  @wander/canvas-core
                        │
                        └──>  @wander/pencil-input
```

The core knows nothing about the renderer. The renderer knows nothing about the app.

## `@wander/canvas-core`

Entry: `packages/canvas-core/src/index.ts`.

The document model, camera, commands, history, tools, brushes, serialization and PDF export. It has no React Native imports, so it runs in Node and is tested with `vitest run` (`npm test` inside the package). Its runtime dependencies are `rbush` (spatial index) and `pdf-lib` (export).

The index groups the exports roughly as:

- Geometry and camera: `./math/geometry`, `Camera`, `pointInPolygon`, `polygonBounds`.
- Model: `CanvasObject`, `Stroke`, `Layer`, `StrokeStyle`, `Background`, `CanvasDocument`, `PageObject`, `registerObjectKind`, `objectFromJSON`, `SpatialIndex`.
- Brushes: `Brush` types, `getBrush`, `registerBrush`, `PenBrush`, `HighlighterBrush`, `PencilBrush`, outline helpers such as `freehandOutline` and `outlineToSvgPath`.
- Commands: `Command`, `CommandGroup`, `History`, the object and layer commands, `SplitStroke`.
- Tools: `Tool` and `ToolContext` types, `Overlay`, `Selection`, `PenTool`, `EraserTool`, `LassoTool`.
- Engine and input: `CanvasEngine`, `InputMode`, `PointerSession` and its constants and types.
- Files: `./serialize/Serializer`, `buildExportPlan`, `exportAnnotatedPdf`.

The header of that file states the rule: everything outside the package imports from the index, never from internal files.

## `@wander/canvas-renderer`

Entry: `packages/canvas-renderer/src/index.ts`.

Skia drawing, gesture handling and the `CanvasView` component. It depends on `@wander/canvas-core` and `@wander/pencil-input`, and declares `@shopify/react-native-skia`, `react`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated` and `react-native-worklets` as peer dependencies, so the app supplies those versions.

Its own exports are small:

- `CanvasView` and `CanvasViewProps`
- `useCanvasGesture` and `CanvasGestureOptions`
- `useCanvasWheel`
- `pointerSessionFor`
- `GestureTouchAdapter`
- `ensureSkiaWeb`
- `isPencilInputAvailable`, re-exported from `@wander/pencil-input`

It also does `export * from '@wander/canvas-core'`, so every core symbol is reachable from the renderer. The renderer holds no document logic; it draws core state and turns touches into core calls.

## `@wander/pencil-input`

Entry: `packages/pencil-input/index.ts` (the package root, not `src/`).

A native iOS view that reports Apple Pencil and touch samples with pressure, tilt, and coalesced and predicted points. Peer dependencies are `expo`, `react` and `react-native`. It exports `PencilInputView`, `NativePencilInputView`, `isPencilInputAvailable`, and the event types from `./src/PencilInput.types`. On platforms without the native view (web, Android) `PencilInputView` renders nothing and `isPencilInputAvailable` is `false`.

Only the renderer imports this package directly. The app reads `isPencilInputAvailable` through the renderer re-export.

## The app import path

`src/canvas-engine/index.ts` contains one line of code:

```ts
export * from '@wander/canvas-renderer';
```

App code imports the engine from there, for example in `src/screens/CanvasScreen.tsx`:

```ts
import { CanvasEngine, CanvasView } from '../canvas-engine';
```

Because the renderer re-exports the core, this one path gives the app `CanvasEngine`, `CanvasDocument`, `History`, the tools, `CanvasView` and the input hooks together. It is also the single place to edit if the packages are ever published or moved.

## What to import, and what not to reach into

- App code under `src/` imports from `src/canvas-engine`. It does not import `@wander/canvas-renderer`, `@wander/canvas-core` or `@wander/pencil-input` by name.
- `@wander/canvas-renderer` imports `@wander/canvas-core` and `@wander/pencil-input` by package name only. It does not import `@wander/canvas-core/src/...` or any other internal path.
- `@wander/canvas-core` imports nothing from `react`, `react-native`, Skia, the renderer or the pencil package. Adding such an import breaks the Node test run and the renderer-independence the architecture note relies on.
- `@wander/pencil-input` imports neither of the other two packages.

If a symbol you need is not in a package's index, add it to that index rather than deep-importing the file that defines it. The index is the contract; the file layout under `src/` is free to change.
