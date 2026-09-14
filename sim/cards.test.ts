/**
 * Lifted cards: the freshness clock, the two ways a run ends badly, and the choice between
 * working the pile by hand and dumping it wholesale.
 *
 * The fiction here is a skin; every assertion below is about dice and clocks. Nothing in these
 * tests — or in the code they cover — describes a technique, and the brand is invented.
 */
import { describe, expect, it } from 'vitest';
import { CARD, CARD_BRAND, CARD_TIERS } from '@content/cyber';
import { PLAYER, can, dispatch, generateWorld, type Card, type World } from './index';
import { addCard, cardValue, dumpValue, liveCards, runOdds, tickCards } from './cyber';

const mk = (seed = 7) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

function card(w: World, over: Partial<Card> = {}): Card {
  const c: Card = { id: `cc_${Object.keys(w.npcs).length}_${(w.player.cards ?? []).length}`, tier: 'gold', limit: 2000, freshness: 100, takenDay: w.day, ...over };
  addCard(w, c);
  return c;
}

describe('the card brand', () => {
  it('is invented, and the only brand anywhere in the game', () => {
    expect(CARD_BRAND).toBe('Bellwether');
    for (const t of Object.values(CARD_TIERS)) expect(t.label.startsWith(CARD_BRAND)).toBe(true);
  });
});

describe('freshness decay', () => {
  it('falls every day whoever is holding it, and a card is worth less as it goes', () => {
    const w = mk();
    const c = card(w, { freshness: 100 });
    const fresh = cardValue(c, CARD.smallCut);
    tickCards(w);
    expect(c.freshness).toBe(100 - CARD.decayPerDay);
    tickCards(w);
    expect(c.freshness).toBe(100 - CARD.decayPerDay * 2);
    expect(cardValue(c, CARD.smallCut)).toBeLessThan(fresh);
  });

  it('drops a card off the books once the clock runs out', () => {
    const w = mk();
    card(w, { freshness: CARD.decayPerDay });
    tickCards(w);
    expect(liveCards(w).length).toBe(0);
    expect(w.player.cards!.length).toBe(0);
  });
});

describe('the odds on a run', () => {
  it('a big score takes far more and is far likelier to kill the card', () => {
    const w = mk();
    const c = card(w);
    const small = runOdds(w, c, 'small');
    const big = runOdds(w, c, 'big');
    expect(big.take).toBeGreaterThan(small.take * 2);
    expect(big.dead).toBeGreaterThan(small.dead);
    expect(big.flag).toBeGreaterThan(small.flag);
  });

  it('a stale card is worse on both counts than a fresh one', () => {
    const w = mk();
    const fresh = card(w, { freshness: 100 });
    const stale = card(w, { freshness: 20 });
    expect(runOdds(w, stale, 'small').dead).toBeGreaterThan(runOdds(w, fresh, 'small').dead);
    expect(runOdds(w, stale, 'small').flag).toBeGreaterThan(runOdds(w, fresh, 'small').flag);
    expect(runOdds(w, stale, 'small').take).toBeLessThan(runOdds(w, fresh, 'small').take);
  });

  it('a card somebody is already watching is worse again', () => {
    const w = mk();
    const clean = card(w, { flagged: false });
    const watched = card(w, { flagged: true });
    expect(runOdds(w, watched, 'small').dead).toBeGreaterThan(runOdds(w, clean, 'small').dead);
    expect(runOdds(w, watched, 'small').flag).toBeGreaterThan(runOdds(w, clean, 'small').flag);
  });

  it('tech lowers both bad outcomes — the skill is what the player buys', () => {
    const dull = mk(); dull.player.skills.tech = 0;
    const sharp = mk(); sharp.player.skills.tech = 10;
    const a = card(dull); const b = card(sharp);
    expect(runOdds(sharp, b, 'small').dead).toBeLessThan(runOdds(dull, a, 'small').dead);
    expect(runOdds(sharp, b, 'small').flag).toBeLessThan(runOdds(dull, a, 'small').flag);
  });
});

describe('running one', () => {
  it('pays dirty, spends the limit, wears the freshness and makes wire heat that heat alone does not explain', () => {
    let w = mk(); w.pendingEvents = [];
    const c = card(w, { tier: 'black', limit: 10000, freshness: 100 });
    const before = { dirty: w.player.dirty, cash: w.player.cash, heat: w.player.heat, cyber: w.player.cyberHeat ?? 0 };
    w = dispatch(w, { type: 'run_card', cardId: c.id, mode: 'small' });
    expect(w.player.dirty).toBeGreaterThan(before.dirty);
    expect(w.player.cash).toBe(before.cash);   // the wire never pays clean
    expect(w.player.heat).toBeGreaterThan(before.heat);
    expect(w.player.cyberHeat).toBeGreaterThan(before.cyber);
    const after = w.player.cards!.find(x => x.id === c.id);
    if (after) {
      expect(after.limit).toBeLessThan(10000);
      expect(after.freshness).toBe(100 - CARD.runWear);
    }
  });

  it('refuses a card that is already dead', () => {
    const w = mk();
    const c = card(w, { freshness: 0 });
    expect(can(w, { type: 'run_card', cardId: c.id, mode: 'small' }).ok).toBe(false);
  });
});

describe('dump vs. run it', () => {
  it('the wholesale price is well under what running the pile by hand would take', () => {
    const w = mk();
    for (let i = 0; i < 5; i++) card(w, { limit: 2000, freshness: 90 });
    const byHand = liveCards(w).reduce((sum, c) => sum + runOdds(w, c, 'big').take, 0);
    expect(dumpValue(w)).toBeLessThan(byHand);
    expect(CARD.dumpRate).toBeLessThan(CARD.bigCut);
  });

  it('needs a carding racket of your own, and then clears the pile in one go for dirty cash', () => {
    const w = mk(); w.pendingEvents = [];
    for (let i = 0; i < 4; i++) card(w);
    expect(can(w, { type: 'dump_cards', racketId: 'nope' }).ok).toBe(false);

    const biz = Object.values(w.businesses)[0];
    const r = { id: 'r_card', kind: 'carding' as const, businessId: biz.id, owner: PLAYER, startedDay: 1, level: 1, lastIncome: 0, disrupted: 0 };
    w.rackets[r.id] = r; w.player.racketIds.push(r.id); biz.racketIds.push(r.id);

    const expected = dumpValue(w);
    const before = w.player.dirty;
    expect(can(w, { type: 'dump_cards', racketId: r.id }).ok).toBe(true);
    const after = dispatch(w, { type: 'dump_cards', racketId: r.id });
    expect(after.player.dirty - before).toBe(expected);
    expect(liveCards(after).length).toBe(0);
  });
});
