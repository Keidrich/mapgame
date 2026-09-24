/**
 * The supply chain (`content/supply.ts`). Every night, after the labs have made what they make,
 * the drivers in each city load from the stash and go round the outlets there — the places you
 * protect or own that have said they will take your product — until the van is empty or the orders
 * are filled. Each load can be stopped on the road.
 *
 * The stash travels with you (as it always has), so a driver in any city you have founded can load
 * from it; only the outlets in the driver's own city are theirs to serve.
 */
import { ITEMS } from '@r/content/kit';
import { PRODUCTS } from '@r/content/world';
import { OUTLETS, SUPPLY } from '@r/content/supply';
import { streetPrice } from './economy';
import { stanceOf } from './factions';
import { GUNS } from '@r/content/fights';
import { injure } from './people';
import type { Rng } from './rng';
import type { Business, Id, Npc, Product, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, fullName, log } from './util';

/** A place that could take product: yours or under your protection, and of a kind that sells it. */
export const canBeOutlet = (b: Business) => (b.ownedBy === PLAYER || b.protection?.by === PLAYER) && !!OUTLETS[b.type];
/** What it would take of one product a night. */
export function outletDemand(w: World, b: Business, p: Product): number {
  const base = OUTLETS[b.type]?.[p] ?? 0;
  return Math.round(base * (SUPPLY.wealthBase + (w.blocks[b.blockId]?.wealth ?? 50) / 100));
}
/** What it pays for a lot. */
export function outletPrice(w: World, b: Business, p: Product): number {
  return Math.round(streetPrice(w, p, b.blockId) * (b.ownedBy === PLAYER ? SUPPLY.ownedMult : SUPPLY.protectedMult));
}
const cityOf = (w: World, blockId: Id) => w.districts[w.blocks[blockId]?.districtId ?? '']?.cityId || 'c0';

/** How many lots a night somebody could carry: more with wheels, more again with a real car. */
export function driverCarry(n: Npc): number {
  const car = n.crew?.kit?.car ? ITEMS[n.crew.kit.car]?.bonus ?? 0 : 0;
  return SUPPLY.driverBase + n.skills.wheels * SUPPLY.perWheels + car * SUPPLY.perCarBonus;
}
/** Your drivers, each with how many lots a night they can carry. */
export function drivers(w: World): { n: Npc; carry: number; city: string }[] {
  return w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew?.assignment?.kind === 'driver' && n.crew.status === 'ready')
    .map(n => ({ n, carry: driverCarry(n), city: n.crew!.cityId || 'c0' }));
}
/** The outlets that are taking product, in one city or all. */
export function outlets(w: World, city?: string): Business[] {
  return Object.values(w.businesses).filter(b => b.outlet?.length && canBeOutlet(b) && b.closed <= 0 && (!city || cityOf(w, b.blockId) === city));
}
/** How likely a load is to be stopped tonight. */
export function hijackChance(w: World, armed: boolean): number {
  const war = Object.values(w.factions).some(f => f.alive && ['war', 'beef'].includes(stanceOf(f, w.day)));
  const c = SUPPLY.hijack.base + (war ? SUPPLY.hijack.war : 0) + w.player.heat * SUPPLY.hijack.perHeat;
  return Math.min(0.5, c * (armed ? SUPPLY.hijack.armed : 1));
}

export interface SupplyNight { day: number; delivered: number; earned: number; lost: number; short: number }

/** How much a round driven by you carries: your wheels, and your car. */
export function yourCarry(w: World): number {
  const car = w.player.kit?.car ? ITEMS[w.player.kit.car]?.bonus ?? 0 : 0;
  return SUPPLY.driverBase + w.player.skills.wheels * SUPPLY.perWheels + car * SUPPLY.perCarBonus;
}
/** What tonight's orders in a city come to, if the stash can fill them: for the button and the bot. */
export function ordersIn(w: World, city: string): { lots: number; worth: number } {
  let lots = 0, worth = 0;
  for (const b of outlets(w, city)) for (const k of b.outlet ?? []) {
    const n = Math.min(outletDemand(w, b, k) - (b.supplied?.day === w.day ? b.supplied.n : 0), w.player.stash[k].n);
    if (n > 0) { lots += n; worth += n * outletPrice(w, b, k); }
  }
  return { lots, worth };
}

/**
 * One van's round: load from the stash and go door to door in one city until the van is empty or
 * every order is filled. Shared by the crew drivers at the end of the day and by you, driving it
 * yourself after dark — so the numbers on the button are the numbers the night uses.
 */
export function round(w: World, rng: Rng, r: SupplyNight, carry: number, city: string, armed: boolean, driver: string, hurt: () => void) {
  const p = w.player;
  let room = carry;
  for (const b of outlets(w, city)) {
    for (const prod of b.outlet ?? []) {
      const lot = p.stash[prod]; if (!lot.n || room <= 0) continue;
      const want = outletDemand(w, b, prod) - (b.supplied?.day === w.day ? b.supplied.n : 0);
      const n = Math.min(want, lot.n, room); if (n <= 0) continue;
      lot.n -= n; if (!lot.n) lot.q = 0; room -= n;
      b.supplied = { day: w.day, n: (b.supplied?.day === w.day ? b.supplied.n : 0) + n };
      if (rng.chance(hijackChance(w, armed))) {
        r.lost += n;
        addHeat(w, 2, b.blockId);
        if (rng.chance(0.3)) hurt();
        log(w, `${driver} load for ${b.name} was taken on the road: ${n} lots of ${prod} gone.`, 'bad', { businessId: b.id });
        continue;
      }
      const pay = n * outletPrice(w, b, prod);
      r.delivered += n; r.earned += pay;
      addHeat(w, PRODUCTS[prod].heat * n * 0.15 * SUPPLY.heatShare, b.blockId);
      const o = w.npcs[b.ownerId]; if (o && b.ownedBy !== PLAYER) o.rel.trust = clamp(o.rel.trust + SUPPLY.trust, -100, 100);
    }
  }
}

/** You drive tonight's round yourself. */
export function runDelivery(w: World, rng: Rng) {
  const r: SupplyNight = { day: w.day, delivered: 0, earned: 0, lost: 0, short: 0 };
  const armed = GUNS.includes(w.player.kit?.weapon as never);
  round(w, rng, r, yourCarry(w), cityOf(w, w.player.blockId), armed, 'Your', () => { w.player.hurtDays = Math.max(w.player.hurtDays ?? 0, 2); });
  w.player.dirty += r.earned;
  log(w, r.delivered ? `You drove the round yourself: ${r.delivered} lots at the back doors, ${Math.round(r.earned)} dirty.` : 'You drove the round, and came home with nothing to show for it.', r.delivered ? 'money' : 'bad');
  if (w.player.skills.wheels < 10 && rng.chance(0.15)) w.player.skills.wheels++;
}

/** The crew's rounds at the end of the day. Returns what came in (dirty) for the day's summary. */
export function tickSupply(w: World, rng: Rng): number {
  const p = w.player;
  const report: SupplyNight = { day: w.day, delivered: 0, earned: 0, lost: 0, short: 0 };
  for (const d of drivers(w)) {
    const armed = GUNS.includes(d.n.crew?.kit?.weapon as never);
    round(w, rng, report, d.carry, d.city, armed, `${fullName(d.n)}'s`, () => injure(w, d.n.id, rng.int(2, 4), 'a load taken on the road'));
  }
  // what the outlets wanted and did not get, so the screen can say why
  for (const b of outlets(w)) for (const prod of b.outlet ?? []) report.short += Math.max(0, outletDemand(w, b, prod) - (b.supplied?.day === w.day ? b.supplied.n : 0));
  if (report.earned) { p.dirty += report.earned; log(w, `The drivers dropped ${report.delivered} lots at your places: ${Math.round(report.earned)} dirty.`, 'money'); }
  w.supply = report;
  return report.earned;
}
