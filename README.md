# Wander

A notebook that talks back. Stylus-first infinite canvas for iPad; lasso your handwriting and the AI answers in ink beside it.

Final project for 420-SNT-MS Object-Oriented Programming, Fall 2026. Team: Zhich, Yu, Justin.

## Run

```bash
npm install
npx expo start
```

Scan the QR code with the Wander dev client on your iPad. Press `w` for the web build (desktop fallback).

## Layout

| Path | What | Owner |
| --- | --- | --- |
| `packages/canvas-core/` | Engine core: document, camera, strokes, tools, undo, save/load, PDF export. Pure TypeScript, vitest. See `docs/ARCHITECTURE.md` there. | shared |
| `packages/canvas-renderer/` | Skia rendering, input, `CanvasView`. | shared |
| `src/canvas-engine/` | The app's single import point for the engine. | shared |
| `src/harness/` | AI harness: lasso context, tool calling, streaming | Zhich |
| `src/sidebar/` | Sidebar chat | Yu |
| `src/ui/` | Tool switcher, pen settings, radial menu | Justin |
| `src/shell/` | Save, load, open and close canvases | Justin |
| `src/screens/` | Screen layouts | shared |

Every source file starts with a header naming the team and the file's purpose, and every function, method and class gets a docstring. Course requirement.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npm test        # canvas-core unit tests
```
