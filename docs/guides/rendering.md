# Rendering

`CanvasView` is the one component in `@wander/canvas-renderer` that draws a `CanvasEngine`. It takes three props: `engine`, an optional `inputMode` (default `"auto"`, see [Input](./input.md)) and `style`. Mount it once per engine and keep the engine alive across re-renders; the rest is wired for you.

```tsx
<CanvasView engine={engine} style={{ flex: 1 }} />
```

## One engine, one Skia canvas

`CanvasView` renders a single Skia `Canvas` with three parts:

1. `BackgroundLayer`, in screen space, outside the camera transform. It reads `engine.doc.background` and redraws when the document emits a `background` change or `documentReplaced` fires.
2. A `Group` carrying the camera transform. Inside it: a `Picture` of the committed scene, a nested `Group` holding the drag preview, and `OverlayLayer`.
3. On iOS, a transparent native `PencilInputView` laid over the canvas with `StyleSheet.absoluteFill`.

The view only reads the engine and subscribes to its emitters. It never mutates the document.

## The camera is a transform

`useCameraValue` mirrors `engine.camera.get()` into a Reanimated shared value and updates it from `engine.camera.changed`. From that value `CanvasView` derives one transform: translate by `-camera.x * scale` and `-camera.y * scale`, then scale by `camera.scale`. That is `screen = (world - camera) * scale`, applied once to the committed ink, the drag preview and the overlay together.

Because the transform is a derived shared value, a pan or zoom reaches the UI thread without a React render. `SceneController` listens to the same emitter but only rebuilds when the visible rect leaves the area the current picture covers: `engine.camera.visibleRect(width, height)` inflated by half its larger side. Panning and zooming inside that window costs no JavaScript.

## Committed ink: SceneController and SceneCache

`CanvasView` creates one `SceneController` per engine in an effect and calls `dispose()` on cleanup. The controller takes two callbacks: `onPictures`, which receives a `ScenePictures` pair (`scene` and `dragPreview`, either may be `null`), and `onDragOffset`, the live offset of a selection being moved. `CanvasView` writes all three into shared values, so a new picture reaches the UI thread the same way a camera change does.

`setViewSize(width, height)` is called from `onLayout` and clears the cull window, forcing a rebuild for the new viewport. The controller rebuilds at most once per animation frame; bursts of document changes coalesce. New ink is the exception: a `doc.changed` event with added objects and nothing removed triggers `rebuildNow()`, so the committed stroke is published in the same tick that `PenTool` clears its live stroke, with no empty frame between them.

The pictures come from `SceneCache`, which records committed objects per layer and per draw pass into chunks of up to 128 consecutive objects, one `SkPicture` each. Playing chunks in order preserves z-order; a new stroke re-records only the last chunk of its pass.

When the active tool exposes `dragChanged` (the `LassoTool` does), the controller hides the selected objects from `scene`, records them once as `dragPreview`, and afterwards publishes only the offset, which the nested `Group` applies as a translate.

## Live overlay

`OverlayLayer` draws the transient feedback inside the camera transform: the live stroke, the lasso polyline, the eraser circle and the selection rectangle. Each is a shared `SkPath` rebuilt from `engine.overlay.state` or `engine.selection.bounds(doc)`; drawing does not re-render the layer. Guide widths are divided by `camera.scale` to stay constant on screen.

The live stroke is derived on the UI thread from the shared `InkState` in `liveInk.ts`. `OverlayLayer` mirrors `PenTool`'s live stroke into that state and clears it on commit or cancel. If the UI thread already started the stroke (its key is in `uiOwnedInkKeys(engine)`), only the clear runs.

## Where iOS pencil events land

When `isPencilInputAvailable` is true, `CanvasView` renders `NativePencilInputView` through `Animated.createAnimatedComponent` and attaches no `GestureDetector`. Its `onInputSamples` event is handled by `useLiveInkHandler`, a Reanimated `useEvent` worklet. The worklet runs on the UI thread first: it calls `applyNativeEvents` on the shared ink state with the current `InkConfig` and camera, so the live path redraws in the frame the touch arrives. It then forwards the same events with `scheduleOnRN` to `session.handle` on the JavaScript thread, where `PointerSession` and the tools decide what is committed.

`useInkConfig` publishes the pen style and `stylusRules` to the UI thread, and a null style when the tool is not a `PenTool` or the active layer is locked or hidden.

Without the native module (Expo Go, web, Android), `useCanvasGesture` supplies a Gesture Handler manual gesture and `CanvasView` wraps the content in a `GestureDetector`. `useCanvasWheel` binds wheel and trackpad input on web.

## Web: CanvasKit before Skia

On web, React Native Skia draws with CanvasKit, and its `Skia` object is built from the global CanvasKit when the library module is first evaluated. Any module that imports `@shopify/react-native-skia`, including `CanvasView`, must load after CanvasKit. `ensureSkiaWeb()` from `loadSkiaWeb.web.ts` calls `LoadSkiaWeb` with files served from the site root and imports only the web loader subpath, never the main Skia entry. The app's `index.web.ts` awaits it, then imports `App` with a dynamic `import()`. The native `loadSkiaWeb.ts` resolves immediately, since Skia is linked into the binary. `canvaskit.wasm` is copied to `public/` with `npx setup-skia-web public`.
