/** Read-only questions the sim itself needs to ask. `select.ts` re-exports them for the UI. */
import { SAFEHOUSE_TIERS } from '@r/content/world';
import type { Id, World } from './types';
import { PLAYER } from './types';
import { controller } from './util';

export function bedsTotal(w: World): number {
  return 3 + w.player.safehouseIds.reduce((t, id) => t + (SAFEHOUSE_TIERS[(w.safehouses[id]?.tier ?? 1) - 1]?.beds ?? 0), 0);
}

export const playerBlocks = (w: World) => Object.values(w.blocks).filter(b => controller(b) === PLAYER);
export const controlShare = (w: World) => playerBlocks(w).length / Math.max(1, Object.keys(w.blocks).length);

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
