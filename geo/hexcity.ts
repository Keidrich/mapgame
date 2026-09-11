/** Offline fallback: a hex disc as a GeoCity, so the sim never needs to know which it got. */
import { hexCenter, hexCorners, hexKey, neighbors, spiral } from '@sim/hex';
import type { LatLng } from '@sim/types';
import type { GeoCity } from './types';

export const HEX_RADIUS = 6;
export const HEX_SIZE_M = 190;

export function hexCity(origin: LatLng): GeoCity {
  const hexes = spiral(HEX_RADIUS);
  const idByKey = new Map<string, string>();
  hexes.forEach((h, i) => idByKey.set(hexKey(h), `b${i + 1}`));
  const area = (3 * Math.sqrt(3) / 2) * HEX_SIZE_M * HEX_SIZE_M;
  const blocks = hexes.map((h, i) => ({
    id: `b${i + 1}`, hex: h,
    polygon: hexCorners(origin, h, HEX_SIZE_M), center: hexCenter(origin, h, HEX_SIZE_M), areaM2: area,
    neighborIds: neighbors(h).map(n => idByKey.get(hexKey(n))).filter((x): x is string => !!x),
    streetNames: [],
  }));
  return { source: 'hex', origin, blocks, pois: [], places: [], industrialBlockIds: [], waterAdjacentBlockIds: [] };
}
