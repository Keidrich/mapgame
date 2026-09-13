/**
 * Where a new game actually starts.
 *
 * A city coordinate is one point — the literal downtown pin — so picking "Tokyo" twice
 * used to drop you on the same kerb both times. When the place we resolved is city-level
 * (the random button, or a broad search result), we walk a few km off that pin in a random
 * direction first, so a replay of the same city is a different neighbourhood: a different
 * district mix, different streets, different people.
 *
 * Only city-level picks move. An address somebody typed and the device's own location are
 * exact: those are where the player means, and they are never touched.
 *
 * Pure and seeded, like everything else in `sim/`: the UI hands in an `Rng`.
 */
import { toLatLng } from '@geo/project';
import type { Rng } from './rng';
import type { LatLng } from './types';

/** How precisely we know what the player asked for. Only 'city' is ever jittered. */
export type PlacePrecision = 'city' | 'exact' | 'device';

/** Far enough to be a different neighbourhood, near enough to still be that city. */
export const JITTER_MIN_M = 1000;
export const JITTER_MAX_M = 4000;
/** Whatever a caller asks for, a start never moves further than this from the city it named. */
export const JITTER_HARD_CAP_M = 6000;
/** The compass, in eighths: consecutive picks land in different parts of town. */
export const SECTORS = 8;
export const SECTOR_LABELS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export interface Corner {
  origin: LatLng;     // where the game will actually start
  base: LatLng;       // the city pin it came from
  sector: number;     // 0..7, which eighth of the compass
  distanceM: number;
  label: string;      // 'the north-east side', for the UI
}

export interface JitterOptions {
  /** Cap the offset — a small town should not throw you into the fields. Clamped to the hard cap. */
  maxM?: number;
  /** Keep away from this eighth of the compass: how "try a different corner" stays different. */
  avoidSector?: number;
}

/**
 * A start a few km off a city's pin, biased to land somewhere with a different character:
 * one eighth of the compass is chosen (never the one we were just in), and the distance is
 * area-weighted, so most starts sit out in the neighbourhoods rather than back on the pin.
 */
export function jitterOrigin(base: LatLng, rng: Rng, opts: JitterOptions = {}): Corner {
  const maxM = Math.max(JITTER_MIN_M + 200, Math.min(JITTER_HARD_CAP_M, opts.maxM ?? JITTER_MAX_M));
  const sector = pickSector(rng, opts.avoidSector);
  // anywhere inside the eighth, with a margin off the spokes so the direction reads as the label
  const within = 0.12 + rng.float() * 0.76;
  const bearing = ((sector + within) / SECTORS) * 2 * Math.PI;
  // sqrt keeps the draw even over the ring's area instead of bunching at the middle
  const distanceM = JITTER_MIN_M + Math.sqrt(rng.float()) * (maxM - JITTER_MIN_M);
  const origin = toLatLng(base, { x: Math.sin(bearing) * distanceM, y: Math.cos(bearing) * distanceM });
  return { origin, base, sector, distanceM, label: `the ${SECTOR_LABELS[sector]} side` };
}

function pickSector(rng: Rng, avoid?: number): number {
  if (avoid === undefined) return rng.int(0, SECTORS - 1);
  const s = rng.int(0, SECTORS - 2);        // one fewer, then skip the one we came from
  return s >= ((avoid % SECTORS) + SECTORS) % SECTORS ? s + 1 : s;
}

/** Should this pick move at all? Only a city-level one. */
export function shouldJitter(precision: PlacePrecision): boolean { return precision === 'city'; }

/**
 * What a geocoder row actually points at. Nominatim answers with a class and a type: a
 * city, town or admin boundary is a whole city (jitter it), a house number, street, shop
 * or neighbourhood is a place somebody meant exactly (leave it alone).
 */
const CITY_TYPES = new Set(['city', 'town', 'municipality', 'borough', 'county', 'state', 'province', 'region', 'district', 'island']);
export function placePrecision(row: { class?: string; type?: string; addresstype?: string } | undefined): PlacePrecision {
  const type = row?.addresstype ?? row?.type ?? '';
  if (row?.class === 'place' && CITY_TYPES.has(type)) return 'city';
  if (row?.class === 'boundary' && (type === 'administrative' || CITY_TYPES.has(type))) return 'city';
  return 'exact';
}

/** Metres across a geocoder bounding box ([south, north, west, east] as strings), or undefined. */
export function boxSpanM(box: unknown): number | undefined {
  if (!Array.isArray(box) || box.length < 4) return undefined;
  const [s, n, w, e] = box.map(Number);
  if ([s, n, w, e].some(v => !Number.isFinite(v))) return undefined;
  const lat = Math.abs(n - s) * 111320;
  const lng = Math.abs(e - w) * 111320 * Math.cos(((n + s) / 2) * (Math.PI / 180));
  return Math.max(lat, lng);
}
