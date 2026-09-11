import type { Hex, LatLng } from './types';

export const hexKey = (h: Hex) => `${h.q},${h.r}`;

export const HEX_DIRS: Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function neighbors(h: Hex): Hex[] { return HEX_DIRS.map(d => ({ q: h.q + d.q, r: h.r + d.r })); }
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
export function spiral(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r });
  return out;
}

/** Pointy-top axial -> metres east/north of origin. `size` = circumradius in metres. */
export function hexToMeters(h: Hex, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r };
}
export function metersToHex(x: number, y: number, size: number): Hex {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return hexRound(q, r);
}
function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

const M_PER_DEG_LAT = 111320;
export function metersToLatLng(origin: LatLng, x: number, y: number): LatLng {
  const lat = origin.lat + y / M_PER_DEG_LAT;
  const lng = origin.lng + x / (M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}
export function latLngToMeters(origin: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: (p.lng - origin.lng) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180),
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}
export function hexCenter(origin: LatLng, h: Hex, size: number): LatLng {
  const m = hexToMeters(h, size); return metersToLatLng(origin, m.x, m.y);
}
/** Six corners of a pointy-top hex, for drawing. */
export function hexCorners(origin: LatLng, h: Hex, size: number): LatLng[] {
  const c = hexToMeters(h, size);
  const out: LatLng[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push(metersToLatLng(origin, c.x + size * Math.cos(a), c.y + size * Math.sin(a)));
  }
  return out;
}
export function latLngToHex(origin: LatLng, p: LatLng, size: number): Hex {
  const m = latLngToMeters(origin, p); return metersToHex(m.x, m.y, size);
}
