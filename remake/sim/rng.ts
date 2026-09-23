/**
 * The seeded generator the whole remake runs on. Same Mulberry32 as the original game — it is
 * shared rather than copied, so a bug fixed there is fixed here — plus the pieces procedural
 * generation needs on top: value noise and a per-name hash stream.
 */
export { Rng, hashString, next } from '@sim/rng';
import { hashString } from '@sim/rng';

/** A stream seeded from a string: the same key always gives the same choices, anywhere. */
export function hash01(key: string): number { return hashString(key) / 4294967296; }

/** Pick deterministically from a list by key, without touching any rng state. */
export function pickBy<T>(arr: readonly T[], key: string): T { return arr[hashString(key) % arr.length]; }

function lattice(seed: number, ix: number, iy: number): number {
  let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in 0..1. Smooth, cheap, and all the city warp needs. */
export function noise2(seed: number, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = lattice(seed, ix, iy), b = lattice(seed, ix + 1, iy);
  const c = lattice(seed, ix, iy + 1), d = lattice(seed, ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** Fractal noise, −1..1: three octaves is plenty for a street plan. */
export function fbm(seed: number, x: number, y: number, octaves = 3): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += (noise2(seed + o * 101, x * freq, y * freq) * 2 - 1) * amp; norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm;
}
