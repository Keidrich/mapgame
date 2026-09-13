/**
 * The fixer: a guaranteed early launderer, so a bad opening cannot dead-end with a pile of
 * dirty money, no laundering racket and no clean cash to start one.
 */
import { describe, expect, it } from 'vitest';
import { FIXER, LAUNDER_RATE, RACKET_DEFS } from '@content/rackets';
import { can, dispatch, generateWorld, select } from './index';
import { fixerCapLeft, fixerCapToday, fixerDailyCap, fixerRate, fixerUsedToday } from './economy';
import { legworkFor, route } from './travel';
import type { Npc, World } from './types';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const theFixer = (w: World): Npc => Object.values(w.npcs).filter(n => n.role === 'fixer')[0];

describe('the guaranteed fixer', () => {
  it('exists in every world, within the player\'s first day of walking', () => {
    for (const seed of [1, 2, 5, 9, 23, 44]) {
      const w = mk(seed);
      const fixers = Object.values(w.npcs).filter(n => n.role === 'fixer' && n.alive);
      expect(fixers.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      const n = fixers[0];
      // reachable the same way the other starting guarantees are: from where the player stands, today
      const where = select.npcReachBlock(w, n)!;
      const r = route(w, w.player.currentBlockId, where);
      expect(r, `seed ${seed} route`).toBeDefined();
      expect(r!.cost).toBeLessThanOrEqual(w.player.legworkMax);
      expect(w.player.legworkMax).toBeGreaterThanOrEqual(legworkFor(0));
    }
  });

  it('starts known, trusted a little, and with room to grow', () => {
    const n = theFixer(mk(5));
    expect(n.rel.trust).toBe(FIXER.startTrust);
    expect(n.rel.trust).toBeGreaterThan(0);    // usable immediately
    expect(n.rel.trust).toBeLessThan(50);      // but a long way from the best deal
    expect(n.known).toBe(true);
    expect(n.crew).toBeUndefined();
    expect(n.connections.length).toBeGreaterThan(0); // they know people, like everybody else
  });

  it('is a person, not a business: nothing is owned, nothing is set up', () => {
    const w = mk(5);
    const n = theFixer(w);
    expect(Object.values(w.businesses).some(b => b.ownerId === n.id)).toBe(false);
    expect(w.player.racketIds.length).toBe(0);
    // and no laundering-capable business was planted near the player to paper over the gap
    expect(w.player.businessIds.length).toBe(0);
  });
});

describe('the fixer\'s rate and window', () => {
  it('scales with trust, from minRate to maxRate', () => {
    expect(fixerRate(0)).toBeCloseTo(FIXER.minRate, 5);
    expect(fixerRate(100)).toBeCloseTo(FIXER.maxRate, 5);
    expect(fixerRate(50)).toBeCloseTo((FIXER.minRate + FIXER.maxRate) / 2, 5);
    for (let t = 0; t < 100; t += 5) expect(fixerRate(t + 5)).toBeGreaterThan(fixerRate(t));
    expect(fixerRate(-40)).toBe(fixerRate(0));     // hostile is not worse than a stranger
    expect(fixerRate(9999)).toBe(fixerRate(100));  // and nothing above the cap
  });

  it('never reaches a laundering racket of your own, even at maximum trust', () => {
    expect(FIXER.maxRate).toBeLessThan(LAUNDER_RATE);
    for (let t = -100; t <= 200; t += 10) expect(fixerRate(t)).toBeLessThan(LAUNDER_RATE);
    // and the racket's own daily capacity still dwarfs the fixer's window
    expect(RACKET_DEFS.laundering.launderCap!).toBeGreaterThan(fixerDailyCap(100));
  });

  it('caps what they will take in a day, and that cap grows with trust the same way', () => {
    expect(fixerDailyCap(0)).toBe(FIXER.capBase);
    expect(fixerDailyCap(100)).toBe(FIXER.capBase + FIXER.capPerTrust * 100);
    for (let t = 0; t < 100; t += 5) expect(fixerDailyCap(t + 5)).toBeGreaterThan(fixerDailyCap(t));
    expect(fixerDailyCap(-50)).toBe(fixerDailyCap(0));
  });
});

describe('washing money through a fixer', () => {
  /** A world where the player is standing with the fixer and has dirty money to move. */
  function ready(seed = 5, dirty = 20000) {
    const w = mk(seed);
    const n = theFixer(w);
    w.player.currentBlockId = select.npcReachBlock(w, n)!;
    w.player.dirty = dirty;
    return { w, id: n.id };
  }

  it('pays the trust rate, takes the dirty money, and costs an action', () => {
    const { w, id } = ready();
    const before = w.npcs[id].rel.trust;
    const rate = fixerRate(before);
    const amount = 300;
    const next = dispatch(w, { type: 'launder_with_fixer', npcId: id, amount });
    expect(next.player.dirty).toBe(w.player.dirty - amount);
    expect(next.player.cash).toBe(w.player.cash + Math.round(amount * rate));
    expect(next.player.ap).toBe(w.player.ap - FIXER.ap);
    // a fixer is not the player's own racket capacity: that counter is untouched
    expect(next.player.launderedToday).toBe(0);
    expect(fixerUsedToday(next, next.npcs[id])).toBe(amount);
  });

  it('builds trust like any other dealing, so the rate improves with use', () => {
    let { w, id } = ready(5, 200000);
    const startTrust = w.npcs[id].rel.trust;
    const startRate = fixerRate(startTrust);
    for (let day = 0; day < 12; day++) {
      const left = fixerCapLeft(w, w.npcs[id]);
      w = dispatch(w, { type: 'launder_with_fixer', npcId: id, amount: left });
      w.player.ap = 8; w.day++;   // next day: their window reopens
    }
    expect(w.npcs[id].rel.trust).toBeGreaterThan(startTrust);
    expect(fixerRate(w.npcs[id].rel.trust)).toBeGreaterThan(startRate);
    expect(fixerDailyCap(w.npcs[id].rel.trust)).toBeGreaterThan(fixerDailyCap(startTrust));
    expect(fixerRate(w.npcs[id].rel.trust)).toBeLessThan(LAUNDER_RATE); // still never the real thing
  });

  it('washes at most what is left of their day, and then turns you away until tomorrow', () => {
    const { w, id } = ready();
    const cap = fixerDailyCap(w.npcs[id].rel.trust);
    const over = dispatch(w, { type: 'launder_with_fixer', npcId: id, amount: cap + 5000 });
    expect(fixerUsedToday(over, over.npcs[id])).toBe(cap);
    expect(over.player.dirty).toBe(w.player.dirty - cap);           // only the cap changed hands
    expect(fixerCapLeft(over, over.npcs[id])).toBe(0);
    const again = can(over, { type: 'launder_with_fixer', npcId: id, amount: 100 });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toMatch(/today/i);
    // the window reopens with the new day, without anything having to reset it
    const tomorrow = { ...over, day: over.day + 1 };
    expect(fixerCapLeft(tomorrow, tomorrow.npcs[id])).toBe(fixerDailyCap(tomorrow.npcs[id].rel.trust));
  });

  it('sets the day\'s window when they first take money, so trust earned today pays tomorrow', () => {
    const { w, id } = ready();
    const capBefore = fixerDailyCap(w.npcs[id].rel.trust);
    const used = dispatch(w, { type: 'launder_with_fixer', npcId: id, amount: 100 });
    const n = used.npcs[id];
    expect(n.rel.trust).toBeGreaterThan(w.npcs[id].rel.trust);          // the use earned trust
    expect(fixerCapToday(used, n)).toBe(capBefore);                     // but today's window is what it was
    expect(fixerCapLeft(used, n)).toBe(capBefore - 100);
    const tomorrow = { ...used, day: used.day + 1 };
    expect(fixerCapToday(tomorrow, tomorrow.npcs[id])).toBeGreaterThan(capBefore); // it pays tomorrow
  });

  it('refuses what it should: no dirty money, the wrong person, or standing somewhere else', () => {
    const { w, id } = ready(5, 0);
    expect(can(w, { type: 'launder_with_fixer', npcId: id, amount: 500 }).ok).toBe(false);   // nothing to wash
    const funded = { ...w, player: { ...w.player, dirty: 5000 } };
    expect(can(funded, { type: 'launder_with_fixer', npcId: id, amount: 0 }).ok).toBe(false); // no amount
    const patron = Object.values(funded.npcs).find(n => n.role === 'patron')!;
    const wrong = can(funded, { type: 'launder_with_fixer', npcId: patron.id, amount: 500 });
    expect(wrong.ok).toBe(false);
    expect(wrong.ok === false && wrong.reason).toMatch(/does not move money/);
    // face to face, like every other dealing with a person
    const away = Object.keys(funded.blocks).find(id2 => id2 !== funded.player.currentBlockId)!;
    const elsewhere = { ...funded, player: { ...funded.player, currentBlockId: away } };
    const far = can(elsewhere, { type: 'launder_with_fixer', npcId: id, amount: 500 });
    expect(far.ok).toBe(false);
    expect(far.ok === false && far.reason).toMatch(/Walk over first/);
  });

  it('leaves the clean-cash rule for setup costs alone', () => {
    // the fixer hands back clean cash, which is the only thing that pays for a racket;
    // nothing here lets dirty money buy a setup
    const { w, id } = ready();
    const next = dispatch(w, { type: 'launder_with_fixer', npcId: id, amount: 300 });
    expect(next.player.cash).toBeGreaterThan(w.player.cash);
    expect(next.player.dirty).toBeLessThan(w.player.dirty);
  });
});
