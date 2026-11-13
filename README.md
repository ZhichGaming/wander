# Wander

A notebook that talks back. Stylus-first infinite canvas for iPad; lasso your handwriting and the AI answers in ink beside it.

Final project for 420-SNT-MS Object-Oriented Programming, Fall 2026. Team: Zhich, Yu, Justin.

## Run

```bash
npm install
npx expo start
```

Apple Pencil pressure and tilt come from a native module, so they need a development build (Expo Go still runs the app, without pressure or tilt): `npx expo run:ios` (Simulator or a cabled iPad) or `npx eas-cli@latest build --profile development`. Then scan the QR code with the Wander dev client. Press `w` for the web build (desktop fallback).

## Layout

| Path | What | Owner |
| --- | --- | --- |
| `packages/canvas-core/` | Engine core: document, camera, strokes, tools, undo, save/load, PDF export. Pure TypeScript, vitest. See `docs/ARCHITECTURE.md` there. | shared |
| `packages/canvas-renderer/` | Skia rendering, input, `CanvasView`. | shared |
| `packages/pencil-input/` | Native Swift touch view: Apple Pencil pressure, tilt, coalesced and predicted samples. | Zhich |
| `src/canvas-engine/` | The app's single import point for the engine. | shared |
| `src/harness/` | AI harness: lasso context, tool calling, streaming | Zhich |
| `src/sidebar/` | Sidebar chat | Yu |
| `src/ui/` | Tool switcher, pen settings, radial menu | Justin |
| `src/shell/` | Save, load, open and close canvases | Justin |
| `src/screens/` | Screen layouts | shared |

Every source file starts with a header naming the team and the file's purpose, and every function, method and class gets a docstring. Course requirement.

## Docs

`npm run docs` serves a local guide for the canvas library and generates the `@wander/canvas-core` API reference. The page map is `docs/STRUCTURE.md`.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npm test        # canvas-core unit tests
```
