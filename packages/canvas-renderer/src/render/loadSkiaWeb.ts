/**
 * Wander — Zhich, Yu, Justin
 * Native version of ensureSkiaWeb: Skia is linked into the app binary, so
 * there is nothing to load. The web build uses loadSkiaWeb.web.ts instead.
 */

/** Resolves immediately on iOS and Android. */
export function ensureSkiaWeb(): Promise<void> {
  return Promise.resolve();
}
