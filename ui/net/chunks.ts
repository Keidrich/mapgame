/**
 * Chunk geometry loader: IndexedDB cache → Overpass (mirrors). It never falls
 * back to a grid on its own: a chunk that cannot be mapped is an error the
 * caller shows, and a grid is only ever an explicit choice (`gridChunk`).
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
const CACHE_VERSION = 'c3'; // c3: chunks carry school/police landmarks

const inflight = new Map<string, Promise<GeoChunk>>();
const memory = new Map<string, GeoChunk>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 45000;

export function cachedChunk(key: string): GeoChunk | undefined { return memory.get(key); }
export function allCachedChunks(): GeoChunk[] { return [...memory.values()]; }
/** A chunk that failed recently; the map waits a bit before asking the server again. */
export function recentlyFailed(key: string): boolean { return (failedAt.get(key) ?? 0) > Date.now() - RETRY_AFTER_MS; }
/** The explicit grid: only when the player chooses it. */
export function gridChunk(key: string): GeoChunk { return hexChunk(key); } // never cached: a grid chunk is never a reason to stop asking for the streets

export interface LoadOptions { onStatus?: (s: string) => void; timeoutMs?: number; attempts?: number }
/** Resolves with real street geometry or rejects with a reason. Never a grid. */
export function loadChunk(key: string, onStatus?: (s: string) => void, opts: LoadOptions = {}): Promise<GeoChunk> {
  const hit = memory.get(key); if (hit) return Promise.resolve(hit);
  const running = inflight.get(key); if (running) return running;
  const status = onStatus ?? opts.onStatus ?? (() => {});
  const p = (async () => {
    const stored = await idbGet<GeoChunk>(`${CACHE_VERSION}:${key}`);
    if (stored) { memory.set(key, stored); return stored; }
    let lastErr: unknown;
    for (let i = 0; i < (opts.attempts ?? 1); i++) {
      try {
        const chunk = await fetchChunk(key, status, opts.timeoutMs ?? 25000);
        memory.set(key, chunk); failedAt.delete(key);
        void idbSet(`${CACHE_VERSION}:${key}`, chunk);
        return chunk;
      } catch (e) { lastErr = e; if (i + 1 < (opts.attempts ?? 1)) status(`Trying again… (${reason(e)})`); }
    }
    failedAt.set(key, Date.now());
    throw lastErr instanceof Error ? lastErr : new Error('Could not map this area');
  })();
  inflight.set(key, p);
  void p.then(() => inflight.delete(key), () => inflight.delete(key)); // clear the slot without creating an unhandled rejection
  return p;
}
export function reason(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(m)) return 'map server timed out';
  if (/HTTP 429|HTTP 504|HTTP 503/.test(m)) return 'map server busy';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'no connection to the map server';
  return m;
}

/** Mirrors that fail move to the back of the line for the rest of the session. */
let mirrors = OVERPASS_MIRRORS.slice();
async function overpass(query: string, onStatus: (s: string) => void, timeoutMs = 25000): Promise<OsmResponse> {
  let lastErr: unknown;
  for (const url of mirrors.slice()) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OsmResponse;
      if (!Array.isArray(json.elements)) throw new Error('bad response');
      return json;
    } catch (e) { lastErr = e; mirrors = [...mirrors.filter(m => m !== url), url]; onStatus(`Map server busy (${reason(e)}), trying another…`); }
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
    const t = setTimeout(() => { worker.terminate(); reject(new Error('block builder timed out')); }, 40000);
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
  const p = job.pois ? parsePois(job.pois) : { pois: [], places: [], landmarks: [] };
  return { chunk: buildChunk({ key: job.key, roads: r.roads, nodePos: r.nodePos, water: r.water, industrial: r.industrial, pois: p.pois, places: p.places, landmarks: p.landmarks }), streets: r.roads.length };
}

async function fetchChunk(key: string, onStatus: (s: string) => void, timeoutMs: number): Promise<GeoChunk> {
  onStatus('Downloading streets…');
  const roads = await overpass(chunkRoadsQuery(key), onStatus, timeoutMs);
  const ways = roads.elements.filter(e => e.type === 'way' && e.tags?.highway).length;
  if (ways < 12) throw new Error('not enough streets here (open water, or nothing mapped)');
  onStatus(`Finding businesses… (${ways} streets)`);
  let pois: OsmResponse | null = null;
  try { pois = await overpass(chunkPoisQuery(key), onStatus, Math.min(timeoutMs, 20000)); } catch { /* businesses get invented */ }
  onStatus(`Drawing blocks… (${ways} streets)`);
  const job: ChunkJob = { key, roads, pois };
  let built: { chunk: GeoChunk; streets: number };
  try { built = await buildInWorker(job); }
  catch { onStatus('Drawing blocks (slow path)…'); await new Promise(r => setTimeout(r, 20)); built = buildInline(job); }
  if (built.chunk.blocks.length < 8) throw new Error('not enough blocks here');
  return built.chunk;
}
