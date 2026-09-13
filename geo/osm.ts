/** Overpass query text and response parsing. Pure: the fetch itself lives in the UI layer. */
import type { Polyline } from './polygonize';
import { toXY, type XY } from './project';
import type { GeoLandmark, GeoPlace } from './types';
import type { BusinessType, LatLng } from '@sim/types';

export const ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];

export function bboxFor(origin: LatLng, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111320; const dLng = radiusM / (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return [origin.lat - dLat, origin.lng - dLng, origin.lat + dLat, origin.lng + dLng]; // S W N E
}

export function roadsQuery(origin: LatLng, radiusM: number): string {
  const b = bboxFor(origin, radiusM).map(v => v.toFixed(5)).join(',');
  return `[out:json][timeout:40];(way["highway"~"^(${ROAD_TYPES.join('|')})$"](${b});way["natural"="water"](${b});way["waterway"="riverbank"](${b});way["landuse"~"^(industrial|port|harbour)$"](${b}););out geom;`;
}

export function poisQuery(origin: LatLng, radiusM: number): string {
  const b = bboxFor(origin, radiusM).map(v => v.toFixed(5)).join(',');
  const amen = 'bar|pub|biergarten|restaurant|cafe|fast_food|nightclub|bank|taxi|stripclub|casino|gambling|car_wash';
  const shop = 'convenience|pawnbroker|car_repair|hairdresser|jewelry|jewellery|laundry|dry_cleaning|supermarket|tobacco|alcohol|pawn';
  return `[out:json][timeout:40];(nwr["amenity"~"^(${amen})$"](${b});nwr["shop"~"^(${shop})$"](${b});nwr["leisure"="fitness_centre"](${b});nwr["tourism"~"^(motel|hotel|hostel|guest_house)$"](${b});nwr["building"~"^(warehouse|industrial)$"](${b});nwr["office"="construction_company"](${b});nwr["amenity"~"^(school|college|kindergarten|police)$"](${b});node["place"~"^(neighbourhood|suburb|quarter)$"](${b}););out center;`;
}

interface OsmElement { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[]; center?: { lat: number; lon: number } }
export interface OsmResponse { elements: OsmElement[] }

export interface ParsedRoads { roads: Polyline[]; nodePos: Map<string, XY>; water: XY[][]; industrial: XY[][] }

export function parseRoads(res: OsmResponse, origin: LatLng): ParsedRoads {
  const roads: Polyline[] = []; const nodePos = new Map<string, XY>(); const water: XY[][] = []; const industrial: XY[][] = [];
  for (const el of res.elements) {
    if (el.type !== 'way' || !el.geometry || !el.nodes) continue;
    const t = el.tags ?? {};
    const ring = el.geometry.map(p => toXY(origin, { lat: p.lat, lng: p.lon }));
    if (t.natural === 'water' || t.waterway === 'riverbank') { if (ring.length >= 4) water.push(ring); continue; }
    if (t.landuse) { if (ring.length >= 4) industrial.push(ring); continue; }
    if (!t.highway) continue;
    if (t.tunnel === 'yes' || t.area === 'yes') continue; // tunnels do not bound blocks; pedestrian areas are plazas
    const ids = el.nodes.map(String);
    ids.forEach((id, i) => { if (!nodePos.has(id)) nodePos.set(id, ring[i]); });
    roads.push({ id: String(el.id), nodes: ids, name: t.name });
  }
  return { roads, nodePos, water, industrial };
}

export interface ParsedPois { pois: { id: string; name?: string; type: BusinessType; pos: LatLng }[]; places: GeoPlace[]; landmarks: GeoLandmark[] }

export function parsePois(res: OsmResponse): ParsedPois {
  const pois: ParsedPois['pois'] = []; const places: GeoPlace[] = []; const landmarks: GeoLandmark[] = [];
  for (const el of res.elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const pos = { lat, lng: lon };
    if (t.place && el.type === 'node' && t.name) { places.push({ name: t.name, pos, kind: t.place as GeoPlace['kind'] }); continue; }
    if (t.amenity === 'school' || t.amenity === 'college' || t.amenity === 'kindergarten') { landmarks.push({ kind: 'school', name: t.name, pos }); continue; }
    if (t.amenity === 'police') { landmarks.push({ kind: 'police', name: t.name, pos }); continue; }
    const type = classify(t); if (!type) continue;
    pois.push({ id: `${el.type[0]}${el.id}`, name: t.name?.trim() || undefined, type, pos });
  }
  return { pois, places, landmarks };
}

export function classify(t: Record<string, string>): BusinessType | undefined {
  const a = t.amenity, s = t.shop;
  if (a === 'bar' || a === 'pub' || a === 'biergarten') return 'bar';
  if (a === 'restaurant') return 'restaurant';
  if (a === 'cafe' || a === 'fast_food') return 'diner';
  if (a === 'nightclub' || a === 'stripclub' || a === 'casino' || a === 'gambling') return 'nightclub';
  if (a === 'bank') return 'bank';
  if (a === 'taxi' || a === 'car_wash') return 'cab_company';
  if (s === 'convenience' || s === 'supermarket' || s === 'tobacco' || s === 'alcohol') return 'corner_store';
  if (s === 'pawnbroker' || s === 'pawn') return 'pawn';
  if (s === 'car_repair') return 'garage';
  if (s === 'hairdresser') return 'barbershop';
  if (s === 'jewelry' || s === 'jewellery') return 'jeweller';
  if (s === 'laundry' || s === 'dry_cleaning') return 'laundromat';
  if (t.leisure === 'fitness_centre') return 'gym';
  if (t.tourism === 'motel' || t.tourism === 'hotel' || t.tourism === 'hostel' || t.tourism === 'guest_house') return 'motel';
  if (t.building === 'warehouse' || t.building === 'industrial') return 'warehouse';
  if (t.office === 'construction_company') return 'construction';
  return undefined;
}
