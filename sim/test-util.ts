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
import type { Npc, World } from './types';

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
