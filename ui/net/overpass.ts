/**
 * The only network code for world building. Fetches streets and points of
 * interest around a point from OpenStreetMap's Overpass API (mirrors tried in
 * order), and turns them into a GeoCity. Throws if every mirror fails; the
 * caller falls back to the hex city.
 */
import { buildCity } from '@geo/blocks';
import { parsePois, parseRoads, poisQuery, roadsQuery, type OsmResponse } from '@geo/osm';
import type { GeoCity } from '@geo/types';
import type { LatLng } from '@sim/types';

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const FETCH_RADIUS_M = 1900;  // what we download
export const PLAY_RADIUS_M = 1600;   // what becomes blocks

async function overpass(query: string, onStatus: (s: string) => void, timeoutMs = 45000): Promise<OsmResponse> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OsmResponse;
      if (!Array.isArray(json.elements)) throw new Error('bad response');
      return json;
    } catch (e) {
      lastErr = e; onStatus(`Map server busy, trying another…`);
    } finally { clearTimeout(t); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass unavailable');
}

export async function fetchCity(origin: LatLng, onStatus: (s: string) => void): Promise<GeoCity> {
  onStatus('Downloading streets…');
  const roadsRes = await overpass(roadsQuery(origin, FETCH_RADIUS_M), onStatus);
  const roads = parseRoads(roadsRes, origin);
  if (roads.roads.length < 20) throw new Error('Not enough streets here');
  onStatus(`Finding businesses… (${roads.roads.length} streets)`);
  let pois = { pois: [] as ReturnType<typeof parsePois>['pois'], places: [] as ReturnType<typeof parsePois>['places'] };
  try { pois = parsePois(await overpass(poisQuery(origin, FETCH_RADIUS_M), onStatus)); } catch { /* streets are enough; businesses get invented */ }
  onStatus('Drawing blocks…');
  await new Promise(r => setTimeout(r, 30)); // let the status paint before the heavy synchronous work
  const city = buildCity({ origin, roads: roads.roads, nodePos: roads.nodePos, water: roads.water, industrial: roads.industrial, pois: pois.pois, places: pois.places, radiusM: PLAY_RADIUS_M, maxBlocks: 220 });
  if (city.blocks.length < 25) throw new Error('Not enough blocks here');
  return city;
}
