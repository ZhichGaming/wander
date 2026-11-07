/**
 * Wander — Zhich, Yu, Justin
 * Tests that the vendored worklet copy of perfect-freehand produces the
 * same outline as the library for the options Wander's brushes use.
 */

import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import { freehandOutline, type FreehandOptions } from '../src/brush/freehand';

/** Deterministic pseudo-random wavy stroke with varying pressure. */
function stroke(n: number, seed: number): { x: number; y: number; pressure: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i * 3 + Math.sin(i * 0.7 + seed) * 2,
    y: 40 * Math.sin(i / 9 + seed) + Math.cos(i * 1.3) * 1.5,
    pressure: 0.3 + 0.5 * Math.abs(Math.sin(i / 7 + seed)),
  }));
}

const CASES: FreehandOptions[] = [
  { size: 3, thinning: 0.6, smoothing: 0.5, streamline: 0.45, capStart: true, capEnd: true, last: true },
  { size: 3, thinning: 0.6, smoothing: 0.5, streamline: 0.45, capStart: true, capEnd: true, last: false },
  { size: 18, thinning: 0, smoothing: 0.5, streamline: 0.5, capStart: false, capEnd: false, last: true },
  { size: 7.5, thinning: 1, smoothing: 0.6, streamline: 0.4, capStart: true, capEnd: true, last: true },
];

describe('vendored freehand outline', () => {
  CASES.forEach((o, k) => {
    it(`matches perfect-freehand (case ${k})`, () => {
      for (const n of [1, 5, 40, 300]) {
        const input = stroke(n, k + n);
        const ours = freehandOutline(input, o);
        const theirs = getStroke(input, {
          size: o.size,
          thinning: o.thinning,
          smoothing: o.smoothing,
          streamline: o.streamline,
          simulatePressure: false,
          start: { cap: o.capStart },
          end: { cap: o.capEnd },
          last: o.last,
        });
        expect(ours.length).toBe(theirs.length);
        ours.forEach((p, i) => {
          expect(p.x).toBeCloseTo(theirs[i][0], 9);
          expect(p.y).toBeCloseTo(theirs[i][1], 9);
        });
      }
    });
  });
});
