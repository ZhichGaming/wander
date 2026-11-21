# Input

`PointerSession` in `@wander/canvas-core` is the single entry point for raw input. Every source hands it `RawPointerEvent`s in screen space, and it decides, per contact, whether that contact draws or moves the camera. Drawing contacts reach the engine as world-space `PointerInput` through `engine.pointerDown`, `pointerMove`, `pointerUpdate` and `pointerUp`; navigating contacts call `camera.panBy` and `camera.zoomAt`.

## Getting a session

Callers do not construct a session. `pointerSessionFor(engine)` in `@wander/canvas-renderer` returns one `PointerSession` per engine, created in mode `'auto'` on first use and shared by every input source, so touches, Pencil events and wheel events see the same contacts and the same "a pen was seen" state. The session subscribes to `engine.flushRequested` so a lifted stroke still waiting for corrections is committed before undo, redo, a tool switch or a load.

`setMode(mode)` changes the `InputMode`; contacts already down keep their role. `cancelAll()` drops every contact without committing.

## Input modes

`InputMode` is one of three strings:

- `'auto'`: fingers draw until a stylus is seen, then the stylus draws and fingers pan and zoom. The switch is permanent for the session.
- `'pencilOnly'`: only the stylus draws; fingers always pan and zoom.
- `'finger'`: one finger draws, two fingers pan and zoom.

`session.stylusRules` is true in `'pencilOnly'`, or in `'auto'` after a pen was seen.

## Roles

Each contact gets one role for its lifetime: `draw`, `navigate`, `modifier` or `ignored`. The rules in `roleForNewContact`:

- A pen always draws, in every mode. If a finger was drawing (no pen seen yet), the pen cancels that gesture and takes over; navigating fingers become modifiers, so the camera never moves under a stroke in progress.
- A mouse draws. The gesture only reports the left button.
- Under stylus rules a finger navigates: one finger pans, the first two pan and pinch-zoom. A finger that lands while the pen draws is a modifier.
- A tool can claim a finger under stylus rules through `wantsTouch(p, ctx)`. `LassoTool` does for a finger that lands on the selection, so a selection can be moved by hand; a second finger landing early still turns it into a pan or pinch. A lone finger tap that navigated nowhere (at most `TAP_SLOP_PX`, 10 px, within `TAP_MAX_MS`, 350 ms) clears the selection.
- While the tool reports `edgePan` (the lasso moving a selection) and the drawing contact is within `EDGE_PAN_ZONE_PX` (56 px) of the view's edge, the session pans the camera towards that edge, up to `EDGE_PAN_SPEED` (900 px per second) at the edge itself, and re-sends the contact's position so the dragged objects keep up. This needs `session.setViewSize`, which `CanvasView` calls on layout.
- Without stylus rules the first finger draws. A second finger that lands within `SECOND_FINGER_WINDOW_MS` (120 ms), or before the first moved more than `SECOND_FINGER_SLOP_PX` (6 px), cancels the draw and both fingers navigate. Otherwise it is a modifier and the draw continues.
- Extra pens or mice while something else draws are ignored.

A modifier never moves the camera. It only sets `PointerInput.additive` on the drawing contact, which the lasso uses for multi-select.

Pinch lives in `PointerSession.navigate`: it pans by the centroid delta of the navigating fingers and zooms by their spread ratio around the new centroid.

## Wheel

`session.wheel(w: WheelInput)` zooms at the cursor when `w.zoom` is true (factor `exp(-deltaY * WHEEL_ZOOM_SPEED)`) and pans otherwise. Its only caller is `useCanvasWheel`, which listens to the DOM `wheel` event on web and sets `zoom` from `ctrlKey`, the way browsers report a trackpad pinch. On native platforms it does nothing.

## Two sources, one session

**Gesture Handler.** `useCanvasGesture(engine, { mode })` returns a manual gesture for `GestureDetector`. It calls `session.setMode(mode)`, calls `cancelAll` on unmount, and hands each touch callback to `GestureTouchAdapter`, which maps `PointerType.STYLUS` to `'pen'`, `PointerType.MOUSE` to `'mouse'` and everything else to `'touch'`, then calls `session.handle` once per changed touch. These events carry no pressure or tilt, so pressure falls back to the session's 0.5 default. This is the input path on web, Android and Expo Go.

**Native Pencil view.** `@wander/pencil-input` exports `PencilInputView`, `NativePencilInputView` and `isPencilInputAvailable`. Its `NativePointerEvent` mirrors `RawPointerEvent` structurally, so `CanvasView` passes events to the same session without the package depending on the engine. When the view is available, `CanvasView` mounts it instead of wrapping the canvas in `GestureDetector`.

## Pencil data

Each native event can carry what UIKit reports for Apple Pencil:

- `pressure` (0..1) and `tiltX`/`tiltY` (radians) are copied onto the `PointerInput`.
- `coalesced` high-rate samples are fed to the engine one by one instead of the event's own position; `predicted` look-ahead samples go with the last of them, shown but never committed.
- By default the session ignores corrections (`corrections: 'ignore'`): ink keeps the values the pen first reported and a lift commits at once. On a real Pencil the corrections only change pressure and arrive a few hundred milliseconds late, mostly after the stroke has lifted, so applying them reshapes ink the writer has already finished. Pass `{ corrections: 'apply' }` to `PointerSession` for the behaviour in the next two points; `session.appliesCorrections` reports which is in use.
- `updateIndex` marks a sample UIKit still expects to correct. The later `'update'` event with the same index becomes `engine.pointerUpdate` with corrected position, pressure and tilt; `final: true` clears it.
- If a drawing contact lifts with corrections outstanding, its `pointerUp` is deferred until the last final update arrives or `ESTIMATE_TIMEOUT_MS` (150 ms) passes. A new drawing contact, `cancelAll` or `flushRequested` commits the deferred lift first. If that commit throws, the session cancels the gesture and clears its state.
- `session.penSample` emits every pen sample, including updates, for live pressure and tilt readouts.

## Platform availability

- **Expo Go**: the binary has no `WanderPencilInput` module, so `isPencilInputAvailable` is false and input falls back to Gesture Handler with no pressure or tilt.
- **Web and Android**: `PencilInputView` renders nothing and `isPencilInputAvailable` is false. Wheel zoom and pan are web only.
- **iOS development and release builds**: the native view supplies pressure, tilt, coalesced and predicted samples.
