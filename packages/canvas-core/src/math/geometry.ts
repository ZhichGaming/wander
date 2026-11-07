/**
 * Wander — Zhich, Yu, Justin
 * Geometry primitives shared by the whole engine: points, axis-aligned
 * rectangles and 2D affine matrices. Plain data plus pure functions so they
 * can also be used from worklets and serialized without conversion.
 */

/** A point or vector in 2D. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle given by its min and max corners. */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 2D affine matrix in the SVG/Canvas layout:
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** The identity matrix. */
export const IDENTITY: Readonly<Matrix> = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** Rectangle that contains nothing; unioning with it returns the other rect. */
export function emptyRect(): Rect {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

/** True when the rectangle contains no area and no point. */
export function isEmptyRect(r: Rect): boolean {
  return r.minX > r.maxX || r.minY > r.maxY;
}

/** Smallest rectangle containing both inputs. */
export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Rectangle grown by `pad` on every side. */
export function inflateRect(r: Rect, pad: number): Rect {
  return { minX: r.minX - pad, minY: r.minY - pad, maxX: r.maxX + pad, maxY: r.maxY + pad };
}

/** True when the two rectangles overlap or touch. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** True when point `p` lies inside or on the edge of `r`. */
export function rectContainsPoint(r: Rect, p: Vec2): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}

/** Bounding rectangle of a list of points; empty for an empty list. */
export function boundsOfPoints(points: readonly Vec2[]): Rect {
  const r = emptyRect();
  for (const p of points) {
    if (p.x < r.minX) r.minX = p.x;
    if (p.y < r.minY) r.minY = p.y;
    if (p.x > r.maxX) r.maxX = p.x;
    if (p.y > r.maxY) r.maxY = p.y;
  }
  return r;
}

/** Applies matrix `m` to point `p`. */
export function applyMatrix(m: Matrix, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Matrix product `m1 * m2` (apply m2 first, then m1). */
export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Inverse of `m`. Throws on a singular matrix. */
export function invertMatrix(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) throw new Error('invertMatrix: singular matrix');
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Translation matrix. */
export function translation(dx: number, dy: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

/** Uniform or non-uniform scale about `origin`. */
export function scaleAbout(sx: number, sy: number, origin: Vec2): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: origin.x - sx * origin.x, f: origin.y - sy * origin.y };
}

/** Average linear scale factor of `m`; used to scale stroke widths. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

/** Bounding rectangle of `r` after transforming its four corners by `m`. */
export function transformRect(m: Matrix, r: Rect): Rect {
  return boundsOfPoints([
    applyMatrix(m, { x: r.minX, y: r.minY }),
    applyMatrix(m, { x: r.maxX, y: r.minY }),
    applyMatrix(m, { x: r.minX, y: r.maxY }),
    applyMatrix(m, { x: r.maxX, y: r.maxY }),
  ]);
}

/** Distance from point `p` to the segment `a`-`b`. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
