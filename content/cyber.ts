/**
 * The wire: stolen cards, taps, and the tech answer to heat.
 *
 * Everything here is game state — tiers, timers, dice weights — in the same shape as the
 * rackets and ops around it. There is no technique in this file and none anywhere it is used:
 * a card is a number with a freshness clock, a tap is a risk that compounds per day, and
 * "running it" is a roll against two thresholds. The skin is 1970s crime fiction; the
 * mechanics are the ones the rest of the game already uses.
 *
 * The card brand is invented. There is no real issuer, network or number anywhere in RACKETS.
 */
import type { Skills } from '@sim/types';

/** An invented brand. Deliberately not any real card network. */
export const CARD_BRAND = 'Bellwether';

export type CardTier = 'classic' | 'gold' | 'black';
export interface CardTierDef {
  label: string;
  icon: string;
  limit: [number, number];   // what it is good for before anybody notices
  weight: number;            // how often one turns up in a pocket
  heat: number;              // per run
}
export const CARD_TIERS: Record<CardTier, CardTierDef> = {
  classic: { label: `${CARD_BRAND} Classic`, icon: '💳', limit: [300, 900], weight: 6, heat: 1 },
  gold:    { label: `${CARD_BRAND} Gold`, icon: '💳', limit: [1200, 3500], weight: 3, heat: 2 },
  black:   { label: `${CARD_BRAND} Black`, icon: '🖤', limit: [5000, 14000], weight: 1, heat: 4 },
};

export const CARD = {
  /** Freshness starts at 100 and falls this much a day, like heat cooling. A dead card is worth nothing. */
  decayPerDay: 9,
  /** A small swipe: a fraction of the limit, gentle on both clocks. */
  smallCut: 0.18,
  smallDead: 0.1,
  smallFlag: 0.06,
  /** One big score: most of the limit, and far more likely to be the last thing it ever does. */
  bigCut: 0.7,
  bigDead: 0.55,
  bigFlag: 0.3,
  /** Wholesale, through a carding racket: less money, no exposure at all. */
  dumpRate: 0.28,
  /** Freshness spent per run, on top of the daily decay. */
  runWear: 14,
  /** A flagged card that gets run again is how a file gets opened. */
  caseChance: 0.35,
};

/** A tap: how likely the person on the other end notices, the longer it runs. */
export const TAP = {
  baseRisk: 0.05,
  dayRisk: 0.13,        // compounds per day tapped, the way a hostage's risk does
  techK: 0.09,          // per point of the target's tech: some people read their own logs
  connected: 1.35,      // 'connected' people have somebody who checks for them
  quiet: 1.2,           // 'quiet' people notice a stranger in their business
  feedChance: 0.6,      // chance of something worth hearing on a given day
  trustHit: -45,        // what being caught listening does to them
  caseChance: 0.3,
};

/** Scrubbing: tech's way out of the heat cybercrime makes, with no official involved. */
export const SCRUB = {
  ap: 1,
  /** Cash per point of heat removed, before skill. */
  costPerPoint: 260,
  /** Points you can shift in one go, before skill. */
  basePoints: 6,
  /** Each point of tech and brains adds this share to both. */
  skillK: 0.07,
};

/** Selling what you learned to somebody who wants it. */
export const DIRT = {
  base: 1200,
  bossMult: 2.5,
  lieutenantMult: 1.6,
  /** Standing the buyer gains, and the risk the subject's people hear whose mouth it came from. */
  standingGain: 8,
  blowback: 0.3,
  blowbackStanding: -12,
};

/** A crew member on the wire: cards run themselves once there are enough of them to bother with. */
export const HACK = {
  minCards: 3,          // fewer than this and they are not worth a day of somebody's time
  perDay: 2,            // cards they can work in a day, at a good tech skill
  heat: 1,
  /** Their cut of what a card is worth, against what the player gets doing it by hand. */
  rate: 0.8,
  skill: 'tech' as keyof Skills,
};
