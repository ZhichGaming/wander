# Wander canvas

The canvas library is three packages. The app imports them from `src/canvas-engine`.

```
app (src/)  →  @wander/canvas-renderer  →  @wander/canvas-core
               Skia, gestures, CanvasView    document, tools, undo
                        │
                        └── @wander/pencil-input
                            Apple Pencil on iOS
```

`canvas-core` holds the document and the rules. It does not import React Native. The renderer draws that state and turns touches into core calls. The pencil package is the native touch view. On web and Android it reports that Pencil input is unavailable.

## Guides

- [Packages and imports](./guides/packages.md)
- [Engine](./guides/engine.md)
- [Document model](./guides/document.md)
- [Commands and history](./guides/commands.md)
- [Tools and brushes](./guides/tools.md)
- [Input](./guides/input.md)
- [Rendering](./guides/rendering.md)
- [Save, load, and PDF](./guides/files.md)

The course architecture note stays in the repo at `packages/canvas-core/docs/ARCHITECTURE.md`. The generated API reference for `@wander/canvas-core` is at [/api/](/api/) after `npm run docs`.

## Run the docs

```bash
npm run docs
```

That generates `docs/public/api` with TypeDoc, then serves this site locally.
