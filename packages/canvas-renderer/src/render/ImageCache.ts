/**
 * Wander — Zhich, Yu, Justin
 * Loads page images (file, http or data URIs) into SkImages once each.
 * Loading is asynchronous: `get` returns null until the image is ready and
 * `loaded` fires so the renderer can redraw the pages that use it.
 */

import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Emitter } from '@wander/canvas-core';

/** Cache of decoded images keyed by URI. */
export class ImageCache {
  /** Fires with the URI of every image that finished loading. */
  readonly loaded = new Emitter<string>();
  private images = new Map<string, SkImage | 'loading' | 'failed'>();

  /** The decoded image for `uri`, or null while loading or after a failure. */
  get(uri: string): SkImage | null {
    const entry = this.images.get(uri);
    if (entry === undefined) {
      this.load(uri);
      return null;
    }
    return typeof entry === 'string' ? null : entry;
  }

  /** Starts decoding `uri` in the background. */
  private load(uri: string): void {
    this.images.set(uri, 'loading');
    Skia.Data.fromURI(uri)
      .then((data) => {
        const image = Skia.Image.MakeImageFromEncoded(data);
        this.images.set(uri, image ?? 'failed');
        if (image) this.loaded.emit(uri);
      })
      .catch(() => {
        this.images.set(uri, 'failed');
      });
  }
}
