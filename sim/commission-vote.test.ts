/**
 * The man in the chair, not just the outfit he runs.
 *
 * The table used to vote a spreadsheet: temperament, cash, soldiers, standing. That is still most
 * of it. What this adds is the boss himself — the same favours, grudges, holds and notoriety that
 * `sim/standing.ts`, `sim/ledger.ts` and `sim/nemesis.ts` already keep about everybody — and the
 * claim under test is that it measurably moves a vote off the line pure faction standing predicts,
 * in both directions, without ever simply buying one.
 */
import { describe, expect, it } from 'vitest';
import { PERSONAL, personalPull, resolveMeeting, tickCommission, MEETING_EVERY } from './commission';
import { generateWorld, PLAYER } from './index';
import { doFavour } from './standing';
import { oweThem } from './ledger';
import { scoreMeeting } from './nemesis';
import { turnAsset } from './informants';
import { Rng } from './rng';
import { known, unknown } from './test-util';
import type { Faction, Npc, Proposal, World } from './types';

const mk = (seed = 71) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });

/** A world with a Commission sitting and a proposal on the table. */
function table(seed = 71): { w: World; ms: Faction[] } {
  const w = mk(seed);
  w.day = 20;
  const alive = Object.values(w.factions).filter(f => f.alive);
  w.commission = { formedDay: 1, memberIds: alive.map(f => f.id), seat: false, nextMeeting: w.day, rulings: [] };
  return { w, ms: alive };
}
const boss = (w: World, f: Faction): Npc => w.npcs[f.bossId];
/** Run one proposal to a ruling and report who voted which way. */
function run(w: World, prop: Proposal): { passed: boolean; text: string } {
  w.commission!.pending = prop;
  const before = w.commission!.rulings.length;
  resolveMeeting(w, 'watch', new Rng(1));
  const r = w.commission!.rulings[before];
  return { passed: r.passed, text: r.text };
}
/**
 * The tally as a pair, read off the ruling line ("...: passed 3–1. <what it did>"). Deliberately
 * not anchored to the end: a proposal that passes appends what it did after the score, so an
 * end-anchored match silently returns 0–0 for exactly the rulings worth checking.
 */
function tally(text: string): [number, number] {
  const m = text.match(/(passed|rejected) (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)/);
  return m ? [Number(m[2]), Number(m[3])] : [-1, -1];
}

describe('a boss\'s own history with the player moves their vote', () => {
  it('a stranger boss contributes nothing: the pull is the faction line and nothing else', () => {
    const { w, ms } = table();
    for (const f of ms) unknown(boss(w, f));
    for (const f of ms) expect(personalPull(w, f)).toBe(0);
  });

  it('settling something real for a boss pulls them toward you', () => {
    const { w, ms } = table();
    const f = ms[0]; const b = known(w, boss(w, f), { trust: 40 });
    expect(personalPull(w, f)).toBe(0);
    doFavour(w, b);
    expect(personalPull(w, f)).toBeGreaterThan(0);
    doFavour(w, b);
    const two = personalPull(w, f);
    doFavour(w, b); doFavour(w, b);
    expect(personalPull(w, f), 'favours are capped: a boss is moved, not bought').toBe(two);
  });

  it('humiliating one pushes them away, and so does being beaten by one', () => {
    const { w, ms } = table();
    const f = ms[0]; const b = known(w, boss(w, f), { trust: 40 });
    b.grudge = { since: w.day, reason: 'you put them on the floor in their own bar', spread: 0 };
    expect(personalPull(w, f)).toBeLessThanOrEqual(-PERSONAL.grudge + 1);

    const { w: w2, ms: ms2 } = table(72);
    const f2 = ms2[0]; const b2 = known(w2, boss(w2, f2), { trust: 40 });
    expect(personalPull(w2, f2)).toBe(0);
    for (let i = 0; i < 8; i++) scoreMeeting(w2, b2, true, 'violence', `they had the better of you (${i})`);
    expect(personalPull(w2, f2)).toBeLessThan(0);
  });

  it('and every input is one the rest of the game already keeps', () => {
    const { w, ms } = table();
    const f = ms[0]; const b = known(w, boss(w, f), { trust: 40 });
    const base = personalPull(w, f);
    b.ratted = w.day;                                   // leverage, from standing.ts
    expect(personalPull(w, f)).toBe(base + PERSONAL.hold);
    oweThem(w, b, 'they tipped you off once');          // the other side of the ledger
    expect(personalPull(w, f)).toBe(base + PERSONAL.hold - PERSONAL.perOwed);
  });

  it('a boss you have never dealt with is barely moved by any of it', () => {
    const { w, ms } = table();
    const f = ms[0]; const b = boss(w, f);
    known(w, b, { trust: 40 });
    doFavour(w, b);
    const familiarPull = personalPull(w, f);
    b.rel.metDay = undefined; b.rel.contacts = undefined;   // same favour, no relationship
    expect(personalPull(w, f)).toBeLessThan(familiarPull);
    expect(Math.abs(personalPull(w, f))).toBeLessThan(PERSONAL.flip);
  });
});

describe('and it changes the ruling, not only a number', () => {
  /** A seat vote the table is set up to refuse: nobody is close enough to the player. */
  const seatSetup = (seed = 73) => {
    const { w, ms } = table(seed);
    for (const f of ms) { f.standing[PLAYER] = 0; f.stance[PLAYER] = 'peace'; f.temperament = 'paranoid'; unknown(boss(w, f)); }
    return { w, ms, prop: { kind: 'seat', targetId: PLAYER, text: 'a chair' } as Proposal };
  };

  it('a table that would refuse you still refuses you on faction standing alone', () => {
    const { w, prop } = seatSetup();
    const r = run(w, prop);
    expect(r.passed).toBe(false);
    expect(tally(r.text)[0]).toBe(0);
  });

  it('bosses who owe you cross the floor and it passes', () => {
    const { w, ms, prop } = seatSetup();
    for (const f of ms) {
      const b = known(w, boss(w, f), { trust: 40 });
      doFavour(w, b); doFavour(w, b);
      expect(personalPull(w, f)).toBeGreaterThanOrEqual(PERSONAL.flip);
    }
    const r = run(w, prop);
    expect(r.passed).toBe(true);
    expect(tally(r.text)[0]).toBeGreaterThan(0);
  });

  it('the other direction too: a table that would seat you refuses when the men will not', () => {
    const { w, ms } = table(74);
    for (const f of ms) { f.standing[PLAYER] = 60; f.stance[PLAYER] = 'peace'; f.temperament = 'diplomatic'; unknown(boss(w, f)); }
    const prop: Proposal = { kind: 'seat', targetId: PLAYER, text: 'a chair' };
    expect(run(structuredClone(w), prop).passed).toBe(true);
    for (const f of ms) {
      const b = known(w, boss(w, f), { trust: 40 });
      b.grudge = { since: w.day, reason: 'you humiliated them', spread: 0 };
      expect(personalPull(w, f)).toBeLessThanOrEqual(-PERSONAL.flip);
    }
    const r = run(w, prop);
    expect(r.passed).toBe(false);
  });

  it('a sanction on the player reads the pull the other way round', () => {
    const { w, ms } = table(75);
    // a table that would sanction you: everybody at war with you
    for (const f of ms) { f.standing[PLAYER] = -80; f.stance[PLAYER] = 'war'; unknown(boss(w, f)); }
    const prop: Proposal = { kind: 'sanction', targetId: PLAYER, text: 'cut them off' };
    expect(run(structuredClone(w), prop).passed).toBe(true);
    // a boss who owes you votes against cutting you off, even at war
    for (const f of ms) { const b = known(w, boss(w, f), { trust: 40 }); doFavour(w, b); doFavour(w, b); }
    const r = run(w, prop);
    expect(r.passed).toBe(false);
  });

  it('nothing personal touches the table\'s own business', () => {
    const { w, ms } = table(76);
    for (const f of ms) { const b = known(w, boss(w, f), { trust: 40 }); doFavour(w, b); doFavour(w, b); }
    // a proposal about the members and not about the player votes exactly as it always did
    const peace: Proposal = { kind: 'peace', text: 'the shooting stops' };
    const withHistory = run(structuredClone(w), peace);
    const clean = structuredClone(w);
    for (const f of ms) unknown(boss(clean, f));
    expect(withHistory.text).toBe(run(clean, peace).text);
  });

  it('an asset at the table is worth a vote, which is what an asset is for', () => {
    const { w, ms, prop } = seatSetup(77);
    const f = ms[0]; const b = known(w, boss(w, f), { trust: 40 });
    b.official = undefined;
    turnAsset(w, b, 'muscle');
    expect(personalPull(w, f)).toBeGreaterThanOrEqual(PERSONAL.flip - PERSONAL.asset);
    b.rel.favours = 1;
    expect(personalPull(w, f)).toBeGreaterThanOrEqual(PERSONAL.flip);
    expect(tally(run(w, prop).text)[0]).toBeGreaterThan(0);
  });
});

describe('the meeting itself still works the way it did', () => {
  it('a ruling is recorded and the next meeting is scheduled', () => {
    const { w } = table();
    const before = w.commission!.rulings.length;
    run(w, { kind: 'peace', text: 'the shooting stops' });
    expect(w.commission!.rulings.length).toBe(before + 1);
    expect(w.commission!.pending).toBeUndefined();
    expect(w.commission!.nextMeeting).toBe(w.day + MEETING_EVERY);
  });

  it('and the whole thing still runs from the tick without throwing', () => {
    // the table forms on its own only with three living factions; these worlds generate two, so
    // the test seats it directly rather than asserting a generation detail it does not care about
    const { w } = table(78);
    for (let i = 0; i < 40; i++) {
      tickCommission(w, new Rng(i));
      if (w.commission!.pending) resolveMeeting(w, i % 2 ? 'watch' : 'no', new Rng(i));
      w.pendingEvents = [];
      w.day++;
    }
    expect(w.commission).toBeDefined();
    expect(w.commission!.rulings.length).toBeGreaterThan(0);
  });
});
