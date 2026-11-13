# Save, load, and PDF

Three things leave the engine as files: the document as JSON, the document back in from JSON, and selected pages as an annotated PDF. The core never touches disk; the app passes bytes in and gets bytes or plain objects out.

## JSON save

`serializeDocument(doc: CanvasDocument): DocumentJSON` turns a document into a JSON-safe object. `CanvasEngine.save()` calls it on the current document.

```ts
interface DocumentJSON {
  format: 'wander-canvas';
  version: number;        // FORMAT_VERSION, currently 1
  background: BackgroundStyle;
  activeLayerId: string;
  layers: LayerJSON[];
}

interface LayerJSON extends LayerProps {   // name, visible, locked, opacity
  id: string;
  objects: ObjectJSON[];
}
```

Layers are written in document order. Each carries its id, its `LayerProps`, and one `ObjectJSON` record per object from `o.toJSON()`, in z-order. Every record has at least `kind` and `id`.

The camera is view state and is not saved; the engine source says so on `save()`. Selection, overlay, and undo history are not saved either. `DocumentJSON` has no field for any of them.

## JSON load

`deserializeDocument(json: DocumentJSON): CanvasDocument` rebuilds a document, in this order:

1. Throws `Not a Wander canvas file` if `format` is not `'wander-canvas'`.
2. Throws `Unsupported format version N` if `version` is greater than `FORMAT_VERSION`. Older versions load.
3. Creates a new `CanvasDocument`, which starts with one placeholder layer.
4. For each `LayerJSON`, constructs `new Layer(props, id)`, inserts each object via `objectFromJSON`, and adds the layer.
5. Removes the placeholder layer if the file had at least one layer.
6. Sets the active layer to `activeLayerId` if that layer exists.
7. Applies `background`.

Object and layer ids are preserved. `CanvasEngine.load(json)` wraps this and resets history, selection and overlay; see [Engine](./engine.md).

## Object factories

`objectFromJSON(json: ObjectJSON): CanvasObject` looks up a factory by `json.kind` and throws `Unknown object kind: X` if none is registered. Built in: `'stroke'` maps to `Stroke.fromJSON`, `'page'` to `PageObject.fromJSON`.

To add a kind, give its class a `toJSON()` that writes `kind` and `id`, a static `fromJSON`, and register it before any load:

```ts
registerObjectKind(kind: string, factory: ObjectFactory): void
type ObjectFactory = (json: ObjectJSON) => CanvasObject;
```

Registering an existing kind replaces the earlier factory. The serializer only calls `toJSON` on save and `objectFromJSON` on load, so it needs no change for a new kind.

## PageObject

`PageObject` is an imported PDF page or image placed on the canvas. It is immutable like `Stroke`; an edit returns a new object with the same id.

```ts
new PageObject(source: PageSource, rect: PageRect, imageUri: string, id?: string)
```

- `source` is `{ sourceId, fileName, kind: 'pdf' | 'image', pageIndex }`. `sourceId` is the key the app uses to find the original file again. `pageIndex` is 0-based and always 0 for images.
- `rect` is `{ x, y, width, height }` in world units, top-left plus size.
- `imageUri` is the rasterized image the renderer draws. The app's import step produces it; the core stores the string.

`label` is `"fileName, page N"` (1-based) for PDFs, or the file name for images. `transformed(m)` maps the corner through `m` and scales the size by the matrix's average scale; rotation and skew are ignored. `toJSON()` returns a `PageJSON` with `kind: 'page'`, `id`, `source`, `rect`, and `imageUri`.

## buildExportPlan

```ts
buildExportPlan(doc: CanvasDocument, pageIds: readonly string[]): ExportPlan
type ExportPlan = ExportPage[];
```

The plan is pure data with no PDF code. One `ExportPage` is produced per id, in the order given, with `pageId`, a copy of `source`, `imageUri`, the rect's `width` and `height`, and `annotations`. It throws `Not a page: id` if an id is not a `PageObject`.

Annotations per page:

1. Skip layers with `visible: false`.
2. Take every `Stroke` whose bounds intersect the page bounds.
3. Stable-sort by brush pass (highlighter before pen), so z-order holds within a pass.
4. Emit an `ExportAnnotation` per stroke: `outline` in page units (world units with the origin at the page's top-left, y down), `color`, `opacity` as stroke opacity times layer opacity, and the brush's `blendMode`.

Order is layer, then pass, then z. Strokes are not cut; the writer clips them.

## exportAnnotatedPdf

```ts
type BytesLoader = (key: string) => Promise<Uint8Array>;

exportAnnotatedPdf(plan: ExportPlan, loadSource: BytesLoader, loadImage?: BytesLoader): Promise<Uint8Array>
```

Writes one PDF with pdf-lib and returns its bytes. `loadSource` receives a `sourceId` and returns the original file. `loadImage`, when given, receives an image entry's `imageUri`; without it, image pages go through `loadSource(sourceId)`. Images must be PNG or JPEG; the PNG signature is checked, anything else is embedded as JPEG.

For each entry, in plan order:

1. If `source.kind` is `'pdf'`, load the source document once per `sourceId`, copy page `pageIndex` into the output, and add it. Text and vectors stay intact.
2. Otherwise embed the image and add a page sized to it, one pixel per point, with the image filling it.
3. Draw the annotations inside the page's crop box: push a graphics state, clip to the box, then for each annotation with at least three points draw a closed SVG path scaled by `box.width / entry.width` and `box.height / entry.height`, filled with the hex color (black if malformed), the annotation's opacity, and `Multiply` or `Normal` blend. The path is anchored at the box's top-left because `drawSvgPath` flips y, so outlines keep their y-down coordinates. Pop the graphics state.

The result is `out.save()`.
