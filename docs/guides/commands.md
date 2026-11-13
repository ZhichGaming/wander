# Commands and history

Every edit to a `CanvasDocument` is a `Command`. `History` runs commands against one document and keeps the undo and redo stacks. App code and tools never call `doc.addObject`, `doc.removeObject` or `doc.replaceObject` directly. They build a command and pass it to `history.execute`. If a change did not go through a command, undo does not know about it.

Source: `packages/canvas-core/src/commands/`.

## Command

```ts
abstract class Command {
  abstract readonly label: string;
  abstract do(doc: CanvasDocument): void;
  abstract undo(doc: CanvasDocument): void;
}
```

`label` is the short name shown on undo and redo buttons ("Draw", "Erase", "Move"). `do` applies the edit. `undo` reverts exactly what the last `do` changed. `do` is called again on redo, so it must be repeatable after an undo.

Commands do not compute inverse operations. In `do` they keep whatever the document returns (removed locations, replaced objects, previous props), and `undo` feeds those values back. `DeleteObjects` stores the `ObjectLocation` from `doc.removeObject`. `ReplaceObjects` stores the old objects from `doc.replaceObject`. `TransformObjects` computes the transformed copies once and reuses them on every redo. No command inverts a matrix or re-derives a stroke.

## CommandGroup

`CommandGroup` is a `Command` holding a list of `children`. `do` applies them in order; `undo` reverts them in reverse. `add(cmd)` appends a command that has already been applied, which is how `History` records an open group. One group is one undo step.

## History

`CanvasEngine` creates a `History` for the current document and exposes it as `engine.history`; tools get the same instance as `ctx.history`. The constructor takes the document and an optional `limit` (default 500 undo steps).

- `execute(cmd)` calls `cmd.do(doc)`, then records the command. If a group is open the command is added to it; otherwise it is pushed onto the undo stack, the redo stack is cleared, and the oldest step is dropped past `limit`.
- `undo()` pops the last step, calls its `undo`, and moves it to the redo stack. Returns `false` when there is nothing to undo.
- `redo()` pops the last undone step, calls its `do`, and moves it back. Returns `false` when there is nothing to redo.
- `beginGroup(label)` opens a `CommandGroup`. Every command executed until the matching `endGroup()` is recorded into it. Groups nest: an inner group is added to its parent on `endGroup`. Empty groups are dropped. `endGroup` without an open group throws.
- `group(label, fn)` wraps `fn` in `beginGroup` / `endGroup` with a `finally`, so the group closes even if `fn` throws.
- `clear()` forgets both stacks and any open groups. `CanvasEngine.load` builds a fresh `History` for the loaded document instead.
- `state` returns `{ canUndo, canRedo, undoLabel, redoLabel }`. The `changed` emitter fires with that state after every `execute`, `undo`, `redo` and `clear`, so a toolbar subscribes once.

`undo` and `redo` throw while a group is open. `CanvasEngine.undo` and `CanvasEngine.redo` cancel the active gesture first, which closes any open group.

`EraserTool` is the reference use of grouping. It calls `ctx.history.beginGroup('Erase')` on pointer down, executes one `DeleteObjects` or `SplitStroke` per sweep, and calls `ctx.history.endGroup()` on pointer up or cancel. A whole erase gesture is one undo step. The same pattern wraps a multi-command AI response.

## Object commands

`ObjectCommands.ts`:

- `CreateObjects(layerId, objects, label = 'Draw')` adds objects on top of one layer. Undo removes them in reverse order. `PenTool` executes one per finished stroke.
- `DeleteObjects(ids, label = 'Delete')` removes every listed object that exists and remembers each `ObjectLocation`. Undo re-inserts them at their original layer and index. `LassoTool` uses it to delete a selection.
- `ReplaceObjects(after, label = 'Edit')` swaps objects for new versions with the same ids and keeps the old versions for undo. This is the generic edit for any change to an immutable object.
- `TransformObjects(ids, matrix, label = 'Transform')` calls `transformed(matrix)` on each object and delegates to an inner `ReplaceObjects`. `LassoTool` executes one with a translation matrix and the label `'Move'` when a selection is dragged.

## Layer commands

`LayerCommands.ts`:

- `AddLayer(layer, index?)` inserts the layer (on top by default) and makes it active. Undo removes it and restores the previous active layer.
- `RemoveLayer(layerId)` removes a layer with its objects, remembering its index and whether it was active. Undo re-inserts it at the old position.
- `MoveLayer(layerId, toIndex)` reorders the layer stack and remembers the old index.
- `UpdateLayer(layerId, props)` changes name, visibility, lock or opacity through `doc.updateLayer`, which returns the previous values for undo.
- `SetBackground(next)` replaces the `BackgroundStyle`, keeping a copy of the old one.

## SplitStroke

`EraseCommands.ts` holds `SplitStroke(strokeId, pieces)`, used by the partial eraser. `do` removes the original stroke and inserts the pieces at the same layer and z index, bottom to top. The caller builds the pieces once with new ids, so redo reinstalls the same objects. Undo removes the pieces and puts the original back where it was.

A new command follows the same shape: subclass `Command`, change the document in `do` and keep what it returns, restore it in `undo`, and call `history.execute(new YourCommand(...))` from the tool or app code.
