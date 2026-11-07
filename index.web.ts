/**
 * Wander — Zhich, Yu, Justin
 * Web entry point. React Native Skia on web needs CanvasKit (Skia as
 * WebAssembly) loaded before any module that imports Skia is evaluated, so
 * this loads it first and only then imports the app. Native platforms use
 * index.ts.
 */

import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { ensureSkiaWeb } from '@wander/canvas-renderer/src/render/loadSkiaWeb';

ensureSkiaWeb().then(async () => {
  const { default: App } = await import('./App');
  registerRootComponent(App);
});
