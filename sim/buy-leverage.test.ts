/**
 * Paying somebody important to owe you one.
 *
 * The thing this must not become is a way to buy a vote. `personalPull` turns favours into pull,
 * pull has to clear `PERSONAL.flip` to cross the floor, and every other term — a grudge, their
 * record against you, whether you are strangers — is untouched by money. So the tests here are
 * mostly about what a purchase *cannot* reach.
 */
import { describe, expect, it } from 'vitest';
import { FAVOUR_PRICE } from '@content/fortune';
import { PERSONAL, personalPull } from './commission';
import { can, dispatch, generateWorld, type Npc, type World } from './index';
import { favourPrice, favourReason } from './fortune';
import { favours } from './standing';
import { owedToThem } from './ledger';

function city(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 17 });
  w.pendingEvents = []; w.day = 60; w.player.cash = 5_000_000;
  return w;
}
/** A boss the player has actually dealt with, which is the precondition for any of this. */
function boss(w: World): Npc {
  const f = Object.values(w.factions)[0];
  const n = w.npcs[f.bossId];
  n.known = true; n.rel.trust = 45; n.rel.metDay = 1; n.rel.contacts = 6;
  return n;
}

describe('the purchase moves exactly one input', () => {
  it('a paid favour is a favour, in the same field `doFavour` writes', () => {
    const w = city(); const n = boss(w);
    const before = favours(n);
    const after = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(favours(after.npcs[n.id])).toBe(before + 1);
  });

  it('and it shows up in `personalPull`, because that is what a favour is for', () => {
    const w = city(); const n = boss(w);
    const f = Object.values(w.factions)[0];
    const before = personalPull(w, f);
    const after = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(personalPull(after, after.factions[f.id])).toBe(before + PERSONAL.perFavour);
  });

  it('it costs real money, and the money is gone', () => {
    const w = city(); const n = boss(w);
    const price = favourPrice(n);
    const after = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(w.player.cash - after.player.cash).toBe(price);
    expect(price).toBeGreaterThan(10_000);
  });
});

describe('what money cannot reach', () => {
  it('it does not touch `PERSONAL.flip`: buying markers is not buying a vote', () => {
    // Two markers is all `favourCap` ever counts, so the most money can buy is `favourCap` of
    // pull — and the flip threshold is unchanged by any of this.
    const w = city(); const n = boss(w);
    const f = Object.values(w.factions)[0];
    let cur = w;
    for (let i = 0; i < 4; i++) { if (can(cur, { type: 'buy_favour', npcId: n.id }).ok) cur = dispatch(cur, { type: 'buy_favour', npcId: n.id }); }
    const pull = personalPull(cur, cur.factions[f.id]);
    expect(pull).toBeLessThanOrEqual(PERSONAL.favourCap + PERSONAL.hold + PERSONAL.asset);
    expect(PERSONAL.flip, 'the flip threshold was moved to make room for this').toBe(20);
  });

  it('a grudge cannot be paid off', () => {
    const w = city(); const n = boss(w);
    n.grudge = { since: w.day, reason: 'You humiliated them in front of their own people.', spread: 2 };
    expect(favourReason(n)).toMatch(/not forgotten/i);
    expect(can(w, { type: 'buy_favour', npcId: n.id }).ok).toBe(false);
  });

  it('nor will a stranger take it', () => {
    const w = city(); const n = boss(w);
    n.rel.trust = FAVOUR_PRICE.minTrust - 1;
    expect(can(w, { type: 'buy_favour', npcId: n.id }).ok).toBe(false);
  });

  it('and their record against you still counts against you at the table', () => {
    // `perNotoriety` is untouched by a purchase: a boss who made his name beating you takes the
    // envelope and still votes his own way.
    const w = city(); const n = boss(w);
    const f = Object.values(w.factions)[0];
    n.nemesis = { since: 5, wins: 6, losses: 0, notoriety: 80, earned: [] };
    const bought = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(personalPull(bought, bought.factions[f.id])).toBeLessThan(PERSONAL.perFavour);
  });

  it('what you owe *them* is a separate number and money does not clear it', () => {
    const w = city(); const n = boss(w);
    n.rel.owedToThem = 2;
    const before = owedToThem(n);
    const after = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(owedToThem(after.npcs[n.id])).toBe(before);
  });
});

describe('the price is a sink, not a subscription', () => {
  it('the second marker costs several times the first', () => {
    const w = city(); const n = boss(w);
    const first = favourPrice(n);
    const after = dispatch(w, { type: 'buy_favour', npcId: n.id });
    expect(favourPrice(after.npcs[n.id])).toBeGreaterThan(first * 2.5);
  });

  it('somebody who likes you asks for less, and never for cheap', () => {
    const w = city(); const n = boss(w);
    n.rel.trust = 40; const plain = favourPrice(n);
    n.rel.trust = 100; const liked = favourPrice(n);
    expect(liked).toBeLessThan(plain);
    expect(liked / plain).toBeGreaterThanOrEqual(FAVOUR_PRICE.minShare - 0.001);
  });

  it('a boss costs more than an official, and both cost more than a shopkeeper', () => {
    const w = city();
    const b = boss(w);
    const official = Object.values(w.npcs).find(n => n.official)!;
    official.rel.trust = 45; official.known = true;
    const shop = Object.values(w.npcs).find(n => n.role === 'owner')!;
    shop.rel.trust = 45; shop.known = true;
    expect(favourPrice(b)).toBeGreaterThan(favourPrice(official));
    expect(favourPrice(official)).toBeGreaterThan(favourPrice(shop));
  });

  it('and your own crew are not for sale, because they already work for you', () => {
    const w = city();
    const n = Object.values(w.npcs).find(x => x.alive && x.role === 'patron')!;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 };
    n.rel.trust = 60;
    expect(favourReason(n)).toMatch(/already work/i);
  });
});
