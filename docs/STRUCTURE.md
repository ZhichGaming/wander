# Canvas docs structure

Local site for the canvas library. `npm run docs` generates the API reference, then serves this folder.

The course architecture note stays at `packages/canvas-core/docs/ARCHITECTURE.md`. These pages are the readable guide. They describe the code as it is. They do not add a new API.

## How it is built

| Piece | Tool | Output |
| --- | --- | --- |
| Guides in `docs/guides/` | written markdown | VitePress pages |
| Home page `docs/index.md` | written markdown | VitePress home |
| Public exports of `@wander/canvas-core` | TypeDoc | `docs/public/api/` (generated, not committed) |

`@wander/canvas-renderer` and `@wander/pencil-input` are explained in the guides. They are not a second generated API, because the renderer re-exports the whole core and the pencil package is a native view.

## Pages

1. `docs/index.md` — what the library is, the package diagram, links to every guide, link to the generated API.
2. `docs/guides/packages.md` — `canvas-core`, `canvas-renderer`, `pencil-input`, and `src/canvas-engine` as the app import. Dependency direction. What must not be imported from where.
3. `docs/guides/engine.md` — `CanvasEngine`: document, history, camera, selection, overlay, active tool, pointer forwarding, undo, redo, save, load.
4. `docs/guides/document.md` — `CanvasDocument`, `Layer`, `CanvasObject`, `Stroke`, stroke style, `PageObject`, background, spatial index, object registry. Mutations go through the document. Objects are immutable.
5. `docs/guides/commands.md` — `Command`, `CommandGroup`, `History`, object commands, layer commands, `SplitStroke`. Undo stores before and after. Call `history.execute`, not `doc.addObject`, from app code.
6. `docs/guides/tools.md` — input `Tool` (pen, eraser, lasso), `Overlay`, `Selection`, brushes and the brush registry. Tools act through commands. This is not the AI harness `Tool` class.
7. `docs/guides/input.md` — `PointerSession`, `InputMode`, wheel and pinch, Apple Pencil events from `@wander/pencil-input`, and what Expo Go cannot report.
8. `docs/guides/rendering.md` — `CanvasView`, camera transform, scene cache, live ink on the UI thread, web CanvasKit.
9. `docs/guides/files.md` — JSON save and load, `PageObject`, `buildExportPlan`, `exportAnnotatedPdf`.

## Voice

- Name the real classes and methods.
- Say what the caller does, then the one or two rules that keep undo and rendering correct.
- Do not invent methods, options, or future features.
- Do not restate the same design point on every page.
