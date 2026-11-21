/**
 * Wander — Zhich, Yu, Justin
 * Generated handwriting: lays text with inline math out as pen strokes
 * that look written by hand, so an agent can answer on the canvas in ink.
 *
 * Text is split into words and math. `$...$` is inline math and `$$...$$`
 * is display math on its own line, which may hold several rows aligned
 * with `&` and `\\` (see math.ts for the LaTeX subset); `\$` writes a
 * dollar sign. Words and inline math wrap at
 * `maxWidth`, `\n` starts a new line, and lines holding tall math get
 * extra room. The layout varies spacing and lets each line's baseline
 * drift and tilt a little; the pen (pen.ts) then draws every letter and
 * line with the variation, pressure and timing of a real hand.
 */

import type { Rect } from '../math/geometry';
import { Stroke } from '../model/Stroke';
import { DEFAULT_PEN_STYLE, type StrokePoint, type StrokeStyle } from '../model/StrokeStyle';
import { glyphBox, rowBox, shiftBox, spaceBox, type Box } from './boxes';
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
  /** Where a line written straight after this would start: the left edge and the next baseline. */
  nextLine: { x: number; baseline: number };
  /** The y just under the last line's descenders: the top edge for whatever is written below. */
  below: number;
  /** Number of lines written, counting wrapped lines, `\n` and display math. */
  lines: number;
}

/** Where and how to write. */
export interface HandwritingOptions {
  /** Left edge of the first letter, in world units. */
  x: number;
  /**
   * Baseline of the first line (the line letters sit on), in world units.
   * y grows downward. Give this or `top`.
   */
  baseline?: number;
  /**
   * Top edge of the first line instead of its baseline: the block's ink
   * starts at about this y, however tall the first line is (a fraction or
   * capitals reach higher than lowercase letters).
   */
  top?: number;
  /** Hand to write with; missing fields come from NEAT_HAND. */
  style?: Partial<HandStyle>;
  /** Wrap onto a new line past this width from `x` (default: never wrap). */
  maxWidth?: number;
  /**
   * Where display math sits: centred in `maxWidth` (the default, when there
   * is a `maxWidth`) or at the left edge, as people write working by hand.
   */
  displayAlign?: 'center' | 'left';
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
/** How far ordinary letters reach above and below the baseline, in x-heights. */
const ASCENT = 1.75;
const DESCENT = 0.7;
/**
 * How far a line reaches for spacing purposes: the ordinary letter reach
 * unless something clearly taller (math) is on it. Words vary a little in
 * size and height, and that must not make plain lines unevenly spaced.
 */
function reach(actual: number, ordinary: number): number {
  return actual > ordinary + 0.45 ? actual : ordinary;
}

/** How much a whole line slopes, and how much the rows of a stacked block differ, at messiness 0.5 (rise per unit run). */
const LINE_TILT = 0.026;
const ROW_TILT = 0.014;
/** How much a word's size and height on the line vary, at messiness 0.7 (fractions of the x-height). */
const WORD_SIZE_DRIFT = 0.07;
const WORD_LIFT = 0.13;
/** More room above and below display math, in x-heights. */
const DISPLAY_AIR = 0.6;
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
export function layoutHandwriting(input: string, opts: HandwritingOptions): Handwriting {
  const text = plainScripts(input);
  const style: HandStyle = { ...NEAT_HAND, ...opts.style };
  const S = style.xHeight;
  if (opts.baseline === undefined && opts.top === undefined) {
    throw new Error('layoutHandwriting needs a baseline or a top');
  }
  const seed = opts.seed ?? hashSeed(text, opts.x, opts.top ?? opts.baseline ?? 0);
  const random = seededRandom(seed);
  const gauss = gaussian(random);
  const m = style.messiness;
  const missing = new Set<string>();
  const maxWidth = opts.maxWidth ?? Infinity;
  const lineHeight = opts.lineHeight ?? Math.ceil(2.7 * S);

  // Break the text into lines of placed pieces (x in world units from opts.x).
  type Line = { items: { box: Box; x: number }[]; up: number; down: number; display?: boolean };
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

  // True right after display math, which already ended its line: a line
  // break written straight after it must not add an empty line.
  let afterDisplay = false;
  for (const piece of pieces(text, style, random, missing)) {
    if (piece === 'newline') {
      if (!afterDisplay) newLine();
      afterDisplay = false;
      continue;
    }
    const w = piece.box.w * S;
    if (piece.display) {
      if (current().items.length > 0) newLine();
      const centred = opts.displayAlign !== 'left' && Number.isFinite(maxWidth);
      place(piece.box, centred ? Math.max(0, (maxWidth - w) / 2) : 0);
      current().display = true;
      newLine();
      afterDisplay = true;
      continue;
    }
    afterDisplay = false;
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
    if (i === 0) baselines.push(opts.top !== undefined ? opts.top + reach(line.up, ASCENT) * S : (opts.baseline ?? 0));
    else {
      const prev = lines[i - 1];
      const air = LINE_CLEARANCE + (prev.display || line.display ? DISPLAY_AIR : 0);
      const needed = (reach(prev.down, DESCENT) + reach(line.up, ASCENT) + air) * S;
      baselines.push(baselines[i - 1] + Math.max(lineHeight, needed));
    }
  });

  // The baseline wanders along each line and each line tilts a little.
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  const wander = (dx: number) =>
    (Math.sin(dx / (S * 9) + phase1) * 0.11 + Math.sin(dx / (S * 3.3) + phase2) * 0.05) * S * (0.6 + m);

  const marks: PenMark[] = [];
  lines.forEach((line, i) => {
    // Lines climb or sink a little, each by its own amount. Rows stacked in one box
    // (aligned working) get their own slopes too, from how far down the box they are.
    const tilt = gauss() * LINE_TILT * (0.5 + m);
    const rowPhase = random() * Math.PI * 2;
    const drift = (wx: number, down: number) =>
      wander(wx - opts.x) + (wx - opts.x) * (tilt + Math.sin(down / (S * 2.6) + rowPhase) * ROW_TILT * (0.5 + m));
    for (const item of line.items) {
      marks.push(...placeBox(item.box, opts.x + item.x, baselines[i], S, drift));
      marks.push({ kind: 'flush' });
    }
  });

  const pen = new Pen(style, seededRandom(seed ^ 0x9e3779b9), opts.startTime);
  pen.drawAll(marks);
  const lastBaseline = baselines[baselines.length - 1];
  const lastLine = lines[lines.length - 1];
  return {
    strokes: pen.strokes,
    bounds: pen.bounds,
    duration: pen.duration,
    missing: [...missing],
    end: { x: opts.x + penX, baseline: lastBaseline },
    nextLine: { x: opts.x, baseline: lastBaseline + lineHeight },
    below: lastBaseline + Math.max(lastLine.down, DESCENT) * S,
    lines: lines.length,
  };
}

/**
 * Stroke objects for `ink`, drawn with `style` (default: the pen) and
 * optionally sharing a `group` id. Add them with CreateObjects, or use
 * writeInk, which also groups them and reveals them as writing.
 */
export function inkStrokes(ink: Ink, style: StrokeStyle = DEFAULT_PEN_STYLE, group?: string): Stroke[] {
  return ink.strokes.map((points) => new Stroke(points, style, undefined, undefined, group));
}

/**
 * World pen marks for `box` with its origin at (`x`, `baseline`) and one
 * box unit equal to `S` world units. `drift(x, down)` moves the baseline at
 * world x for a mark `down` world units below the box's baseline.
 */
export function placeBox(
  box: Box,
  x: number,
  baseline: number,
  S: number,
  drift: (x: number, down: number) => number = () => 0,
): PenMark[] {
  return box.marks.map((mk): PenMark => {
    if (mk.kind === 'glyph') {
      const gx = x + mk.x * S;
      return { kind: 'glyph', char: mk.char, x: gx, y: baseline - mk.y * S + drift(gx, -mk.y * S), size: mk.scale * S };
    }
    if (mk.kind === 'path') {
      return {
        kind: 'path',
        smooth: mk.smooth,
        points: mk.points.map(([px, py]) => {
          const wx = x + px * S;
          return { x: wx, y: baseline - py * S + drift(wx, -py * S) };
        }),
      };
    }
    return mk;
  });
}

const SUPERSCRIPTS = '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b';
const SUBSCRIPTS = '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208a\u208b';
const SCRIPT_PLAIN = '0123456789+-';

/**
 * `text` with Unicode superscript and subscript characters (as in x\u00b2 or
 * H\u2082O) rewritten as ^{...} and _{...}. Outside math, the word holding
 * them becomes inline math, so they are written raised or lowered instead
 * of being reported missing. Models type these characters often.
 */
function plainScripts(text: string): string {
  const has = (s: string) => [...s].some((c) => SUPERSCRIPTS.includes(c) || SUBSCRIPTS.includes(c));
  if (!has(text)) return text;
  /** Runs of script characters as ^{...} or _{...}. */
  const convert = (s: string): string => {
    let out = '';
    let run = '';
    let kind = '';
    const flush = () => {
      if (run) out += `${kind}{${run}}`;
      run = '';
      kind = '';
    };
    for (const c of s) {
      const sup = SUPERSCRIPTS.indexOf(c);
      const sub = SUBSCRIPTS.indexOf(c);
      const k = sup >= 0 ? '^' : sub >= 0 ? '_' : '';
      if (k === '') {
        flush();
        out += c;
        continue;
      }
      if (k !== kind) flush();
      kind = k;
      run += SCRIPT_PLAIN[sup >= 0 ? sup : sub];
    }
    flush();
    return out;
  };
  // Math stays math; outside it, each word with a script in it is wrapped as inline math.
  return text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/)
    .map((part, i) => {
      if (i % 2 === 1) return convert(part);
      return part
        .split(/(\s+)/)
        .map((word) => {
          if (!has(word)) return word;
          let end = word.length;
          while (end > 0 && '?.,;:!'.includes(word[end - 1])) end--;
          return `$${convert(word.slice(0, end))}$${word.slice(end)}`;
        })
        .join('');
    })
    .join('');
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
  const gauss = gaussian(random);
  let i = 0;
  let spaced = true;
  let word = '';
  function* endWord(): Generator<Piece> {
    if (word) {
      // Each word is its own size and sits a little above or below the line, as in real writing.
      const size = 1 + gauss() * WORD_SIZE_DRIFT * (0.3 + style.messiness);
      const lift = gauss() * WORD_LIFT * (0.3 + style.messiness);
      yield { box: shiftBox(wordBox(word, style, random, missing, size), 0, lift), join: spaced ? 'word' : 'tight' };
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
      const box = layoutMath(src, 1 + gauss() * WORD_SIZE_DRIFT * (0.3 + style.messiness), ctx);
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
