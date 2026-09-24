/** Read-only questions the sim itself needs to ask. `select.ts` re-exports them for the UI. */
import { SAFEHOUSE_TIERS } from '@r/content/world';
import type { Id, World } from './types';
import { PLAYER } from './types';
import { controller } from './util';

/** Which city a block is in (absent `cityId` on its district: the home city). */
export const blockCity = (w: World, blockId: Id): string => { const b = w.blocks[blockId]; return (b && w.districts[b.districtId]?.cityId) || 'c0'; };
/** Which city one of your people is in. Crew work only where they are (`region.ts`). */
export const crewCity = (w: World, npcId: Id): string => w.npcs[npcId]?.crew?.cityId || 'c0';
/** Your people in one city. */
export const crewIn = (w: World, city: string) => w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew && (n.crew.cityId || 'c0') === city);

export function bedsTotal(w: World): number {
  return 3 + w.player.safehouseIds.reduce((t, id) => t + (SAFEHOUSE_TIERS[(w.safehouses[id]?.tier ?? 1) - 1]?.beds ?? 0), 0);
}

export const playerBlocks = (w: World) => Object.values(w.blocks).filter(b => controller(b) === PLAYER);
/**
 * Your share of one city's blocks — the home city unless another is named. Winning is half of the
 * home city, as it always was; the region's other cities are counted on their own (`region.ts`).
 */
export function controlShare(w: World, city = 'c0'): number {
  let n = 0, mine = 0;
  for (const b of Object.values(w.blocks)) { if ((w.districts[b.districtId]?.cityId || 'c0') !== city) continue; n++; if (controller(b) === PLAYER) mine++; }
  return mine / Math.max(1, n);
}

/**
 * What walking somewhere costs. Next door is free. Anywhere you can reach through ground you
 * hold is free — the city shrinks as you own it, the original's best idea kept whole. Everything
 * else is a cab: 1 AP. A wheelman never pays.
 */
export function travelCost(w: World, to: Id): number {
  const from = w.player.blockId;
  if (from === to) return 0;
  if (w.player.background === 'wheelman') return 0;
  const here = w.blocks[from];
  if (here.neighborIds.includes(to)) return 0;
  const seen = new Set<Id>([from]); const q = [from];
  while (q.length) {
    const x = q.shift()!;
    for (const n of w.blocks[x].neighborIds) {
      if (seen.has(n)) continue;
      if (n === to) return 0;
      const b = w.blocks[n];
      if (controller(b) === PLAYER) { seen.add(n); q.push(n); }
    }
  }
  return 1;
}
