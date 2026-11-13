# Document model

`CanvasDocument` (in `packages/canvas-core/src/model/`) holds everything a drawing is made of: an ordered list of `Layer`s, the objects inside them, the background, and a spatial index over every object's bounds. Every mutation goes through a `CanvasDocument` method so the index and the `changed` emitter stay consistent with the layers.

## Layers and z-order

A `Layer` is an ordered list of `CanvasObject`s plus `LayerProps`: `name`, `visible`, `locked`, and `opacity` (0..1, applied to the whole layer). `layer.items` is the draw order inside the layer, bottom first. `doc.layers` is the layer order, also bottom to top. Together they define z-order: a later layer is above an earlier one, and a later object inside a layer is above an earlier one. `doc.allObjects()` walks both in draw order.

A new document has one layer, "Layer 1", which is also the active layer. `doc.activeLayer` is where new strokes go; `setActiveLayer(id)` changes it. The layer methods are `addLayer(layer, index?)`, `removeLayer(id)`, `moveLayer(id, toIndex)`, and `updateLayer(id, props)`. `removeLayer` refuses to remove the last layer and returns the layer with its old index so a command can put it back; `updateLayer` returns the previous values for the same reason.

`Layer.insert`, `Layer.removeAt`, and `Layer.replaceAt` are for `CanvasDocument` only; calling them directly leaves the spatial index stale.

## CanvasObject is immutable

`CanvasObject` is the abstract base for anything on the canvas: a stable `id`, a `kind` tag (`"stroke"`, `"page"`), a world-space `bounds` rect, `hitTest(p, radius)`, `transformed(m)`, and `toJSON()`.

Objects are never edited in place. `transformed(m)` returns a copy with the same id and the matrix applied. This keeps undo simple, because a command stores the object before and after, and it makes cached geometry safe: once an object computes its bounds or outline, nothing can invalidate them.

The object methods on the document are:

- `addObject(layerId, obj, index?)` — inserts, default on top. Throws on a duplicate id.
- `removeObject(id)` — returns an `ObjectLocation` (`layerId`, `index`, `object`) so the removal can be reversed.
- `replaceObject(obj)` — swaps in the object with `obj.id` and returns the old one. This is how a transform lands.
- `getObject(id)`, `layerOf(id)`, and `allObjects()` for reading.

Each of these emits a `DocumentChange` of kind `'objects'` listing `added`, `removed`, and `updated` ids for one layer. Layer and background edits emit `{ kind: 'layers' }` and `{ kind: 'background' }`. The renderer subscribes to `doc.changed` to know what to redraw.

## Stroke

`Stroke` is a freehand stroke: a `readonly points: StrokePoint[]` array and a `StrokeStyle`. A `StrokePoint` is `x`, `y`, `pressure` (0..1; 0.5 when the device reports none), `time` in milliseconds, and optional `tiltX`/`tiltY` in radians. `StrokeStyle` is `brush` (`'pen' | 'highlighter' | 'pencil'`), `color` as a CSS hex string, `width` as the base diameter in world units, and `opacity`. `DEFAULT_PEN_STYLE` and its highlighter and pencil siblings are frozen defaults.

The stroke does not store its drawn shape. `stroke.outline` asks the brush from the brush registry for the filled polygon and caches it; `stroke.bounds` is the points padded by the width, unioned with the outline bounds; `stroke.opacity` is the style opacity times the brush's opacity. `hitTest` checks distance to the centre line widened by half the width.

A stroke the partial eraser has cut is *baked*: `toBaked()` freezes the brush's centre line into `points` and sets `baked` (a `BakedInk`), after which `outline` goes through `freehandBakedOutline` instead of the brush, so the remaining ink stays exactly where it was. `withPoints(points, keepsEnd)` makes a copy with new points and a new id, used when a split produces two strokes. `toJSON()` packs points as `[x, y, pressure, time, ...]`, with optional `tilt`, `baked`, and `edges` arrays; `Stroke.fromJSON` reverses it.

## PageObject

`PageObject` is an imported page: one PDF page or a single image. It stores a `PageSource` (`sourceId`, `fileName`, `kind: 'pdf' | 'image'`, `pageIndex`), a `PageRect` (`x`, `y`, `width`, `height`), and the `imageUri` the renderer draws. `label` is the text drawn at the top-left, such as "lecture3.pdf, page 4". `transformed(m)` supports only translation and uniform scale; rotation and skew are ignored so the page stays axis-aligned. Import is covered in [files](./files.md).

## Background

The background is document data, not a layer. `BackgroundStyle` is `pattern` (`'blank' | 'grid' | 'dots' | 'lines'`), `spacing` in world units, `paperColor`, and `lineColor`. `DEFAULT_BACKGROUND` is white paper with a light grid at spacing 32. Read it with `doc.background`; replace it with `doc.setBackground(bg)`.

## Spatial index

`SpatialIndex` is an R-tree (rbush) over object bounds keyed by id, with `set(id, bounds)`, `delete(id)`, `search(rect)` (ids, unspecified order), `clear()`, and `size`. The document owns one and keeps it current inside `addObject`, `removeObject`, `replaceObject`, `addLayer`, and `removeLayer`.

Callers use it through `doc.queryRect(rect, opts)`, which returns the objects whose bounds intersect `rect` in draw order. By default it skips hidden layers and includes locked ones; `QueryOptions` has `includeHidden` and `includeLocked` to change that. It serves viewport culling, erasing, and lasso hit-tests, which narrow candidates before calling `hitTest`.

## Object registry

Loading does not know the concrete classes. `objectRegistry.ts` maps each `kind` to an `ObjectFactory` (`ObjectJSON` to `CanvasObject`); `stroke` and `page` are registered by default. `objectFromJSON(json)` looks up the factory and throws for an unregistered kind. A new object kind subclasses `CanvasObject`, implements `toJSON` and a `fromJSON`, and calls `registerObjectKind(kind, factory)`.

## Who calls what

Commands call the document methods above; app code should not. Call `history.execute(command)` so the edit is recorded and undoable; see [commands](./commands.md). Calling `doc.addObject` directly keeps the index and change events correct, but the edit is invisible to undo.
