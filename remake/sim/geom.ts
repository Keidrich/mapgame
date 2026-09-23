/** Plane geometry for the city: small, exact enough, and no dependencies. */
import type { Vec } from './types';

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const round1 = (a: Vec): Vec => ({ x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10 });

export function centroid(poly: Vec[]): Vec {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) { const s = poly.reduce((t, p) => add(t, p), v(0, 0)); return mul(s, 1 / poly.length); }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function area(poly: Vec[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

export function pointInPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polyline. */
export function distToPath(p: Vec, path: Vec[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ab = sub(b, a); const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    best = Math.min(best, dist(p, lerp(a, b, t)));
  }
  return best;
}

/** Where two infinite lines (p + t·r, q + u·s) cross, or undefined when parallel. */
export function intersect(p: Vec, r: Vec, q: Vec, s: Vec): Vec | undefined {
  const d = r.x * s.y - r.y * s.x;
  if (Math.abs(d) < 1e-9) return undefined;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / d;
  return { x: p.x + r.x * t, y: p.y + r.y * t };
}

/**
 * Inset a polygon whose ring is split into sides, each side a polyline along one street with its
 * own half-width. Offsetting side by side and meeting at the corners is what keeps it stable:
 * the vertices *within* a side are nearly collinear, and intersecting those would explode.
 * The ring is clockwise in screen space (y down), so the inward normal is (−dy, dx).
 */
export function insetSides(sides: { pts: Vec[]; w: number }[]): Vec[] {
  const off = sides.map(({ pts, w }) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(b, a));
    return add(p, mul({ x: -d.y, y: d.x }, w));
  }));
  const out: Vec[] = [];
  for (let s = 0; s < off.length; s++) {
    const cur = off[s], prev = off[(s + off.length - 1) % off.length];
    // corner: the end of the previous side meets the start of this one
    const pa = prev[prev.length - 2], pb = prev[prev.length - 1];
    const ca = cur[0], cb = cur[1];
    const x = intersect(pa, sub(pb, pa), ca, sub(cb, ca));
    out.push(x && dist(x, ca) < 80 ? x : lerp(pb, ca, 0.5));
    for (let i = 1; i < cur.length - 1; i++) out.push(cur[i]);
  }
  return out.map(round1);
}

/** Smooth a polyline (Chaikin), for the river and the coast. */
export function chaikin(pts: Vec[], iterations = 2): Vec[] {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const q: Vec[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { q.push(lerp(p[i], p[i + 1], 0.25), lerp(p[i], p[i + 1], 0.75)); }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Offset a polyline both ways into a ribbon polygon. */
export function ribbon(path: Vec[], halfWidth: number): Vec[] {
  const left: Vec[] = [], right: Vec[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const d = norm(sub(b, a)); const n = { x: -d.y, y: d.x };
    left.push(add(path[i], mul(n, halfWidth))); right.push(sub(path[i], mul(n, halfWidth)));
  }
  return [...left, ...right.reverse()].map(round1);
}
