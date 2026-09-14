import type { BusinessType } from '@sim/types';
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
export type IntelKind = 'skim' | 'route' | 'consign' | 'offshore' | 'trade';

export interface IntelDef {
  label: string;
  icon: string;
  blurb: string;
  /** Business type this comes out of. Widened as the institutions arrived; the shape did not. */
  from: BusinessType;
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
  // ---------------------------------------------------------------- the institutions
  // Three more of exactly the same shape, because the shape was right: an institution pays out
  // through somebody inside it, never through a racket bolted onto its front counter.
  consign: {
    label: 'A consignment window', icon: '🖼️', from: 'gallery', lifetime: 35,
    blurb: 'Things arrive, hang for a season and leave with paperwork saying where they were all along. One of them each time is yours.',
  },
  offshore: {
    label: 'Accounts somewhere else', icon: '📇', from: 'accountant', lifetime: 55,
    blurb: 'Somebody who signs things for a living signs a few more. Far more money goes through than any laundry you could build — and every pound of it is written down somewhere.',
  },
  trade: {
    label: 'A trade lane', icon: '🚢', from: 'importer', lifetime: 30,
    blurb: 'A standing lane in and out: what moves on it, whose name is on the manifest, and which week nobody counts twice. Goods, not detail.',
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


/**
 * A gallery's consignment window: a fence with a wall and a mailing list.
 *
 * Shaped on `SKIM` deliberately — a drip rather than a payday — but it moves *goods* rather than
 * money, so it pays in `hot_goods` and wants somewhere to sell them. That is the whole difference,
 * and it is why the two are separate kinds rather than one with a multiplier.
 */
export const CONSIGN = {
  /** Hot goods per day, before the player's charm and the gallery's standing. */
  base: 2.2,
  perCharm: 0.28,
  baseRisk: 0.02,
  dayRisk: 0.03,
  heat: 0.4,
  trustHit: -30,
};

/**
 * Offshore accounts. The most laundering capacity in the game by a distance, and the only one
 * that writes a receipt.
 *
 * The liability is the point and it is not flavour: every day it runs adds to a paper trail, and
 * once that trail is deep enough it can surface as a real `CaseFile` through the ordinary case
 * system — the same files a hit or a bank job opens, with the same evidence clock and the same
 * ways to kill it. Nothing new; it just has a new way in.
 */
export const OFFSHORE = {
  /** Daily laundering capacity, against a laundering racket's few hundred. */
  capacity: 2600,
  perBrains: 180,
  /** The rate is worse than a laundry of your own: somebody else is taking a cut of every pound. */
  rate: 0.72,
  /** Paper per day it runs, and how much of it before a file can open. */
  paperPerDay: 1,
  paperPerThousand: 0.6,
  filesAt: 55,
  /** Chance per day, once the trail is deep enough, that somebody actually pulls it. */
  surfaceChance: 0.05,
  /** Evidence the file opens with. A cold start, but a long one. */
  startEvidence: 30,
  heat: 0.2,
  trustHit: -40,
};

/**
 * A trade lane out of an import/export firm. The depot route, generalised: nothing today, and a
 * real discount on the jobs that move goods across the city on the day you use it.
 */
export const TRADE = {
  /** Difficulty taken off the trade-flavoured ops while the lane is current. */
  difficulty: 18,
  heatMult: 0.85,
  staleChance: 0.03,
  /** Which ops a lane actually helps. Named here so the list is content, not a condition in code. */
  helps: ['convoy_run', 'dockside_pickup', 'hijack_load', 'smuggle_run', 'heist_containers'] as const,
};
