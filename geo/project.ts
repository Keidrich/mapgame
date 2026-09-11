import type { LatLng } from '@sim/types';

const M_PER_DEG_LAT = 111320;
export interface XY { x: number; y: number }

export function toXY(origin: LatLng, p: LatLng): XY {
  return { x: (p.lng - origin.lng) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180), y: (p.lat - origin.lat) * M_PER_DEG_LAT };
}
export function toLatLng(origin: LatLng, p: XY): LatLng {
  return { lat: origin.lat + p.y / M_PER_DEG_LAT, lng: origin.lng + p.x / (M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)) };
}
export function distanceM(a: LatLng, b: LatLng): number {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lng - b.lng) * M_PER_DEG_LAT * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}
/** Signed area (shoelace) in the units of the points. Positive = counter-clockwise in a y-up frame. */
export function signedArea(ring: XY[]): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}
export function centroid(ring: XY[]): XY {
  const a = signedArea(ring); if (Math.abs(a) < 1e-9) return ring[0];
  let cx = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; const f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
export function pointInRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Drop nearly-collinear vertices so drawn polygons stay light. */
export function simplifyRing(ring: XY[], toleranceM = 1.5): XY[] {
  if (ring.length <= 4) return ring;
  const out: XY[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
    const abx = b.x - a.x, aby = b.y - a.y, bcx = c.x - b.x, bcy = c.y - b.y;
    const cross = Math.abs(abx * bcy - aby * bcx);
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (cross / len > toleranceM) out.push(b);
  }
  return out.length >= 3 ? out : ring;
}
