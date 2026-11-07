/**
 * Wander — Zhich, Yu, Justin
 * Web version of ensureSkiaWeb. React Native Skia on web draws with
 * CanvasKit (Skia compiled to WebAssembly), and its `Skia` object is
 * created from the global CanvasKit when the library module is first
 * evaluated. So CanvasKit must be loaded before ANY module that imports
 * '@shopify/react-native-skia' (including CanvasView) is evaluated: the app
 * entry awaits this and then imports the rest with a dynamic import().
 *
 * This file deliberately imports only the web loader subpath, never the
 * main Skia entry. canvaskit.wasm is served from the site root: copy it to
 * public/ with `npx setup-skia-web public`.
 */

import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/** Loads CanvasKit once; later calls resolve immediately. */
export function ensureSkiaWeb(): Promise<void> {
  return LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
}
