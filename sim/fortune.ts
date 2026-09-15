/**
 * The money sinks, and the one rule they all follow: spend into a number that already exists.
 *
 * See `content/fortune.ts` for what each one buys and why it is priced the way it is. This file
 * is the arithmetic — prices, caps, and the read-only helpers the reducer and the UI both call,
 * so a quote and a charge can never drift apart.
 */
import { CEILING, FAVOUR_PRICE, LEGITIMACY, LIFESTYLE, SAFEHOUSE_BASE_LIMIT, SECURITY_GUARD, type CeilingKind, type LifestyleKind } from '@content/fortune';
import { SAFEHOUSE_TIERS } from '@content/rackets';
import { favours } from './standing';
import type { Npc, World } from './types';

// ---------------------------------------------------------------- buying a favour
/** What this person charges to owe you one. Rises steeply with what they already owe. */
export function favourPrice(n: Npc): number {
  const base = n.official ? FAVOUR_PRICE.official
    : n.role === 'boss' ? FAVOUR_PRICE.boss
    : FAVOUR_PRICE.other;
  const already = favours(n);
  const liked = Math.max(FAVOUR_PRICE.minShare, 1 - Math.max(0, n.rel.trust - 40) * FAVOUR_PRICE.trustDiscount);
  return Math.round(base * Math.pow(FAVOUR_PRICE.escalator, already) * liked);
}

/** Why they will not take your money. Undefined when they will. */
export function favourReason(n: Npc): string | undefined {
  if (!n.alive) return 'They are gone.';
  if (n.crew) return 'They already work for you.';
  if (n.rel.trust < FAVOUR_PRICE.minTrust) return `${n.name} does not take money from people they do not know. Deal with them first.`;
  if (n.grudge) return `${n.name} has not forgotten what you did. Money will not touch it.`;
  return undefined;
}

// ---------------------------------------------------------------- a lifestyle
/** Rungs bought on a ladder, 0..3. */
export const lifestyleAt = (w: World, k: LifestyleKind): number => w.player.lifestyle?.[k] ?? 0;
/** The next rung, or undefined at the top. */
export function nextStep(w: World, k: LifestyleKind) {
  const at = lifestyleAt(w, k);
  return at < LIFESTYLE[k].length ? LIFESTYLE[k][at] : undefined;
}
/** Every rung the player has bought, for the screens that describe them. */
export function lifestyleOwned(w: World) {
  return (Object.keys(LIFESTYLE) as LifestyleKind[])
    .flatMap(k => LIFESTYLE[k].slice(0, lifestyleAt(w, k)).map(step => ({ kind: k, step })));
}
/**
 * How visibly successful the player is, 0..1. Read by the scene layer to decide whether somebody
 * opens a conversation like they are talking to a man with a house on the hill.
 */
export function standingShow(w: World): number {
  const rungs = (Object.keys(LIFESTYLE) as LifestyleKind[]).reduce((t, k) => t + lifestyleAt(w, k), 0);
  const total = (Object.keys(LIFESTYLE) as LifestyleKind[]).reduce((t, k) => t + LIFESTYLE[k].length, 0);
  return rungs / total;
}
/** What the men you pay are worth when somebody comes for you personally. */
export const securityCover = (w: World): number => lifestyleAt(w, 'security') * SECURITY_GUARD;

// ---------------------------------------------------------------- legitimacy
export const legitimacy = (w: World): number => w.player.legitimacy ?? 0;
/**
 * The multiplier `addHeat` applies. 1.0 with nothing bought, `heatAtCap` at the cap, linear
 * between — and never below `heatFloor` once everything else has had its go, which is what stops
 * this and `LONE_WOLF.heat` together removing the police.
 */
export function legitimacyHeatMult(w: World): number {
  const at = Math.min(LEGITIMACY.cap, legitimacy(w));
  return 1 - (1 - LEGITIMACY.heatAtCap) * (at / LEGITIMACY.cap);
}
/** What a spend would buy, before the day's decay takes its cut. */
export function legitimacyGain(w: World, spend: number): number {
  return Math.min(LEGITIMACY.cap - legitimacy(w), spend * LEGITIMACY.perDollar);
}
/** Why the money would be wasted. Undefined when it would not. */
export function legitimacyReason(w: World, spend: number): string | undefined {
  if (spend < LEGITIMACY.minSpend) return `Nobody notices less than ${LEGITIMACY.minSpend.toLocaleString('en-US')}.`;
  if (legitimacy(w) >= LEGITIMACY.cap) return 'You are as respectable as a man in your line of work is ever going to look.';
  return undefined;
}

// ---------------------------------------------------------------- headroom
export const ceilingAt = (w: World, k: CeilingKind): number => w.player.ceilings?.[k] ?? 0;
/** What the next one costs. Undefined once there are no more to buy. */
export function ceilingPrice(w: World, k: CeilingKind): number | undefined {
  const at = ceilingAt(w, k); const def = CEILING[k];
  if (at >= def.max) return undefined;
  return Math.round(def.base * Math.pow(def.escalator, at));
}
/** Extra beds bought. Folded into the bed count `assign` already enforces. */
export const extraBeds = (w: World): number => ceilingAt(w, 'crew') * CEILING.crew.per;
/** How many safehouses the player may hold, base plus anything bought. */
export const safehouseLimit = (w: World): number => SAFEHOUSE_BASE_LIMIT + ceilingAt(w, 'safehouse') * CEILING.safehouse.per;
/** Beds, the single number: two of your own, plus every safehouse's, plus anything bought. */
export function bedsTotal(w: World): number {
  return 2 + w.player.safehouseIds.reduce((t, id) => t + (SAFEHOUSE_TIERS[(w.safehouses[id]?.tier ?? 1) - 1]?.crewBeds ?? 0), 0) + extraBeds(w);
}
