/**
 * Helpers for setting a world up the way the social systems now expect.
 *
 * Before the standing pass a test could write `owner.rel.trust = 90` and have somebody ready to
 * hand over their business. That is exactly what stopped working on purpose: trust alone buys
 * nothing big any more. These put the rest of the relationship in place — how long you have
 * known each other, how many times you have actually been in front of them, and what they owe
 * you — so a test that is about protection or recruiting can say so in one line instead of
 * re-deriving the floor each time.
 *
 * Not shipped to the player: nothing outside `*.test.ts` imports this.
 */
import { FAMILIARITY } from '@content/standing';
import { BUSINESS_DEFS } from '@content/businesses';
import { canHost } from './tiers';
import type { Business, BusinessType, Id, Npc, RacketKind, World } from './types';

/** Somebody you have dealt with properly. `favours` is what they owe you — reciprocity. */
export function known(w: World, n: Npc, opts: { trust?: number; days?: number; contacts?: number; favours?: number } = {}): Npc {
  // not clamped to day 1: a world generated on day 1 still has people the player knew before
  // it started, and `daysKnown` is arithmetic on day numbers, not an index into anything.
  const days = opts.days ?? FAMILIARITY.minDays;
  n.rel.metDay = w.day - days;
  n.rel.contacts = opts.contacts ?? FAMILIARITY.minContacts;
  n.rel.lastContactDay = undefined;
  if (opts.trust !== undefined) n.rel.trust = opts.trust;
  if (opts.favours !== undefined) n.rel.favours = opts.favours;
  return n;
}

/** Someone who trusts you *and* owes you: the pair a friendly concession now needs. */
export function owes(w: World, n: Npc, trust = 60): Npc { return known(w, n, { trust, favours: 1 }); }

/** A stranger again, for the other side of a gate test. */
export function unknown(n: Npc): Npc {
  n.rel.metDay = undefined; n.rel.contacts = undefined; n.rel.lastContactDay = undefined; n.rel.favours = undefined;
  return n;
}


/**
 * A business the player could actually lean on: tier 1, so its owner's nerve has no floor and the
 * ordinary shakedown/protect rules apply. Since the tier pass, picking "a business" at random gets
 * you an accountant's office as often as a diner, and a test about protection that lands on one is
 * asserting the wrong thing.
 */
export function softBiz(w: World, blockId?: Id): Business | undefined {
  const pool = Object.values(w.businesses).filter(b =>
    (!blockId || b.blockId === blockId) && b.ownedBy === 'npc' && BUSINESS_DEFS[b.type].tier === 1 && BUSINESS_DEFS[b.type].rackets.includes('protection'));
  return pool[0];
}

/** A business that can host this racket kind, for tests about rackets rather than about tiers. */
export function hostFor(w: World, kind: RacketKind, blockId?: Id): Business | undefined {
  return Object.values(w.businesses).find(b => (!blockId || b.blockId === blockId) && canHost(b, kind));
}

/**
 * A business of a given type, converting a spare one where this seed generated none.
 *
 * Which types a city gets is a roll per block, so a test about galleries or importers is
 * silently vacuous on half the seeds — it returns early, passes, and checks nothing. Retyping
 * one leaves its rolled income and value alone, which is fine for anything asking what a type
 * can host or be got at for, and is not fine for a test about what it earns.
 */
export function typed(w: World, type: BusinessType): Business {
  const have = Object.values(w.businesses).find(b => b.type === type && b.ownedBy === 'npc');
  if (have) return have;
  const spare = Object.values(w.businesses).find(b => b.ownedBy === 'npc' && !b.racketIds.length && !b.protection)!;
  spare.type = type;
  return spare;
}
