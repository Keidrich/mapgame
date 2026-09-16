/**
 * Territory, and why it never moved.
 *
 * Influence accrued at a flat +1/day per racket wherever it sat. Three rackets on one block did
 * exactly what three rackets on three blocks did — depth bought nothing — and city control sat
 * near the same low percentage from this project's first soak onward.
 *
 * Measuring rather than assuming turned up the real cause: a bot sixty days in had every block
 * it ran anything on already at influence 100, and there were three of them out of forty-five.
 * Accrual speed was never the constraint; *spread* was. So depth now compounds accrual, tenure
 * settles it, and — the actual lever — a block you hold deeply bleeds influence into the streets
 * around it, so an empire grows outward from strongholds instead of stopping at the doors it owns.
 */
import { describe, expect, it } from 'vitest';
import { TERRITORY } from '@content/territory';
import { PLAYER, dispatch, generateWorld, select, type Business, type World } from './index';
import { mkRacket } from './reducer';
import { accrualMult, applyDailyInfluence, blockDepth, heldDays, spillToNeighbours, updateTenure } from './territory';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; w.player.cash = 500000; return w; };
const own = (w: World, biz: Business) => { biz.ownedBy = 'player'; if (!w.player.businessIds.includes(biz.id)) w.player.businessIds.push(biz.id); return biz; };
/**
 * A block carrying exactly `n` of the player's operations. Depth counts owned businesses *and*
 * rackets, so the first one is the business itself and the rest are rackets in it.
 */
function stack(w: World, n: number): string {
  const block = Object.values(w.blocks).sort((a, b) => b.businessIds.length - a.businessIds.length)[0];
  expect(block.businessIds.length).toBeGreaterThan(0);
  const kinds = ['numbers', 'bookmaking', 'gambling_den', 'loansharking', 'laundering', 'dealing', 'after_hours', 'policy_bank'] as const;
  const biz = own(w, w.businesses[block.businessIds[0]]);
  for (let i = 0; i < n - 1; i++) mkRacket(w, kinds[i % kinds.length], biz);
  expect(blockDepth(w, block.id)).toBe(n);
  return block.id;
}
/**
 * Run days properly. `end_day` is refused while an event card is waiting, so a bare
 * dispatch loop silently stops advancing the moment the deck hands you something — which is
 * how this file's first draft "proved" that influence stalls at 15.
 */
function days(w: World, n: number): World {
  let next = w;
  for (let d = 0; d < n; d++) {
    let guard = 0;
    while (next.pendingEvents.length && guard++ < 10) {
      const e = next.pendingEvents[0];
      next = dispatch(next, { type: 'resolve_event', eventId: e.id, optionId: e.options[e.options.length - 1].id });
    }
    next = dispatch(next, { type: 'end_day' });
  }
  return next;
}

describe('depth counts', () => {
  it('counts everything of yours on a block, not just one racket', () => {
    const w = mk();
    const block = Object.values(w.blocks).find(b => b.businessIds.length >= 2)!;
    expect(blockDepth(w, block.id)).toBe(0);
    const biz = own(w, w.businesses[block.businessIds[0]]);
    expect(blockDepth(w, block.id)).toBe(1);          // the business itself
    mkRacket(w, 'numbers', biz);
    expect(blockDepth(w, block.id)).toBe(2);          // and what you run in it
    mkRacket(w, 'bookmaking', biz);
    expect(blockDepth(w, block.id)).toBe(3);
  });

  it('the old flat rate is gone: accrual multiplies with depth', () => {
    const w = mk();
    const id = stack(w, 1);
    const one = accrualMult(w, id);
    expect(one).toBeCloseTo(1, 6);   // one operation is the old flat trickle, unchanged
    const deep = mk();
    const deepId = stack(deep, 4);
    expect(accrualMult(deep, deepId)).toBeGreaterThan(one);
    expect(blockDepth(deep, deepId)).toBeGreaterThan(1);
  });

  it('measurably: the same day of work on a deep block moves influence further', () => {
    const shallow = mk(); const shallowId = stack(shallow, 1);
    const deep = mk(); const deepId = stack(deep, 4);
    applyDailyInfluence(shallow, shallowId, 1);
    applyDailyInfluence(deep, deepId, 1);
    expect(deep.blocks[deepId].influence[PLAYER]).toBeGreaterThan(shallow.blocks[shallowId].influence[PLAYER]!);
  });

  it('stops compounding past the cap, so one mega-block cannot run away', () => {
    const w = mk();
    const id = stack(w, 10);
    expect(blockDepth(w, id)).toBeGreaterThan(TERRITORY.depthCap);
    const capped = 1 + (TERRITORY.depthCap - 1) * TERRITORY.depthBonus;
    expect(accrualMult(w, id)).toBeCloseTo(capped, 6);   // tenure is zero on a block never held
  });
});

describe('tenure counts', () => {
  it('is zero until you actually hold the block', () => {
    const w = mk();
    const id = stack(w, 2);
    expect(heldDays(w, id)).toBe(0);
    expect(w.blocks[id].heldSince).toBeUndefined();
  });

  it('starts the day you take it and grows while you keep it', () => {
    const w = mk();
    const id = stack(w, 2);
    w.blocks[id].influence = { [PLAYER]: 60 };
    updateTenure(w);
    expect(w.blocks[id].heldSince).toBe(w.day);
    w.day += 10;
    expect(heldDays(w, id)).toBe(10);
    expect(accrualMult(w, id)).toBeGreaterThan(1 + (blockDepth(w, id) - 1) * TERRITORY.depthBonus);
  });

  it('resets the moment you lose it', () => {
    const w = mk();
    const id = stack(w, 2);
    w.blocks[id].influence = { [PLAYER]: 60 };
    updateTenure(w); w.day += 20;
    expect(heldDays(w, id)).toBe(20);
    w.blocks[id].influence = { [PLAYER]: 10, rival: 70 };
    updateTenure(w);
    expect(w.blocks[id].heldSince).toBeUndefined();
    expect(heldDays(w, id)).toBe(0);
  });

  it('caps, so a block held for a year is not unassailable', () => {
    const w = mk();
    const id = stack(w, 1);
    w.blocks[id].influence = { [PLAYER]: 60 };
    updateTenure(w); w.day += 5000;
    expect(accrualMult(w, id)).toBeLessThanOrEqual(1 + (TERRITORY.depthCap - 1) * TERRITORY.depthBonus + TERRITORY.tenureCap + 1e-9);
  });
});

describe('holding ground spreads it — the actual lever', () => {
  it('a block you hold deeply bleeds influence into its neighbours', () => {
    const w = mk();
    const id = stack(w, 4);
    w.blocks[id].influence = { [PLAYER]: 60 };
    updateTenure(w);
    const neighbours = w.blocks[id].neighborIds.filter(x => w.blocks[x]);
    expect(neighbours.length).toBeGreaterThan(0);
    for (const nb of neighbours) expect(w.blocks[nb].influence[PLAYER] ?? 0).toBe(0);
    spillToNeighbours(w, id, 10);
    for (const nb of neighbours) expect(w.blocks[nb].influence[PLAYER] ?? 0).toBeGreaterThan(0);
  });

  it('but only off a block you actually control', () => {
    const w = mk();
    const id = stack(w, 4);
    w.blocks[id].influence = { [PLAYER]: TERRITORY.controlAt - 5 };   // present, not in charge
    updateTenure(w);
    spillToNeighbours(w, id, 10);
    for (const nb of w.blocks[id].neighborIds) if (w.blocks[nb]) expect(w.blocks[nb].influence[PLAYER] ?? 0).toBe(0);
  });

  it('and only once there is real depth on it', () => {
    const w = mk();
    const id = stack(w, 1);
    w.blocks[id].influence = { [PLAYER]: 60 };
    updateTenure(w);
    expect(blockDepth(w, id)).toBeLessThan(TERRITORY.spillFromDepth);
    spillToNeighbours(w, id, 10);
    for (const nb of w.blocks[id].neighborIds) if (w.blocks[nb]) expect(w.blocks[nb].influence[PLAYER] ?? 0).toBe(0);
  });
});

describe('rivals get pushed, not merely out-added', () => {
  it('a deep block erodes the other outfits on it', () => {
    const w = mk();
    const id = stack(w, 4);
    const rival = Object.values(w.factions)[0].id;
    w.blocks[id].influence = { [PLAYER]: 40, [rival]: 50 };
    const before = w.blocks[id].influence[rival];
    applyDailyInfluence(w, id, 1);
    expect(w.blocks[id].influence[rival] ?? 0).toBeLessThan(before);
  });

  it('a shallow one does not', () => {
    const w = mk();
    const id = stack(w, 1);
    const rival = Object.values(w.factions)[0].id;
    w.blocks[id].influence = { [PLAYER]: 40, [rival]: 50 };
    applyDailyInfluence(w, id, 1);
    expect(w.blocks[id].influence[rival]).toBe(50);
  });
});

describe('end to end, through the real tick', () => {
  it('a block with several of your operations takes hold far faster than one with a single racket', () => {
    const deep = mk(); const deepId = stack(deep, 4);
    const thin = mk(); const thinId = stack(thin, 1);
    const a = days(deep, 12); const b = days(thin, 12);
    expect(a.blocks[deepId].influence[PLAYER] ?? 0).toBeGreaterThan(b.blocks[thinId].influence[PLAYER] ?? 0);
  });

  it('and the ground around a stronghold comes with it, which flat accrual never did', () => {
    let w = mk();
    const id = stack(w, 4);
    const neighbours = w.blocks[id].neighborIds.filter(x => w.blocks[x]);
    w = days(w, 40);
    expect(w.blocks[id].influence[PLAYER] ?? 0).toBeGreaterThan(TERRITORY.controlAt);
    const spread = neighbours.filter(nb => (w.blocks[nb].influence[PLAYER] ?? 0) > 0);
    expect(spread.length, 'a stronghold should pull its neighbours with it').toBeGreaterThan(0);
    expect(select.controlShare(w)).toBeGreaterThan(0);
  });
});

/**
 * How hard it bleeds, and what bleed alone is allowed to do.
 *
 * Reported from play: "once you buy a safehouse the leak of influence onto other blocks is really
 * harsh — you take over the surrounding blocks really quick without ever having talked to someone
 * or making someone protected." Measured, that was exactly right. Spill was `0.45 * (depth -
 * spillFromDepth + 1)` of the day's gain *per neighbour*, while `accrualMult` already scaled with
 * depth — so spill scaled with depth twice over and a block at the cap handed each of its
 * neighbours 1.35× what it earned itself. A business, one racket and a safehouse put all three
 * neighbours past control by day 10 from nothing.
 *
 * The other half of the report is the constraint on the fix: *some blocks have no business anybody
 * could protect*, and bleed is the only way in to those. So it is slowed and capped, not removed.
 */
describe('spill is a share of the day, not a multiple of it', () => {
  const hold = (w: World, id: string) => { w.blocks[id].influence = { [PLAYER]: 60 }; updateTenure(w); };

  it('gives each neighbour a fraction of the gain, and the same fraction at every depth', () => {
    const shallow = mk(); const shallowId = stack(shallow, TERRITORY.spillFromDepth); hold(shallow, shallowId);
    const deep = mk(); const deepId = stack(deep, TERRITORY.depthCap); hold(deep, deepId);
    spillToNeighbours(shallow, shallowId, 10);
    spillToNeighbours(deep, deepId, 10);
    const one = shallow.blocks[shallow.blocks[shallowId].neighborIds.filter(x => shallow.blocks[x])[0]].influence[PLAYER]!;
    const four = deep.blocks[deep.blocks[deepId].neighborIds.filter(x => deep.blocks[x])[0]].influence[PLAYER]!;
    expect(one).toBeCloseTo(10 * TERRITORY.spillShare, 6);
    expect(four, 'depth already scales the day\'s gain; scaling spill by it as well is what ran away').toBeCloseTo(one, 6);
    expect(one, 'a neighbour must never get more than the block that fed it').toBeLessThan(10);
  });

  it('stops at the cap, however long the stronghold runs', () => {
    const w = mk(); const id = stack(w, TERRITORY.depthCap); hold(w, id);
    const nbs = w.blocks[id].neighborIds.filter(x => w.blocks[x]);
    for (let d = 0; d < 200; d++) spillToNeighbours(w, id, 10);
    for (const nb of nbs) expect(w.blocks[nb].influence[PLAYER] ?? 0).toBeCloseTo(TERRITORY.spillCap, 6);
  });

  it('so bleed takes empty ground but cannot take a block off somebody holding it', () => {
    const w = mk(); const id = stack(w, TERRITORY.depthCap); hold(w, id);
    const nbs = w.blocks[id].neighborIds.filter(x => w.blocks[x]);
    const rival = Object.values(w.factions)[0].id;
    w.blocks[nbs[0]].influence = { [rival]: TERRITORY.spillCap + 10 };   // somebody actually runs this one
    for (let d = 0; d < 200; d++) spillToNeighbours(w, id, 10);
    expect(select.blockController(w, nbs[0]), 'you have to turn up to take it off them').toBe(rival);
    expect(select.blockController(w, nbs[1]), 'empty ground still comes with the stronghold').toBe(PLAYER);
  });

  it('caps what bleeds in, not what a block earns for itself', () => {
    const w = mk(); const id = stack(w, TERRITORY.depthCap); hold(w, id);
    for (let d = 0; d < 200; d++) applyDailyInfluence(w, id, 10);
    expect(w.blocks[id].influence[PLAYER]).toBeGreaterThan(TERRITORY.spillCap);
  });
});

describe('a safehouse is a rented door, not a street', () => {
  it('pays less influence a day than a protection racket, which the whole street knows about', () => {
    expect(TERRITORY.safehousePerDay).toBeLessThan(1.5);
  });

  it('one on its own does not spread: it is depth, not a stronghold', () => {
    let w = mk();
    const target = Object.values(w.blocks).find(b => b.neighborIds.filter(x => w.blocks[x]).length >= 3)!;
    const nbs = target.neighborIds.filter(x => w.blocks[x]);
    w.player.currentBlockId = target.id;
    w = dispatch(w, { type: 'rent_safehouse', blockId: target.id });
    expect(blockDepth(w, target.id)).toBe(1);
    w = days(w, 45);
    expect(select.blockController(w, target.id), 'the block itself is yours').toBe(PLAYER);
    for (const nb of nbs) expect(w.blocks[nb].influence[PLAYER] ?? 0, 'but nothing leaks off it').toBe(0);
  });
});

describe('the blocks with nothing to protect', () => {
  /**
   * Some blocks carry no business at all, so there is no door to buy and nobody to protect. Bleed
   * from an adjacent stronghold is their only route into an empire, which is why spill is capped
   * rather than switched off. Seed 1 has three of them; seed 5 has none, so this test picks its
   * own world.
   */
  it('are still reachable, because bleed is the only way in to them', () => {
    let w = mk(1);
    const stronghold = Object.values(w.blocks).find(b => b.businessIds.length > 0 && b.neighborIds.some(x => w.blocks[x] && w.blocks[x].businessIds.length === 0))!;
    expect(stronghold, 'seed 1 should still have a block with a business-less neighbour').toBeTruthy();
    const bare = stronghold.neighborIds.map(x => w.blocks[x]).filter(b => b && b.businessIds.length === 0);
    const biz = own(w, w.businesses[stronghold.businessIds[0]]);
    for (const k of ['numbers', 'bookmaking', 'gambling_den'] as const) mkRacket(w, k, biz);
    w = days(w, 40);
    for (const b of bare) expect(select.blockController(w, b.id), `${b.name} has nothing to protect; bleed has to be able to take it`).toBe(PLAYER);
  });
});
