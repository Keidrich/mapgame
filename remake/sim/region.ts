/**
 * The region: the city you started in and the cities down the road from it.
 *
 * Every save has five or six cities on a region map, linked by road and rail. Only the ones you
 * have been to exist in full: a city is generated — streets, people, outfits, a precinct — the
 * first time you arrive, into the same world as the first, with every id it makes prefixed by its
 * own (`c2.b14`), from its own seed. Everything else in the game works per block and per district,
 * so rackets, factions, the law and jobs work in a second city without knowing it is a second city.
 *
 * You open the road to a city by holding a quarter of one next to it. After that you can take the
 * train (a day's work of action points and a fare), start again on its streets with everything you
 * carry, run jobs there from wherever you are with your crew doing the work, and move product
 * between cities that pay differently for it.
 *
 * The home city is `c0`, stored where it always was (`w.city`, unprefixed ids), so a save from
 * before the region existed is simply a region of one founded city, and gains the rest in `migrate`.
 */
import { PRODUCTS } from '@r/content/world';
import { generateCity } from './city';
import { populateCity } from './generate';
import { Rng } from './rng';
import { generateStreetCrews } from './streetcrews';
import type { Block, City, CityId, Id, Product, Route, World } from './types';
import { PLAYER } from './types';
import { addHeat, addInfluence, clamp, controller, log, money, nid } from './util';

import { HOME } from './regionmap';
export { HOME, generateRegion } from './regionmap';

export const REGION = {
  /** Control of a city — a quarter of its blocks — that opens the road to the cities beside it. */
  unlockAt: 0.25,
  /** The train: a day's work of action points, and a fare by distance. */
  trainAp: 4,
  farePerUnit: 2,
  /** A trade route: what it costs to set up, how many lots it moves a day, and the freight's cut. */
  routeSetup: 2500,
  routePerDay: 12,
  routeKeep: 0.8,
  /** The daily chance a load is stopped: the lots are gone and the heat lands where it was going. */
  routeBust: 0.03,
};

// ------------------------------------------------------------------------------------ where
export const regionCity = (w: World, id: CityId) => w.region?.cities.find(c => c.id === id);
export const cityOfBlock = (w: World, blockId: Id): CityId => { const b = w.blocks[blockId]; return (b && w.districts[b.districtId]?.cityId) || HOME; };
export const currentCity = (w: World): CityId => cityOfBlock(w, w.player.blockId);
/** A city's streets and water: the home city's where they always were, the others' beside them. */
export const cityGeo = (w: World, id: CityId): City => (id === HOME ? w.city : w.cities?.[id] ?? w.city);
export const cityName_ = (w: World, id: CityId) => regionCity(w, id)?.name ?? (id === HOME ? w.city.name : id);
export function cityBlocks(w: World, id: CityId): Block[] { return Object.values(w.blocks).filter(b => (w.districts[b.districtId]?.cityId || HOME) === id); }
/** Your share of one city's blocks. */
export function controlIn(w: World, id: CityId): number {
  const bs = cityBlocks(w, id);
  return bs.filter(b => controller(b) === PLAYER).length / Math.max(1, bs.length);
}
/** Whether you can go there: a city you have been to, or one the road to has opened. */
export const isOpen = (w: World, id: CityId) => { const c = regionCity(w, id); return !!c && (c.founded || !!c.open); };
export function fare(w: World, to: CityId): number {
  const a = regionCity(w, currentCity(w)), b = regionCity(w, to);
  return a && b ? Math.round(dist(a, b) * REGION.farePerUnit / 10) * 10 : 0;
}

// ------------------------------------------------------------------------------------ growing
/** Once a quarter of a city is yours, word reaches the cities down the road. */
export function tickRegion(w: World, rng: Rng) {
  if (!w.region) return;
  for (const c of w.region.cities) {
    if (!c.founded || c.reached) continue;
    if (controlIn(w, c.id) < REGION.unlockAt) continue;
    c.reached = true;
    const opened = c.links.map(id => regionCity(w, id)!).filter(o => !o.founded && !o.open);
    for (const o of opened) o.open = true;
    if (opened.length) {
      const text = `A quarter of ${c.name} answers to you, and people in ${opened.map(o => o.name).join(' and ')} have started to say your name.`;
      log(w, `${text} The road is open — take the train from the region map.`, 'good');
      w.news.push({ day: w.day, text, weight: 8 });
    }
  }
  tickRoutes(w, rng);
}

/**
 * The first time you arrive somewhere: generate it in full, into this world, and put you on a
 * modest street of it. The city's own seed decides everything about it, so every save with this
 * seed gets the same second city.
 */
export function foundCity(w: World, id: CityId): Id | undefined {
  const c = regionCity(w, id); if (!c) return undefined;
  if (c.founded) return undefined;   // already here: `arrivalIn` says where you get off
  const prefix = `${id}.`;
  const gen = generateCity(c.seed, c.size, prefix);
  gen.city.name = c.name;
  if (c.motto) gen.city.motto = c.motto;
  for (const d of Object.values(gen.districts)) d.cityId = id;
  Object.assign(w.districts, gen.districts);
  Object.assign(w.blocks, gen.blocks);
  (w.cities ??= {})[id] = gen.city;
  const rng = new Rng(c.seed ^ 0x7e11);
  populateCity(w, gen, rng, { small: 3, medium: 4, large: 5 }[c.size], prefix);
  generateStreetCrews(w, Object.values(gen.blocks), c.seed);
  // somewhere modest to arrive: a street with doors on it and nobody's name on it yet
  const blocks = Object.values(gen.blocks);
  const quiet = blocks.filter(b => b.businessIds.length >= 2 && !b.landmark && !controller(b));
  const arrive = rng.pick(quiet.length ? quiet : blocks.filter(b => b.businessIds.length));
  c.founded = true; c.foundedDay = w.day; c.arrivalBlockId = arrive.id;
  // enough of a foothold on the street you arrive on to take a back room there (influence 10)
  addInfluence(w, arrive.id, PLAYER, 12);
  return arrive.id;
}

/**
 * Where the train leaves you in a city you have been to: your back room there, else the street you
 * hold most of, else where you first arrived. The home city has no arrival street of its own.
 */
export function arrivalIn(w: World, id: CityId): Id {
  const s = safehouseIn(w, id); if (s) return s.blockId;
  const bs = cityBlocks(w, id);
  const best = bs.slice().sort((a, b) => (b.influence[PLAYER] ?? 0) - (a.influence[PLAYER] ?? 0))[0];
  if (best && (best.influence[PLAYER] ?? 0) > 0) return best.id;
  return regionCity(w, id)?.arrivalBlockId ?? bs[0].id;
}

// ------------------------------------------------------------------------------------ trade
/** What a city pays for a product, against the street's ordinary price. */
export const demandIn = (w: World, id: CityId, p: Product) => regionCity(w, id)?.demand[p] ?? 1;

/** Your back room in a city, if you have one: routes start and end at them. */
export const safehouseIn = (w: World, id: CityId) => w.player.safehouseIds.map(s => w.safehouses[s]).find(s => s && cityOfBlock(w, s.blockId) === id);

/**
 * A route sells up to a dozen lots a day from your stash on the streets of the city at the other
 * end, at that city's price less the freight's cut. The stash travels with you, so the route is
 * really a standing order: the far city's price, without being there.
 */
function tickRoutes(w: World, rng: Rng) {
  const p = w.player;
  let earned = 0; const moved: string[] = [];
  for (const r of w.routes ?? []) {
    const dest = safehouseIn(w, r.to);
    if (!dest || !safehouseIn(w, r.from)) continue;          // a route needs a door at each end
    const lot = p.stash[r.product];
    const n = Math.min(REGION.routePerDay, lot.n);
    if (!n) continue;
    lot.n -= n; if (!lot.n) lot.q = 0;
    if (rng.chance(REGION.routeBust)) {
      addHeat(w, 6, dest.blockId);
      log(w, `A load of ${r.product} for ${cityName_(w, r.to)} was stopped on the road. ${n} lots gone, and the police there know the name on the manifest.`, 'bad');
      continue;
    }
    const price = routePrice(w, r);
    earned += n * price; r.moved = (r.moved ?? 0) + n;
    moved.push(`${n} ${r.product} to ${cityName_(w, r.to)}`);
  }
  if (earned) { p.dirty += earned; log(w, `The routes moved ${moved.join(', ')}: ${money(earned)} dirty.`, 'money'); }
}
/** What one lot fetches at the far end, after freight. */
export function routePrice(w: World, r: Pick<Route, 'to' | 'product'>): number {
  const q = w.player.stash[r.product].q || 50;
  const base = PRODUCTS[r.product].price * (0.6 + q / 125);
  return Math.round(base * demandIn(w, r.to, r.product) * REGION.routeKeep);
}
export function openRoute(w: World, from: CityId, to: CityId, product: Product): Route {
  const r: Route = { id: nid(w, 'rt'), from, to, product, since: w.day, moved: 0 };
  (w.routes ??= []).push(r);
  log(w, `A standing order: ${product}, ${cityName_(w, r.from)} to ${cityName_(w, to)}, up to ${REGION.routePerDay} lots a night.`, 'good');
  return r;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export { clamp };
