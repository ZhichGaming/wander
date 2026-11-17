/**
 * Wander — Zhich, Yu, Justin
 * Layout boxes for generated ink. Text and math are laid out as boxes
 * holding marks: a glyph at a position and size, or a path such as a
 * fraction bar or a stretched bracket. Box units are x-heights with y up
 * and the origin on the baseline at the left edge; placeBox turns a box
 * into world coordinates, where the pen draws it.
 */

import { GLYPHS } from './glyphs';

/** A point in box units: x-heights, y up. */
export type BoxPoint = readonly [number, number];

/** Something to draw, in box units. */
export type BoxMark =
  | { kind: 'glyph'; char: string; x: number; y: number; scale: number }
  | { kind: 'path'; points: readonly BoxPoint[]; smooth?: boolean }
  /** Write the strokes held back so far (i dots, t bars) before going on. */
  | { kind: 'flush' };

/** A laid-out piece: its width, height above and depth below the baseline, and marks. */
export interface Box {
  w: number;
  up: number;
  down: number;
  marks: BoxMark[];
}

/** An empty box `w` wide. */
export function spaceBox(w: number): Box {
  return { w, up: 0, down: 0, marks: [] };
}

/** Height above and depth below the baseline of each glyph's control points, in x-heights. */
const glyphExtents = new Map<string, { up: number; down: number }>();

/** Extent of `char`'s glyph, or null when there is none. */
export function glyphExtent(char: string): { up: number; down: number } | null {
  const glyph = GLYPHS[char];
  if (!glyph) return null;
  let extent = glyphExtents.get(char);
  if (!extent) {
    let up = 0;
    let down = 0;
    for (const s of glyph.strokes) {
      for (const [, y] of s) {
        up = Math.max(up, y);
        down = Math.max(down, -y);
      }
    }
    extent = { up, down };
    glyphExtents.set(char, extent);
  }
  return extent;
}

/** One glyph at `scale` with letters `widthScale` wide, or null when `char` has none. */
export function glyphBox(char: string, scale: number, widthScale: number): Box | null {
  const glyph = GLYPHS[char];
  const extent = glyphExtent(char);
  if (!glyph || !extent) return null;
  return {
    w: glyph.adv * widthScale * scale,
    up: extent.up * scale,
    down: extent.down * scale,
    marks: [{ kind: 'glyph', char, x: 0, y: 0, scale }],
  };
}

/** `box` moved by (dx, dy). */
export function shiftBox(box: Box, dx: number, dy: number): Box {
  return {
    w: box.w,
    up: box.up + dy,
    down: box.down - dy,
    marks: box.marks.map((m) => shiftMark(m, dx, dy)),
  };
}

/** `mark` moved by (dx, dy). */
function shiftMark(m: BoxMark, dx: number, dy: number): BoxMark {
  if (m.kind === 'glyph') return { ...m, x: m.x + dx, y: m.y + dy };
  if (m.kind === 'path') return { ...m, points: m.points.map(([x, y]) => [x + dx, y + dy] as const) };
  return m;
}

/**
 * Boxes side by side on one baseline. `gaps[i]` is the space before
 * `boxes[i]` (gaps[0] is ignored).
 */
export function rowBox(boxes: readonly Box[], gaps: readonly number[] = []): Box {
  const marks: BoxMark[] = [];
  let x = 0;
  let up = 0;
  let down = 0;
  boxes.forEach((b, i) => {
    if (i > 0) x += gaps[i] ?? 0;
    for (const m of b.marks) marks.push(shiftMark(m, x, 0));
    x += b.w;
    up = Math.max(up, b.up);
    down = Math.max(down, b.down);
  });
  return { w: x, up, down, marks };
}

/** Several boxes drawn over one another, keeping all their marks in order. */
export function stackBox(w: number, parts: readonly Box[]): Box {
  return {
    w,
    up: Math.max(0, ...parts.map((p) => p.up)),
    down: Math.max(0, ...parts.map((p) => p.down)),
    marks: parts.flatMap((p) => p.marks),
  };
}

/** A path mark as a box of width `w`. */
export function pathBox(w: number, points: readonly BoxPoint[], smooth = false): Box {
  let up = 0;
  let down = 0;
  for (const [, y] of points) {
    up = Math.max(up, y);
    down = Math.max(down, -y);
  }
  return { w, up, down, marks: [{ kind: 'path', points, smooth }] };
}
