/** Reproduce the preview fixture from an Overpass `out geom` extract. Fetching is explicit and
 * outside the client: opening the game never puts a new request on the public Overpass servers.
 * Usage: npx vite-node scripts/import-real-city.ts -- /path/to/les-osm.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseRealCity, type OsmGeometryElement } from '../geo/realCity';

const input = process.argv.filter(x => x.endsWith('.json'))[0];
if (!input) throw new Error('Pass the path to an Overpass JSON extract. See docs/REAL_CITY.md.');
const raw = JSON.parse(readFileSync(input, 'utf8')) as { elements: OsmGeometryElement[]; osm3s?: { timestamp_osm_base?: string }; retrievedAt?: string; remark?: string };
if (raw.remark || !Array.isArray(raw.elements)) throw new Error(`Incomplete extract: ${raw.remark ?? 'elements missing'}`);
const city = parseRealCity(raw.elements, { lat: 40.719, lng: -73.9865 }, [40.713, -73.995, 40.725, -73.978], raw.osm3s?.timestamp_osm_base ?? 'unknown');
city.source.retrievedAt = raw.retrievedAt;
if (city.buildings.length < 100 || city.streets.length < 20) throw new Error('Extract is too small for the Manhattan preview.');
writeFileSync('public/data/lower-east-side.json', JSON.stringify(city));
console.log(`${city.buildings.length} buildings, ${city.streets.length} street segments, ${city.parks.length} parks; OSM ${city.source.timestamp}`);
