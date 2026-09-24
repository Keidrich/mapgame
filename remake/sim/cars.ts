/**
 * Cars (`content/cars.ts`): stealing what is parked on the street after dark, a garage to keep it
 * in while it cools, and what to do with it — chop it for dirty money, or respray it and keep it as
 * kit or sell it clean. And cars on the job: a getaway car in the crew keeps people out of cells
 * when a job goes wrong.
 *
 * What is parked on a block tonight is decided by a hash of the seed, the block and the day, not by
 * the world's rng: the sheet can show it before you try, and looking does not change the future.
 */
import { CHOP, GARAGE, GETAWAY, MODELS, RESPRAY, SELL, STEAL, type CarModel } from '@r/content/cars';
import { ITEMS } from '@r/content/kit';
import { half } from './clock';
import { skillOf } from './kit';
import { openCase } from './law';
import { cityOfBlock } from './region';
import { hash01 } from './rng';
import type { Rng } from './rng';
import type { Car, Id, Job, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, log, money, nid } from './util';

// ------------------------------------------------------------------------------------------ street
/** The car worth taking on a block tonight, or nothing if you have already taken it. */
export function parkedOn(w: World, blockId: Id): CarModel | undefined {
  if (w.player.lifted?.day === w.day && w.player.lifted.blockIds.includes(blockId)) return undefined;
  const b = w.blocks[blockId]; if (!b) return undefined;
  const fits = (Object.keys(MODELS) as CarModel[]).filter(m => b.wealth >= MODELS[m].wealth[0] && b.wealth <= MODELS[m].wealth[1]);
  if (!fits.length) return undefined;
  return fits[Math.floor(hash01(`${w.seed}:car:${blockId}:${w.day}`) * fits.length)];
}
export function stealOdds(w: World, blockId: Id): number {
  const m = parkedOn(w, blockId); if (!m) return 0;
  const att = w.districts[w.blocks[blockId].districtId]?.attention ?? 30;
  return clamp(Math.round(STEAL.base + skillOf(w, PLAYER, 'wheels') * STEAL.perWheels + skillOf(w, PLAYER, 'tech') * STEAL.perTech - MODELS[m].lock - att * STEAL.perPolice), 5, 95);
}
/** Room for cars: one on the street, two more per safehouse tier. */
export function garageRoom(w: World): number {
  return GARAGE.street + w.player.safehouseIds.reduce((t, id) => t + (w.safehouses[id]?.tier ?? 0) * GARAGE.perTier, 0);
}
export function stealBlock(w: World, blockId: Id): string | undefined {
  if (half(w) !== 'night') return 'Cars are taken after dark.';
  if (w.player.blockId !== blockId) return `Go to ${w.blocks[blockId]?.name ?? 'the block'} first.`;
  if (!parkedOn(w, blockId)) return 'Nothing left on this street worth taking tonight.';
  if ((w.player.garage ?? []).length >= garageRoom(w)) return 'Nowhere to put it. Chop or move what you have, or take a bigger place.';
  return undefined;
}
export function stealCar(w: World, rng: Rng, blockId: Id) {
  const p = w.player;
  const m = parkedOn(w, blockId)!;
  const odds = stealOdds(w, blockId);
  p.lifted = p.lifted?.day === w.day ? { day: w.day, blockIds: [...p.lifted.blockIds, blockId] } : { day: w.day, blockIds: [blockId] };
  if (rng.float() * 100 < odds) {
    const car: Car = { id: nid(w, 'car'), model: m, hot: STEAL.hotDays, plates: false, day: w.day };
    p.garage = [...(p.garage ?? []), car];
    addHeat(w, STEAL.heatOk, blockId);
    log(w, `${MODELS[m].label} off ${w.blocks[blockId].name}, and nobody saw a thing. Worth ${money(MODELS[m].value)} whole; hot for ${STEAL.hotDays} days.`, 'good', { blockId });
  } else {
    addHeat(w, STEAL.heatFail, blockId);
    if (rng.chance(STEAL.caseChance)) openCase(w, 'robbery', PLAYER, undefined, `A car stolen on ${w.blocks[blockId].name}.`, STEAL.caseEvidence);
    log(w, `The alarm on ${MODELS[m].label.toLowerCase()} goes off, and so do you. Lights coming on all along ${w.blocks[blockId].name}.`, 'bad', { blockId });
  }
}

// ------------------------------------------------------------------------------------------ garage
const carOf = (w: World, id: Id) => (w.player.garage ?? []).find(c => c.id === id);
const dropCar = (w: World, id: Id) => { w.player.garage = (w.player.garage ?? []).filter(c => c.id !== id); };
/** Who chops it: your own chop shop in this city pays best; a scrapyard that is not yours takes a cut. */
export function chopper(w: World): { rate: number; where: string } | undefined {
  const here = cityOfBlock(w, w.player.blockId);
  const mine = w.player.racketIds.map(id => w.rackets[id]).find(r => r?.kind === 'chop_shop' && !r.down && cityOfBlock(w, w.businesses[r.businessId]?.blockId) === here);
  if (mine) return { rate: CHOP.yours, where: w.businesses[mine.businessId].name };
  const yard = Object.values(w.businesses).find(b => b.type === 'scrapyard' && b.closed <= 0 && cityOfBlock(w, b.blockId) === here);
  return yard ? { rate: CHOP.fence, where: yard.name } : undefined;
}
/** A garage you own or protect in this city: where the plates change. */
export function sprayShop(w: World): Id | undefined {
  const here = cityOfBlock(w, w.player.blockId);
  return Object.values(w.businesses).find(b => b.type === 'garage' && b.closed <= 0 && (b.ownedBy === PLAYER || b.protection?.by === PLAYER) && cityOfBlock(w, b.blockId) === here)?.id;
}
export const chopValue = (w: World, c: Car) => Math.round(MODELS[c.model].value * (chopper(w)?.rate ?? 0));
export const sellValue = (c: Car) => Math.round(MODELS[c.model].value * SELL.clean);

export function carBlock(w: World, id: Id, what: 'chop' | 'respray' | 'keep' | 'sell'): string | undefined {
  const c = carOf(w, id); if (!c) return 'No such car.';
  if (what === 'chop') return chopper(w) ? undefined : 'Nobody in this city will take it apart: find a scrapyard, or run a chop shop.';
  if (what === 'respray') { if (c.plates) return 'Already on new plates.'; return sprayShop(w) ? undefined : 'You need a garage you own or protect in this city.'; }
  if (!c.plates) return 'Respray it first: new plates, new colour, new papers.';
  if (what === 'sell' && half(w) !== 'day') return 'Dealers keep office hours.';
  return undefined;
}
export function chop(w: World, id: Id) {
  const c = carOf(w, id)!; const v = chopValue(w, c); const who = chopper(w)!;
  dropCar(w, id); w.player.dirty += v;
  log(w, `${MODELS[c.model].label} goes into ${who.where} whole and comes out as parts: ${money(v)} dirty.`, 'money');
}
export function respray(w: World, id: Id) {
  const c = carOf(w, id)!; c.hot = 0; c.plates = true;
  log(w, `${MODELS[c.model].label} comes out of the spray booth a different colour, with papers to match. ${money(RESPRAY.cost)}.`, 'info');
}
export function keep(w: World, id: Id) {
  const c = carOf(w, id)!; const item = MODELS[c.model].keep;
  dropCar(w, id); w.player.armoury.push(item);
  log(w, `${MODELS[c.model].label} is yours now: ${ITEMS[item].label.toLowerCase()} in the armoury, for whoever needs wheels.`, 'good');
}
export function sell(w: World, id: Id) {
  const c = carOf(w, id)!; const v = sellValue(c);
  dropCar(w, id); w.player.cash += v;
  log(w, `A dealer across town takes ${MODELS[c.model].label.toLowerCase()} for ${money(v)}, by cheque.`, 'money');
}

/** Each night: hot cars cool a day, and each one still hot draws a little attention. */
export function tickCars(w: World) {
  for (const c of w.player.garage ?? []) if (c.hot > 0) { addHeat(w, STEAL.hotHeat); c.hot--; }
}

// -------------------------------------------------------------------------------------- the job
/** The best car in a job's crew (you too, if you are going): the getaway. */
export function getawayBonus(w: World, job: Job, withPlayer: boolean): number {
  const who: (Id | typeof PLAYER)[] = [...job.crewIds, ...(withPlayer ? [PLAYER] : [])];
  return Math.max(0, ...who.map(id => { const k = id === PLAYER ? w.player.kit : w.npcs[id]?.crew?.kit; return k?.car ? ITEMS[k.car]?.bonus ?? 0 : 0; }));
}
/** What a failed job's arrest chance is multiplied by, with that car waiting outside. */
export const getawayMult = (w: World, job: Job, withPlayer: boolean) => Math.max(0.4, 1 - getawayBonus(w, job, withPlayer) * GETAWAY.perBonus);
