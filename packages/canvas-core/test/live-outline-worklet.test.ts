/**
 * Wander — Zhich, Yu, Justin
 * Locks the live-ink worklet path to the shape that worked on iPad
 * (f5346d6). bb7f609 folded bake-only extra arguments, bitwise edge flags
 * and object-returning *Freehand helpers into those worklets; after the
 * first Pencil stroke the UI thread stopped delivering gesture callbacks
 * (no JS error, toolbar still worked). Node cannot run Hermes UI worklets,
 * so this file asserts the source shape plus that the JS bake helpers
 * still match the inlined live outline.
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getBrush } from '../src/brush/registry';
import { freehandOutline } from '../src/brush/freehand';
import { DEFAULT_HIGHLIGHTER_STYLE, DEFAULT_PEN_STYLE, DEFAULT_PENCIL_STYLE, type StrokePoint } from '../src/model/StrokeStyle';

const srcDir = join(process.cwd(), 'src/brush');

/** Reads a brush source file. */
function readBrush(name: string): string {
  return readFileSync(join(srcDir, name), 'utf8');
}

/** Slice of `src` from `startMarker` up to `endMarker`. */
function between(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** A short wavy stroke with pressure, long enough to skip the tap/dot path. */
function wave(n: number): StrokePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i * 4 + Math.sin(i * 0.4) * 2,
    y: 20 + Math.cos(i * 0.25) * 8,
    pressure: 0.4 + 0.3 * Math.abs(Math.sin(i / 5)),
    time: i * 8,
  }));
}

describe('live outline worklets stay bake-free', () => {
  it('keeps outlineOf a two-argument worklet with no edge flags', () => {
    const src = readBrush('freehand.ts');
    const live = between(src, 'function outlineOf(', 'export function freehandOutline');
    expect(live).toMatch(/^function outlineOf\(points: CentrePoint\[\], o: FreehandOptions\): P\[]/);
    expect(live).toContain("'worklet'");
    expect(live).not.toContain('edgesIn');
    expect(live).not.toContain('edgesOut');
    expect(live).not.toContain('EDGE_LEFT');
    expect(live).not.toContain('EDGE_RIGHT');
    expect(live).not.toContain('trimEnd');
  });

  it('calls outlineOf from freehandOutline with only the centre line and options', () => {
    const src = readBrush('freehand.ts');
    const fn = between(src, 'export function freehandOutline', 'function outlineWithEdges');
    expect(fn).toContain("'worklet'");
    expect(fn).toContain('outlineOf(centreLine(input, o), o)');
    expect(fn).not.toContain('null, null');
  });

  it('keeps edge recording in a non-worklet helper', () => {
    const src = readBrush('freehand.ts');
    const bake = between(src, 'function outlineWithEdges(', 'export interface BakedOptions');
    expect(bake).not.toContain("'worklet'");
    expect(bake).toContain('EDGE_LEFT');
    expect(bake).toContain('edgesIn');
  });

  it('does not call object-returning *Freehand helpers from live outline worklets', () => {
    const cases = [
      { file: 'PenBrush.ts', outline: 'export function penOutline', cls: 'export class PenBrush', helper: 'penFreehand(' },
      {
        file: 'HighlighterBrush.ts',
        outline: 'export function highlighterOutline',
        cls: 'export class HighlighterBrush',
        helper: 'highlighterFreehand(',
      },
      {
        file: 'PencilBrush.ts',
        outline: 'export function pencilOutline',
        cls: 'export class PencilBrush',
        helper: 'pencilFreehand(',
      },
    ] as const;
    for (const c of cases) {
      const src = readBrush(c.file);
      const outline = between(src, c.outline, c.cls);
      expect(outline, c.file).toContain("'worklet'");
      expect(outline, c.file).not.toContain(c.helper);
      const helper = between(src, `function ${c.helper}`, c.outline);
      expect(helper, c.file).not.toContain("'worklet'");
    }
  });
});

describe('inlined live outline matches bake freehand() helpers', () => {
  it.each([
    ['pen', DEFAULT_PEN_STYLE],
    ['highlighter', DEFAULT_HIGHLIGHTER_STYLE],
    ['pencil', DEFAULT_PENCIL_STYLE],
  ] as const)('%s outline equals freehandOutline of brush.freehand()', (kind, style) => {
    const brush = getBrush(kind);
    const points = wave(40);
    const live = brush.outline(points, style, true);
    const call = brush.freehand?.(points, style);
    expect(call).toBeTruthy();
    const fromCall = freehandOutline(call!.input, { ...call!.options });
    expect(live).toHaveLength(fromCall.length);
    live.forEach((p, i) => {
      expect(p.x).toBeCloseTo(fromCall[i].x, 9);
      expect(p.y).toBeCloseTo(fromCall[i].y, 9);
    });
  });
});
