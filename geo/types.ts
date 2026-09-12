/** Geography layer: pure geometry, no React, no network. Produces a GeoCity the sim generates from. */
import type { LatLng, BusinessType, DistrictKind } from '@sim/types';

export interface GeoBlock {
  id: string;
  polygon: LatLng[];      // ring, closed implicitly
  center: LatLng;
  areaM2: number;
  neighborIds: string[];
  streetNames: string[];  // named roads on the boundary, longest first
  hex?: { q: number; r: number };
  edgeKeys?: string[];    // boundary edges as node-id pairs, for linking across chunks
}

export interface GeoPoi {
  id: string;
  name?: string;
  type: BusinessType;
  pos: LatLng;
  blockId?: string;
}

export interface GeoPlace { name: string; pos: LatLng; kind: 'neighbourhood' | 'suburb' | 'quarter' }

export interface GeoCity {
  source: 'osm' | 'hex';
  origin: LatLng;
  blocks: GeoBlock[];
  pois: GeoPoi[];
  places: GeoPlace[];
  /** Blocks whose polygon is mostly industrial land (used for district flavour). */
  industrialBlockIds: string[];
  waterAdjacentBlockIds: string[];
}

export type { LatLng, BusinessType, DistrictKind };
