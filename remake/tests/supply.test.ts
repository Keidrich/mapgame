/**
 * Supply chains (`sim/supply.ts`, `content/supply.ts`): which places take product, what they pay,
 * the crew's nightly rounds, driving a round yourself, and loads taken on the road.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { OUTLETS, SUPPLY } from '@r/content/supply';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { hire } from '@r/sim/people';
import { hijackChance, tickSupply } from '@r/sim/supply';
import { Rng } from '@r/sim/rng';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

/** A world with a protected bar, a stash of booze and one hand free to drive. */
function mk(): { w: World; barId: string; driverId: string } {
  const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
  const bar = Object.values(w.businesses).find(b => b.type === 'bar' && !b.protection && b.ownedBy !== PLAYER)!;
  bar.protection = { by: PLAYER, rate: 0.12, since: 1 } as never;
  const n = Object.values(w.npcs).find(x => x.alive && !x.faction && !x.official && x.role !== 'fixer')!;
  hire(w, n, 80);
  w.player.stash.booze = { n: 40, q: 60 };
  return { w, barId: bar.id, driverId: n.id };
}

describe('outlets', () => {
  it('only a place you protect or own, of a kind that sells it, takes your product', () => {
    const { w, barId } = mk();
    expect(can(w, { type: 'set_outlet', businessId: barId, products: ['booze'] }).ok).toBe(true);
    expect(can(w, { type: 'set_outlet', businessId: barId, products: ['pills'] }).why).toMatch(/no call for pills/);
    const other = Object.values(w.businesses).find(b => b.type === 'bar' && b.id !== barId && b.protection?.by !== PLAYER)!;
    expect(can(w, { type: 'set_outlet', businessId: other.id, products: ['booze'] }).why).toMatch(/Protect it or own it/);
    const laundromat = Object.values(w.businesses).find(b => !OUTLETS[b.type])!;
    expect(can(w, { type: 'set_outlet', businessId: laundromat.id, products: ['booze'] }).ok).toBe(false);
  });

  it('pays better than the street, more again at a place you own; demand follows the block', () => {
    const { w, barId } = mk();
    const b = w.businesses[barId];
    const street = select.streetPrice(w, 'booze', b.blockId);
    expect(select.outletPrice(w, b, 'booze')).toBe(Math.round(street * SUPPLY.protectedMult));
    b.ownedBy = PLAYER;
    expect(select.outletPrice(w, b, 'booze')).toBe(Math.round(street * SUPPLY.ownedMult));
    const blk = w.blocks[b.blockId];
    blk.wealth = 20; const poor = select.outletDemand(w, b, 'booze');
    blk.wealth = 90; expect(select.outletDemand(w, b, 'booze')).toBeGreaterThan(poor);
  });
});

describe('the rounds', () => {
  it('a driver delivers from the stash each night, for dirty money, and the owner warms to you', () => {
    let { w, barId, driverId } = mk();
    w = dispatch(w, { type: 'set_outlet', businessId: barId, products: ['booze'] });
    w = dispatch(w, { type: 'assign', npcId: driverId, assignment: { kind: 'driver' } });
    expect(select.drivers(w)).toHaveLength(1);
    // clear the roads so the test is about delivery, not luck
    for (const f of Object.values(w.factions)) f.standing = 50;
    w.player.heat = 0;
    const b = w.businesses[barId]; const trust = w.npcs[b.ownerId].rel.trust;
    const want = select.outletDemand(w, b, 'booze');
    const before = w.player.dirty;
    const earned = tickSupply(w, new Rng(1));
    expect(w.supply!.delivered + w.supply!.lost).toBeGreaterThan(0);
    if (w.supply!.delivered) {
      expect(earned).toBe(w.supply!.delivered * select.outletPrice(w, b, 'booze'));
      expect(w.player.dirty).toBe(before + earned);
      expect(w.npcs[b.ownerId].rel.trust).toBeGreaterThan(trust);
    }
    expect(w.player.stash.booze.n).toBe(40 - Math.min(want, select.driverCarry(w.npcs[driverId])));
    // the order is filled for the night: a second pass sends nothing
    const again = tickSupply(w, new Rng(2));
    expect(again).toBe(0);
  });

  it('a van only carries so much; a car and wheels carry more', () => {
    const { w, driverId } = mk();
    const n = w.npcs[driverId];
    const bare = select.driverCarry(n);
    expect(bare).toBe(SUPPLY.driverBase + n.skills.wheels * SUPPLY.perWheels);
    n.crew!.kit = { car: 'sedan' };
    expect(select.driverCarry(n)).toBeGreaterThan(bare);
  });

  it('you can drive the round yourself, after dark, when there are orders', () => {
    let { w, barId } = mk();
    expect(can(w, { type: 'run_delivery' }).ok).toBe(false);
    w = dispatch(w, { type: 'set_outlet', businessId: barId, products: ['booze'] });
    w.player.blockId = w.businesses[barId].blockId;
    expect(can(w, { type: 'run_delivery' }).why).toMatch(/after closing/);
    w = dispatch(w, { type: 'nightfall' });
    w.events = [];
    expect(select.ordersIn(w, select.currentCity(w)).lots).toBeGreaterThan(0);
    const booze = w.player.stash.booze.n;
    w = dispatch(w, { type: 'run_delivery' });
    expect(w.player.stash.booze.n).toBeLessThan(booze);
  });
});

describe('the road', () => {
  it('war and heat make a hijack likelier; a gun in the car halves it', () => {
    const { w } = mk();
    for (const f of Object.values(w.factions)) f.standing = 50;
    w.player.heat = 0;
    const calm = hijackChance(w, false);
    expect(calm).toBeCloseTo(SUPPLY.hijack.base);
    w.player.heat = 80;
    const hot = hijackChance(w, false);
    expect(hot).toBeGreaterThan(calm);
    expect(hijackChance(w, true)).toBeCloseTo(hot * SUPPLY.hijack.armed);
    Object.values(w.factions)[0].standing = -80;
    expect(hijackChance(w, false)).toBeGreaterThan(hot);
  });
});
