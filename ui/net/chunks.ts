/**
 * Chunk geometry loader: IndexedDB cache → Overpass (mirrors) → hex fallback.
 * Only the UI talks to the network; the sim receives finished GeoChunks.
 */
import { buildChunk, chunkBounds, hexChunk, type GeoChunk } from '@geo/chunks';
import { parsePois, parseRoads, type OsmResponse } from '@geo/osm';
import type { ChunkJob } from './chunkWorker';
import { ROAD_TYPES } from '@geo/osm';
import { idbGet, idbSet } from './idb';

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const MARGIN_DEG = 0.003; // ~330 m so faces on the chunk border are complete
const CACHE_VERSION = 'c2';

const inflight = new Map<string, Promise<GeoChunk>>();
const memory = new Map<string, GeoChunk>();

export function cachedChunk(key: string): GeoChunk | undefined { return memory.get(key); }
export function allCachedChunks(): GeoChunk[] { return [...memory.values()]; }

export function loadChunk(key: string, onStatus?: (s: string) => void): Promise<GeoChunk> {
  const hit = memory.get(key); if (hit) return Promise.resolve(hit);
  const running = inflight.get(key); if (running) return running;
  const p = (async () => {
    const stored = await idbGet<GeoChunk>(`${CACHE_VERSION}:${key}`);
    if (stored) { memory.set(key, stored); return stored; }
    let chunk: GeoChunk;
    try { chunk = await fetchChunk(key, onStatus ?? (() => {})); }
    catch { chunk = hexChunk(key); }
    memory.set(key, chunk);
    if (chunk.source === 'osm') void idbSet(`${CACHE_VERSION}:${key}`, chunk);
    return chunk;
  })();
  inflight.set(key, p);
  p.finally(() => inflight.delete(key));
  return p;
}

async function overpass(query: string, onStatus: (s: string) => void, timeoutMs = 25000): Promise<OsmResponse> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OsmResponse;
      if (!Array.isArray(json.elements)) throw new Error('bad response');
      return json;
    } catch (e) { lastErr = e; onStatus('Map server busy, trying another…'); }
    finally { clearTimeout(t); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass unavailable');
}

function bboxOf(key: string): string {
  const b = chunkBounds(key); const dLng = MARGIN_DEG / Math.max(0.2, Math.cos((b.center.lat * Math.PI) / 180));
  return [b.south - MARGIN_DEG, b.west - dLng, b.north + MARGIN_DEG, b.east + dLng].map(v => v.toFixed(5)).join(',');
}
export function chunkRoadsQuery(key: string): string {
  const bb = bboxOf(key);
  return `[out:json][timeout:25];(way["highway"~"^(${ROAD_TYPES.join('|')})$"](${bb});way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});way["landuse"~"^(industrial|port|harbour)$"](${bb}););out geom;`;
}
export function chunkPoisQuery(key: string): string {
  const bb = bboxOf(key);
  const amen = 'bar|pub|biergarten|restaurant|cafe|fast_food|nightclub|bank|taxi|stripclub|casino|gambling|car_wash';
  const shop = 'convenience|pawnbroker|car_repair|hairdresser|jewelry|jewellery|laundry|dry_cleaning|supermarket|tobacco|alcohol|pawn';
  return `[out:json][timeout:25];(nwr["amenity"~"^(${amen})$"](${bb});nwr["shop"~"^(${shop})$"](${bb});nwr["leisure"="fitness_centre"](${bb});nwr["tourism"~"^(motel|hotel|hostel|guest_house)$"](${bb});nwr["building"~"^(warehouse|industrial)$"](${bb});nwr["office"="construction_company"](${bb});node["place"~"^(neighbourhood|suburb|quarter)$"](${bb}););out center;`;
}

/** Run the polygoniser in a worker when we can, inline otherwise (tests, old browsers). */
function buildInWorker(job: ChunkJob): Promise<{ chunk: GeoChunk; streets: number }> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' }); }
    catch { return reject(new Error('no worker')); }
    const t = setTimeout(() => { worker.terminate(); reject(new Error('block builder timed out')); }, 20000);
    worker.onmessage = (ev: MessageEvent<{ ok: boolean; chunk?: GeoChunk; streets?: number; error?: string }>) => {
      clearTimeout(t); worker.terminate();
      if (ev.data.ok && ev.data.chunk) resolve({ chunk: ev.data.chunk, streets: ev.data.streets ?? 0 }); else reject(new Error(ev.data.error ?? 'worker failed'));
    };
    worker.onerror = e => { clearTimeout(t); worker.terminate(); reject(new Error(e.message || 'worker error')); };
    worker.postMessage(job);
  });
}
function buildInline(job: ChunkJob): { chunk: GeoChunk; streets: number } {
  const origin = chunkBounds(job.key).center;
  const r = parseRoads(job.roads, origin);
  const p = job.pois ? parsePois(job.pois) : { pois: [], places: [] };
  return { chunk: buildChunk({ key: job.key, roads: r.roads, nodePos: r.nodePos, water: r.water, industrial: r.industrial, pois: p.pois, places: p.places }), streets: r.roads.length };
}

async function fetchChunk(key: string, onStatus: (s: string) => void): Promise<GeoChunk> {
  onStatus('Downloading streets…');
  const roads = await overpass(chunkRoadsQuery(key), onStatus);
  const ways = roads.elements.filter(e => e.type === 'way' && e.tags?.highway).length;
  if (ways < 12) throw new Error('Not enough streets here');
  onStatus(`Finding businesses… (${ways} streets)`);
  let pois: OsmResponse | null = null;
  try { pois = await overpass(chunkPoisQuery(key), onStatus, 15000); } catch { /* businesses get invented */ }
  onStatus('Drawing blocks…');
  const job: ChunkJob = { key, roads, pois };
  let built: { chunk: GeoChunk; streets: number };
  try { built = await buildInWorker(job); }
  catch (e) { if ((e as Error).message === 'block builder timed out') throw e; built = buildInline(job); }
  if (built.chunk.blocks.length < 8) throw new Error('Not enough blocks here');
  return built.chunk;
}
