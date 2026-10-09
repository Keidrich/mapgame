/** Provider-independent geometry for the real-city preview. Coordinates are metres, east/right
 * and south/down, shared by SVG and Three's X/Z plane. No network or simulation state here. */
import { labelPoint, pointInRing, signedArea, toXY, type XY } from './project';
import type { LatLng } from '@sim/types';

export interface OsmGeometryElement {
  type: 'way' | 'relation' | 'node'; id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}
export interface RealBuilding {
  id: string; rings: XY[][]; center: XY; address: string; kind: string;
  height: number; minHeight: number; heightSource: 'measured' | 'levels' | 'estimated';
}
export interface RealStreet { id: string; name: string; points: XY[]; width: number; major: boolean }
export interface RealCity {
  version: 1; name: string; origin: LatLng; bounds: { minX: number; minY: number; maxX: number; maxY: number };
  source: { provider: 'OpenStreetMap'; timestamp: string; retrievedAt?: string; attribution: string; license: string };
  buildings: RealBuilding[]; streets: RealStreet[]; parks: { id: string; name: string; rings: XY[][] }[];
}

/** OSM lengths are normally metres, with occasional explicit feet. Reject ambiguous lists. */
export function metres(value?: string): number | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*(m|ft|feet|')?$/i);
  if (!match) return undefined;
  const n = Number(match[1]) * (match[2] && match[2].toLowerCase() !== 'm' ? 0.3048 : 1);
  return Number.isFinite(n) && n > 0 && n < 1500 ? n : undefined;
}

export function buildingHeight(tags: Record<string, string>, area?: number): Pick<RealBuilding, 'height' | 'minHeight' | 'heightSource'> {
  const measured = metres(tags.height);
  const levels = /^\d+(\.\d+)?$/.test(tags['building:levels'] ?? '') ? Number(tags['building:levels']) : 0;
  // Missing data stays explicitly estimated; it must never masquerade as surveyed height.
  const height = measured ?? (levels > 0 && levels < 200 ? levels * 3.2 : estimatedBuildingHeight(tags.building ?? 'yes', area));
  const minHeight = Math.min(metres(tags.min_height) ?? 0, Math.max(0, height - 1));
  return { height, minHeight, heightSource: measured ? 'measured' : levels > 0 && levels < 200 ? 'levels' : 'estimated' };
}

const same = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
function ring(points: XY[]): XY[] | undefined {
  if (points.length < 4 || !same(points[0], points[points.length - 1])) return;
  const clean = points.slice(0, -1).filter((p, i) => i === 0 || !same(p, points[i - 1]));
  return clean.length >= 3 && Math.abs(signedArea(clean)) >= 2 ? clean : undefined;
}

/** A relation's outer/inner rings can be split into multiple ways, with mixed directions. */
function stitch(parts: XY[][]): XY[][] {
  const todo = parts.filter(p => p.length >= 2).map(p => [...p]); const out: XY[][] = [];
  while (todo.length) {
    let path = todo.shift()!;
    while (!same(path[0], path[path.length - 1])) {
      const end = path[path.length - 1];
      const i = todo.findIndex(p => same(end, p[0]) || same(end, p[p.length - 1]));
      if (i < 0) break;
      const next = todo.splice(i, 1)[0];
      if (!same(end, next[0])) next.reverse();
      path = path.concat(next.slice(1));
    }
    const closed = ring(path); if (closed) out.push(closed);
  }
  return out;
}

export function parseRealCity(elements: OsmGeometryElement[], origin: LatLng, bbox: [number, number, number, number], timestamp: string): RealCity {
  const project = (g?: { lat: number; lon: number }[]) => {
    if (!g || g.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) return [];
    return g.map(p => { const xy = toXY(origin, { lat: p.lat, lng: p.lon }); return { x: +xy.x.toFixed(2), y: +(-xy.y).toFixed(2) }; });
  };
  const nw = project([{ lat: bbox[2], lon: bbox[1] }])[0], se = project([{ lat: bbox[0], lon: bbox[3] }])[0];
  const city: RealCity = { version: 1, name: 'Lower East Side', origin,
    bounds: { minX: nw.x, minY: nw.y, maxX: se.x, maxY: se.y },
    source: { provider: 'OpenStreetMap', timestamp, attribution: '© OpenStreetMap contributors', license: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    buildings: [], streets: [], parks: [] };
  const members = new Set<number>();
  const addBuilding = (el: OsmGeometryElement, rings: XY[][], suffix = '') => {
    const t = el.tags ?? {};
    const address = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    city.buildings.push({ id: `osm:${el.type}:${el.id}${suffix}`, rings, center: labelPoint(rings[0]),
      address: address || 'Unnumbered building', kind: t.building ?? 'yes', ...buildingHeight(t, footprintArea({ rings })) });
  };
  // Relations first; only suppress a member way when its parent was successfully assembled.
  for (const el of elements.filter(e => e.type === 'relation' && e.tags?.building && e.tags.building !== 'no')) {
    const outer = stitch((el.members ?? []).filter(m => m.role === 'outer' || !m.role).map(m => project(m.geometry)));
    const inner = stitch((el.members ?? []).filter(m => m.role === 'inner').map(m => project(m.geometry)));
    outer.forEach((o, i) => addBuilding(el, [o, ...inner.filter(h => pointInRing(h[0], o))], `:${i}`));
    if (outer.length) for (const m of el.members ?? []) if (m.type === 'way') members.add(m.ref);
  }
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const t = el.tags ?? {}, points = project(el.geometry);
    if (t.building && t.building !== 'no' && !members.has(el.id)) { const r = ring(points); if (r) addBuilding(el, [r]); }
    if (t.highway && t.tunnel !== 'yes' && t.area !== 'yes' && points.length >= 2) {
      const major = ['primary', 'secondary', 'tertiary'].includes(t.highway);
      const foot = ['footway', 'path', 'pedestrian', 'steps', 'cycleway'].includes(t.highway);
      city.streets.push({ id: `osm:way:${el.id}`, name: t.name ?? '', points, major, width: Math.min(40, metres(t.width) ?? (foot ? 3 : major ? 16 : t.highway === 'service' ? 5 : 9)) });
    }
    if (t.leisure === 'park') { const r = ring(points); if (r) city.parks.push({ id: `osm:way:${el.id}`, name: t.name ?? 'Park', rings: [r] }); }
  }
  city.buildings.sort((a, b) => a.id.localeCompare(b.id));
  city.streets.sort((a, b) => a.id.localeCompare(b.id));
  city.parks.sort((a, b) => a.id.localeCompare(b.id));
  return city;
}

/** Net usable footprint excludes courtyards. Estimates never overwrite tagged heights. */
export function footprintArea(b: Pick<RealBuilding, 'rings'>): number {
  return Math.max(0, Math.abs(signedArea(b.rings[0])) - b.rings.slice(1).reduce((n, r) => n + Math.abs(signedArea(r)), 0));
}
export function estimatedBuildingHeight(kind: string, area = 200): number {
  if (['shed', 'hut', 'garage', 'garages', 'roof', 'kiosk'].includes(kind) || area < 35) return 3.2;
  if (area < 80) return 6.4;
  if (area < 180) return 9.6;
  return 15;
}
export function prepareRealCity(city: RealCity): RealCity {
  return { ...city, buildings: city.buildings.map(b => b.heightSource !== 'estimated' ? b :
    { ...b, height: Math.max(b.minHeight + 1, estimatedBuildingHeight(b.kind, footprintArea(b))) }) };
}
/** A small amenity, narrow sliver or elevated structure is scenery, never a storefront. */
export function isStorefrontFootprint(b: RealBuilding, minimumArea = 45): boolean {
  if (b.minHeight > .5 || ['shed', 'hut', 'roof', 'garages', 'kiosk', 'church', 'chapel', 'cathedral', 'mosque', 'temple', 'school', 'hospital', 'service', 'toilets', 'greenhouse', 'tank', 'tower'].includes(b.kind)) return false;
  const area = footprintArea(b), ring = b.rings[0];
  const span = Math.max(...ring.map(p => p.x)) - Math.min(...ring.map(p => p.x));
  const depth = Math.max(...ring.map(p => p.y)) - Math.min(...ring.map(p => p.y));
  return area >= minimumArea && area / Math.max(span, depth, 1) >= 4;
}
