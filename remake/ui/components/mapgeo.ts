/**
 * The city's drawn geometry, shared by the flat map (`CityMap.tsx`) and the 3D one
 * (`CityMap3D.tsx`) so both show the same lots, trees and parks for the same seed. Pure functions of
 * the generated `City` and a block: every random draw is seeded by the block's own number, so
 * nothing here touches the sim's rng and the order of draws must not change (it would move every
 * building on every map).
 */
import type { Block, DistrictKind, Id, Vec, World } from '@r/sim/types';

export function mulberry(seed: number) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const bil = (a: Vec, b: Vec, c: Vec, d: Vec, u: number, v: number): Vec => ({ x: (a.x * (1 - u) + b.x * u) * (1 - v) + (d.x * (1 - u) + c.x * u) * v, y: (a.y * (1 - u) + b.y * u) * (1 - v) + (d.y * (1 - u) + c.y * u) * v });

/** The number in a block's id, with any city prefix off it (`c2.b14` → 14): lots and trees are seeded by it. */
export function blockNo(b: Block) { return parseInt(b.id.replace(/^.*b/, ''), 10) || 0; }
export function inside(p: Vec, poly: Vec[]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }

export const quadPath = (q: Vec[]) => `M${q.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`;

/**
 * The buildings actually on a block, and nothing else: one for every business on it, a landmark's
 * own building, and homes for the people who live there. The first cut filled every block with four
 * to nine decorative lots whatever it held, so a block with one bar and a block with three shops and
 * a tower of flats looked the same; now the count is the count.
 */
export interface Lot { quad: Vec[]; center: Vec; kind: 'shop' | 'home' | 'landmark'; businessId?: Id; tier: number }

/** How many people share a home, by what kind of district it is: towers in the projects, houses up the hill. */
const PER_HOME: Partial<Record<DistrictKind, number>> = { projects: 7, downtown: 5, strip: 4, market: 3, oldtown: 3, docks: 3, industrial: 4, heights: 2, suburb: 2 };

/** Who lives where, counted once per city (alive or not: a house does not come down when its owner does). */
export function residents(w: World): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const n of Object.values(w.npcs)) out[n.homeBlockId] = (out[n.homeBlockId] ?? 0) + 1;
  return out;
}
export function homesOn(w: World, b: Block, living: number): number {
  if (!living) return 0;
  return Math.max(1, Math.ceil(living / (PER_HOME[w.districts[b.districtId]?.kind ?? 'market'] ?? 3)));
}

/**
 * Lay a block out: cut its cells into slots (2×2 a cell, 3×3 when that is not room enough), put each
 * business on the free slot nearest where it stands, the landmark nearest the middle, then the homes;
 * the slots left over are yards and empty lots. Seeded by the block's number, like everything here.
 */
export function blockLots(w: World, b: Block, living: number): Lot[] {
  const city = w.city;
  const vt = (i: number, j: number) => city.verts[j * (city.cols + 1) + i];
  const r = mulberry(blockNo(b) * 6151 + 29);
  const biz = b.businessIds.map(id => w.businesses[id]).filter(Boolean);
  const homes = homesOn(w, b, living);
  const need = biz.length + homes + (b.landmark ? 1 : 0);
  if (!need) return [];
  const [i0, j0, i1, j1] = b.cells;
  const ncell = (i1 - i0 + 1) * (j1 - j0 + 1);
  const n = need > ncell * 4 ? 3 : 2;
  const slots: { quad: Vec[]; center: Vec }[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const A = vt(i, j), B = vt(i + 1, j), C = vt(i + 1, j + 1), D = vt(i, j + 1);
    const cu = [0.09]; for (let k = 1; k < n; k++) cu.push(0.09 + (0.82 * k) / n + (r() - 0.5) * 0.06); cu.push(0.91);
    const cv = [0.09]; for (let k = 1; k < n; k++) cv.push(0.09 + (0.82 * k) / n + (r() - 0.5) * 0.06); cv.push(0.91);
    for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
      const g = 0.014;
      const quad = [bil(A, B, C, D, cu[a] + g, cv[c] + g), bil(A, B, C, D, cu[a + 1] - g, cv[c] + g), bil(A, B, C, D, cu[a + 1] - g, cv[c + 1] - g), bil(A, B, C, D, cu[a] + g, cv[c + 1] - g)];
      slots.push({ quad, center: bil(A, B, C, D, (cu[a] + cu[a + 1]) / 2, (cv[c] + cv[c + 1]) / 2) });
    }
  }
  const free = slots.map((_, k) => k);
  const take = (near: Vec) => { let best = 0; for (let k = 1; k < free.length; k++) if (dist(slots[free[k]].center, near) < dist(slots[free[best]].center, near)) best = k; return slots[free.splice(best, 1)[0]]; };
  const out: Lot[] = [];
  for (const x of biz) { if (!free.length) break; const s = take(x.pos); out.push({ ...s, kind: 'shop', businessId: x.id, tier: x.tier }); }
  if (b.landmark && free.length) { const s = take(b.center); out.push({ ...s, kind: 'landmark', tier: 3 }); }
  for (let k = 0; k < homes && free.length; k++) { const s = slots[free.splice(Math.floor(r() * free.length), 1)[0]]; out.push({ ...s, kind: 'home', tier: 1 }); }
  return out;
}
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where each business's own building stands, so its marker sits on its roof and not on a yard. */
export function shopSpots(w: World): Record<Id, Vec> {
  const res = residents(w); const out: Record<Id, Vec> = {};
  for (const b of Object.values(w.blocks)) for (const l of blockLots(w, b, res[b.id] ?? 0)) if (l.businessId) out[l.businessId] = l.center;
  return out;
}

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
