# Wander

A notebook that talks back. Stylus-first infinite canvas for iPad; lasso your handwriting and the AI answers in ink beside it.

Final project for 420-SNT-MS Object-Oriented Programming, Fall 2026. Team: Zhich, Yu, Justin.

## Run

```bash
npm install
npx expo start
```

Scan the QR code with the Wander dev client on your iPad (not Expo Go, once native modules are added).

## Layout

| Path | What | Owner |
| --- | --- | --- |
| `src/canvas-engine/` | Rendering, camera, strokes, tools, undo, persistence. Treated as a library. | shared |
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
```
