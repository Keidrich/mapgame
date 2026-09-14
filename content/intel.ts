/**
 * What a bank or an armoured depot is worth before you rob it.
 *
 * Both business types exist with `income: [0,0]`, `valueMult: 0`, `rackets: []` — they are pure
 * heist targets and do nothing on any other day. Nobody extorts a bank teller for protection
 * money, so the fix is not a racket bolted onto them: it is the wire. You get inside an
 * employee, and what you learn is worth something on its own.
 *
 * Two shapes, matching what the two buildings actually are:
 *  - a **skim** inside a bank: a small, persistent drip, the standing version of what Wire
 *    Fraud does once.
 *  - a **route** out of a depot: nothing today, but the next armoured-car job goes far better
 *    because you know when the truck moves and who is on it.
 */
export type IntelKind = 'skim' | 'route';

export interface IntelDef {
  label: string;
  icon: string;
  blurb: string;
  /** Business type this comes out of. */
  from: 'bank' | 'armored_depot';
  /** Days before it is worthless: rotas change, auditors arrive. */
  lifetime: number;
}

export const INTEL: Record<IntelKind, IntelDef> = {
  skim: {
    label: 'An inside skim', icon: '🏦', from: 'bank', lifetime: 40,
    blurb: 'Somebody inside moves a little, often, into an account that closes on Fridays. It is not a fortune and it is not supposed to be — it is a fortune slowly.',
  },
  route: {
    label: 'A route and a rota', icon: '🚚', from: 'armored_depot', lifetime: 25,
    blurb: 'Which truck, which morning, which two men, and the one stretch of road where it is alone. Worth nothing by itself and a great deal on the day.',
  },
};

export const SKIM = {
  /** Dirty cash per day, before the teller's nerve and your tech. */
  base: 120,
  perTech: 22,
  /** Chance a day's skim is noticed and the whole thing closes. Compounds with how long it runs. */
  baseRisk: 0.018,
  dayRisk: 0.035,
  /** Heat per day it runs. Small — this is the quietest money in the game, which is the point. */
  heat: 0.3,
  /** What being caught does to the person you leaned on. */
  trustHit: -35,
};

export const ROUTE = {
  /** Difficulty taken off `heist_armored` while the route is current. A real, felt discount. */
  difficulty: 22,
  /** …and a share off the heat, because you are not improvising. */
  heatMult: 0.8,
  /** Chance per day the rota changes under you and the tip goes stale early. */
  staleChance: 0.04,
};
