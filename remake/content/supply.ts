/**
 * The supply chain: which places can take your product, how much they want, what they pay, who
 * carries it, and how often a load is taken on the road. Data, read by `sim/supply.ts`.
 *
 * The street sells a lot at a time off a corner. A supply chain is steadier: bars, clubs and
 * restaurants that you protect or own buy by the case every night — at better than the street
 * pays, with less heat, as long as somebody drives it to them.
 */
import type { BusinessType, Product } from '@r/sim/types';

/** What each kind of place will take, in lots a night, at an ordinary block (wealth 50). */
export const OUTLETS: Partial<Record<BusinessType, Partial<Record<Product, number>>>> = {
  bar: { booze: 10, green: 3 },
  nightclub: { booze: 12, pills: 6, green: 5 },
  restaurant: { booze: 8 },
  diner: { booze: 4 },
  casino: { booze: 10, pills: 4 },
};

export const SUPPLY = {
  /** Demand scales with the block: ×(0.5 + wealth/100). */
  wealthBase: 0.5,
  /** What a lot fetches against the street price: a protected place pays more (it is buying quiet,
   *  steady stock); one you own keeps the bar's margin too. At 1.15/1.3 it paid barely better than
   *  a dealing racket selling the same lots the next day, and the bots came out $10k poorer for
   *  the night hours it cost them. */
  protectedMult: 1.4, ownedMult: 1.7,
  /** Street selling puts heat on the block; a delivery into a back door puts a third of it. */
  heatShare: 0.33,
  /** A driver carries this many lots a night, more with wheels and a real car. */
  driverBase: 12, perWheels: 3, perCarBonus: 8,
  /** A load taken on the road: a base chance, more with any outfit at war or beef with you, more
   *  with heat; an armed driver halves it. */
  hijack: { base: 0.02, war: 0.06, perHeat: 0.0006, armed: 0.5 },
  /** Driving a round yourself, after dark: two hours, the same van a crew driver would load. */
  selfAp: 2,
  /** A place that is kept supplied likes you a little more every night. */
  trust: 0.5,
};
