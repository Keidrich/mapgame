/**
 * Tier 4, and the one thing it has to prove: the gate is arithmetic.
 *
 * Tiers 2 and 3 refuse the player through numbers — `nerveFloor` sits above what `STAKES` can
 * reach, `TIER_EXCLUDES` empties a racket list — and nothing anywhere names a business type. Tier
 * 4 adds a second such number, `standingFloor`, and the test of whether it is really arithmetic
 * rather than a hardcoded check wearing a table is this: **adding a tier 5 should need no new
 * branch.** So most of this file reads the ladder off `TIERS` rather than counting to four.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS, TIERS, TIER_EXCLUDES, standingOf, type BusinessTier } from '@content/businesses';
import { can, generateWorld, select, type Business, type BusinessType, type World } from './index';
import { racketsAllowed, setupCost, standingReason, tierOf, nerveFloorFor } from './tiers';
import { RACKET_DEFS } from '@content/rackets';

const mk = (seed = 21) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'charm', seed });
const typesAt = (t: BusinessTier) => (Object.keys(BUSINESS_DEFS) as BusinessType[]).filter(k => BUSINESS_DEFS[k].tier === t);
const findTier4 = (w: World): Business | undefined => Object.values(w.businesses).find(b => tierOf(b) === 4 && b.ownedBy === 'npc');

describe('the ladder got a rung, and it behaves like a rung', () => {
  it('tier 4 exists and has types in it', () => {
    expect(typesAt(4).length).toBeGreaterThanOrEqual(4);
  });

  it('every step up earns more and costs more than the one below', () => {
    const ladder = (Object.keys(TIERS).map(Number) as BusinessTier[]).sort((a, b) => a - b);
    for (let i = 1; i < ladder.length; i++) {
      expect(TIERS[ladder[i]].income, `tier ${ladder[i]} income`).toBeGreaterThan(TIERS[ladder[i - 1]].income);
      expect(TIERS[ladder[i]].value, `tier ${ladder[i]} value`).toBeGreaterThan(TIERS[ladder[i - 1]].value);
    }
  });

  it('and generates real buildings with real income', () => {
    const w = mk();
    const b = findTier4(w);
    expect(b, 'no tier-4 building was generated at all').toBeTruthy();
    expect(b!.baseIncome).toBeGreaterThan(0);
    expect(b!.value).toBeGreaterThan(0);
  });
});

describe('the entry gate is arithmetic, not a named check', () => {
  it('a tier-4 place refuses somebody the city has never heard of', () => {
    const w = mk();
    const b = findTier4(w)!;
    w.player.respect = 0; w.player.fear = 0;
    const why = standingReason(w, b);
    expect(why, 'a nobody walked into a chartered institution').toBeTruthy();
    expect(why).toMatch(/standing/i);
  });

  it('…and the refusal lifts the moment the number clears, with nothing else changing', () => {
    const w = mk();
    const b = findTier4(w)!;
    const floor = TIERS[4].standingFloor;
    w.player.respect = floor; w.player.fear = 0;
    expect(standingOf(w.player.respect, w.player.fear)).toBeGreaterThanOrEqual(floor);
    expect(standingReason(w, b), 'cleared the floor and was still refused').toBeUndefined();
  });

  it('fear counts for half, which is what makes it standing and not respect', () => {
    const w = mk();
    const b = findTier4(w)!;
    const floor = TIERS[4].standingFloor;
    w.player.respect = 0; w.player.fear = floor;           // enough respect-equivalent? no: half
    expect(standingReason(w, b)).toBeTruthy();
    w.player.fear = floor * 2;
    expect(standingReason(w, b), 'pure fear could never get there').toBeUndefined();
  });

  it('every tier below is untouched by this existing at all', () => {
    const w = mk();
    w.player.respect = 0; w.player.fear = 0;
    for (const b of Object.values(w.businesses)) {
      if (tierOf(b) === 4) continue;
      expect(standingReason(w, b), `${b.type} is gated on standing and should not be`).toBeUndefined();
    }
  });

  it('nothing names a business type: the floor lives on the tier', () => {
    // The real test of "arithmetic, not hardcoded". Zero the floor and tier 4 opens; nothing
    // anywhere else has an opinion about a casino.
    const w = mk();
    const b = findTier4(w)!;
    w.player.respect = 0; w.player.fear = 0;
    expect(standingReason(w, b)).toBeTruthy();
    const saved = TIERS[4].standingFloor;
    try {
      (TIERS[4] as { standingFloor: number }).standingFloor = 0;
      expect(standingReason(w, b), 'something other than the floor was refusing it').toBeUndefined();
    } finally { (TIERS[4] as { standingFloor: number }).standingFloor = saved; }
  });
});

describe('buying one goes through the same door as buying anything else', () => {
  it('the reducer refuses on standing before it refuses on money', () => {
    const w = mk();
    const b = findTier4(w)!;
    w.player.cash = 50_000_000; w.player.respect = 0; w.player.fear = 0;
    const r = can(w, { type: 'buy_business', businessId: b.id, offer: b.value * 2 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/standing/i);
  });

  it('and takes the money once the standing is there', () => {
    const w = mk();
    const b = findTier4(w)!;
    w.player.cash = 50_000_000; w.player.respect = 90; w.player.fear = 40;
    const r = can(w, { type: 'buy_business', businessId: b.id, offer: Math.round(b.value * 1.3) });
    expect(r.ok, `still refused: ${!r.ok && r.reason}`).toBe(true);
  });

  it('it really is the largest sink on the board', () => {
    const w = mk();
    const t4 = Object.values(w.businesses).filter(b => tierOf(b) === 4);
    const rest = Object.values(w.businesses).filter(b => tierOf(b) < 4 && b.value > 0);
    const dearest = Math.max(...rest.map(b => b.value));
    expect(Math.max(...t4.map(b => b.value))).toBeGreaterThan(dearest);
  });
});

describe('what a chartered institution will and will not carry', () => {
  it('one racket, and it is the one that is made of paperwork', () => {
    const w = mk();
    for (const b of Object.values(w.businesses).filter(x => tierOf(x) === 4)) {
      expect(racketsAllowed(b), b.type).toEqual(['laundering']);
    }
    expect(TIER_EXCLUDES[4]).not.toBe('all');
  });

  it('and setting up inside one costs more than anywhere else', () => {
    const w = mk();
    const t4 = Object.values(w.businesses).find(b => tierOf(b) === 4)!;
    const street = Object.values(w.businesses).find(b => tierOf(b) === 1)!;
    expect(setupCost(t4, 'laundering')).toBeGreaterThan(setupCost(street, 'laundering'));
    expect(setupCost(t4, 'laundering')).toBeGreaterThan(RACKET_DEFS.laundering.setupCost * 2);
  });

  it('nobody in one is frightened of anybody', () => {
    const w = mk();
    for (const type of typesAt(4)) expect(nerveFloorFor(type)).toBeGreaterThanOrEqual(TIERS[3].nerveFloor);
    const b = Object.values(w.businesses).find(x => tierOf(x) === 4)!;
    expect(select.extortReason(b), 'a chartered institution can be leaned on').toBeTruthy();
  });
});
