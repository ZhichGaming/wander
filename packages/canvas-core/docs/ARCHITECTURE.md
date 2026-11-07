# Wander canvas engine: architecture

Team: Zhich, Yu, Justin. Feeds the course design guide.

## Packages, one direction of dependency

```
app (src/)  ──>  @wander/canvas-renderer  ──>  @wander/canvas-core
                 Skia, Reanimated, Gesture       pure TypeScript,
                 Handler, CanvasView             no React Native
                        │
                        └──>  @wander/pencil-input
                              native Swift touch view (iOS)
```

- **canvas-core** holds every rule about the document: what a stroke is, how
  undo works, how files are saved, what each tool does with a drag. It
  imports no React Native, so it is unit-tested with vitest in Node and
  would survive a change of renderer.
- **canvas-renderer** only draws the core's state and turns touches into
  core calls. It has no document logic of its own.
- The app imports the engine from one place (`src/canvas-engine/index.ts`,
  which re-exports the renderer, which re-exports the core).

## Core classes

| Class | Role | Pattern |
| --- | --- | --- |
| `CanvasEngine` | Ties one document, history, camera, selection, overlay and the active tool together. The app's main handle. | Facade |
| `CanvasDocument` | Ordered `Layer`s, the `BackgroundStyle`, an rbush `SpatialIndex` over every object. All mutations go through it so the index and change events stay in sync. | Observer (`changed` emitter) |
| `Layer` | Ordered objects (order = z-order), visibility, lock, opacity. | |
| `CanvasObject` | Abstract base: `id`, `bounds`, `hitTest`, `transformed`, `toJSON`. Immutable: edits make a new object with the same id. | Template / polymorphism |
| `Stroke` | Raw points (x, y, pressure, time, tilt) plus a `StrokeStyle`; its filled outline comes from its brush, cached. | |
| `PageObject` | An imported PDF page or image placed on the canvas, with its source file, page number and label. | |
| `Brush` (`PenBrush`, `HighlighterBrush`, `PencilBrush`) | Turns points into a filled outline polygon (perfect-freehand) and says its draw pass, blend mode, texture and opacity. The pen thins with speed; the highlighter is flat, multiply-blended and drawn behind ink; the pencil reads Apple Pencil tilt and shades wide and light with the side of the lead, filled with graphite grain. Speed comes from timestamps and samples are evened out first (`samplePrep`), so ink looks the same at 60, 120 or 240 Hz. | Strategy + registry |
| `Command` (`CreateObjects`, `DeleteObjects`, `ReplaceObjects`, `TransformObjects`, `SplitStroke`, layer commands, `SetBackground`) | One undoable edit each: `do` and `undo`. | Command |
| `CommandGroup` | Several commands as one undo step (one AI answer, one eraser drag). | Composite |
| `History` | Undo and redo stacks, `beginGroup` / `endGroup`. | |
| `Tool` (`PenTool`, `EraserTool`, `LassoTool`) | What a drag does. Tools read `PointerInput` in world space and act only through commands, the selection and the overlay. | Strategy |
| `Overlay` | Transient drawing state for the renderer: live stroke, lasso path, eraser cursor. Never saved. | Observer |
| `Selection` | Selected object ids (lasso result; read by the AI harness). | Observer |
| `Camera` | Pan and zoom (2% to 6400%), world-to-screen transforms, zoom about a point. | |
| `PointerSession` | Input policy: decides per contact whether it draws or navigates (pen vs finger, `InputMode`), sets the multi-select flag, applies pinch and wheel to the camera. Gesture Handler feeds it today; the native Pencil module will feed it later. | State machine |
| `Serializer` | Document to and from JSON, one record per object, grouped by layer. New object kinds register a factory. | Registry / factory |
| `buildExportPlan`, `exportAnnotatedPdf` | Per selected page, the strokes on it in page coordinates; then pdf-lib copies the original PDF page and draws the ink on top as vector paths. | |

### Why it is split this way

- **Immutable objects + commands.** Undo stores the before and after objects,
  so no command needs custom reverse math, and cached outlines can never go
  stale.
- **Vector erasing.** The partial eraser splits strokes into new strokes
  (`SplitStroke`) instead of painting pixels, so zoom stays sharp and files
  stay small.
- **Tools never touch the renderer.** They publish transient state on the
  `Overlay`; the renderer subscribes. A new tool needs no renderer change.
- **Input policy in the core.** `PointerSession` is plain logic, so pen vs
  finger rules are unit-tested, and the native Pencil module can call it
  directly without going through Gesture Handler.

## Renderer

- `CanvasView` mirrors the camera into a Reanimated shared value and applies
  it as one `Group` transform around world-space content, so panning and
  zooming do not re-render React.
- `SceneCache` records committed objects into Skia `Picture`s: per layer and
  per draw pass (pages, highlighter, pen), consecutive runs of up to 128
  objects, one picture each. Playing the runs in order keeps exact z-order;
  a new stroke re-records only the last run. The visible scene is recorded
  over the viewport plus a margin and rebuilt only when the view leaves it.
- No empty frame on release: `PenTool` commits before clearing the live
  stroke, `SceneController` rebuilds at once for newly added ink, and the
  committed pictures are shared values, so the new picture and the
  clearing of that stroke's live ink reach the UI thread together.
- Live ink runs on the UI thread. On iOS, Reanimated's `useEvent` handles
  the native view's `onInputSamples` event on the UI thread
  (`useLiveInkInput`): it extends the shared live-ink state (`liveInk.ts`)
  and the derived path redraws in the same frame the touch arrives, then
  the events are forwarded to `PointerSession` on the JavaScript thread,
  which still decides what is committed. The brush math is written as
  worklet functions (`penOutline`, `pencilOutline`, `highlighterOutline`,
  `brushOutline`) over a vendored, worklet-safe copy of perfect-freehand
  (`freehand.ts`, MIT, tested to match the library exactly), so live and
  committed ink come from the same code. On web and in Expo Go the
  overlay mirrors PenTool's live stroke into the same state instead.
- `OverlayLayer` draws the live stroke, lasso, eraser cursor and selection
  box from shared values, so drawing does not re-render the ink.
- `BackgroundLayer` draws the infinite grid, dots or lines for the visible
  area only, with hairlines snapped to screen pixels.
- Input sources, all feeding the one `PointerSession` per engine:
  - iOS (development or release build): `@wander/pencil-input`'s `PencilInputView`, a transparent Swift
    `UIView` laid over the canvas. It reports every touch with Apple Pencil
    pressure (`force / maximumPossibleForce`), tilt (altitude and azimuth
    converted to `tiltX` / `tiltY` radians), the coalesced samples between
    frames (up to 240 Hz) and UIKit's predicted samples. Its events have
    the same shape as `RawPointerEvent`, so JavaScript forwards them as is.
    UIKit's later corrections to estimated Pencil force and angles arrive
    as `update` events matched by `updateIndex`; `PointerSession` waits up
    to 150 ms after lift for them before committing the stroke, and the
    engine's `flushRequested` makes undo or a tool switch commit it first.
  - Expo Go: the native module is absent, `isPencilInputAvailable` is
    false, and iOS falls back to Gesture Handler (no pressure or tilt).
  - Web and Android: `useCanvasGesture` (Gesture Handler 3 manual gesture,
    JS thread), which has no pressure or tilt, and `useCanvasWheel` (web
    wheel and trackpad).
- Web: CanvasKit must load before Skia is imported; `index.web.ts` awaits
  `ensureSkiaWeb()` and then imports the app. `canvaskit.wasm` is copied to
  `public/` by the `postinstall` script.

## Known limits

- The UI thread mirrors PointerSession's draw rules to decide which
  contact starts live ink; when they disagree (rare multi-touch cases),
  JavaScript's cancel or commit clears the UI stroke.
- Pressure and tilt need a development build; Expo Go still runs, with
  Gesture Handler input only.
- `PageObject` supports move and uniform scale, not rotation; PDF `/Rotate`
  pages are not yet handled in export.
- Pen speed-thinning constants are first guesses; tune on a real iPad.
