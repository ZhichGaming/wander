# Engine

`CanvasEngine` is the caller's handle on one live editing session. It is the main entry point of `@wander/canvas-core`. The app and the renderer both talk to this object: the app forwards input and calls undo, redo, save and load; the renderer reads the document, camera, selection and overlay from it and subscribes to its emitters.

```ts
import { CanvasEngine } from '@wander/canvas-core';

const engine = new CanvasEngine();
```

The constructor takes an optional `CanvasDocument`. With no argument it creates an empty document. It always starts with a fresh `History` for that document and a `PenTool` as the active tool.

## What it owns

| Member | Type | Notes |
| --- | --- | --- |
| `doc` | `CanvasDocument` | Getter. The current document. Replaced by `load`. |
| `history` | `History` | Getter. Undo history for the current document. Replaced by `load`. |
| `tool` | `Tool` | Getter. The active tool. Replaced by `setTool`. |
| `camera` | `Camera` | Readonly field. View state. Not saved. |
| `selection` | `Selection` | Readonly field. Cleared by `load`. |
| `overlay` | `Overlay` | Readonly field. Cleared by `load`. |

`doc`, `history` and `tool` are getters because the engine swaps the objects behind them. Hold the engine, not the document or the history, across a `load`.

Every tool call receives a `ToolContext` built from five of these members: `doc`, `history`, `camera`, `selection` and `overlay`. Tools act on the context, not on the engine.

## Emitters

| Emitter | Payload | Fires when |
| --- | --- | --- |
| `documentReplaced` | `CanvasDocument` | `load` swaps in a new document. Renderers must resubscribe to the new document. |
| `toolChanged` | `Tool` | `setTool` installs a new tool. |
| `flushRequested` | none | Before undo, redo, a tool switch or a load. |

`flushRequested` exists because an input source may still be holding a lifted stroke. `PointerSession` waits a moment after pointer-up so Apple Pencil can deliver corrected samples. When the engine is about to undo, redo, switch tools or load, it emits `flushRequested` first so the input source can commit that stroke before the engine moves on. Subscribe to it from any input source that delays commit.

## Pointer forwarding

The engine does not interpret input. It forwards pointer events to the active tool and tracks one flag, `gestureActive`, so stray events outside a gesture are ignored.

- `pointerDown(e: PointerInput)` sets `gestureActive` and calls `tool.onDown(e, ctx)`.
- `pointerMove(e: PointerInput, predicted?: readonly PointerInput[])` calls `tool.onMove(e, ctx, predicted)` only while a gesture is active. `predicted` carries predicted samples, if the input source has them.
- `pointerUpdate(u: PointerSampleUpdate)` calls `tool.onSampleUpdate?.(u, ctx)` only while a gesture is active. This is how corrected values for an earlier sample reach the tool. `onSampleUpdate` is optional on `Tool`; tools that do not implement it get nothing.
- `pointerUp(e: PointerInput)` returns early if no gesture is active. Otherwise it clears `gestureActive` and calls `tool.onUp(e, ctx)`. If `onUp` throws, the engine calls `tool.onCancel(ctx)` and rethrows, so the tool is never left half-finished.

Callers must pair `pointerDown` with `pointerUp` or `cancelGesture`. A `pointerMove` or `pointerUpdate` with no active gesture is dropped.

## Gesture cancellation

`cancelGesture()` returns early if no gesture is active. Otherwise it clears `gestureActive` and calls `tool.onCancel(ctx)`. Call it when the input source loses the pointer.

The engine also cancels on its own. `setTool`, `undo`, `redo` and `load` all run the same two steps first: emit `flushRequested`, then `cancelGesture`. A gesture in progress at that moment is cancelled, not committed, unless the input source committed it in response to `flushRequested`.

## Tools

`setTool(tool: Tool)` emits `flushRequested`, cancels any gesture, stores the tool and emits `toolChanged`. The engine has no tool registry. The caller constructs the tool and hands it over. Each tool is described in [Tools](./tools.md).

## Undo and redo

`undo()` and `redo()` emit `flushRequested`, cancel any gesture, and then call `history.undo()` or `history.redo()`. Both return the boolean from `History`, so the caller can tell whether a step was applied. Tools record their changes through `history` in the `ToolContext`, which is what makes a gesture undoable. See [Commands](./commands.md).

## Save and load

`save()` returns `serializeDocument(doc)` as `DocumentJSON`. The camera is view state and is not part of the output. Selection and overlay are not saved either.

`load(json: DocumentJSON)` emits `flushRequested`, cancels any gesture, then:

1. replaces `doc` with `deserializeDocument(json)`;
2. replaces `history` with a new `History` for that document, so nothing from the previous document can be undone into the new one;
3. clears `selection` and `overlay`;
4. emits `documentReplaced` with the new document.

The camera is left as it was. The active tool is left as it was. Anything that subscribed to the old document must subscribe to the new one when `documentReplaced` fires. The file format itself is covered in [Files](./files.md).
