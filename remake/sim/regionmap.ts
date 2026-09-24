/**
 * The region map on its own, so the world generator can make one without importing the code that
 * founds cities (which imports the world generator). See `region.ts` for what the region is for.
 */
import { PRODUCTS } from '@r/content/world';
import { cityMotto, cityName } from '@r/content/names';
import type { CitySize } from './city';
import { Rng } from './rng';
import type { CityId, Product, Region, RegionCity, World } from './types';

export const HOME: CityId = 'c0';

const KINDS: { kind: string; size: CitySize; demand: Partial<Record<Product, number>>; blurb: string }[] = [
  { kind: 'port', size: 'medium', demand: { goods: 1.35, booze: 0.9 }, blurb: 'Docks and warehouses. Anything stolen moves fast here.' },
  { kind: 'mill town', size: 'small', demand: { booze: 1.4, pills: 1.15, goods: 0.8 }, blurb: 'Shift work, bars and not much else. Drinks more than it earns.' },
  { kind: 'capital', size: 'large', demand: { pills: 1.3, goods: 1.2, green: 1.05 }, blurb: 'Money, lawyers, and a police force with a budget.' },
  { kind: 'resort', size: 'small', demand: { pills: 1.45, booze: 1.25, green: 1.2 }, blurb: 'A season town. Everybody is on holiday from something.' },
  { kind: 'college town', size: 'small', demand: { green: 1.5, pills: 1.2, booze: 1.1, goods: 0.8 }, blurb: 'Twenty thousand students and their parents\' money.' },
  { kind: 'border town', size: 'medium', demand: { goods: 1.45, green: 0.8, booze: 1.1 }, blurb: 'Half of what is sold here came across a line it should not have.' },
  { kind: 'rail junction', size: 'medium', demand: { booze: 1.2, goods: 1.15 }, blurb: 'Everything passes through. Some of it stops.' },
];

// ------------------------------------------------------------------------------------ the map
/**
 * The region, from its own stream so it moves nothing in any seed's first city. The home city
 * sits in the middle and pays the street's ordinary price for everything; the others are placed
 * around it and each pays more for some things and less for others.
 */
export function generateRegion(w: World): Region {
  const rng = new Rng(w.seed ^ 0x2e610);
  const n = rng.int(5, 6);
  const home: RegionCity = { id: HOME, name: w.city.name, kind: 'home', size: sizeOf(w), x: 500, y: 350, links: [], seed: w.seed, demand: flat(), founded: true, blurb: 'Where you started.' };
  const cities: RegionCity[] = [home];
  const taken = new Set([w.city.name]);
  const kinds = rng.shuffle(KINDS.slice());
  for (let k = 1; k < n; k++) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 40; tries++) {
      const a = rng.float() * Math.PI * 2, r = 170 + rng.float() * 150;
      x = Math.round(500 + Math.cos(a) * r * 1.3); y = Math.round(350 + Math.sin(a) * r * 0.85);
      if (x > 60 && x < 940 && y > 50 && y < 650 && cities.every(c => Math.hypot(c.x - x, c.y - y) > 150)) break;
    }
    const t = kinds[(k - 1) % kinds.length];
    let name = cityName(rng, t.kind === 'port');
    for (let g = 0; g < 5 && taken.has(name); g++) name = cityName(rng, t.kind === 'port');
    taken.add(name);
    const demand = flat();
    for (const p of Object.keys(demand) as Product[]) demand[p] = Math.round((t.demand[p] ?? 0.85 + rng.float() * 0.3) * 100) / 100;
    cities.push({ id: `c${k}`, name, kind: t.kind, size: t.size, x, y, links: [], seed: (w.seed * 31 + k * 7919) >>> 0, demand, founded: false, blurb: t.blurb, motto: cityMotto(rng) });
  }
  // roads: every city to its two nearest, both ways — and the nearest to home always reaches it
  for (const c of cities) {
    const near = cities.filter(o => o !== c).sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 2);
    for (const o of near) { if (!c.links.includes(o.id)) c.links.push(o.id); if (!o.links.includes(c.id)) o.links.push(c.id); }
  }
  return { cities };
}
export const flat = (): Record<Product, number> => Object.fromEntries(Object.keys(PRODUCTS).map(p => [p, 1])) as Record<Product, number>;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function sizeOf(w: World): CitySize { return w.city.cols >= 21 ? 'large' : w.city.cols >= 17 ? 'medium' : 'small'; }

