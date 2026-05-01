// FILE: src/utils/math.js

/**
 * Linear interpolation between a and b by factor t (0–1).
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp value between lo and hi.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Euclidean length of a 2D or 3D vector.
 * @param {{ x: number, y: number, z?: number }} v
 * @returns {number}
 */
export function vecLength(v) {
  const z = v.z ?? 0;
  return Math.sqrt(v.x * v.x + v.y * v.y + z * z);
}

/**
 * Euclidean distance between two 2D normalised points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
