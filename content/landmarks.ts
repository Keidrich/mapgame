/**
 * The handful of places in the city that are only there once.
 *
 * Everything else on the map is generated from a type: there are eleven bars and they differ by
 * name, income and who owns them. A landmark is the opposite — one building, placed once, with a
 * job that exists nowhere else and cannot be practised on something smaller.
 *
 * They are ordinary `Business` records of ordinary types, so every system in the game reads them
 * without a special case: you can case one, buy one (if you can clear the tier-4 standing floor),
 * run its racket, watch a faction take protection on it. The only thing that makes one a landmark
 * is `Business.landmark`, and the only thing that field does is unlock one op.
 */
import type { BusinessType, OpKind } from '@sim/types';

export type LandmarkId = 'grand_casino' | 'courthouse' | 'port' | 'central_station' | 'observatory';

export interface LandmarkDef {
  id: LandmarkId;
  name: string;
  /** What kind of building it is, so it generates and behaves like anything else of that type. */
  type: BusinessType;
  /** The district it wants. Falls back to anywhere if the city has none of that kind. */
  district: string;
  blurb: string;
  /** The one job that exists only here. */
  op: OpKind;
}

export const LANDMARKS: LandmarkDef[] = [
  {
    id: 'grand_casino', name: 'The Grand', type: 'casino', district: 'strip',
    blurb: 'Four floors, two thousand people a night, and a count room nobody has ever seen twice.',
    op: 'count_night',
  },
  {
    id: 'courthouse', name: 'County Courthouse', type: 'development_co', district: 'downtown',
    blurb: 'Everything anybody ever did to anybody in this city, in a basement, in boxes.',
    op: 'records_room',
  },
  {
    id: 'port', name: 'The Port Authority', type: 'shipping_line', district: 'docks',
    blurb: 'Nine miles of fence and a manifest for every box behind it.',
    op: 'manifest_swap',
  },
  {
    id: 'central_station', name: 'Union Station', type: 'development_co', district: 'downtown',
    blurb: 'Forty thousand people a day, every one of them carrying something, none of them looking at anybody.',
    op: 'left_luggage',
  },
  {
    id: 'observatory', name: 'The Old Observatory', type: 'merchant_bank', district: 'heights',
    blurb: 'Nobody has looked at a star from up here in sixty years. The vault under it was never emptied.',
    op: 'dome_job',
  },
];

export const LANDMARK_BY_OP = Object.fromEntries(LANDMARKS.map(l => [l.op, l])) as Record<string, LandmarkDef>;
export const LANDMARK_OPS = LANDMARKS.map(l => l.op);
