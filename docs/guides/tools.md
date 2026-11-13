# Tools and brushes

A `Tool` is what a drag on the canvas does: draw, erase, or lasso. This is the canvas input `Tool` in `packages/canvas-core/src/tools/Tool.ts`, not the AI harness `Tool` class in `src/harness`; they share only a name.

## The Tool interface

The input layer converts raw events into `PointerInput` in world space and hands them to `CanvasEngine`, which forwards them to the active tool (`engine.tool`, swapped with `engine.setTool`).

A tool implements five methods, each receiving the sample and a `ToolContext`:

- `onDown(e, ctx)` — a contact went down.
- `onMove(e, ctx, predicted?)` — the contact moved. `predicted` holds optional look-ahead samples; a tool may show them but must not commit them.
- `onSampleUpdate?(u, ctx)` — corrected values for a sample this gesture already received (Apple Pencil estimates).
- `onUp(e, ctx)` — the contact lifted; commit the gesture.
- `onCancel(ctx)` — a palm, second finger, or tool switch interrupted the gesture; discard it.

`PointerInput` carries `pointerId`, `kind`, world `x` and `y`, `pressure` (0.5 when the device has none), `time`, optional tilt, and `additive` (true while another finger is held).

## ToolContext

`ToolContext` is everything a tool may read or change: `doc`, `history`, `camera`, `selection`, and `overlay`.

The rule that keeps undo correct: a tool never calls `doc.addObject` or any other document mutation directly. It changes the document only through `ctx.history.execute(command)`. Its other two outputs, `ctx.selection` and `ctx.overlay`, are not part of the document and are not undoable. Tools read `camera.scale` to turn screen-pixel thresholds into world units.

## Overlay

`Overlay` is transient drawing state that tools publish for the renderer: the stroke being drawn, the lasso path, and the eraser cursor. Nothing in it is saved or undoable. Tools write with `setLiveStroke`, `setLasso`, and `setEraser`; `clear()` empties all three. The renderer subscribes to `overlay.changed`, which fires with the full `OverlayState` after any change. `overlay.state` returns live arrays; copy them before keeping them.

## Selection

`Selection` is an ordered set of selected object ids. `set`, `add`, and `clear` fire `changed`; `objects(doc)` resolves ids to objects that still exist and `bounds(doc)` unions their bounds. The AI harness reads it; tools move or delete it.

## The three tools

**`PenTool`** starts a stroke on down if the active layer is visible and unlocked, appends samples that moved at least a quarter of a screen pixel, and shows the stroke through `overlay.setLiveStroke`. `onSampleUpdate` rewrites the matching point in place. On up it commits one `CreateObjects` to the active layer, then clears the live stroke, so the renderer can swap one for the other in the same frame. `getStyle`, `setStyle`, and the `styleChanged` emitter manage the `StrokeStyle`; the tool's `name` is the style's brush kind, so one class serves pen, highlighter, and pencil.

**`EraserTool`** works on stroke geometry, never pixels, and only touches strokes on visible, unlocked layers. Each drag is one undo step: `onDown` calls `history.beginGroup('Erase')`, each sweep executes commands immediately so ink disappears under the pen, and `onUp` or `onCancel` calls `endGroup`. Cancel does not roll back. `'object'` mode removes a touched stroke with `DeleteObjects`; `'partial'` mode cuts out the covered part with `SplitStroke`. The radius is in screen pixels, divided by `camera.scale` so it stays the same size at any zoom.

**`LassoTool`** does two things. Outside the selection's bounds it draws a polygon through `overlay.setLasso` and on lift selects the objects mostly inside it, with `selection.add` when `additive` is set and `selection.set` otherwise. A lasso under six screen pixels is a tap and clears the selection. Inside the selection's bounds it starts a move; the document is untouched until lift, when one `TransformObjects` is committed, and `dragOffset` plus `dragChanged` let the renderer draw the selection translated meanwhile. The module also exports `objectsInLasso` and `deleteSelection`; the engine satisfies their context type, so UI code can call `deleteSelection(engine)`.

## Brushes

A `Brush` turns stroke points into a filled outline polygon, never a stroked path, and says how it is composited. Each has a `kind` matching `StrokeStyle.brush`, a `pass` (lower passes draw first within a layer), a `blendMode`, a `texture`, an `opacity(points, style)` multiplier on top of `style.opacity`, and `outline(points, style, complete)`. The optional `freehand(points, style)` returns the call behind a finished stroke; the partial eraser uses it to freeze a centre line before cutting.

`getBrush(kind)` in `brush/registry.ts` returns the brush for a `BrushKind` and throws for an unknown one; `registerBrush(brush)` replaces or adds one, for custom brushes and tests. `Stroke` looks up its brush through the registry when it computes its outline and opacity; tools never touch brushes directly.

The built-in brushes differ in what they read from the input:

- **`PenBrush`** (pass 1, normal blend) is a velocity pen: fast movement thins the line. With a stylus the real pressure is scaled down by speed; with a finger or mouse a fixed base pressure is scaled down the same way. Speed and pressure change width, not darkness.
- **`HighlighterBrush`** (pass 0, multiply blend) draws a constant-width, flat-ended line and ignores pressure. Multiply blending and the earlier pass keep pen ink crisp on top of it; its translucency comes from `style.opacity`.
- **`PencilBrush`** (pass 1, multiply blend, graphite texture) responds to Apple Pencil tilt. Held upright it draws a thin tip line; leaned past about 50 degrees it shades with the side of the lead, widening up to six times and lightening to 45 percent at full tilt. Pressure darkens and widens a little; samples without tilt count as the tip.
