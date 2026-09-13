/// <reference lib="webworker" />
/** Builds a GeoChunk from raw Overpass responses off the main thread. */
import { buildChunk, chunkBounds } from '@geo/chunks';
import { parsePois, parseRoads, type OsmResponse } from '@geo/osm';

export interface ChunkJob { key: string; roads: OsmResponse; pois: OsmResponse | null }

self.onmessage = (ev: MessageEvent<ChunkJob>) => {
  const { key, roads, pois } = ev.data;
  try {
    const origin = chunkBounds(key).center;
    const r = parseRoads(roads, origin);
    const p = pois ? parsePois(pois) : { pois: [], places: [] };
    const chunk = buildChunk({ key, roads: r.roads, nodePos: r.nodePos, water: r.water, industrial: r.industrial, pois: p.pois, places: p.places });
    self.postMessage({ ok: true, chunk, streets: r.roads.length });
  } catch (e) {
    self.postMessage({ ok: false, error: (e as Error).message });
  }
};
