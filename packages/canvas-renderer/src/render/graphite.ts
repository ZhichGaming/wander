/**
 * Wander — Zhich, Yu, Justin
 * Graphite grain for the pencil brush: a small SkSL shader that fills a
 * stroke with its color modulated by two octaves of value noise, so the
 * ink looks like pencil on paper. The noise is evaluated in world space
 * (the shader runs inside the camera transform), so the grain sticks to
 * the paper rather than the screen.
 */

import { Skia, type SkRuntimeEffect, type SkShader } from '@shopify/react-native-skia';

/** Size of one grain cell in world units. */
export const GRAIN_SIZE = 0.6;

/** SkSL source. Output is premultiplied: color scaled by grain coverage. */
const SOURCE = `
uniform half4 inkColor;
uniform float grain;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1, 0));
  float c = hash(i + float2(0, 1));
  float d = hash(i + float2(1, 1));
  float2 u = f * f * (3 - 2 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

half4 main(float2 p) {
  float n = noise(p / grain) * 0.6 + noise(p / (grain * 0.37)) * 0.4;
  float coverage = 0.35 + 0.65 * smoothstep(0.25, 0.75, n);
  return inkColor * half(coverage);
}
`;

let effect: SkRuntimeEffect | null | undefined;

/** The compiled grain effect, created on first use; null if compilation failed. */
export function graphiteEffect(): SkRuntimeEffect | null {
  if (effect === undefined) effect = Skia.RuntimeEffect.Make(SOURCE);
  return effect;
}

/** Uniform values for `color` (opaque; opacity comes from the paint). */
export function graphiteUniforms(color: string): { inkColor: number[]; grain: number } {
  const c = Skia.Color(color);
  return { inkColor: [c[0], c[1], c[2], 1], grain: GRAIN_SIZE };
}

/** A grain shader in `color`, or null when the effect is unavailable. */
export function graphiteShader(color: string): SkShader | null {
  const fx = graphiteEffect();
  if (!fx) return null;
  const u = graphiteUniforms(color);
  return fx.makeShader([...u.inkColor, u.grain]);
}
