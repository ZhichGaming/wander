/**
 * Wander — Zhich, Yu, Justin
 * Generated handwriting: lays text with inline math out as pen strokes
 * that look written by hand, so an agent can answer on the canvas in ink.
 *
 * Text is split into words and math. `$...$` is inline math and `$$...$$`
 * is display math on its own centred line (see math.ts for the LaTeX
 * subset); `\$` writes a dollar sign. Words and inline math wrap at
 * `maxWidth`, `\n` starts a new line, and lines holding tall math get
 * extra room. The layout varies spacing and lets each line's baseline
 * drift and tilt a little; the pen (pen.ts) then draws every letter and
 * line with the variation, pressure and timing of a real hand.
 */

import type { Rect } from '../math/geometry';
import { Stroke } from '../model/Stroke';
import { DEFAULT_PEN_STYLE, type StrokePoint, type StrokeStyle } from '../model/StrokeStyle';
import { glyphBox, rowBox, spaceBox, type Box } from './boxes';
import { GLYPHS } from './glyphs';
import { layoutMath } from './math';
import { Pen, type PenMark } from './pen';
import { gaussian, hashSeed, seededRandom, type Random } from './random';
import { NEAT_HAND, type HandStyle } from './style';

/** Generated ink: strokes in drawing order with pressure and time. */
export interface Ink {
  /** Strokes in drawing order. Points are world units with pressure and increasing time. */
  strokes: StrokePoint[][];
  /** Bounds of the stroke centre lines (add the pen width for the drawn ink). */
  bounds: Rect;
  /** Milliseconds from the start time to the last point. */
  duration: number;
  /** Characters and LaTeX commands that could not be drawn, each listed once. They are left as a gap. */
  missing: string[];
}

/** Text laid out as handwriting. */
export interface Handwriting extends Ink {
  /** Pen position after the last word: where to continue writing on the same line. */
  end: { x: number; baseline: number };
  /** Number of lines written, counting wrapped lines, `\n` and display math. */
  lines: number;
}

/** Where and how to write. */
export interface HandwritingOptions {
  /** Left edge of the first letter, in world units. */
  x: number;
  /** Baseline of the first line (the line letters sit on), in world units. y grows downward. */
  baseline: number;
  /** Hand to write with; missing fields come from NEAT_HAND. */
  style?: Partial<HandStyle>;
  /** Wrap onto a new line past this width from `x`, and centre display math in it (default: never wrap). */
  maxWidth?: number;
  /**
   * Smallest distance between baselines (default 2.7 x-heights). Lines
   * holding tall math, such as fractions, get more.
   */
  lineHeight?: number;
  /** Seed for the variation. The same input and seed give the same strokes. Default: from the text and position. */
  seed?: number;
  /** Time of the first point, in milliseconds (default 0). */
  startTime?: number;
}

/** Characters with a glyph, besides space and newline. */
export const HANDWRITING_CHARACTERS: string = Object.keys(GLYPHS).join('');

/** Width given to a character with no glyph, in x-heights. */
const MISSING_ADVANCE = 0.6;
/** Extra room between lines whose contents would otherwise touch, in x-heights. */
const LINE_CLEARANCE = 0.4;

/** A word or a piece of math, and how it joins the one before it. */
interface Piece {
  box: Box;
  /** `word`: a space came before it; `tight`: nothing did (punctuation after math). */
  join: 'word' | 'tight';
  display?: boolean;
}

/**
 * Lays `text` (with `$...$` inline and `$$...$$` display math) out as
 * handwritten pen strokes starting at (`x`, `baseline`).
 */
export function layoutHandwriting(text: string, opts: HandwritingOptions): Handwriting {
  const style: HandStyle = { ...NEAT_HAND, ...opts.style };
  const S = style.xHeight;
  const seed = opts.seed ?? hashSeed(text, opts.x, opts.baseline);
  const random = seededRandom(seed);
  const gauss = gaussian(random);
  const m = style.messiness;
  const missing = new Set<string>();
  const maxWidth = opts.maxWidth ?? Infinity;
  const lineHeight = opts.lineHeight ?? Math.ceil(2.7 * S);

  // Break the text into lines of placed pieces (x in world units from opts.x).
  type Line = { items: { box: Box; x: number }[]; up: number; down: number };
  const lines: Line[] = [{ items: [], up: 0, down: 0 }];
  let penX = 0;
  const current = () => lines[lines.length - 1];
  const newLine = () => {
    lines.push({ items: [], up: 0, down: 0 });
    penX = 0;
  };
  const place = (box: Box, x: number) => {
    const line = current();
    line.items.push({ box, x });
    line.up = Math.max(line.up, box.up);
    line.down = Math.max(line.down, box.down);
  };

  for (const piece of pieces(text, style, random, missing)) {
    if (piece === 'newline') {
      newLine();
      continue;
    }
    const w = piece.box.w * S;
    if (piece.display) {
      if (current().items.length > 0) newLine();
      place(piece.box, Number.isFinite(maxWidth) ? Math.max(0, (maxWidth - w) / 2) : 0);
      newLine();
      continue;
    }
    const first = current().items.length === 0;
    // A space is the gap after a letter plus the word gap, as in running handwriting.
    let gap = first
      ? 0
      : (piece.join === 'word' ? style.letterGap + style.wordGap + gauss() * 0.06 * (0.5 + m) : style.letterGap) * S;
    if (!first && penX + gap + w > maxWidth) {
      newLine();
      gap = 0;
    }
    penX += gap;
    place(piece.box, penX);
    penX += w;
  }
  // A trailing display line leaves an empty line behind it; drop it so `end` sits after the math.
  const trailingDisplay = lines.length > 1 && current().items.length === 0 && penX === 0 && !text.endsWith('\n');
  if (trailingDisplay) {
    lines.pop();
    const last = current().items[current().items.length - 1];
    penX = last ? last.x + last.box.w * S : 0;
  }

  // Baselines: at least lineHeight apart, more when tall math would touch the line above.
  const baselines: number[] = [];
  lines.forEach((line, i) => {
    if (i === 0) baselines.push(opts.baseline);
    else {
      const prev = lines[i - 1];
      const needed = (Math.max(prev.down, 0.7) + Math.max(line.up, 1.75) + LINE_CLEARANCE) * S;
      baselines.push(baselines[i - 1] + Math.max(lineHeight, needed));
    }
  });

  // The baseline wanders along each line and each line tilts a little.
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  const wander = (dx: number) =>
    (Math.sin(dx / (S * 9) + phase1) * 0.07 + Math.sin(dx / (S * 3.3) + phase2) * 0.035) * S * (0.6 + m);

  const marks: PenMark[] = [];
  lines.forEach((line, i) => {
    const tilt = gauss() * 0.012 * (0.5 + m);
    const drift = (wx: number) => wander(wx - opts.x) + (wx - opts.x) * tilt;
    for (const item of line.items) {
      marks.push(...placeBox(item.box, opts.x + item.x, baselines[i], S, drift));
      marks.push({ kind: 'flush' });
    }
  });

  const pen = new Pen(style, seededRandom(seed ^ 0x9e3779b9), opts.startTime);
  pen.drawAll(marks);
  return {
    strokes: pen.strokes,
    bounds: pen.bounds,
    duration: pen.duration,
    missing: [...missing],
    end: { x: opts.x + penX, baseline: baselines[baselines.length - 1] },
    lines: lines.length,
  };
}

/** Stroke objects for `ink`, drawn with `style` (default: the pen). Add them with CreateObjects. */
export function inkStrokes(ink: Ink, style: StrokeStyle = DEFAULT_PEN_STYLE): Stroke[] {
  return ink.strokes.map((points) => new Stroke(points, style));
}

/**
 * World pen marks for `box` with its origin at (`x`, `baseline`) and one
 * box unit equal to `S` world units. `drift(x)` moves the baseline at world x.
 */
export function placeBox(box: Box, x: number, baseline: number, S: number, drift: (x: number) => number = () => 0): PenMark[] {
  return box.marks.map((mk): PenMark => {
    if (mk.kind === 'glyph') {
      const gx = x + mk.x * S;
      return { kind: 'glyph', char: mk.char, x: gx, y: baseline - mk.y * S + drift(gx), size: mk.scale * S };
    }
    if (mk.kind === 'path') {
      return {
        kind: 'path',
        smooth: mk.smooth,
        points: mk.points.map(([px, py]) => {
          const wx = x + px * S;
          return { x: wx, y: baseline - py * S + drift(wx) };
        }),
      };
    }
    return mk;
  });
}

/** A word of text as a box, letters spaced with a little variation. */
export function wordBox(word: string, style: HandStyle, random: Random, missing: Set<string>, scale = 1): Box {
  const gauss = gaussian(random);
  const boxes: Box[] = [];
  const gaps: number[] = [];
  for (const ch of word) {
    gaps.push(boxes.length === 0 ? 0 : style.letterGap * scale * (1 + gauss() * 0.4 * (0.4 + style.messiness)));
    const box = glyphBox(ch, scale, style.width);
    if (box) boxes.push(box);
    else {
      missing.add(ch);
      boxes.push(spaceBox(MISSING_ADVANCE * style.width * scale));
    }
  }
  return rowBox(boxes, gaps);
}

/** The words, math and line breaks of `text`, in order. */
function* pieces(text: string, style: HandStyle, random: Random, missing: Set<string>): Generator<Piece | 'newline'> {
  const ctx = { widthScale: style.width, missing };
  let i = 0;
  let spaced = true;
  let word = '';
  function* endWord(): Generator<Piece> {
    if (word) {
      yield { box: wordBox(word, style, random, missing), join: spaced ? 'word' : 'tight' };
      word = '';
      spaced = false;
    }
  }
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '$') {
      word += '$';
      i += 2;
    } else if (c === '$') {
      yield* endWord();
      const display = text[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = text.indexOf(display ? '$$' : '$', i + open);
      const src = close < 0 ? text.slice(i + open) : text.slice(i + open, close);
      i = close < 0 ? text.length : close + open;
      const box = layoutMath(src, 1, ctx);
      if (box.marks.length > 0) yield { box, join: spaced ? 'word' : 'tight', display };
      spaced = false;
    } else if (c === '\n') {
      yield* endWord();
      yield 'newline';
      spaced = true;
      i++;
    } else if (/\s/.test(c)) {
      yield* endWord();
      spaced = true;
      i++;
    } else {
      word += c;
      i++;
    }
  }
  yield* endWord();
}
