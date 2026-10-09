/** Real geography supplies block topology; the existing seeded generator supplies fiction.
 * Never remap a generated save. This constructor is for a separately saved neighborhood. */
import { footprintArea, isStorefrontFootprint, type RealCity } from '@geo/realCity';
import { buildGraph, faces } from '@geo/polygonize';
import { labelPoint, pointInRing } from '@geo/project';
import { DISTRICTS } from '@r/content/world';
import type { GeneratedCity } from './city';
import { newWorld } from './generate';
import { hashString, Rng } from './rng';
import type { Block, BusinessType, District, World } from './types';

const key = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const edge = (a: string, b: string) => [a, b].sort().join('|');
export function geographyId(city: RealCity): string {
  // Geometry changes must not silently relocate a saved business. Independent of input order.
  const parts = [...city.streets.map(s => `${s.id}:${s.points.map(key).join(';')}`),
    ...city.buildings.map(b => `${b.id}:${b.rings.map(r => r.map(key).join(';')).join('/')}`)].sort();
  return `les-v1-${hashString(parts.join('\n')).toString(36)}`;
}

export function realCityGeography(city: RealCity, seed = 7) {
  const streets = city.streets.filter(s => s.width >= 5).sort((a, b) => a.id.localeCompare(b.id));
  const pos = new Map(streets.flatMap(s => s.points.map(p => [key(p), p] as const)));
  const graph = buildGraph(streets.map(s => ({ id: s.id, name: s.name, nodes: s.points.map(key) })), pos);
  const candidates = faces(graph).filter(f => f.area >= 600 && f.area <= 90000).map(f => {
    const poly = f.ring.map(n => pos.get(n)!);
    const buildings = city.buildings.filter(b => pointInRing(b.center, poly)).sort((a, b) => a.id.localeCompare(b.id));
    const edges = f.ring.map((n, i) => edge(n, f.ring[(i + 1) % f.ring.length]));
    const id = `real:b:${hashString([...edges].sort().join('/')).toString(36)}`;
    const names = [...new Set(edges.map(e => graph.edgeName.get(e)).filter((s): s is string => !!s))].sort();
    return { id, poly, buildings, edges, name: names.slice(0, 2).join(' & ') || 'Neighborhood block' };
  }).filter(b => b.buildings.length >= 2).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(candidates.map(b => b.id)).size !== candidates.length) throw new Error('Duplicate geographic block ID.');
  const byEdge = new Map<string, string[]>();
  for (const b of candidates) for (const e of b.edges) byEdge.set(e, [...(byEdge.get(e) ?? []), b.id]);
  const neighbors = new Map(candidates.map(b => [b.id, [...new Set(b.edges.flatMap(e => byEdge.get(e) ?? []).filter(id => id !== b.id))].sort()]));
  // Disconnected edge scraps remain scenery, not fabricated walkable connections.
  const seen = new Set<string>(); let connected: string[] = [];
  for (const b of candidates) {
    if (seen.has(b.id)) continue;
    const component = [b.id]; seen.add(b.id);
    for (let i = 0; i < component.length; i++) for (const n of neighbors.get(component[i]) ?? []) if (!seen.has(n)) { seen.add(n); component.push(n); }
    if (component.length > connected.length) connected = component;
  }
  const keep = new Set(connected), blocks: Record<string, Block> = {}, districts: Record<string, District> = {};
  const buildingsByBlock: Record<string, string[]> = {}, rng = new Rng(seed ^ 0x4c4553);
  const { minX, maxX, minY, maxY } = city.bounds;
  // Equal-size east-to-west fictional wards keep each faction home viable (six blocks).
  const playable = candidates.filter(b => keep.has(b.id)).sort((a, b) => labelPoint(a.poly).x - labelPoint(b.poly).x || a.id.localeCompare(b.id));
  const wardCount = Math.min(4, Math.floor(playable.length / 6));
  for (const [index, b] of playable.entries()) {
    const center = labelPoint(b.poly), sector = Math.floor(index * wardCount / playable.length);
    const did = `real:d:${sector}`, kind = (['oldtown', 'market', 'strip'] as const)[sector % 3], def = DISTRICTS[kind];
    // These are fictional simulation wards, not claims about real residents or local crime.
    if (!districts[did]) districts[did] = { id: did, name: `Lower East Side · Ward ${sector + 1}`, kind, center, wealth: rng.int(...def.wealth), police: rng.int(...def.police), attention: 0, precinctId: `real:p:${sector}`, blockIds: [] };
    const d = districts[did]; d.attention = d.police; d.blockIds.push(b.id);
    blocks[b.id] = { id: b.id, name: b.name, districtId: did, poly: b.poly, center,
      // Compatibility metadata only. Real geometry is the polygon and explicit neighbor graph.
      cells: [0, 0, 0, 0], neighborIds: neighbors.get(b.id)!.filter(id => keep.has(id)), waterfront: false,
      wealth: d.wealth, population: def.population, heat: 0, influence: {}, businessIds: [] };
    buildingsByBlock[b.id] = b.buildings.map(x => x.id);
  }
  if (connected.length < 12 || Object.keys(districts).length < 2) throw new Error(`Not enough connected streets for a neighborhood: ${candidates.length} candidates, ${connected.length} connected, ${Object.keys(districts).length} wards.`);
  const first = Object.keys(blocks)[0];
  const gen: GeneratedCity = { city: { name: 'New York', motto: 'Real streets. A fictional empire.',
    geography: { kind: 'real', id: geographyId(city) }, width: maxX - minX, height: maxY - minY,
    cols: 0, rows: 0, verts: [], streets: streets.map((s, i) => ({ id: s.id, name: s.name, points: s.points, axis: 'x', index: i, rank: s.major ? 0 : 1 })),
    bridges: [], parks: city.parks.map(p => ({ id: p.id, name: p.name, poly: p.rings[0] })) }, blocks, districts,
    precincts: Object.values(districts).map(d => ({ id: d.precinctId, name: `Ward ${d.id.split(':').pop()} precinct`, blockId: d.blockIds[0], districtIds: [d.id] })),
    cityHallBlockId: first, courthouseBlockId: first };
  return { gen, buildingsByBlock };
}

/** Ground-floor area budgets, in square metres; this is place suitability, not game balance. */
const AREA: Partial<Record<BusinessType, number>> = { laundromat: 65, restaurant: 70, diner: 60,
  bar: 65, nightclub: 160, gym: 120, garage: 120, warehouse: 200, motel: 160, scrapyard: 150,
  construction: 100, cab_company: 100, bank: 140, casino: 200, armored_depot: 200, gallery: 100 };
export const placeFits = (city: RealCity, id: string | undefined, type: BusinessType) => {
  const b = city.buildings.find(b => b.id === id);
  return !!b && isStorefrontFootprint(b, AREA[type] ?? 45);
};
/** Repair only invalid bindings, on the same saved block. IDs, owners, relationships and RNG stay put. */
export function repairRealCityPlaces(world: World, city: RealCity): { world: World; moved: number } {
  if (!world.city.geography || world.city.geography.id !== geographyId(city)) throw new Error('The map does not match this campaign.');
  if (world.city.geography.placementVersion === 2) return { world, moved: 0 };
  const w = structuredClone(world), byId = new Map(city.buildings.map(b => [b.id, b]));
  let moved = 0;
  for (const block of Object.values(w.blocks)) {
    const choices = city.buildings.filter(b => pointInRing(b.center, block.poly) && isStorefrontFootprint(b));
    const occupied = new Set(block.businessIds.map(id => w.businesses[id]).filter(b => placeFits(city, b.buildingId, b.type)).map(b => b.buildingId));
    // Larger premises get first choice, so a small shop cannot use the only warehouse-sized site.
    const businesses = block.businessIds.map(id => w.businesses[id]).sort((a, b) => (AREA[b.type] ?? 45) - (AREA[a.type] ?? 45) || a.id.localeCompare(b.id));
    for (const b of businesses) {
      const old = b.buildingId ? byId.get(b.buildingId) : undefined;
      if (old && placeFits(city, old.id, b.type) && pointInRing(old.center, block.poly)) continue;
      const suitable = choices.filter(site => isStorefrontFootprint(site, AREA[b.type] ?? 45));
      const score = (site: typeof choices[number]) => (occupied.has(site.id) ? 100000 : 0) + (site.address === 'Unnumbered building' ? 10000 : 0) + footprintArea(site);
      suitable.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
      const site = suitable[0];
      if (!site) throw new Error(`No suitable premises for ${b.name}; the existing save was preserved.`);
      b.buildingId = site.id; b.pos = { ...site.center }; occupied.add(site.id); moved++;
    }
  }
  w.city.geography!.placementVersion = 2;
  return { world: w, moved };
}
export function newRealCityWorld(city: RealCity, seed = 7): World {
  const { gen } = realCityGeography(city, seed);
  const w = newWorld({ seed, size: 'small', name: 'Nobody', background: 'grifter' }, gen);
  return repairRealCityPlaces(w, city).world;
}
