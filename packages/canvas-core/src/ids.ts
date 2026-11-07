/**
 * Wander — Zhich, Yu, Justin
 * Unique id generation for canvas objects and layers.
 */

let counter = 0;

/**
 * Returns a new id that is unique within this process and very unlikely to
 * collide across devices (time + counter + random suffix).
 */
export function newId(prefix = 'o'): string {
  counter = (counter + 1) % 0x100000;
  const rand = Math.floor(Math.random() * 0x1000000).toString(36);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
