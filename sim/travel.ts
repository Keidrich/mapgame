/**
 * Where the player physically is, and what it costs to get somewhere else.
 *
 * The city is a graph: `Block.neighborIds` links blocks that share a street edge, across
 * loaded chunks too. What a hop costs depends on whose ground it is, which comes from
 * influence, not from owning property: full price on a stranger's block, half where you
 * have a foothold, free between two blocks you run. Totals are rounded up, so a single
 * half-price hop still costs 1, but a walk entirely across your own turf costs nothing.
 *
 * Pure and deterministic: no RNG, no time, same answer for the same world.
 */
import { controller } from './populate';
import { PLAYER, type Block, type Id, type Npc, type World } from './types';

/**
 * Walking a hop costs 1 on ground that is not yours, half where you have a real foothold,
 * and nothing at all between two blocks you run. Territory is the reward: once a stretch
 * of the city is yours, you move through it freely.
 */
export const HOP = 1;
export const FOOTHOLD_HOP = 0.5;
export const TURF_HOP = 0;
/** Influence where your people are on the block, short of the 30 it takes to run it. */
export const FOOTHOLD = 15;

/** Legwork a day, from wheels. 3 at wheels 0, 8 at wheels 10. */
export function legworkFor(wheels: number): number { return 3 + Math.floor(wheels / 2); }

/** Blocks you run: the most influence on them, and enough of it to count. */
export function yourTurf(w: World): Set<Id> {
  const out = new Set<Id>();
  for (const b of Object.values(w.blocks)) if (controller(b) === PLAYER) out.add(b.id);
  return out;
}
/** Blocks where you have people and interests, whether or not you run them. */
export function footholdBlocks(w: World): Set<Id> {
  const out = new Set<Id>();
  for (const b of Object.values(w.blocks)) if ((b.influence[PLAYER] ?? 0) >= FOOTHOLD) out.add(b.id);
  return out;
}
/** Free, half or full price, by how much of the two blocks is yours. */
function edgeCost(a: Id, b: Id, turf: Set<Id>, foot: Set<Id>): number {
  if (turf.has(a) && turf.has(b)) return TURF_HOP;
  if (foot.has(a) && foot.has(b)) return FOOTHOLD_HOP;
  return HOP;
}

export interface Route { hops: Id[]; cost: number }

/**
 * Cheapest walk from `from` to `to`, or undefined when the two are not connected through
 * blocks that are loaded. `hops` excludes the starting block; `cost` is rounded up.
 */
export function route(w: World, from: Id, to: Id): Route | undefined {
  if (!w.blocks[from] || !w.blocks[to]) return undefined;
  if (from === to) return { hops: [], cost: 0 };
  const turf = yourTurf(w); const foot = footholdBlocks(w);
  // Dijkstra: edges are 1, 0.5 or free, so a longer way round through your own turf can be cheaper.
  const dist = new Map<Id, number>([[from, 0]]);
  const prev = new Map<Id, Id>();
  const seen = new Set<Id>();
  const queue: Id[] = [from];
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if ((dist.get(queue[i]) ?? Infinity) < (dist.get(queue[bi]) ?? Infinity)) bi = i;
    const cur = queue.splice(bi, 1)[0];
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (cur === to) break;
    const d = dist.get(cur) ?? Infinity;
    for (const nb of w.blocks[cur]?.neighborIds ?? []) {
      if (!w.blocks[nb] || seen.has(nb)) continue;
      const nd = d + edgeCost(cur, nb, turf, foot);
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); prev.set(nb, cur); queue.push(nb); }
    }
  }
  const raw = dist.get(to);
  if (raw === undefined) return undefined;
  const hops: Id[] = [];
  for (let at: Id | undefined = to; at !== undefined && at !== from; at = prev.get(at)) hops.unshift(at);
  return { hops, cost: Math.ceil(raw) };
}

/** What walking from where the player stands to `to` would cost, or undefined if unreachable. */
export function travelCost(w: World, to: Id): number | undefined { return route(w, w.player.currentBlockId, to)?.cost; }

/** True when the player is standing on this block. */
export function isHere(w: World, blockId?: Id): boolean { return !!blockId && w.player.currentBlockId === blockId; }

/**
 * Where you would run into this person: the blocks of the places they drink at, plus the
 * block they live on. In a generated world these are the same, but a person who moves or
 * inherits a business elsewhere should still be findable at either.
 */
export function npcBlockIds(w: World, n: Npc): Id[] {
  const out = new Set<Id>();
  for (const id of n.favouriteBusinessIds) { const b = w.businesses[id]; if (b) out.add(b.blockId); }
  const owned = Object.values(w.businesses).find(b => b.ownerId === n.id);
  if (owned) out.add(owned.blockId);
  if (n.homeBlockId) out.add(n.homeBlockId);
  return [...out];
}

/** True when the player is standing where this person can be found. */
export function npcIsHere(w: World, n: Npc): boolean { return npcBlockIds(w, n).includes(w.player.currentBlockId); }

/** The block the UI should offer to walk to in order to reach this person. */
export function npcReachBlock(w: World, n: Npc): Id | undefined {
  const ids = npcBlockIds(w, n);
  if (!ids.length) return undefined;
  let best: Id | undefined; let bc = Infinity;
  for (const id of ids) { const c = travelCost(w, id); if (c !== undefined && c < bc) { bc = c; best = id; } }
  return best ?? ids[0];
}

/** Name for a block id, for refusal messages. */
export function blockName(w: World, id?: Id): string { return (id && w.blocks[id]?.name) || 'there'; }

/** The block the player is standing on. */
export function currentBlock(w: World): Block | undefined { return w.blocks[w.player.currentBlockId]; }
