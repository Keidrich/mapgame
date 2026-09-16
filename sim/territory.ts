/**
 * Saturation, synergy, and what holding a block is actually worth.
 *
 * The two structural problems this fixes, both diagnosed long before they were touched:
 *
 * 1. **Nothing diversified.** Protection has no setup cost and works on any business, so once it
 *    worked there was no reason to pay for anything else. Now running the same kind repeatedly
 *    in one district decays its yield, and several kinds that feed each other pay a bonus for
 *    running together — so the profitable shape is a mixed portfolio, not protection everywhere.
 *
 * 2. **Territory never moved.** Influence accrued at a flat +1/day per racket wherever it sat,
 *    so three rackets on one block did exactly what three rackets on three blocks did. Depth
 *    bought nothing, and city control sat near the same low percentage from this project's first
 *    soak onward. Now accrual compounds with how much you run on a block and with how long you
 *    have held it, and a block you run deeply pushes rivals off rather than merely out-adding
 *    them.
 *
 * The two pull in opposite directions on purpose: spreading one kind thin is punished, stacking
 * several kinds on one block is rewarded twice over (synergy income and territory depth).
 */
import { SATURATION, SYNERGIES, TERRITORY } from '@content/territory';
import { PLAYER, type Block, type FactionId, type Id, type Racket, type RacketKind, type World } from './types';
import { addInfluence, clamp } from './util';

// ---------------------------------------------------------------- saturation
/** The district a racket sits in. */
export function districtOf(w: World, r: Racket): Id | undefined {
  const b = w.businesses[r.businessId];
  return b ? w.blocks[b.blockId]?.districtId : undefined;
}

/** The owner's rackets of one kind in one district, oldest first — order decides who decays. */
export function sameKindInDistrict(w: World, r: Racket): Racket[] {
  const district = districtOf(w, r);
  if (!district) return [r];
  return Object.values(w.rackets)
    .filter(x => x.owner === r.owner && x.kind === r.kind && districtOf(w, x) === district)
    .sort((a, b) => a.startedDay - b.startedDay || a.id.localeCompare(b.id));
}

/**
 * What this racket keeps after flooding. The first of a kind in a district is untouched; each
 * one after it is worth `decay` times the one before, floored so nothing is literally pointless.
 * Oldest first, so opening a fifth numbers route dilutes the *new* one rather than retroactively
 * punishing the four already running.
 */
export function saturationMult(w: World, r: Racket): number {
  const peers = sameKindInDistrict(w, r);
  const rank = Math.max(0, peers.findIndex(x => x.id === r.id));
  const over = rank - (SATURATION.free - 1);
  if (over <= 0) return 1;
  return Math.max(SATURATION.floor, Math.pow(SATURATION.decay, over));
}

// ---------------------------------------------------------------- synergy
/** Whether the feeder this kind wants is running for the same owner in the same district. */
export function synergyFor(w: World, r: Racket): { bonus: number; why: string; needs: RacketKind } | undefined {
  const s = SYNERGIES[r.kind];
  if (!s) return undefined;
  const district = districtOf(w, r);
  const fed = Object.values(w.rackets).some(x => x.owner === r.owner && x.kind === s.needs && !x.disrupted && districtOf(w, x) === district);
  return fed ? s : undefined;
}
export function synergyMult(w: World, r: Racket): number { return 1 + (synergyFor(w, r)?.bonus ?? 0); }

/** Everything the world does to this racket's take, before the racket's own formula. */
export function yieldMult(w: World, r: Racket): number { return saturationMult(w, r) * synergyMult(w, r); }

// ---------------------------------------------------------------- territory
/**
 * How much of yours is on this block: rackets you run, businesses you own, a safehouse. This is
 * the thing that used to count for nothing — a block with four of your operations accrued
 * exactly what four blocks with one each did.
 */
export function blockDepth(w: World, blockId: Id): number {
  const b = w.blocks[blockId]; if (!b) return 0;
  let n = 0;
  for (const id of b.businessIds) {
    const biz = w.businesses[id]; if (!biz) continue;
    if (biz.ownedBy === 'player') n++;
    for (const rid of biz.racketIds) if (w.rackets[rid]?.owner === PLAYER) n++;
  }
  if (b.safehouseId && w.safehouses[b.safehouseId]?.owner === PLAYER) n++;
  return n;
}

/** Consecutive days the player has actually controlled this block. */
export function heldDays(w: World, blockId: Id): number {
  const since = w.blocks[blockId]?.heldSince;
  return since === undefined ? 0 : Math.max(0, w.day - since);
}

/**
 * The multiplier on a day's influence gain. Depth compounds (each operation past the first adds
 * half again, to a cap) and tenure settles (a month of holding adds up to half again more).
 */
export function accrualMult(w: World, blockId: Id): number {
  const depth = Math.min(TERRITORY.depthCap, blockDepth(w, blockId));
  const fromDepth = 1 + Math.max(0, depth - 1) * TERRITORY.depthBonus;
  const fromTenure = Math.min(TERRITORY.tenureCap, heldDays(w, blockId) * TERRITORY.tenurePerDay);
  return fromDepth + fromTenure;
}

/** Whoever holds this block, by the same rule `controller` uses. */
function controllerOf(b: Block): FactionId | undefined { return topHolder(b)?.id; }
function topHolder(b: Block): { id: FactionId; value: number } | undefined {
  let best: FactionId | undefined; let bv = 0;
  for (const [f, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = f; }
  return best && bv >= TERRITORY.controlAt ? { id: best, value: bv } : undefined;
}

/**
 * A day's influence for the player on one block, applied once for the whole block rather than
 * per asset — and a block you run deeply pushes rivals off it, because otherwise a contested
 * block stays contested forever with both sides adding.
 */
export function applyDailyInfluence(w: World, blockId: Id, base: number) {
  if (base <= 0) return;
  const gain = base * accrualMult(w, blockId);
  addInfluence(w, blockId, PLAYER, gain);
  spillToNeighbours(w, blockId, gain);
  const depth = Math.min(TERRITORY.depthCap, blockDepth(w, blockId));
  if (depth <= 1) return;
  const push = (depth - 1) * TERRITORY.pushPerDepth;
  const b = w.blocks[blockId];
  for (const f of Object.keys(b.influence)) {
    if (f === PLAYER) continue;
    addInfluence(w, blockId, f, -push);
  }
}

/**
 * Ground you hold deeply bleeds into the streets around it. This is the piece that actually
 * moves city control: without it a player's influence maxes out on the handful of blocks they
 * have something on and stops, which is exactly where this game's territory numbers had sat
 * since the first soak. Spill is a fraction of the day's gain, so it costs nothing extra and
 * simply means a stronghold grows a neighbourhood rather than a corner.
 *
 * Two things keep that sentence true, both added after it turned out not to be:
 *
 * 1. **A share, not a multiple.** The old rate scaled with depth on top of `accrualMult`, which
 *    already does, so a deep block gave each neighbour more than it earned itself. Measured, a
 *    business plus one racket plus a safehouse flipped all three neighbours past control by day
 *    ten with the player never having gone there. `spillShare` is flat now.
 * 2. **A ceiling on what bleed alone can do.** Spill stops at `spillCap` — above `controlAt`, so
 *    it still takes empty ground (blocks with no protectable business have no other way in), but
 *    below what an outfit holding the block would have, so taking it off somebody still means
 *    turning up. Influence the block earns for itself is not capped; only what bleeds in is.
 */
export function spillToNeighbours(w: World, blockId: Id, base: number) {
  const b = w.blocks[blockId]; if (!b) return;
  if (controllerOf(b) !== PLAYER) return;                       // you have to actually hold it
  const depth = Math.min(TERRITORY.depthCap, blockDepth(w, blockId));
  if (depth < TERRITORY.spillFromDepth) return;
  const each = base * TERRITORY.spillShare;
  for (const nb of b.neighborIds) {
    const nbBlock = w.blocks[nb]; if (!nbBlock) continue;
    const room = TERRITORY.spillCap - (nbBlock.influence[PLAYER] ?? 0);
    if (room <= 0) continue;
    addInfluence(w, nb, PLAYER, Math.min(each, room));
  }
}

/**
 * Keep `heldSince` honest: stamped the day you take a block, cleared the day you lose it. Run
 * once at the end of the tick, after all the day's influence has moved.
 */
export function updateTenure(w: World) {
  for (const b of Object.values(w.blocks)) {
    const holder = topHolder(b);
    if (holder?.id === PLAYER) { if (b.heldSince === undefined) b.heldSince = w.day; }
    else if (b.heldSince !== undefined) b.heldSince = undefined;
  }
}

/** For the block sheet: why this block is accruing what it is. */
export function territoryReading(w: World, blockId: Id): { depth: number; days: number; mult: number } {
  return { depth: blockDepth(w, blockId), days: heldDays(w, blockId), mult: accrualMult(w, blockId) };
}
/** For a racket's sheet: what the district is doing to it. */
export function racketReading(w: World, r: Racket): { saturation: number; rank: number; synergy?: { bonus: number; why: string; needs: RacketKind } } {
  const peers = sameKindInDistrict(w, r);
  return { saturation: saturationMult(w, r), rank: Math.max(0, peers.findIndex(x => x.id === r.id)), synergy: synergyFor(w, r) };
}
export { clamp };
