/**
 * Wander — Zhich, Yu, Justin
 * Pen brush: "velocity pen" ink built on perfect-freehand (MIT). Fast
 * movement thins the line. With a stylus the real pressure is used and
 * scaled down by speed; with a finger or mouse (pressure always 0.5) a
 * fixed base pressure is scaled down by speed the same way. Speed comes
 * from timestamps and samples are evened out first (see samplePrep), so
 * the ink looks the same at any input rate. The math lives in worklet
 * functions so the live stroke can be drawn on the UI thread.
 */

import type { Vec2 } from '../math/geometry';
import type { StrokePoint, StrokeStyle } from '../model/StrokeStyle';
import type { Brush, FreehandCall } from './Brush';
import { freehandOutline } from './freehand';
import { dotOutline, isDot, isSinglePoint } from './outlinePath';
import { resample, smoothedSpeeds, type PreparedPoint } from './samplePrep';

/** Pressure reported by devices that have no pressure sensor. */
const NO_PRESSURE = 0.5;
/** Pressure used for finger and mouse strokes before speed thinning. */
const FINGER_PRESSURE = 0.6;
/** Speed, in stroke widths per millisecond, at which thinning is strongest. */
const FAST_SPEED = 0.5;
/** Largest fraction of pressure removed by speed. */
const MAX_SPEED_THINNING = 0.25;
/** How strongly pressure changes the pen's width with a stylus (0..1). */
const STYLUS_THINNING = 0.9;
/** How strongly speed-reduced pressure changes the width with a finger or mouse. */
const FINGER_THINNING = 0.6;
/**
 * Stylus pressure is multiplied by this before it sets the width (and
 * capped at 1). Ordinary writing reads about 0.35 on Apple Pencil; the gain
 * brings that to nearly 0.5, the pen's nominal width, and widens every
 * other pressure in proportion.
 */
const STYLUS_PRESSURE_GAIN = 1.3;
/** Lowest pressure a stylus stroke is drawn with, so a light touch is thin but never a hair. */
const MIN_STYLUS_PRESSURE = 0.22;
/**
 * For this long after a stroke starts (ms) the drawn pressure follows the pen
 * quickly in both directions, so a light stroke is light from its start.
 * After that, easing off is slow (RELEASE_TIME_MS).
 */
const SETTLE_MS = 45;
/** How quickly the drawn pressure follows the pen while settling (ms). */
const SETTLE_TIME_MS = 14;
/** How quickly the drawn pressure follows the pen pressing harder (ms). */
const PRESS_TIME_MS = 12;
/**
 * How quickly it follows the pen easing off (ms). Slow on purpose: lifting
 * the pen drops the pressure to nothing within a few samples, which would
 * pinch every stroke end into a point and reshape it at the moment of release.
 */
const RELEASE_TIME_MS = 90;
/** How strongly pressure changes a dot's size, and its smallest radius as a fraction of the pen width. */
const DOT_THINNING = 0.5;
const DOT_MIN = 0.45;
/** Stylus pressure at or below which the pen is leaving the page, not drawing. */
const LIFT_PRESSURE = 0.02;
/** A sample is part of the lift when its pressure is below this fraction of the highest in the last LIFT_WINDOW_MS. */
const LIFT_FRACTION = 0.6;
const LIFT_WINDOW_MS = 120;
/** Longest lift skid, in pen widths. */
const LIFT_REACH = 1;
/** A landing skid is at most this long (ms) and reaches at most this many pen widths from the first sample. */
const LANDING_MS = 80;
const LANDING_REACH = 1.2;
/** How far back towards its start, in pen widths, the pen must come for the skid to count as over. */
const LANDING_RETURN = 0.15;
/** Cosine of the turn at the end of a landing skid: the stroke must head back more sharply than this. */
const LANDING_TURN = -0.3;
/** Even sample spacing handed to perfect-freehand, as a fraction of the width. */
const SPACING = 0.2;

/** True when the device reported real pressure (some sample is not 0.5). Worklet. */
function hasPressure(points: readonly StrokePoint[]): boolean {
  'worklet';
  for (const p of points) if (p.pressure !== NO_PRESSURE) return true;
  return false;
}

/**
 * Index of the first sample that is ink. A pen landing on glass often
 * skids a unit or two before the stroke sets off the other way, which
 * draws a small hook on the start of the stroke. When the pen turns back
 * sharply within LANDING_MS and LANDING_REACH pen widths of its first
 * sample, the samples before the turn are left out. Worklet.
 */
function landingEnd(points: readonly StrokePoint[], width: number): number {
  'worklet';
  const reach = width * LANDING_REACH;
  // The apex: the furthest the pen got from its first sample before heading back.
  let apex = 0;
  let furthest = 0;
  let turned = false;
  for (let i = 1; i < points.length; i++) {
    const a = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (a > furthest) {
      if (a > reach || points[i].time - points[0].time > LANDING_MS) return 0;
      furthest = a;
      apex = i;
    } else if (a < furthest - width * LANDING_RETURN) {
      turned = true;
      break;
    }
  }
  if (!turned) return 0;
  // Where the stroke has got to one reach beyond the apex.
  let j = apex + 1;
  while (j < points.length && Math.hypot(points[j].x - points[apex].x, points[j].y - points[apex].y) < reach) j++;
  if (j >= points.length) return 0;
  const ax = points[apex].x - points[0].x;
  const ay = points[apex].y - points[0].y;
  const bx = points[j].x - points[apex].x;
  const by = points[j].y - points[apex].y;
  const turn = (ax * bx + ay * by) / (furthest * Math.hypot(bx, by));
  return turn < LANDING_TURN ? apex : 0;
}

/**
 * Index after the last sample that is ink. A lifting pen keeps reporting
 * for a few samples while its pressure collapses, skidding off the line;
 * the very last sample or two have no pressure at all and sit several
 * units away. Drawn, they put a hook or a stray tail on every stroke. The
 * end is cut back to where the pressure was still at least LIFT_FRACTION
 * of its recent level, as long as that removes no more than a short skid.
 * Worklet.
 */
function liftStart(points: readonly StrokePoint[], width: number): number {
  'worklet';
  let end = points.length;
  while (end > 1 && points[end - 1].pressure <= LIFT_PRESSURE) end--;
  const since = points[end - 1].time - LIFT_WINDOW_MS;
  let recent = 0;
  for (let i = end - 1; i >= 0 && points[i].time >= since; i--) {
    if (points[i].pressure > recent) recent = points[i].pressure;
  }
  // A skid is short. A longer run of fading pressure is a deliberate flick and is kept.
  let cut = end;
  let length = 0;
  while (cut > 1 && points[cut - 1].pressure < recent * LIFT_FRACTION) {
    length += Math.hypot(points[cut - 1].x - points[cut - 2].x, points[cut - 1].y - points[cut - 2].y);
    if (length > width * LIFT_REACH) return end;
    cut--;
  }
  return cut;
}

/**
 * The samples of a stylus stroke that are ink: without the landing skid
 * when `fromStart` is true (the points begin where the stroke began), and
 * without the lift when `toEnd` is true (they end where the pen is). Both
 * depend only on samples near that end, so live ink and committed ink
 * agree. Worklet.
 */
function inked(
  points: readonly StrokePoint[],
  width: number,
  fromStart: boolean,
  toEnd: boolean,
): readonly StrokePoint[] {
  'worklet';
  if (points.length < 2 || !hasPressure(points)) return points;
  const end = toEnd ? liftStart(points, width) : points.length;
  const start = fromStart ? landingEnd(points, width) : 0;
  if (start === 0 && end === points.length) return points;
  return start < end - 1 ? points.slice(start, end) : points.slice(0, end);
}

/**
 * Stylus pressure as the pen draws it: floored, starting from the first
 * sample, settling quickly at first, then rising quickly and falling slowly
 * towards what the pen reports. Each value depends only on earlier samples,
 * so ink already drawn does not change as the stroke grows. Worklet.
 */
function stylusPressures(points: readonly StrokePoint[]): number[] {
  'worklet';
  const out: number[] = [];
  if (points.length === 0) return out;
  const first = Math.min(1, points[0].pressure * STYLUS_PRESSURE_GAIN);
  let level = first > MIN_STYLUS_PRESSURE ? first : MIN_STYLUS_PRESSURE;
  for (let i = 0; i < points.length; i++) {
    const gained = Math.min(1, points[i].pressure * STYLUS_PRESSURE_GAIN);
    const target = gained > MIN_STYLUS_PRESSURE ? gained : MIN_STYLUS_PRESSURE;
    const dt = i > 0 ? points[i].time - points[i - 1].time : 0;
    if (dt > 0) {
      const settling = points[i].time - points[0].time <= SETTLE_MS;
      const tau = settling ? SETTLE_TIME_MS : target > level ? PRESS_TIME_MS : RELEASE_TIME_MS;
      level += (target - level) * (1 - Math.exp(-dt / tau));
    }
    out.push(level);
  }
  return out;
}

/** Per-point pressure: stylus pressure (or a fixed finger pressure) reduced by speed. Worklet. */
function penPressures(points: readonly StrokePoint[], width: number, stylus: boolean): PreparedPoint[] {
  'worklet';
  const speeds = smoothedSpeeds(points, width);
  const levels = stylus ? stylusPressures(points) : [];
  return points.map((p, i) => {
    const base = stylus ? levels[i] : FINGER_PRESSURE;
    const thinning = MAX_SPEED_THINNING * Math.min(1, speeds[i] / FAST_SPEED);
    return { x: p.x, y: p.y, pressure: base * (1 - thinning) };
  });
}

/**
 * A stroke smaller than the pen is wide (an i dot, a full stop): a round mark
 * at its middle, a little larger when pressed harder. Worklet.
 */
function penDot(points: readonly StrokePoint[], style: StrokeStyle): Vec2[] {
  'worklet';
  const last = points[points.length - 1];
  const levels = hasPressure(points) ? stylusPressures(points) : [];
  const p = levels.length > 0 ? levels[levels.length - 1] : FINGER_PRESSURE;
  const radius = style.width * (0.5 - DOT_THINNING * (0.5 - p));
  return dotOutline(
    { x: (points[0].x + last.x) / 2, y: (points[0].y + last.y) / 2 },
    radius > style.width * DOT_MIN ? radius : style.width * DOT_MIN,
  );
}

/**
 * Samples and options the pen hands to freehandOutline. JavaScript only
 * (Stroke.toBaked). The live outline inlines the same call: a worklet that
 * returns this object and is then read from penOutline hung Pencil input
 * on iPad / Hermes after the first stroke (bb7f609).
 */
function penFreehand(all: readonly StrokePoint[], style: StrokeStyle, complete: boolean): FreehandCall {
  const points = inked(all, style.width, true, true);
  const stylus = hasPressure(points);
  return {
    input: resample(penPressures(points, style.width, stylus), style.width * SPACING),
    options: {
      size: style.width,
      // A stylus gets a wider pressure range than a finger's speed-only response.
      thinning: stylus ? STYLUS_THINNING : FINGER_THINNING,
      smoothing: 0.25,
      streamline: 0.3,
      capStart: true,
      capEnd: true,
      last: complete,
    },
  };
}

/** Round-ended outline whose width follows pressure and speed. Worklet. */
export function penOutline(all: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
  'worklet';
  if (all.length === 0) return [];
  const points = inked(all, style.width, true, true);
  if (isSinglePoint(points)) return dotOutline(points[0], style.width / 2);
  if (isDot(points, style.width)) return penDot(points, style);
  const stylus = hasPressure(points);
  const input = resample(penPressures(points, style.width, stylus), style.width * SPACING);
  return freehandOutline(input, {
    size: style.width,
    // A stylus gets a wider pressure range than a finger's speed-only response.
    thinning: stylus ? STYLUS_THINNING : FINGER_THINNING,
    smoothing: 0.25,
    streamline: 0.3,
    capStart: true,
    capEnd: true,
    last: complete,
  });
}

/**
 * Outline of `points` without its first `skip` points, which are only used
 * to settle the speed filter. This lets live ink be drawn in segments: a
 * segment that starts mid-stroke gets the same width there as the whole
 * stroke would have, so segments overlap without a visible seam. `complete`
 * is true once the pen has lifted, so the end is drawn as it will be
 * committed. Worklet.
 */
export function penOutlineFrom(
  all: readonly StrokePoint[],
  style: StrokeStyle,
  skip: number,
  complete: boolean,
): Vec2[] {
  'worklet';
  const points = inked(all, style.width, skip === 0, complete);
  // Live ink must show a dot as the same dot it commits as.
  if (skip === 0 && points.length > 0 && isDot(points, style.width)) return penDot(points, style);
  if (points.length - skip < 2) return [];
  const stylus = hasPressure(points);
  const prepared = penPressures(points, style.width, stylus).slice(skip);
  const input = resample(prepared, style.width * SPACING);
  return freehandOutline(input, {
    size: style.width,
    thinning: stylus ? STYLUS_THINNING : FINGER_THINNING,
    smoothing: 0.25,
    streamline: 0.3,
    capStart: true,
    capEnd: true,
    last: complete,
  });
}

/** Pressure and velocity sensitive pen. */
export class PenBrush implements Brush {
  readonly kind = 'pen' as const;
  readonly pass = 1;
  readonly blendMode = 'normal' as const;
  readonly texture = 'none' as const;

  /** Full opacity: speed and pressure change width, not darkness. */
  opacity(): number {
    return 1;
  }

  /** Round-ended outline whose width follows pressure and speed (see penOutline). */
  outline(points: readonly StrokePoint[], style: StrokeStyle, complete: boolean): Vec2[] {
    return penOutline(points, style, complete);
  }

  /** The freehand call behind a finished pen stroke; null for a tap. */
  freehand(all: readonly StrokePoint[], style: StrokeStyle): FreehandCall | null {
    const points = inked(all, style.width, true, true);
    const dot = points.length === 0 || isSinglePoint(points) || isDot(points, style.width);
    return dot ? null : penFreehand(points, style, true);
  }
}
