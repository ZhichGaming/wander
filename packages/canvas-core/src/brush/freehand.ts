/**
 * Wander — Zhich, Yu, Justin
 * Stroke outline tessellation, adapted from perfect-freehand 1.2.3 by
 * Steve Ruiz (MIT License, https://github.com/steveruizok/perfect-freehand,
 * Copyright (c) 2021 Stephen Ruiz Ltd).
 *
 * Why a copy: the live stroke is drawn on the UI thread by a Reanimated
 * worklet, and worklets can only call functions marked 'worklet'. This
 * copy marks every function as a worklet, keeps no module-level scratch
 * state, and takes only plain-data options. It keeps the parts Wander's
 * brushes use (explicit pressure, round or flat caps, identity easing)
 * and leaves out simulated pressure, tapers and custom easings. The
 * 'worklet' strings are ordinary string statements outside a worklet
 * runtime, so this file stays free of React Native.
 */

/** A 2D point as [x, y]. */
type P = [number, number];

/** Input sample with explicit pressure (0..1). */
export interface FreehandInput {
  x: number;
  y: number;
  pressure: number;
}

/** Options for freehandOutline; all plain data. */
export interface FreehandOptions {
  /** Base diameter. */
  size: number;
  /** How much pressure changes the radius (0 = constant, 1 = radius is size times pressure). */
  thinning: number;
  /** How much to soften the outline's edges. */
  smoothing: number;
  /** How much to smooth the centre line (0..1). */
  streamline: number;
  /** Round (true) or flat (false) caps at the start and end. */
  capStart: boolean;
  capEnd: boolean;
  /** True when the stroke is finished (the last point is used exactly). */
  last: boolean;
}

/** One processed centre-line point. */
interface CentrePoint {
  point: P;
  pressure: number;
  vector: P;
  distance: number;
  runningLength: number;
}

/** PI nudged to avoid a browser rendering artifact (from perfect-freehand). */
const FIXED_PI = Math.PI + 0.0001;
const START_CAP_SEGMENTS = 13;
const END_CAP_SEGMENTS = 29;
const CORNER_CAP_SEGMENTS = 13;
const END_NOISE_THRESHOLD = 3;
const MIN_STREAMLINE_T = 0.15;
const STREAMLINE_T_RANGE = 0.85;
const MIN_RADIUS = 0.01;
const DEFAULT_FIRST_PRESSURE = 0.25;
/** Bits of a centre sample's `edges`: the outline has a vertex on that side. */
const EDGE_LEFT = 1;
const EDGE_RIGHT = 2;

/** A + B. */
function add(a: P, b: P): P {
  'worklet';
  return [a[0] + b[0], a[1] + b[1]];
}

/** A - B. */
function sub(a: P, b: P): P {
  'worklet';
  return [a[0] - b[0], a[1] - b[1]];
}

/** A scaled by n. */
function mul(a: P, n: number): P {
  'worklet';
  return [a[0] * n, a[1] * n];
}

/** A rotated 90 degrees. */
function per(a: P): P {
  'worklet';
  return [a[1], -a[0]];
}

/** Dot product. */
function dpr(a: P, b: P): number {
  'worklet';
  return a[0] * b[0] + a[1] * b[1];
}

/** Length of A. */
function len(a: P): number {
  'worklet';
  return Math.hypot(a[0], a[1]);
}

/** Unit vector of A. */
function uni(a: P): P {
  'worklet';
  const l = len(a);
  return [a[0] / l, a[1] / l];
}

/** Distance between A and B. */
function dist(a: P, b: P): number {
  'worklet';
  return Math.hypot(a[1] - b[1], a[0] - b[0]);
}

/** Squared distance between A and B. */
function dist2(a: P, b: P): number {
  'worklet';
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Linear interpolation from A to B. */
function lrp(a: P, b: P, t: number): P {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** A projected along direction B by c. */
function prj(a: P, b: P, c: number): P {
  'worklet';
  return [a[0] + b[0] * c, a[1] + b[1] * c];
}

/** A rotated around C by r radians. */
function rotAround(a: P, c: P, r: number): P {
  'worklet';
  const s = Math.sin(r);
  const co = Math.cos(r);
  const px = a[0] - c[0];
  const py = a[1] - c[1];
  return [px * co - py * s + c[0], px * s + py * co + c[1]];
}

/** Radius for a pressure (identity easing). */
function radiusFor(size: number, thinning: number, pressure: number): number {
  'worklet';
  return size * (0.5 - thinning * (0.5 - pressure));
}

/** Streamlined centre-line points with direction, distance and running length. */
function centreLine(input: readonly FreehandInput[], o: FreehandOptions): CentrePoint[] {
  'worklet';
  if (input.length === 0) return [];
  const t = MIN_STREAMLINE_T + (1 - o.streamline) * STREAMLINE_T_RANGE;
  let pts: number[][] = input.map((p) => [p.x, p.y, p.pressure]);
  if (pts.length === 2) {
    const lastPt = pts[1];
    pts = [pts[0]];
    for (let i = 1; i < 5; i++) {
      const q = lrp([pts[0][0], pts[0][1]], [lastPt[0], lastPt[1]], i / 4);
      pts.push([q[0], q[1], lastPt[2]]);
    }
  }
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 1, pts[0][1] + 1, pts[0][2]]];
  const out: CentrePoint[] = [
    {
      point: [pts[0][0], pts[0][1]],
      pressure: pts[0][2] >= 0 ? pts[0][2] : DEFAULT_FIRST_PRESSURE,
      vector: [1, 1],
      distance: 0,
      runningLength: 0,
    },
  ];
  let reachedMinimum = false;
  let runningLength = 0;
  let prev = out[0];
  const max = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    const point: P =
      o.last && i === max ? [pts[i][0], pts[i][1]] : lrp(prev.point, [pts[i][0], pts[i][1]], t);
    if (prev.point[0] === point[0] && prev.point[1] === point[1]) continue;
    const distance = dist(point, prev.point);
    runningLength += distance;
    if (i < max && !reachedMinimum) {
      if (runningLength < o.size) continue;
      reachedMinimum = true;
    }
    prev = { point, pressure: pts[i][2], vector: uni(sub(prev.point, point)), distance, runningLength };
    out.push(prev);
  }
  out[0].vector = out.length > 1 ? out[1].vector : [0, 0];
  return out;
}

/**
 * Outline polygon around the centre line. Outline vertices closer than the
 * smoothing distance to the previous one are left out, which depends on
 * where the line starts. `edgesOut`, when not null, records per point which
 * sides got a vertex (EDGE_LEFT | EDGE_RIGHT); `edgesIn` replays such a
 * record, so a part of a line gets the same vertices the whole line had.
 *
 * Every argument is required. Reanimated worklets do not reliably transform
 * default or optional parameters; a broken transform here throws on the UI
 * thread while drawing the live stroke (and on JS while committing).
 */
function outlineOf(
  points: CentrePoint[],
  o: FreehandOptions,
  trimEnd: boolean,
  edgesIn: readonly (number | undefined)[] | null,
  edgesOut: (number | undefined)[] | null,
): P[] {
  'worklet';
  if (points.length === 0 || o.size <= 0) return [];
  const totalLength = points[points.length - 1].runningLength;
  const minDistance = Math.pow(o.size * o.smoothing, 2);
  const leftPts: P[] = [];
  const rightPts: P[] = [];
  let radius = radiusFor(o.size, o.thinning, points[points.length - 1].pressure);
  let firstRadius = -1;
  let prevVector = points[0].vector;
  let prevLeft = points[0].point;
  let prevRight = prevLeft;
  let tempLeft: P = prevLeft;
  let tempRight: P = prevRight;
  let prevSharp = false;

  for (let i = 0; i < points.length; i++) {
    const { point, vector, runningLength, pressure } = points[i];
    const isLast = i === points.length - 1;
    if (trimEnd && !isLast && totalLength - runningLength < END_NOISE_THRESHOLD) continue;
    radius = o.thinning ? radiusFor(o.size, o.thinning, pressure) : o.size / 2;
    if (firstRadius < 0) firstRadius = radius;
    radius = Math.max(MIN_RADIUS, radius);

    const nextVector = (!isLast ? points[i + 1] : points[i]).vector;
    const nextDpr = !isLast ? dpr(vector, nextVector) : 1.0;
    const prevDpr = dpr(vector, prevVector);
    const sharp = prevDpr < 0 && !prevSharp;
    const nextSharp = nextDpr < 0;
    if (sharp || nextSharp) {
      const offset = mul(per(prevVector), radius);
      const step = 1 / CORNER_CAP_SEGMENTS;
      for (let t = 0; t <= 1; t += step) {
        tempLeft = rotAround(sub(point, offset), point, FIXED_PI * t);
        leftPts.push(tempLeft);
        tempRight = rotAround(add(point, offset), point, FIXED_PI * -t);
        rightPts.push(tempRight);
      }
      prevLeft = tempLeft;
      prevRight = tempRight;
      if (nextSharp) prevSharp = true;
      continue;
    }
    prevSharp = false;
    if (isLast) {
      const offset = mul(per(vector), radius);
      leftPts.push(sub(point, offset));
      rightPts.push(add(point, offset));
      continue;
    }
    const offset = mul(per(lrp(nextVector, vector, nextDpr)), radius);
    const edges = edgesIn !== null ? edgesIn[i] : undefined;
    tempLeft = sub(point, offset);
    const keepLeft =
      edges !== undefined ? (edges & EDGE_LEFT) !== 0 : i <= 1 || dist2(prevLeft, tempLeft) > minDistance;
    if (keepLeft) {
      leftPts.push(tempLeft);
      prevLeft = tempLeft;
    }
    tempRight = add(point, offset);
    const keepRight =
      edges !== undefined ? (edges & EDGE_RIGHT) !== 0 : i <= 1 || dist2(prevRight, tempRight) > minDistance;
    if (keepRight) {
      rightPts.push(tempRight);
      prevRight = tempRight;
    }
    if (edgesOut !== null) edgesOut[i] = (keepLeft ? EDGE_LEFT : 0) | (keepRight ? EDGE_RIGHT : 0);
    prevVector = vector;
  }

  const firstPoint: P = [points[0].point[0], points[0].point[1]];
  const lastPoint: P =
    points.length > 1
      ? [points[points.length - 1].point[0], points[points.length - 1].point[1]]
      : add(points[0].point, [1, 1]);
  const startCap: P[] = [];
  const endCap: P[] = [];
  if (points.length === 1) {
    const r = firstRadius >= 0 ? firstRadius : radius;
    const start = prj(firstPoint, uni(per(sub(firstPoint, add(firstPoint, [1, 1])))), -r);
    const dot: P[] = [];
    const step = 1 / START_CAP_SEGMENTS;
    for (let t = step; t <= 1; t += step) dot.push(rotAround(start, firstPoint, FIXED_PI * 2 * t));
    return dot;
  }
  if (o.capStart) {
    const step = 1 / START_CAP_SEGMENTS;
    for (let t = step; t <= 1; t += step) startCap.push(rotAround(rightPts[0], firstPoint, FIXED_PI * t));
  } else {
    const corners = sub(leftPts[0], rightPts[0]);
    const a = mul(corners, 0.5);
    const b = mul(corners, 0.51);
    startCap.push(sub(firstPoint, a), sub(firstPoint, b), add(firstPoint, b), add(firstPoint, a));
  }
  const last = points[points.length - 1].vector;
  const direction = per([-last[0], -last[1]]);
  if (o.capEnd) {
    const start = prj(lastPoint, direction, radius);
    const step = 1 / END_CAP_SEGMENTS;
    for (let t = step; t < 1; t += step) endCap.push(rotAround(start, lastPoint, FIXED_PI * 3 * t));
  } else {
    endCap.push(
      add(lastPoint, mul(direction, radius)),
      add(lastPoint, mul(direction, radius * 0.99)),
      sub(lastPoint, mul(direction, radius * 0.99)),
      sub(lastPoint, mul(direction, radius)),
    );
  }
  return leftPts.concat(endCap, rightPts.reverse(), startCap);
}

/** Outline polygon (flat [x, y] pairs as points) around `input`. */
export function freehandOutline(
  input: readonly FreehandInput[],
  o: FreehandOptions,
): { x: number; y: number }[] {
  'worklet';
  return outlineOf(centreLine(input, o), o, true, null, null).map((p) => ({ x: p[0], y: p[1] }));
}

/** How to draw a frozen centre line (see freehandCentre); all plain data. */
export interface BakedOptions {
  /** Base diameter; a sample's radius is `size` times its pressure. */
  size: number;
  /** How much to soften the outline's edges. */
  smoothing: number;
  /** Round (true) or flat (false) caps at the start and end. */
  capStart: boolean;
  capEnd: boolean;
  /** True while the line still ends where the original stroke ended. */
  trimEnd: boolean;
}

/** A frozen centre sample: `pressure` is the radius as a fraction of the size. */
export interface CentreSample extends FreehandInput {
  /** Which outline sides have a vertex here (see outlineOf); absent on new cut ends. */
  edges?: number;
}

/**
 * The finished centre line of a stroke: streamlined positions, with each
 * sample's `pressure` replaced by its radius as a fraction of `o.size`.
 * freehandBakedOutline draws it without any further smoothing, so a part
 * cut out of it is drawn exactly where the whole line was.
 */
export function freehandCentre(input: readonly FreehandInput[], o: FreehandOptions): CentreSample[] {
  const line = centreLine(input, o);
  const edges: (number | undefined)[] = [];
  outlineOf(line, o, true, null, edges);
  return line.map((c, i) => {
    const sample: CentreSample = {
      x: c.point[0],
      y: c.point[1],
      pressure: (o.thinning ? radiusFor(o.size, o.thinning, c.pressure) : o.size / 2) / o.size,
    };
    if (edges[i] !== undefined) sample.edges = edges[i];
    return sample;
  });
}

/** Outline polygon around a centre line from freehandCentre, or around a part of one. */
export function freehandBakedOutline(
  centre: readonly CentreSample[],
  b: BakedOptions,
): { x: number; y: number }[] {
  const edges: (number | undefined)[] = [];
  const points: CentrePoint[] = [];
  let runningLength = 0;
  for (const c of centre) {
    const point: P = [c.x, c.y];
    const prev = points[points.length - 1];
    if (!prev) {
      points.push({ point, pressure: c.pressure, vector: [1, 1], distance: 0, runningLength: 0 });
      edges.push(c.edges);
      continue;
    }
    if (prev.point[0] === point[0] && prev.point[1] === point[1]) continue;
    const distance = dist(point, prev.point);
    runningLength += distance;
    edges.push(c.edges);
    points.push({ point, pressure: c.pressure, vector: uni(sub(prev.point, point)), distance, runningLength });
  }
  if (points.length > 0) points[0].vector = points.length > 1 ? points[1].vector : [0, 0];
  const o: FreehandOptions = {
    size: b.size,
    thinning: 1,
    smoothing: b.smoothing,
    streamline: 0,
    capStart: b.capStart,
    capEnd: b.capEnd,
    last: true,
  };
  return outlineOf(points, o, b.trimEnd, edges, null).map((p) => ({ x: p[0], y: p[1] }));
}
