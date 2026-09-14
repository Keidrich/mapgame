/**
 * The floor generalised.
 *
 * `promoteReason` has always refused to hand a book to somebody who joined yesterday, however
 * loyal they were: `w.day - c.joinedDay >= LIEUTENANT.minDays`. That was the only place in the
 * game that asked how long you had actually known anyone. This is the same check, wearing the
 * same shape, applied to everywhere else a deep relationship is claimed.
 */
import { describe, expect, it } from 'vitest';
import { FAMILIARITY, STAKES } from '@content/standing';
import { LIEUTENANT } from '@content/rackets';
import { can, generateWorld, select } from './index';
import { contacts, daysKnown, familiar, familiarReason, fearGain, makeContact, trustGain } from './standing';
import { promoteReason } from './lieutenants';
import { adjustRel } from './util';
import { known, owes, softBiz, unknown } from './test-util';
import type { World } from './types';

const mk = (seed = 8) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
const someone = (w: World) => Object.values(w.npcs).find(n => n.alive && !n.crew)!;

describe('the familiarity floor, in the shape the lieutenant check already had', () => {
  it('a stranger is a stranger: zero days, zero occasions', () => {
    const w = mk(); const n = unknown(someone(w));
    expect(daysKnown(w, n)).toBe(0);
    expect(contacts(n)).toBe(0);
    expect(familiar(w, n)).toBe(false);
    expect(familiarReason(w, n)).toMatch(/never actually dealt/i);
  });

  it('both halves are required — days on their own are not a history, and nor are occasions', () => {
    const w = mk();
    const rushed = known(w, someone(w), { days: 0, contacts: 10 });
    expect(familiar(w, rushed)).toBe(false);
    expect(familiarReason(w, rushed)).toMatch(/Give it/);

    const w2 = mk(12);
    const distant = known(w2, someone(w2), { days: 40, contacts: 1 });
    expect(familiar(w2, distant)).toBe(false);
    expect(familiarReason(w2, distant)).toMatch(/Make it/);
  });

  it('meeting the floor clears it, exactly at the threshold', () => {
    const w = mk();
    const n = known(w, someone(w), { days: FAMILIARITY.minDays, contacts: FAMILIARITY.minContacts });
    expect(familiar(w, n)).toBe(true);
    expect(familiarReason(w, n)).toBeUndefined();
  });

  it('trust cannot register deeply before it — this is the gate, not a slower climb', () => {
    const w = mk(); const n = unknown(someone(w));
    n.rel.trust = 0;
    for (let i = 0; i < 50; i++) n.rel.trust += trustGain(w, n, 20);
    expect(n.rel.trust).toBeCloseTo(FAMILIARITY.shallowTrust, 5);
    known(w, n, { trust: n.rel.trust });
    expect(trustGain(w, n, 20)).toBeGreaterThan(0);
  });

  it('nor can fear, from anything short of a demonstrated act', () => {
    const w = mk(); const n = unknown(someone(w));
    n.rel.fear = 0;
    for (let i = 0; i < 50; i++) n.rel.fear += fearGain(w, n, 20, 'backed');
    expect(n.rel.fear).toBeCloseTo(FAMILIARITY.shallowFear, 5);
    // breaking their window introduces you perfectly well
    expect(fearGain(w, n, 20, 'property')).toBeGreaterThan(0);
  });

  it('a contact is a meeting, not an arithmetic operation: several nudges in one day count once', () => {
    const w = mk(); const n = unknown(someone(w));
    adjustRel(w, n, { trust: 2 });
    adjustRel(w, n, { fear: 1 });
    adjustRel(w, n, { respect: 1 });
    expect(contacts(n)).toBe(1);
    expect(n.rel.metDay).toBe(w.day);
    w.day += 1; makeContact(w, n);
    expect(contacts(n)).toBe(2);
  });

  it('every deep gate sits on it: protection, crew, and a friendly price all refuse a stranger', () => {
    const w = mk();
    const t = softBiz(w, select.startBlock(w).id)!;
    const owner = unknown(w.npcs[t.ownerId]);
    owner.rel.trust = 90; owner.rel.favours = 3; owner.rel.fear = 0; owner.rel.respect = 0; owner.nerve = 90;
    owner.traits = [];
    w.player.currentBlockId = t.blockId; w.player.cash = 10_000_000;
    for (const a of [
      { type: 'protect' as const, businessId: t.id, rate: 0.15 },
      { type: 'recruit' as const, npcId: owner.id, approach: 'promise' as const },
      { type: 'buy_business' as const, businessId: t.id, offer: Math.round(t.value * 0.95) },
    ]) expect(can(w, a).ok, `${a.type} let a stranger through`).toBe(false);
    // and the same person, properly known and owed, gets through every one of them
    owes(w, owner, 90);
    for (const a of [
      { type: 'protect' as const, businessId: t.id, rate: 0.15 },
      { type: 'recruit' as const, npcId: owner.id, approach: 'promise' as const },
      { type: 'buy_business' as const, businessId: t.id, offer: Math.round(t.value * 0.95) },
    ]) expect(can(w, a).ok, `${a.type} refused somebody you know and who owes you`).toBe(true);
  });

  it('the lieutenant check it was generalised from still reads the same way, on its own clock', () => {
    // a crew member's familiarity is joinedDay, not metDay: you see your own people every day,
    // and the question is how long they have been yours, which is what LIEUTENANT.minDays asks.
    const w = mk();
    const d = Object.values(w.districts)[0];
    const n = someone(w);
    n.crew = { loyalty: 90, cut: 0, status: 'idle', statusDays: 0, joinedDay: w.day };
    n.skills = { ...n.skills, muscle: 8, brains: 8, charm: 8 };
    w.player.crewIds.push(n.id);
    expect(promoteReason(w, n, d.id)).toBeDefined();
    n.crew.joinedDay = w.day - LIEUTENANT.minDays;
    const why = promoteReason(w, n, d.id);
    expect(why === undefined || !/Give it/.test(why)).toBe(true);
    expect(LIEUTENANT.minDays).toBeGreaterThanOrEqual(FAMILIARITY.minDays);  // a book is a bigger ask than a conversation
  });

  it('the shallow ceilings sit below the cheapest stake can otherwise reach', () => {
    expect(FAMILIARITY.shallowFear).toBeLessThan(STAKES.words.ceiling);
    expect(FAMILIARITY.shallowTrust).toBeLessThan(FAMILIARITY.shallowFear + 10);
  });
});
