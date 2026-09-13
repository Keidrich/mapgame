/** Headless pipeline test on real OSM data: `npx vite-node scripts/real-osm.ts -- <roads.json> <pois.json> <lat> <lng>` */
import { readFileSync } from 'node:fs';
import { buildChunk, chunkBounds, chunkKeyAt, chunkNeighbors } from '@geo/chunks';
import { parsePois, parseRoads, type OsmResponse } from '@geo/osm';
import { PLAYER, dispatch, generateWorld, select, type World } from '@sim/index';

const [roadsPath, poisPath, latS, lngS] = process.argv.slice(2);
const origin = { lat: Number(latS), lng: Number(lngS) };
const allRoads = JSON.parse(readFileSync(roadsPath, 'utf8')) as OsmResponse;
const allPois = JSON.parse(readFileSync(poisPath, 'utf8')) as OsmResponse;

function clip(res: OsmResponse, s: number, w: number, n: number, e: number): OsmResponse {
  return { elements: res.elements.filter(el => {
    if (el.type === 'way' && el.geometry) return el.geometry.some(p => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e);
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon; return lat !== undefined && lon !== undefined && lat >= s && lat <= n && lon >= w && lon <= e;
  }) };
}
function chunkFor(key: string) {
  const b = chunkBounds(key); const m = 0.003, ml = 0.003 / Math.cos((b.center.lat * Math.PI) / 180);
  const t0 = performance.now();
  const r = parseRoads(clip(allRoads, b.south - m, b.west - ml, b.north + m, b.east + ml), b.center);
  const p = parsePois(clip(allPois, b.south - m, b.west - ml, b.north + m, b.east + ml));
  const c = buildChunk({ key, roads: r.roads, nodePos: r.nodePos, water: r.water, industrial: r.industrial, pois: p.pois, places: p.places });
  console.log(`chunk ${key}: ${r.roads.length} ways, ${r.nodePos.size} nodes → ${c.blocks.length} blocks, ${c.pois.length} pois, ${c.places.length} places in ${(performance.now() - t0).toFixed(0)} ms`);
  return c;
}
const key = chunkKeyAt(origin);
const start = chunkFor(key);
let w: World = generateWorld({ origin, placeName: 'Vaduz', playerName: 'Tester', background: 'charm', seed: 11, chunk: start });
console.log('districts:', Object.values(w.districts).map(d => `${d.name} (${d.kind}, ${d.blockIds.length})`).join('; '));
console.log('real businesses:', Object.values(w.businesses).filter(b => b.flags.includes('real')).map(b => `${b.name} [${b.type}]`).slice(0, 12).join(', '));
console.log('sample blocks:', Object.values(w.blocks).slice(0, 8).map(b => `${b.name} (${Math.round(b.areaM2)} m², ${b.neighborIds.length} nb)`).join('; '));
const areas = Object.values(w.blocks).map(b => b.areaM2).sort((a, b) => a - b);
console.log(`block areas m²: min ${Math.round(areas[0])} median ${Math.round(areas[areas.length >> 1])} max ${Math.round(areas[areas.length - 1])}; factions ${Object.keys(w.factions).length}`);
for (const nk of chunkNeighbors(key)) { const c = chunkFor(nk); if (c.blocks.length) { w = dispatch(w, { type: 'populate_chunk', chunk: c }); } }
console.log('after neighbours:', Object.keys(w.blocks).length, 'blocks,', Object.keys(w.npcs).length, 'npcs,', Object.keys(w.factions).length, 'factions; cross-chunk links:', Object.values(w.blocks).filter(b => b.neighborIds.some(n => w.blocks[n]?.chunkKey !== b.chunkKey)).length);
const t1 = performance.now();
for (let d = 0; d < 30; d++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
console.log(`30 days in ${(performance.now() - t1).toFixed(0)} ms; day ${w.day}; save size ${(JSON.stringify(w).length / 1024).toFixed(0)} KB`);
for (const f of Object.values(w.factions)) console.log(`  ${f.name}: ${select.blocksOf(w, f.id).length} blocks, ${f.stance[PLAYER]}`);
