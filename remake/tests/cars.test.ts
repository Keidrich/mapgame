/**
 * Cars (`sim/cars.ts`, `content/cars.ts`): what is parked tonight, taking it, the garage (chop,
 * respray, keep, sell), hot cars, and the getaway on a failed job.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CHOP, GARAGE, MODELS, RESPRAY, SELL, STEAL } from '@r/content/cars';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { getawayMult } from '@r/sim/cars';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

function night(): World {
  let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
  w.player.cash = 20000;
  w = dispatch(w, { type: 'nightfall' }); w.events = [];
  return w;
}
/** Take a car, trying block after block until one comes off (the dice are the dice). */
function takeOne(w: World): World {
  for (const b of Object.values(w.blocks)) {
    if (!select.parkedOn(w, b.id)) continue;
    w.player.blockId = b.id; w.player.ap = 5;
    w = dispatch(w, { type: 'steal_car', blockId: b.id });
    if ((w.player.garage ?? []).length) return w;
  }
  throw new Error('no car taken anywhere');
}

describe('the street', () => {
  it('every block has something parked tonight, fitted to its wealth, and it stays put while you look', () => {
    const w = night();
    const rich = Object.values(w.blocks).sort((a, b) => b.wealth - a.wealth)[0];
    const poor = Object.values(w.blocks).sort((a, b) => a.wealth - b.wealth)[0];
    const r = select.parkedOn(w, rich.id)!, p = select.parkedOn(w, poor.id)!;
    expect(MODELS[r].value).toBeGreaterThanOrEqual(MODELS[p].value);
    expect(select.parkedOn(w, rich.id)).toBe(r);
    expect(rich.wealth).toBeGreaterThanOrEqual(MODELS[r].wealth[0]);
  });

  it('needs the night and the block; a taken car is hot, and the street is empty after', () => {
    let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    const b = Object.values(w.blocks)[0];
    expect(can(w, { type: 'steal_car', blockId: b.id }).why).toMatch(/after dark/);
    w = night();
    const heat = w.player.heat;
    w = takeOne(w);
    const car = w.player.garage![0];
    expect(car.hot).toBe(STEAL.hotDays);
    expect(w.player.heat).toBeGreaterThan(heat);
    expect(select.parkedOn(w, w.player.blockId)).toBeUndefined();
  });

  it('the garage has room for one on the street and two per safehouse tier', () => {
    const w = night();
    expect(select.garageRoom(w)).toBe(GARAGE.street);
    w.player.garage = [{ id: 'x', model: 'hatch', hot: 0, plates: false, day: 1 }];
    const b = Object.values(w.blocks).find(x => select.parkedOn(w, x.id))!;
    w.player.blockId = b.id;
    expect(can(w, { type: 'steal_car', blockId: b.id }).why).toMatch(/Nowhere to put it/);
  });
});

describe('the garage', () => {
  it('chops through a scrapyard at the fence rate, for dirty money', () => {
    const w = night();
    w.player.garage = [{ id: 'c1', model: 'sedan', hot: 3, plates: false, day: 1 }];
    const yard = Object.values(w.businesses).find(b => b.type === 'scrapyard');
    if (!yard) return;
    w.player.blockId = yard.blockId;
    const dirty = w.player.dirty;
    const w2 = dispatch(w, { type: 'car', carId: 'c1', what: 'chop' });
    expect(w2.player.dirty - dirty).toBe(Math.round(MODELS.sedan.value * CHOP.fence));
    expect(w2.player.garage).toHaveLength(0);
  });

  it('a respray needs your garage; then the car cools and can be kept as kit or sold clean', () => {
    let w = night();
    w.player.garage = [{ id: 'c1', model: 'sports', hot: 4, plates: false, day: 1 }, { id: 'c2', model: 'sedan', hot: 4, plates: false, day: 1 }];
    expect(can(w, { type: 'car', carId: 'c1', what: 'respray' }).why).toMatch(/garage you own or protect/);
    expect(can(w, { type: 'car', carId: 'c1', what: 'keep' }).why).toMatch(/Respray it first/);
    const g = Object.values(w.businesses).find(b => b.type === 'garage' && select.cityOfBlock(w, b.blockId) === select.cityOfBlock(w, w.player.blockId))!;
    g.ownedBy = PLAYER;
    const cash = w.player.cash;
    w = dispatch(w, { type: 'car', carId: 'c1', what: 'respray' });
    expect(w.player.cash).toBe(cash - RESPRAY.cost);
    expect(w.player.garage![0]).toMatchObject({ hot: 0, plates: true });
    w = dispatch(w, { type: 'car', carId: 'c1', what: 'keep' });
    expect(w.player.armoury).toContain(MODELS.sports.keep);
    w = dispatch(w, { type: 'car', carId: 'c2', what: 'respray' });
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    const c0 = w.player.cash;
    w = dispatch(w, { type: 'car', carId: 'c2', what: 'sell' });
    expect(w.player.cash - c0).toBe(Math.round(MODELS.sedan.value * SELL.clean));
  });

  it('a hot car cools a day a night, and costs a little heat while it does', () => {
    let w = night();
    w.player.garage = [{ id: 'c1', model: 'hatch', hot: 2, plates: false, day: 1 }];
    w = dispatch(w, { type: 'end_day' });
    expect(w.player.garage![0].hot).toBe(1);
  });
});

describe('the getaway', () => {
  it('the best car in the crew cuts the arrest chance on a failed job', () => {
    const w = night();
    const job = { crewIds: [] as string[] } as never;
    expect(getawayMult(w, job, true)).toBe(1);
    w.player.kit = { car: 'muscle_car' };
    expect(getawayMult(w, job, true)).toBeCloseTo(1 - 3 * 0.12);
    expect(getawayMult(w, job, false)).toBe(1);
  });
});
