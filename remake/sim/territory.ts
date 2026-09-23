/**
 * Ground: who holds each block, how that moves, and how a stronghold spreads.
 *
 * Carried over from the original with its fixes already in: accrual compounds with how much you
 * run on a block, tenure settles it, a deep block pushes rivals off, and a block you hold deeply
 * bleeds a *share* of its day into its neighbours — capped at `SPILL_CAP`, above control so bleed
 * can still take empty ground (parks, blocks with nothing to protect) and below what an outfit
 * holding a block would have, so taking ground off somebody still means turning up.
 */
import type { Id, Owner, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, controller } from './util';

export const T = { depthBonus: 0.5, depthCap: 4, tenurePerDay: 0.02, tenureCap: 0.5, pushPerDepth: 0.5, spillShare: 0.5, spillFromDepth: 2, spillCap: 45, idleDecay: 2 };

/** Operations of an owner on a block: owned or protected places, rackets, a safehouse, a guard. */
export function depth(w: World, blockId: Id, who: Owner = PLAYER): number {
  const b = w.blocks[blockId]; if (!b) return 0;
  let n = 0;
  for (const id of b.businessIds) {
    const biz = w.businesses[id];
    if (biz.ownedBy === who || biz.protection?.by === who) n++;
    for (const rid of biz.racketIds) if (w.rackets[rid]?.owner === who) n++;
  }
  if (who === PLAYER && b.safehouseId && w.safehouses[b.safehouseId]) n++;
  return n;
}

export function heldDays(w: World, blockId: Id) { const s = w.blocks[blockId]?.heldSince; return s === undefined ? 0 : Math.max(0, w.day - s); }

export function accrualMult(w: World, blockId: Id): number {
  const d = Math.min(T.depthCap, depth(w, blockId));
  return 1 + Math.max(0, d - 1) * T.depthBonus + Math.min(T.tenureCap, heldDays(w, blockId) * T.tenurePerDay);
}

/** Apply one day's gathered influence for the player, block by block. */
export function applyInfluence(w: World, gains: Record<Id, number>) {
  for (const [blockId, base] of Object.entries(gains)) {
    if (base <= 0) continue;
    const gain = base * accrualMult(w, blockId);
    addInfluence(w, blockId, PLAYER, gain);
    const b = w.blocks[blockId];
    const d = Math.min(T.depthCap, depth(w, blockId));
    if (controller(b) === PLAYER && d >= T.spillFromDepth) {
      const each = gain * T.spillShare;
      for (const nb of b.neighborIds) {
        const room = T.spillCap - (w.blocks[nb].influence[PLAYER] ?? 0);
        if (room > 0) addInfluence(w, nb, PLAYER, Math.min(each, room));
      }
    }
    if (d > 1) for (const f of Object.keys(b.influence)) if (f !== PLAYER) addInfluence(w, blockId, f, -(d - 1) * T.pushPerDepth);
  }
  // ground with nothing of yours on it slips back
  for (const b of Object.values(w.blocks)) {
    if ((b.influence[PLAYER] ?? 0) > 0 && depth(w, b.id) === 0 && !(gains[b.id] > 0)) addInfluence(w, b.id, PLAYER, -T.idleDecay);
  }
  // tenure
  for (const b of Object.values(w.blocks)) {
    if (controller(b) === PLAYER) { if (b.heldSince === undefined) b.heldSince = w.day; } else b.heldSince = undefined;
  }
}

export { clamp };
