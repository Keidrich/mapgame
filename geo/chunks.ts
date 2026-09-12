/**
 * The world is loaded in chunks: square cells of ~2.2 km. Each chunk is fetched
 * from OpenStreetMap on demand, polygonised into blocks, and populated by the sim
 * the first time the player goes there. Block ids are stable hashes of their
 * street-node ring, so a chunk re-fetched later maps onto the same saved blocks.
 */
import { hashString } from '@sim/rng';
import type { LatLng } from '@sim/types';
import { buildGraph, faces } from './polygonize';
import type { Polyline } from './polygonize';
import { centroid, pointInRing, signedArea, simplifyRing, toLatLng, toXY, type XY } from './project';
import type { GeoBlock, GeoPlace, GeoPoi } from './types';
import { hexCorners, hexCenter, hexKey, latLngToHex, neighbors, spiral, hexToMeters, metersToLatLng } from '@sim/hex';

export const CHUNK_DEG = 0.02; // latitude degrees per chunk (~2.2 km)
export interface ChunkBounds { key: string; cx: number; cy: number; south: number; west: number; north: number; east: number; center: LatLng }

export function chunkKeyAt(p: LatLng): string { const { cx, cy } = chunkIndex(p); return `${cx}_${cy}`; }
export function chunkIndex(p: LatLng): { cx: number; cy: number } {
  const cy = Math.floor(p.lat / CHUNK_DEG);
  const dLng = CHUNK_DEG / Math.max(0.2, Math.cos(((cy + 0.5) * CHUNK_DEG * Math.PI) / 180));
  return { cx: Math.floor(p.lng / dLng), cy };
}
export function chunkBounds(key: string): ChunkBounds {
  const [cx, cy] = key.split('_').map(Number);
  const south = cy * CHUNK_DEG, north = south + CHUNK_DEG;
  const dLng = CHUNK_DEG / Math.max(0.2, Math.cos(((cy + 0.5) * CHUNK_DEG * Math.PI) / 180));
  const west = cx * dLng, east = west + dLng;
  return { key, cx, cy, south, west, north, east, center: { lat: (south + north) / 2, lng: (west + east) / 2 } };
}
/** Chunk keys intersecting a lat/lng box. */
export function chunksInBox(south: number, west: number, north: number, east: number, max = 12): string[] {
  const out: string[] = [];
  const a = chunkIndex({ lat: south, lng: west }), b = chunkIndex({ lat: north, lng: east });
  for (let cy = a.cy; cy <= b.cy; cy++) {
    const dLng = CHUNK_DEG / Math.max(0.2, Math.cos(((cy + 0.5) * CHUNK_DEG * Math.PI) / 180));
    for (let cx = Math.floor(west / dLng); cx <= Math.floor(east / dLng); cx++) { out.push(`${cx}_${cy}`); if (out.length >= max) return out; }
  }
  return out;
}
export function chunkNeighbors(key: string): string[] {
  const [cx, cy] = key.split('_').map(Number);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${cx + dx}_${cy + dy}`);
}

export interface GeoChunk {
  key: string;
  source: 'osm' | 'hex';
  blocks: GeoBlock[];   // each with edgeKeys for cross-chunk linking
  pois: GeoPoi[];
  places: GeoPlace[];
  industrialBlockIds: string[];
  waterAdjacentBlockIds: string[];
}

export interface ChunkInput {
  key: string;
  roads: Polyline[];
  nodePos: Map<string, XY>;    // metres from the chunk centre
  water: XY[][];
  industrial: XY[][];
  pois: { id: string; name?: string; type: GeoPoi['type']; pos: LatLng }[];
  places: GeoPlace[];
  minAreaM2?: number;
  maxAreaM2?: number;
  maxBlocks?: number;
}

const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const ringEdges = (ring: string[]) => { const s = new Set<string>(); for (let i = 0; i < ring.length; i++) s.add(ekey(ring[i], ring[(i + 1) % ring.length])); return s; };
interface Work { ring: string[]; area: number; edges: Set<string> }

export function buildChunk(input: ChunkInput): GeoChunk {
  const bounds = chunkBounds(input.key); const origin = bounds.center;
  const maxArea = input.maxAreaM2 ?? 400_000, maxBlocks = input.maxBlocks ?? 260;
  let minArea = input.minAreaM2 ?? 3500;
  const g = buildGraph(input.roads, input.nodePos);
  const xyOf = (ring: string[]) => ring.map(n => g.pos.get(n)!);
  const inside = (c: XY) => { const ll = toLatLng(origin, c); return ll.lat >= bounds.south && ll.lat < bounds.north && ll.lng >= bounds.west && ll.lng < bounds.east; };
  const inWater = (c: XY) => input.water.some(r => pointInRing(c, r));
  let work: Work[] = faces(g)
    .filter(f => f.area <= maxArea)
    .filter(f => { const c = centroid(xyOf(f.ring)); return inside(c) && !inWater(c); })
    .map(f => ({ ring: f.ring, area: f.area, edges: ringEdges(f.ring) }));
  for (let round = 0; round < 12; round++) { work = mergeSmall(work, g, minArea); if (work.length <= maxBlocks) break; minArea *= 1.5; }
  if (work.length > maxBlocks) { work.sort((a, b) => b.area - a.area); work = work.slice(0, maxBlocks); }

  const edgeOwners = new Map<string, string[]>();
  const blocks: GeoBlock[] = work.map(f => {
    const id = `b${hashString(f.ring.slice().sort().join(',')).toString(36)}`;
    for (const e of f.edges) { if (!edgeOwners.has(e)) edgeOwners.set(e, []); edgeOwners.get(e)!.push(id); }
    const xy = xyOf(f.ring); const c = centroid(xy);
    return { id, polygon: simplifyRing(xy).map(p => toLatLng(origin, p)), center: toLatLng(origin, c), areaM2: Math.abs(signedArea(xy)), neighborIds: [], streetNames: streetNames(f.ring, g), edgeKeys: [...f.edges] };
  });
  // de-duplicate ids (two faces with identical node sets cannot happen; two hashes colliding is astronomically rare, but keep it safe)
  const seen = new Set<string>(); for (const b of blocks) { while (seen.has(b.id)) b.id += 'x'; seen.add(b.id); }
  const byId = new Map(blocks.map(b => [b.id, b]));
  for (const owners of edgeOwners.values()) if (owners.length > 1) for (const a of owners) for (const b of owners) if (a !== b && !byId.get(a)!.neighborIds.includes(b)) byId.get(a)!.neighborIds.push(b);

  const rings = blocks.map(b => b.polygon.map(p => toXY(origin, p)));
  const pois: GeoPoi[] = [];
  for (const p of input.pois) {
    const xy = toXY(origin, p.pos);
    const i = rings.findIndex(r => pointInRing(xy, r));
    if (i >= 0) pois.push({ id: p.id, name: p.name, type: p.type, pos: p.pos, blockId: blocks[i].id });
  }
  const industrialBlockIds = blocks.filter((_, i) => { const c = centroid(rings[i]); return input.industrial.some(r => pointInRing(c, r)); }).map(b => b.id);
  const waterAdjacentBlockIds = blocks.filter((b, i) => rings[i].some(p => input.water.some(w => distToRing(p, w) < 60)) || (b.neighborIds.length <= 2 && b.areaM2 > 20000)).map(b => b.id);
  const places = input.places.filter(p => p.pos.lat >= bounds.south && p.pos.lat < bounds.north && p.pos.lng >= bounds.west && p.pos.lng < bounds.east);
  return { key: input.key, source: 'osm', blocks, pois, places, industrialBlockIds, waterAdjacentBlockIds };
}

/** Offline / empty-area fallback: hexes tiling the chunk, ids stable by hex coordinate. */
export function hexChunk(key: string): GeoChunk {
  const b = chunkBounds(key); const origin = b.center; const size = 190;
  const hexes = spiral(9).filter(h => { const c = hexCenter(origin, h, size); return c.lat >= b.south && c.lat < b.north && c.lng >= b.west && c.lng < b.east; });
  const ids = new Map(hexes.map(h => [hexKey(h), `h${b.cx}_${b.cy}_${h.q}_${h.r}`]));
  const area = (3 * Math.sqrt(3) / 2) * size * size;
  const blocks: GeoBlock[] = hexes.map(h => ({
    id: ids.get(hexKey(h))!, hex: h, polygon: hexCorners(origin, h, size), center: hexCenter(origin, h, size), areaM2: area,
    neighborIds: neighbors(h).map(n => ids.get(hexKey(n))).filter((x): x is string => !!x), streetNames: [],
    // edge keys let hex chunks link to their neighbours across the chunk border
    edgeKeys: hexEdgeKeys(origin, h, size),
  }));
  return { key, source: 'hex', blocks, pois: [], places: [], industrialBlockIds: [], waterAdjacentBlockIds: [] };
}
function hexEdgeKeys(origin: LatLng, h: { q: number; r: number }, size: number): string[] {
  // global hex edge = the two adjacent hexes' global keys; hexes are global because chunks share the same lattice only within a chunk,
  // so use rounded corner coordinates instead
  const cs = hexCorners(origin, h, size).map(c => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
  return cs.map((c, i) => ekey(c, cs[(i + 1) % cs.length]));
}

function mergeSmall(work: Work[], g: ReturnType<typeof buildGraph>, minArea: number): Work[] {
  const xyOf = (ring: string[]) => ring.map(n => g.pos.get(n)!);
  let list = work.slice();
  for (let iter = 0; iter < 3000; iter++) {
    list.sort((a, b) => a.area - b.area);
    const small = list.find(f => f.area < minArea); if (!small) break;
    let best: Work | undefined; let bestShared = 0;
    for (const o of list) { if (o === small) continue; let shared = 0; for (const e of small.edges) if (o.edges.has(e)) shared++; if (shared > bestShared) { bestShared = shared; best = o; } }
    if (!best) { list = list.filter(f => f !== small); continue; }
    const merged = union(small.ring, best.ring);
    if (!merged) { list = list.filter(f => f !== small); continue; }
    const area = Math.abs(signedArea(xyOf(merged)));
    list = list.filter(f => f !== small && f !== best);
    list.push({ ring: merged, area, edges: ringEdges(merged) });
  }
  return list;
}

export function union(a: string[], b: string[]): string[] | undefined {
  const dir = new Map<string, string>();
  const add = (ring: string[]) => { for (let i = 0; i < ring.length; i++) dir.set(`${ring[i]}>${ring[(i + 1) % ring.length]}`, ring[(i + 1) % ring.length]); };
  add(a); add(b);
  const next = new Map<string, string[]>();
  for (const k of dir.keys()) { const [u, v] = k.split('>'); if (dir.has(`${v}>${u}`)) continue; if (!next.has(u)) next.set(u, []); next.get(u)!.push(v); }
  let bestLoop: string[] | undefined; const used = new Set<string>();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: string[] = []; let cur = start; let guard = 0;
    while (guard++ < 10000) { loop.push(cur); used.add(cur); const outs = next.get(cur); if (!outs?.length) break; cur = outs[0]; if (cur === start) break; }
    if (cur === start && loop.length >= 3 && (!bestLoop || loop.length > bestLoop.length)) bestLoop = loop;
  }
  return bestLoop;
}

function streetNames(ring: string[], g: ReturnType<typeof buildGraph>): string[] {
  const len = new Map<string, number>();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const name = g.edgeName.get(ekey(a, b)); if (!name) continue;
    const pa = g.pos.get(a)!, pb = g.pos.get(b)!;
    len.set(name, (len.get(name) ?? 0) + Math.hypot(pa.x - pb.x, pa.y - pb.y));
  }
  return [...len.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]);
}
function distToRing(p: XY, ring: XY[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}
void latLngToHex; void hexToMeters; void metersToLatLng;
