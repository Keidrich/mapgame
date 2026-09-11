/**
 * Faces → game blocks: drop water and giant faces, merge slivers into their
 * neighbours, cap the count, compute adjacency, name blocks after their streets,
 * and drop points of interest into the block that contains them.
 */
import { buildGraph, faces, type Face, type Graph, type Polyline } from './polygonize';
import { centroid, distanceM, pointInRing, signedArea, simplifyRing, toLatLng, toXY, type XY } from './project';
import type { GeoBlock, GeoCity, GeoPlace, GeoPoi } from './types';
import type { LatLng } from '@sim/types';

export interface BuildInput {
  origin: LatLng;
  roads: Polyline[];
  nodePos: Map<string, XY>;      // metres from origin
  water: XY[][];                 // closed rings
  industrial: XY[][];
  pois: { id: string; name?: string; type: GeoPoi['type']; pos: LatLng }[];
  places: GeoPlace[];
  radiusM?: number;              // keep faces whose centre is within this radius
  maxBlocks?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
}

interface Work { ring: string[]; area: number; edges: Set<string> }
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const ringEdges = (ring: string[]) => { const s = new Set<string>(); for (let i = 0; i < ring.length; i++) s.add(ekey(ring[i], ring[(i + 1) % ring.length])); return s; };

export function buildCity(input: BuildInput): GeoCity {
  const radius = input.radiusM ?? 1700, maxBlocks = input.maxBlocks ?? 200, maxArea = input.maxAreaM2 ?? 400_000;
  let minArea = input.minAreaM2 ?? 3500;
  const g = buildGraph(input.roads, input.nodePos);
  const all = faces(g);
  const xyOf = (ring: string[]) => ring.map(n => g.pos.get(n)!);
  const inWater = (c: XY) => input.water.some(r => pointInRing(c, r));
  let work: Work[] = all
    .filter(f => f.area <= maxArea)
    .filter(f => { const c = centroid(xyOf(f.ring)); return Math.hypot(c.x, c.y) <= radius && !inWater(c); })
    .map(f => ({ ring: f.ring, area: f.area, edges: ringEdges(f.ring) }));

  // merge slivers into the neighbour they share the most boundary with; raise the bar until we fit the cap
  for (let round = 0; round < 12; round++) {
    work = mergeSmall(work, g, minArea);
    if (work.length <= maxBlocks) break;
    minArea *= 1.5;
  }
  if (work.length > maxBlocks) { // still too many: keep the ones nearest the origin
    work.sort((a, b) => { const ca = centroid(xyOf(a.ring)), cb = centroid(xyOf(b.ring)); return Math.hypot(ca.x, ca.y) - Math.hypot(cb.x, cb.y); });
    work = work.slice(0, maxBlocks);
  }

  // adjacency: faces sharing at least one edge
  const edgeOwners = new Map<string, string[]>();
  const blocks: GeoBlock[] = work.map((f, i) => {
    const id = `b${i + 1}`;
    for (const e of f.edges) { if (!edgeOwners.has(e)) edgeOwners.set(e, []); edgeOwners.get(e)!.push(id); }
    const xy = xyOf(f.ring); const c = centroid(xy);
    return { id, polygon: simplifyRing(xy).map(p => toLatLng(input.origin, p)), center: toLatLng(input.origin, c), areaM2: Math.abs(signedArea(xy)), neighborIds: [], streetNames: streetNames(f.ring, g) };
  });
  const byId = new Map(blocks.map(b => [b.id, b]));
  for (const owners of edgeOwners.values()) if (owners.length > 1) for (const a of owners) for (const b of owners) if (a !== b && !byId.get(a)!.neighborIds.includes(b)) byId.get(a)!.neighborIds.push(b);
  // blocks that ended up with no neighbours (islands after filtering) attach to the nearest block so the AI can reach them
  for (const b of blocks) if (!b.neighborIds.length && blocks.length > 1) {
    const nearest = blocks.filter(o => o !== b).sort((p, q) => distanceM(p.center, b.center) - distanceM(q.center, b.center))[0];
    b.neighborIds.push(nearest.id); nearest.neighborIds.push(b.id);
  }

  // POIs → containing block
  const rings = blocks.map(b => b.polygon.map(p => toXY(input.origin, p)));
  const pois: GeoPoi[] = [];
  for (const p of input.pois) {
    const xy = toXY(input.origin, p.pos);
    const i = rings.findIndex(r => pointInRing(xy, r));
    if (i >= 0) pois.push({ id: p.id, name: p.name, type: p.type, pos: p.pos, blockId: blocks[i].id });
  }
  const industrialBlockIds = blocks.filter((_, i) => { const c = centroid(rings[i]); return input.industrial.some(r => pointInRing(c, r)); }).map(b => b.id);
  const waterAdjacentBlockIds = blocks.filter((b, i) => rings[i].some(p => input.water.some(w => distToRing(p, w) < 60)) || (b.neighborIds.length <= 2 && b.areaM2 > 20000)).map(b => b.id);
  return { source: 'osm', origin: input.origin, blocks, pois, places: input.places, industrialBlockIds, waterAdjacentBlockIds };
}

function mergeSmall(work: Work[], g: Graph, minArea: number): Work[] {
  const xyOf = (ring: string[]) => ring.map(n => g.pos.get(n)!);
  let list = work.slice();
  for (let iter = 0; iter < 2000; iter++) {
    list.sort((a, b) => a.area - b.area);
    const small = list.find(f => f.area < minArea); if (!small) break;
    let best: Work | undefined; let bestShared = 0;
    for (const o of list) { if (o === small) continue; let shared = 0; for (const e of small.edges) if (o.edges.has(e)) shared++; if (shared > bestShared) { bestShared = shared; best = o; } }
    if (!best) { list = list.filter(f => f !== small); continue; } // isolated sliver: drop it
    const merged = union(small.ring, best.ring);
    if (!merged) { list = list.filter(f => f !== small); continue; }
    const xy = xyOf(merged); const area = Math.abs(signedArea(xy));
    list = list.filter(f => f !== small && f !== best);
    list.push({ ring: merged, area, edges: ringEdges(merged) });
  }
  return list;
}

/** Union of two adjacent rings with the same orientation: drop the shared edges and re-chain. Holes are ignored. */
export function union(a: string[], b: string[]): string[] | undefined {
  const dir = new Map<string, string>();
  const add = (ring: string[]) => { for (let i = 0; i < ring.length; i++) dir.set(`${ring[i]}>${ring[(i + 1) % ring.length]}`, ring[(i + 1) % ring.length]); };
  add(a); add(b);
  const next = new Map<string, string[]>();
  for (const k of dir.keys()) {
    const [u, v] = k.split('>');
    if (dir.has(`${v}>${u}`)) continue; // shared edge, opposite directions → interior
    if (!next.has(u)) next.set(u, []); next.get(u)!.push(v);
  }
  let bestLoop: string[] | undefined;
  const used = new Set<string>();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: string[] = []; let cur = start; let guard = 0;
    while (guard++ < 10000) { loop.push(cur); used.add(cur); const outs = next.get(cur); if (!outs?.length) break; cur = outs[0]; if (cur === start) break; }
    if (cur === start && loop.length >= 3 && (!bestLoop || loop.length > bestLoop.length)) bestLoop = loop;
  }
  return bestLoop;
}

function streetNames(ring: string[], g: Graph): string[] {
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

export { faces, buildGraph };
export type { Face };
