/**
 * Wander — Zhich, Yu, Justin
 * Seeded randomness for generated ink, so the same input and seed always
 * give the same strokes.
 */

/** A generator of numbers in [0, 1). */
export type Random = () => number;

/** Seeded generator (mulberry32). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly normal values with mean 0 and standard deviation about 0.4, from `random`. */
export function gaussian(random: Random): () => number {
  return () => (random() + random() + random() - 1.5) * 0.8;
}

/** A seed from text and numbers (FNV-1a). */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = typeof part === 'number' ? String(Math.round(part * 8)) : part;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x2c, 16777619);
  }
  return h >>> 0;
}
