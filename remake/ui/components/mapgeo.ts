/**
 * The city's drawn geometry, shared by the flat map (`CityMap.tsx`) and the 3D one
 * (`CityMap3D.tsx`) so both show the same lots, trees and parks for the same seed. Pure functions of
 * the generated `City` and a block: every random draw is seeded by the block's own number, so
 * nothing here touches the sim's rng and the order of draws must not change (it would move every
 * building on every map).
 */
import type { Block, City, Vec } from '@r/sim/types';

export function mulberry(seed: number) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const bil = (a: Vec, b: Vec, c: Vec, d: Vec, u: number, v: number): Vec => ({ x: (a.x * (1 - u) + b.x * u) * (1 - v) + (d.x * (1 - u) + c.x * u) * v, y: (a.y * (1 - u) + b.y * u) * (1 - v) + (d.y * (1 - u) + c.y * u) * v });

/** The number in a block's id, with any city prefix off it (`c2.b14` → 14): lots and trees are seeded by it. */
export function blockNo(b: Block) { return parseInt(b.id.replace(/^.*b/, ''), 10) || 0; }
export function inside(p: Vec, poly: Vec[]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }

/** Building footprints inside one block: each lattice cell is cut into a few lots, deterministically. */
export function lotQuads(city: City, b: Block): Vec[][] {
  const vt = (i: number, j: number) => city.verts[j * (city.cols + 1) + i];
  const r = mulberry(blockNo(b) * 7919 + 17);
  const out: Vec[][] = [];
  const [i0, j0, i1, j1] = b.cells;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const A = vt(i, j), B = vt(i + 1, j), C = vt(i + 1, j + 1), D = vt(i, j + 1);
    const nu = 2 + Math.floor(r() * 2), nv = 2 + Math.floor(r() * 2);
    const cu = [0.09]; for (let k = 1; k < nu; k++) cu.push(0.09 + (0.82 * k) / nu + (r() - 0.5) * 0.08); cu.push(0.91);
    const cv = [0.09]; for (let k = 1; k < nv; k++) cv.push(0.09 + (0.82 * k) / nv + (r() - 0.5) * 0.08); cv.push(0.91);
    for (let a = 0; a < nu; a++) for (let c = 0; c < nv; c++) {
      if (r() < 0.12) continue;   // a yard, a lot nobody built on
      const g = 0.012;
      out.push([bil(A, B, C, D, cu[a] + g, cv[c] + g), bil(A, B, C, D, cu[a + 1] - g, cv[c] + g), bil(A, B, C, D, cu[a + 1] - g, cv[c + 1] - g), bil(A, B, C, D, cu[a] + g, cv[c + 1] - g)]);
    }
  }
  return out;
}
export const lotsPath = (city: City, b: Block) => lotQuads(city, b).map(q => `M${q.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`).join('');

export function treesFor(b: Block): Vec[] {
  const r = mulberry(blockNo(b) * 104729 + 3);
  const xs = b.poly.map(p => p.x), ys = b.poly.map(p => p.y);
  const out: Vec[] = [];
  for (let k = 0; k < 40 && out.length < 26; k++) {
    const p = { x: Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys)) };
    if (inside(p, b.poly)) out.push(p);
  }
  return out;
}
