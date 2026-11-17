/**
 * Wander — Zhich, Yu, Justin
 * Handwritten math: a LaTeX subset parsed and laid out as boxes.
 *
 * The subset covers what calculus and physics answers need: fractions,
 * superscripts and subscripts, roots, integrals, sums and products with
 * limits, lim, named functions (sin, ln...), Greek letters, operators and
 * relations, arrows, accents (vec, hat, bar, dot), stretchy brackets with
 * \left and \right, \text and spacing. Anything else is reported missing.
 *
 * Layout follows how people write math by hand rather than TeX's exact
 * rules: fractions are centred on the height of the minus sign, scripts are
 * about two thirds size, and limits go above and below sums and lim.
 */

import { glyphBox, pathBox, rowBox, shiftBox, spaceBox, stackBox, type Box, type BoxPoint } from './boxes';

/** What math layout needs from the caller. */
export interface MathContext {
  /** Letter width multiplier from the hand style. */
  widthScale: number;
  /** Collects characters and commands that could not be written. */
  missing: Set<string>;
}

/** Height of the fraction bar and the middle of = and +, in x-heights. */
const AXIS = 0.5;
/** Size of scripts and limits relative to their base. */
const SCRIPT = 0.65;
/** Smallest size anything shrinks to. */
const MIN_SCALE = 0.45;

// ---- parsing ---------------------------------------------------------------

type Token =
  | { t: 'cmd'; v: string }
  | { t: 'char'; v: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'sup' }
  | { t: 'sub' };

type MathNode =
  | { k: 'char'; c: string }
  | { k: 'group'; items: MathNode[] }
  | { k: 'frac'; num: MathNode; den: MathNode }
  | { k: 'sqrt'; body: MathNode; index?: MathNode }
  | { k: 'scripts'; base: MathNode; sup?: MathNode; sub?: MathNode }
  | { k: 'bigop'; op: 'int' | 'iint' | 'oint' | 'sum' | 'prod' | 'lim' }
  | { k: 'func'; name: string }
  | { k: 'delim'; left: string; right: string; body: MathNode }
  | { k: 'accent'; accent: 'vec' | 'hat' | 'bar' | 'dot' | 'ddot'; body: MathNode }
  | { k: 'text'; s: string }
  | { k: 'space'; w: number }
  | { k: 'missing'; what: string };

/** Command name to the character it writes. */
const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', eta: 'η',
  theta: 'θ', vartheta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', pm: '±', times: '×', div: '÷', cdot: '⋅',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', propto: '∝',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', Rightarrow: '⇒', implies: '⇒',
  hbar: 'ħ', degree: '°', circ: '°', prime: "'", lt: '<', gt: '>', mid: '|', vert: '|',
  '{': '{', '}': '}', '%': '%',
};

/** Functions written upright as words. */
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'max', 'min', 'det', 'deg',
]);

/** Spacing commands and their width in x-heights. */
const SPACES: Record<string, number> = { ',': 0.17, ':': 0.22, ';': 0.28, ' ': 0.3, quad: 1, qquad: 2, '!': -0.1 };

/** Characters that relate two sides; they get wide spacing. */
const RELATIONS = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '≡', '∝', '→', '←', '⇒', ':']);
/** Binary operators; they get medium spacing when they have something on the left. */
const BINARY = new Set(['+', '−', '±', '×', '÷', '⋅', '*']);

/** Every LaTeX command the math layout understands. */
export const MATH_COMMANDS: readonly string[] = [
  'frac', 'dfrac', 'tfrac', 'sqrt', 'int', 'iint', 'oint', 'sum', 'prod', 'lim',
  'left', 'right', 'vec', 'hat', 'bar', 'overline', 'dot', 'ddot', 'text', 'mathrm', 'mathbf', 'mathit',
  'operatorname', 'ldots', 'cdots', 'dots', ...Object.keys(SYMBOLS).filter((k) => /^[a-zA-Z]+$/.test(k)),
  ...FUNCTIONS, 'quad', 'qquad',
];

/** Splits LaTeX into tokens; whitespace is dropped except inside \text. */
function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const m = /^[a-zA-Z]+/.exec(src.slice(i + 1));
      if (m) {
        out.push({ t: 'cmd', v: m[0] });
        i += 1 + m[0].length;
        // \text keeps its raw argument, spaces included.
        if (m[0] === 'text' || m[0] === 'mathrm' || m[0] === 'operatorname') {
          const rest = src.slice(i).replace(/^\s*/, '');
          i = src.length - rest.length;
          if (rest[0] === '{') {
            const end = rest.indexOf('}');
            const body = end < 0 ? rest.slice(1) : rest.slice(1, end);
            out.push({ t: 'char', v: `\u0000${body}` });
            i += end < 0 ? rest.length : end + 1;
          }
        }
      } else if (i + 1 < src.length) {
        out.push({ t: 'cmd', v: src[i + 1] });
        i += 2;
      } else {
        i++;
      }
    } else if (c === '{') {
      out.push({ t: 'open' });
      i++;
    } else if (c === '}') {
      out.push({ t: 'close' });
      i++;
    } else if (c === '^') {
      out.push({ t: 'sup' });
      i++;
    } else if (c === '_') {
      out.push({ t: 'sub' });
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      out.push({ t: 'char', v: c === '-' ? '−' : c });
      i++;
    }
  }
  return out;
}

/** Recursive-descent parser over the tokens. */
class Parser {
  private i = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  /** The whole input. A stray closing brace or \right is skipped. */
  all(): MathNode {
    const items: MathNode[] = [];
    for (;;) {
      items.push(this.expression());
      if (this.i >= this.tokens.length) break;
      this.i++;
    }
    return items.length === 1 ? items[0] : { k: 'group', items };
  }

  /** Everything up to the end, a closing brace or \right. */
  expression(): MathNode {
    const items: MathNode[] = [];
    while (this.i < this.tokens.length) {
      const t = this.tokens[this.i];
      if (t.t === 'close') break;
      if (t.t === 'cmd' && t.v === 'right') break;
      items.push(this.scripted());
    }
    return { k: 'group', items };
  }

  /** One atom with any superscript and subscript after it. */
  private scripted(): MathNode {
    let node = this.atom();
    let sup: MathNode | undefined;
    let sub: MathNode | undefined;
    for (;;) {
      const t = this.tokens[this.i];
      if (t?.t === 'sup' && !sup) {
        this.i++;
        sup = this.argument();
      } else if (t?.t === 'sub' && !sub) {
        this.i++;
        sub = this.argument();
      } else {
        break;
      }
    }
    if (sup || sub) node = { k: 'scripts', base: node, sup, sub };
    return node;
  }

  /** A braced group or a single atom. */
  private argument(): MathNode {
    const t = this.tokens[this.i];
    if (t?.t === 'open') {
      this.i++;
      const e = this.expression();
      if (this.tokens[this.i]?.t === 'close') this.i++;
      return e;
    }
    return t ? this.atom() : { k: 'group', items: [] };
  }

  /** One thing without scripts. */
  private atom(): MathNode {
    const t = this.tokens[this.i++];
    if (!t) return { k: 'group', items: [] };
    if (t.t === 'char') {
      if (t.v.startsWith('\u0000')) return { k: 'text', s: t.v.slice(1) };
      return { k: 'char', c: t.v };
    }
    if (t.t === 'open') {
      const e = this.expression();
      if (this.tokens[this.i]?.t === 'close') this.i++;
      return e;
    }
    if (t.t === 'close' || t.t === 'sup' || t.t === 'sub') return { k: 'group', items: [] };
    return this.command(t.v);
  }

  /** A command and its arguments. */
  private command(name: string): MathNode {
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
        return { k: 'frac', num: this.argument(), den: this.argument() };
      case 'sqrt': {
        let index: MathNode | undefined;
        if (this.tokens[this.i]?.t === 'char' && (this.tokens[this.i] as { v: string }).v === '[') {
          this.i++;
          const items: MathNode[] = [];
          while (this.i < this.tokens.length) {
            const t = this.tokens[this.i];
            if (t.t === 'char' && t.v === ']') {
              this.i++;
              break;
            }
            items.push(this.scripted());
          }
          index = { k: 'group', items };
        }
        return { k: 'sqrt', body: this.argument(), index };
      }
      case 'int':
      case 'iint':
      case 'oint':
      case 'sum':
      case 'prod':
      case 'lim':
        return { k: 'bigop', op: name };
      case 'left': {
        const left = this.delimiter();
        const body = this.expression();
        let right = '.';
        if (this.tokens[this.i]?.t === 'cmd' && (this.tokens[this.i] as { v: string }).v === 'right') {
          this.i++;
          right = this.delimiter();
        }
        return { k: 'delim', left, right, body };
      }
      case 'vec':
      case 'hat':
      case 'bar':
      case 'dot':
      case 'ddot':
        return { k: 'accent', accent: name, body: this.argument() };
      case 'overline':
        return { k: 'accent', accent: 'bar', body: this.argument() };
      case 'mathbf':
      case 'mathit':
        return this.argument();
      case 'text':
      case 'mathrm':
      case 'operatorname': {
        // The tokenizer already turned the braced argument into one text token.
        const t = this.tokens[this.i];
        if (t?.t === 'char' && t.v.startsWith('\u0000')) {
          this.i++;
          return name === 'operatorname' ? { k: 'func', name: t.v.slice(1) } : { k: 'text', s: t.v.slice(1) };
        }
        return { k: 'group', items: [] };
      }
      case 'ldots':
      case 'dots':
        return { k: 'text', s: '...' };
      case 'cdots':
        return { k: 'group', items: [{ k: 'char', c: '⋅' }, { k: 'char', c: '⋅' }, { k: 'char', c: '⋅' }] };
    }
    if (name in SPACES) return { k: 'space', w: SPACES[name] };
    if (FUNCTIONS.has(name)) return { k: 'func', name };
    if (name in SYMBOLS) return { k: 'char', c: SYMBOLS[name] };
    return { k: 'missing', what: `\\${name}` };
  }

  /** The delimiter after \left or \right. */
  private delimiter(): string {
    const t = this.tokens[this.i++];
    if (!t) return '.';
    if (t.t === 'char') return t.v;
    if (t.t === 'cmd') return t.v === '{' || t.v === '}' ? t.v : t.v === 'vert' || t.v === '|' ? '|' : '.';
    return '.';
  }
}

// ---- layout ----------------------------------------------------------------

/** Lays LaTeX math `src` out as one box at size `scale` (1 is body text). */
export function layoutMath(src: string, scale: number, ctx: MathContext): Box {
  return layoutNode(new Parser(tokenize(src)).all(), scale, ctx);
}

/** Spacing class of a laid-out item, for the gaps between items. */
type SpaceClass = 'ord' | 'bin' | 'rel' | 'op' | 'punct' | 'open' | 'close';

function classOf(n: MathNode): SpaceClass {
  if (n.k === 'char') {
    if (RELATIONS.has(n.c)) return 'rel';
    if (BINARY.has(n.c)) return 'bin';
    if (n.c === ',' || n.c === ';') return 'punct';
    if (n.c === '(' || n.c === '[') return 'open';
    if (n.c === ')' || n.c === ']') return 'close';
  }
  if (n.k === 'bigop' || n.k === 'func') return 'op';
  if (n.k === 'scripts') {
    const base = classOf(n.base);
    return base === 'op' ? 'op' : 'ord';
  }
  return 'ord';
}

/** Gap between two items, in x-heights at `scale`. */
function gapBetween(prev: SpaceClass | null, cur: SpaceClass, scale: number): number {
  if (prev === null) return 0;
  const k = scale;
  if (cur === 'rel' || prev === 'rel') return 0.45 * k;
  // A binary operator after nothing useful (a leading minus) is written tight.
  if (cur === 'bin') return prev === 'ord' || prev === 'close' ? 0.32 * k : 0.04 * k;
  if (prev === 'bin') return 0.32 * k;
  if (prev === 'punct') return 0.35 * k;
  if (prev === 'op' || cur === 'op') return 0.18 * k;
  return 0.1 * k;
}

function layoutNode(n: MathNode, scale: number, ctx: MathContext): Box {
  const s = Math.max(MIN_SCALE, scale);
  switch (n.k) {
    case 'char':
      return charBox(n.c, s, ctx);
    case 'group': {
      const boxes: Box[] = [];
      const gaps: number[] = [];
      let prev: SpaceClass | null = null;
      for (const item of n.items) {
        let cls = classOf(item);
        // A binary operator with nothing before it is a sign: no space after either.
        if (cls === 'bin' && (prev === null || prev === 'open' || prev === 'rel' || prev === 'bin' || prev === 'punct')) cls = 'open';
        gaps.push(gapBetween(prev, cls, s));
        boxes.push(layoutNode(item, s, ctx));
        prev = cls;
      }
      return rowBox(boxes, gaps);
    }
    case 'text':
      return textBox(n.s, s, ctx);
    case 'func':
      return textBox(n.name, s, ctx);
    case 'space':
      return spaceBox(n.w * s);
    case 'missing':
      ctx.missing.add(n.what);
      return spaceBox(0.6 * s);
    case 'frac':
      return fraction(n.num, n.den, s, ctx);
    case 'sqrt':
      return root(n.body, n.index, s, ctx);
    case 'scripts':
      return scripts(n, s, ctx);
    case 'bigop':
      return bigOperator(n.op, s, ctx);
    case 'delim':
      return delimited(n.left, n.right, layoutNode(n.body, s, ctx), s);
    case 'accent':
      return accent(n.accent, layoutNode(n.body, s, ctx), s);
  }
}

/** A single character, or a gap when there is no glyph for it. */
function charBox(c: string, s: number, ctx: MathContext): Box {
  const box = glyphBox(c, s, ctx.widthScale);
  if (box) return box;
  ctx.missing.add(c);
  return spaceBox(0.6 * s);
}

/** Upright text (\text, function names): letters with a small gap, spaces as word gaps. */
function textBox(str: string, s: number, ctx: MathContext): Box {
  const boxes: Box[] = [];
  const gaps: number[] = [];
  let afterSpace = false;
  for (const c of str) {
    if (c === ' ') {
      afterSpace = true;
      continue;
    }
    gaps.push(boxes.length === 0 ? 0 : afterSpace ? 0.42 * s : 0.1 * s);
    boxes.push(charBox(c, s, ctx));
    afterSpace = false;
  }
  return rowBox(boxes, gaps);
}

/** Numerator over a bar over denominator, centred on the axis. */
function fraction(numNode: MathNode, denNode: MathNode, s: number, ctx: MathContext): Box {
  const k = Math.max(MIN_SCALE, s * 0.82);
  const num = layoutNode(numNode, k, ctx);
  const den = layoutNode(denNode, k, ctx);
  const pad = 0.14 * s;
  const w = Math.max(num.w, den.w) + 2 * pad;
  const axis = AXIS * s;
  const numBase = axis + 0.24 * s + num.down;
  const denBase = axis - 0.26 * s - den.up;
  const bar = pathBox(w, [[0.06 * s, axis], [w - 0.06 * s, axis]]);
  return stackBox(w, [
    shiftBox(num, (w - num.w) / 2, numBase),
    bar,
    shiftBox(den, (w - den.w) / 2, denBase),
  ]);
}

/** A radical sign drawn in one stroke over the body, with an optional index. */
function root(bodyNode: MathNode, indexNode: MathNode | undefined, s: number, ctx: MathContext): Box {
  const body = layoutNode(bodyNode, s, ctx);
  const top = Math.max(body.up, 1 * s) + 0.22 * s;
  const bottom = -Math.max(body.down, 0) - 0.05 * s;
  const index = indexNode ? layoutNode(indexNode, Math.max(MIN_SCALE, s * 0.55), ctx) : null;
  const lead = index ? Math.max(0, index.w - 0.25 * s) : 0;
  const start = 0.75 * s;
  const w = lead + start + body.w + 0.18 * s;
  const sign: BoxPoint[] = [
    [lead, 0.42 * s],
    [lead + 0.14 * s, 0.52 * s],
    [lead + 0.34 * s, bottom],
    [lead + 0.6 * s, top],
    [w - 0.05 * s, top],
  ];
  const parts = [pathBox(w, sign), shiftBox(body, lead + start, 0)];
  if (index) parts.unshift(shiftBox(index, 0, 0.62 * s + index.down));
  return stackBox(w, parts);
}

/** A base with a superscript and subscript to its right. */
function scripts(n: Extract<MathNode, { k: 'scripts' }>, s: number, ctx: MathContext): Box {
  if (n.base.k === 'bigop') return bigOperator(n.base.op, s, ctx, n.sup, n.sub);
  const base = layoutNode(n.base, s, ctx);
  const k = Math.max(MIN_SCALE, s * SCRIPT);
  const sup = n.sup ? layoutNode(n.sup, k, ctx) : null;
  const sub = n.sub ? layoutNode(n.sub, k, ctx) : null;
  const x = base.w + 0.05 * s;
  const parts = [base];
  let w = base.w;
  if (sup) {
    const raise = Math.max(0.8 * s, base.up - 0.4 * s) + sup.down;
    parts.push(shiftBox(sup, x + 0.04 * s, raise));
    w = Math.max(w, x + 0.04 * s + sup.w);
  }
  if (sub) {
    const drop = Math.max(0.3 * s, base.down + 0.15 * s);
    parts.push(shiftBox(sub, x, -drop));
    w = Math.max(w, x + sub.w);
  }
  return stackBox(w, parts);
}

/** Integrals, sums, products and lim, with their limits. */
function bigOperator(
  op: Extract<MathNode, { k: 'bigop' }>['op'],
  s: number,
  ctx: MathContext,
  supNode?: MathNode,
  subNode?: MathNode,
): Box {
  const k = Math.max(MIN_SCALE, s * SCRIPT);
  const sup = supNode ? layoutNode(supNode, k, ctx) : null;
  const sub = subNode ? layoutNode(subNode, k, ctx) : null;

  if (op === 'int' || op === 'iint' || op === 'oint') {
    const one = integralSign(s);
    const signs = op === 'iint' ? rowBox([one, integralSign(s)], [0, -0.25 * s]) : one;
    const parts = [signs];
    if (op === 'oint') {
      const ring: BoxPoint[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ring.push([0.3 * s + 0.2 * s * Math.cos(a), AXIS * s + 0.24 * s * Math.sin(a)]);
      }
      parts.push(pathBox(0, ring, true));
    }
    let w = signs.w;
    // Limits sit at the top and bottom right of the sign, as people write them.
    if (sup) {
      parts.push(shiftBox(sup, signs.w + 0.02 * s, 1.75 * s + sup.down));
      w = Math.max(w, signs.w + 0.02 * s + sup.w);
    }
    if (sub) {
      parts.push(shiftBox(sub, signs.w - 0.12 * s, -1.0 * s - sub.down + 0.1 * s));
      w = Math.max(w, signs.w - 0.12 * s + sub.w);
    }
    return stackBox(w + 0.05 * s, parts);
  }

  // Sum, product and lim: limits centred above and below.
  const sign =
    op === 'lim'
      ? textBox('lim', s, ctx)
      : shiftBox(charBox(op === 'sum' ? '∑' : '∏', s * 1.5, ctx), 0, -0.55 * s);
  const w = Math.max(sign.w, sup?.w ?? 0, sub?.w ?? 0);
  const parts = [shiftBox(sign, (w - sign.w) / 2, 0)];
  if (sup) parts.push(shiftBox(sup, (w - sup.w) / 2, sign.up + 0.25 * s + sup.down));
  if (sub) parts.push(shiftBox(sub, (w - sub.w) / 2, -(sign.down + 0.28 * s + sub.up)));
  return stackBox(w, parts);
}

/** An integral sign: a tall leaning S from below the baseline to above capital height. */
function integralSign(s: number): Box {
  const top = 2.1 * s;
  const bottom = -1.0 * s;
  const pts: BoxPoint[] = [
    [0.78 * s, top - 0.14 * s],
    [0.64 * s, top],
    [0.5 * s, top - 0.3 * s],
    [0.4 * s, (top + bottom) / 2],
    [0.3 * s, bottom + 0.3 * s],
    [0.16 * s, bottom],
    [0, bottom + 0.14 * s],
  ];
  return pathBox(0.82 * s, pts, true);
}

/** `body` between brackets stretched to its height. */
function delimited(left: string, right: string, body: Box, s: number): Box {
  const top = Math.max(body.up, 1.3 * s) + 0.12 * s;
  const bottom = -Math.max(body.down, 0.3 * s) - 0.12 * s;
  const l = bracket(left, top, bottom, s, false);
  const r = bracket(right, top, bottom, s, true);
  return rowBox([l, body, r], [0, 0.06 * s, 0.06 * s]);
}

/** One stretched bracket from `bottom` to `top`; `right` faces left. */
function bracket(kind: string, top: number, bottom: number, s: number, right: boolean): Box {
  const w = 0.42 * s;
  const mid = (top + bottom) / 2;
  let pts: BoxPoint[];
  let smooth = false;
  switch (kind) {
    case '(':
    case ')':
      pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push([0.32 * s - 0.24 * s * Math.sin(Math.PI * t), top - t * (top - bottom)]);
      }
      smooth = true;
      break;
    case '[':
    case ']':
      pts = [[0.32 * s, top], [0.1 * s, top], [0.1 * s, bottom], [0.32 * s, bottom]];
      break;
    case '{':
    case '}':
      pts = [
        [0.36 * s, top], [0.22 * s, top - 0.12 * s], [0.2 * s, mid + 0.18 * s],
        [0.05 * s, mid], [0.2 * s, mid - 0.18 * s], [0.22 * s, bottom + 0.12 * s], [0.36 * s, bottom],
      ];
      smooth = true;
      break;
    case '|':
      pts = [[0.2 * s, top], [0.2 * s, bottom]];
      break;
    default:
      return spaceBox(0);
  }
  if (right) pts = pts.map(([x, y]) => [w - x, y] as const);
  const box = pathBox(w, pts, smooth);
  return { ...box, up: Math.max(box.up, top), down: Math.max(box.down, -bottom) };
}

/** An accent drawn above `body`. */
function accent(kind: Extract<MathNode, { k: 'accent' }>['accent'], body: Box, s: number): Box {
  const y = Math.max(body.up, 1 * s) + 0.25 * s;
  const w = body.w;
  const cx = w / 2;
  const parts: Box[] = [body];
  switch (kind) {
    case 'vec': {
      const x0 = 0.02 * s;
      const x1 = Math.max(w, 0.6 * s) - 0.02 * s;
      parts.push(pathBox(w, [[x0, y], [x1, y]]));
      parts.push(pathBox(w, [[x1 - 0.26 * s, y + 0.17 * s], [x1, y], [x1 - 0.26 * s, y - 0.17 * s]]));
      break;
    }
    case 'hat':
      parts.push(pathBox(w, [[cx - 0.22 * s, y - 0.05 * s], [cx, y + 0.18 * s], [cx + 0.22 * s, y - 0.05 * s]]));
      break;
    case 'bar':
      parts.push(pathBox(w, [[0.04 * s, y], [Math.max(w, 0.5 * s) - 0.04 * s, y]]));
      break;
    case 'dot':
      parts.push(pathBox(w, [[cx - 0.03 * s, y], [cx + 0.05 * s, y + 0.05 * s]]));
      break;
    case 'ddot':
      parts.push(pathBox(w, [[cx - 0.2 * s, y], [cx - 0.12 * s, y + 0.05 * s]]));
      parts.push(pathBox(w, [[cx + 0.12 * s, y], [cx + 0.2 * s, y + 0.05 * s]]));
      break;
  }
  return stackBox(Math.max(w, kind === 'vec' ? 0.6 * s : w), parts);
}
