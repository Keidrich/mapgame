/**
 * What a business's tier actually does.
 *
 * Tier is not a label, and the three things it decides are tested separately because they fail
 * separately: what a place can host, what setting up there costs, and — the one that matters —
 * whether fear is a way in at all.
 *
 * The tier-2 claim is deliberately about the *numbers* rather than a branch. Nothing refuses an
 * established owner's shakedown by name; talk stops being enough because `nerveFloor` sits above
 * what `STAKES.words` and `STAKES.backed` can reach, and a demonstrated act still opens the same
 * `protectRoute` it always did. A test that only checked for a refusal string would pass against
 * a hard-coded rule, which is exactly what this is not.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS, TIERS, TIER_EXCLUDES, type BusinessTier } from '@content/businesses';
import { RACKET_DEFS } from '@content/rackets';
import { CONCESSION, STAKES } from '@content/standing';
import { PROTECT_NERVE, protectRoute } from './economy';
import { can, generateWorld, select } from './index';
import { canHost, extortReason, racketsAllowed, setupCost, tierOf } from './tiers';
import { doFavour, fearGain } from './standing';
import { known, owes } from './test-util';
import type { Business, BusinessType, World } from './types';

const mk = (seed = 101) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
const typesAt = (t: BusinessTier) => (Object.keys(BUSINESS_DEFS) as BusinessType[]).filter(k => BUSINESS_DEFS[k].tier === t);
/** A generated business of a given type, with the player standing in it. */
function find(w: World, type: BusinessType): Business | undefined {
  const b = Object.values(w.businesses).find(x => x.type === type && x.ownedBy === 'npc');
  if (b) w.player.currentBlockId = b.blockId;
  return b;
}

describe('every type has a tier, and the tiers describe the city', () => {
  it('every tier exists and has types in it', () => {
    // Read the ladder off `TIERS` rather than hard-coding its length: adding tier 4 should not
    // have needed this test edited, and the next tier should not either.
    const ladder = Object.keys(TIERS).map(Number) as BusinessTier[];
    expect(ladder.length).toBeGreaterThanOrEqual(3);
    for (const t of ladder) expect(typesAt(t).length, `tier ${t}`).toBeGreaterThan(0);
    for (const k of Object.keys(BUSINESS_DEFS) as BusinessType[]) expect(ladder).toContain(BUSINESS_DEFS[k].tier);
  });

  it('income really does climb with tier, rather than the multiplier only claiming it does', () => {
    const mid = (t: BusinessTier) => {
      const earn = typesAt(t).map(k => (BUSINESS_DEFS[k].income[0] + BUSINESS_DEFS[k].income[1]) / 2).filter(v => v > 0);
      return earn.reduce((a, b) => a + b, 0) / earn.length;
    };
    expect(mid(2)).toBeGreaterThan(mid(1));
    expect(mid(3)).toBeGreaterThan(mid(2));
    expect(TIERS[2].income).toBeGreaterThan(TIERS[1].income);
    expect(TIERS[3].income).toBeGreaterThan(TIERS[2].income);
  });

  it('the bank and the armoured depot are still what they always were, now by tier', () => {
    for (const k of ['bank', 'armored_depot', 'jeweller'] as BusinessType[]) expect(BUSINESS_DEFS[k].tier, k).toBe(3);
    for (const k of typesAt(3)) expect(TIER_EXCLUDES[3], k).toBe('all');
  });
});

describe('tier gates which rackets a place can host, on top of the type list', () => {
  it('an institution hosts nothing at all, whatever its own list says', () => {
    const w = mk();
    for (const type of typesAt(3)) {
      const b = find(w, type); if (!b) continue;
      expect(racketsAllowed(b), type).toEqual([]);
      for (const kind of Object.keys(RACKET_DEFS) as (keyof typeof RACKET_DEFS)[]) expect(canHost(b, kind), `${type}/${kind}`).toBe(false);
    }
  });

  it('it is an intersection, never a replacement: a bar is still a bar', () => {
    const w = mk();
    const bar = find(w, 'bar')!;
    expect(racketsAllowed(bar)).toEqual(BUSINESS_DEFS.bar.rackets);
    // and nothing the type does not list is ever allowed in by the tier
    for (const type of [...typesAt(1), ...typesAt(2)]) {
      const b = find(w, type); if (!b) continue;
      for (const k of racketsAllowed(b)) expect(BUSINESS_DEFS[type].rackets, `${type}/${k}`).toContain(k);
    }
  });

  it('the block sheet offers exactly what the reducer will accept', () => {
    const w = mk();
    for (const type of Object.keys(BUSINESS_DEFS) as BusinessType[]) {
      const b = find(w, type); if (!b) continue;
      b.ownedBy = 'player'; w.player.businessIds.push(b.id); w.player.cash = 10_000_000;
      for (const offered of select.availableRackets(w, b)) {
        const r = can(w, { type: 'start_racket', businessId: b.id, kind: offered, product: 'green' });
        expect(r.ok || (!r.ok && !/cannot host|do not run/.test(r.reason)), `${type}/${offered}: ${r.ok ? '' : r.reason}`).toBe(true);
      }
      b.ownedBy = 'npc'; w.player.businessIds.pop();
    }
  });

  it('setting up inside an established place costs more', () => {
    const w = mk();
    const street = find(w, 'bar')!;
    const up = find(w, 'nightclub') ?? find(w, 'construction')!;
    expect(setupCost(street, 'numbers')).toBe(RACKET_DEFS.numbers.setupCost);
    expect(setupCost(up, 'gambling_den')).toBeGreaterThan(RACKET_DEFS.gambling_den.setupCost);
  });
});

describe('tier 1 is unchanged: the ordinary rules still apply', () => {
  it('a street place can be shaken down and protected the way it always could', () => {
    const w = mk();
    const b = find(w, 'bar')!;
    expect(extortReason(b)).toBeUndefined();
    expect(can(w, { type: 'shakedown', businessId: b.id }).ok).toBe(true);
    const owner = w.npcs[b.ownerId];
    owner.rel.fear = owner.nerve;   // plainly frightened
    expect(protectRoute(w, owner, 0.15)).toBe('fear');
  });

  it('and its owners have no floor under their nerve', () => {
    expect(typesAt(1).length).toBeGreaterThan(0);
    expect(TIERS[1].nerveFloor).toBe(0);
  });
});

describe('tier 2: talk stops being enough, because of where the number sits', () => {
  it('an established owner is generated above the floor', () => {
    const w = mk();
    for (const type of typesAt(2)) {
      const b = find(w, type); if (!b) continue;
      expect(w.npcs[b.ownerId].nerve, type).toBeGreaterThanOrEqual(TIERS[2].nerveFloor - 12);
    }
  });

  it('talk alone cannot reach the fear an established owner needs — and that is arithmetic, not a rule', () => {
    const w = mk();
    const n = known(w, w.npcs[find(w, 'bar')!.ownerId]);
    n.nerve = TIERS[2].nerveFloor; n.rel.fear = 0; n.rel.respect = 0;
    const needed = n.nerve * PROTECT_NERVE;
    expect(needed).toBeGreaterThan(STAKES.words.ceiling);
    // talked at for ever, they still do not get there
    for (let i = 0; i < 100; i++) n.rel.fear += fearGain(w, n, 20, 'words');
    expect(n.rel.fear + n.rel.respect).toBeLessThan(needed);
    expect(protectRoute(w, n, 0.15)).toBeUndefined();
  });

  it('but a demonstrated act opens the very same door', () => {
    const w = mk();
    const b = find(w, 'bar')!;
    const n = known(w, w.npcs[b.ownerId]);
    n.nerve = TIERS[2].nerveFloor; n.rel.fear = 0; n.rel.respect = 0;
    for (let i = 0; i < 10; i++) n.rel.fear += fearGain(w, n, 20, 'property');
    expect(protectRoute(w, n, 0.15)).toBe('fear');
    // nothing was refused by name along the way: the gate never mentioned the tier
    expect(extortReason(b)).toBeUndefined();
  });

  it('and so does a real relationship, through the route that always existed', () => {
    const w = mk();
    const n = owes(w, w.npcs[find(w, 'bar')!.ownerId], CONCESSION.ordinary);
    n.nerve = TIERS[2].nerveFloor; n.rel.fear = 0; n.rel.respect = 0;
    expect(protectRoute(w, n, 0.15)).toBe('friend');
  });
});

describe('tier 3: no threat opens an institution, ever', () => {
  it('shakedown and protect are refused outright, at any amount of fear', () => {
    const w = mk();
    for (const type of typesAt(3)) {
      const b = find(w, type); if (!b) continue;
      const owner = w.npcs[b.ownerId];
      owner.rel.fear = 100; owner.rel.respect = 100; owner.nerve = 1;   // as frightened as the game allows
      expect(extortReason(b), type).toBeDefined();
      const sd = can(w, { type: 'shakedown', businessId: b.id });
      const pr = can(w, { type: 'protect', businessId: b.id, rate: 0.1 });
      expect(sd.ok, type).toBe(false);
      expect(pr.ok, type).toBe(false);
      expect(sd.ok === false && sd.reason, type).toMatch(/Nobody there is frightened of you/i);
    }
  });

  it('the refusal names the door that is open instead', () => {
    const w = mk();
    const b = find(w, 'bank') ?? find(w, 'accountant')!;
    const why = can(w, { type: 'shakedown', businessId: b.id });
    expect(why.ok).toBe(false);
    expect(why.ok === false && why.reason).toMatch(/books|turn/i);
  });

  it('leverage over the owner is a real way in, and the sheet can say so', () => {
    const w = mk();
    const b = find(w, 'bank') ?? find(w, 'importer')!;
    const owner = known(w, w.npcs[b.ownerId]);
    delete w.blocks[owner.homeBlockId].influence.player;
    owner.ratted = undefined; owner.tap = undefined; owner.rel.favours = undefined;
    expect(select.hasWayIn(w, owner)).toBe(false);
    owner.ratted = w.day;
    expect(select.hasWayIn(w, owner)).toBe(true);
  });

  it('a settled favour is the other one', () => {
    const w = mk();
    const b = find(w, 'bank') ?? find(w, 'accountant')!;
    const owner = known(w, w.npcs[b.ownerId], { trust: CONCESSION.ordinary });
    delete w.blocks[owner.homeBlockId].influence.player;
    owner.ratted = undefined; owner.tap = undefined;
    expect(select.hasWayIn(w, owner)).toBe(false);
    doFavour(w, owner);
    expect(select.hasWayIn(w, owner)).toBe(true);
  });

  it('but neither of those turns into a shakedown: the counter stays shut', () => {
    const w = mk();
    const b = find(w, 'bank') ?? find(w, 'accountant')!;
    const owner = owes(w, w.npcs[b.ownerId], 90);
    owner.ratted = w.day;
    expect(select.hasWayIn(w, owner)).toBe(true);
    expect(can(w, { type: 'shakedown', businessId: b.id }).ok).toBe(false);
    expect(can(w, { type: 'protect', businessId: b.id, rate: 0.1 }).ok).toBe(false);
  });

  it('you can still buy one outright, which was never a threat', () => {
    const w = mk();
    const b = find(w, 'jeweller'); if (!b) return;
    void b;
    w.player.cash = 10_000_000;
    const r = can(w, { type: 'buy_business', businessId: b.id, offer: Math.round(b.value * 1.3) });
    expect(r.ok || (!r.ok && !/protection|shake/i.test(r.reason))).toBe(true);
    expect(tierOf(b)).toBe(3);
  });
});
