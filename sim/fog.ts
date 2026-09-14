/**
 * What of the city you have actually been out to see.
 *
 * The map used to work like this: tap anywhere, and a whole chunk — hundreds of blocks, their
 * businesses, their people — appeared at once, with no warning and no cost. Territory was a
 * thing you summoned, not a thing you went to. Under fog it is the second one: the unmapped
 * city is under cloud, and cloud only lifts where somebody of yours has actually got to.
 *
 * "Somebody of yours" is the player, or a crew member posted somewhere — a guard on a block, a
 * runner on a racket, a lieutenant over a district. Those are the people who are physically out
 * there; a crew member sitting idle in a safehouse reveals nothing.
 *
 * Pure: this decides *what should be revealed*, and the UI does the fetching, because loading
 * chunk geometry is network work and `/sim` does not do network work.
 */
import { chunkBounds } from '@geo/chunks';
import { distanceM } from '@geo/project';
import type { Id, LatLng, World } from './types';

/**
 * How close somebody has to get to unmapped ground before it opens up. Roughly a block and a
 * half: you have to walk to the edge of what you know, not merely glance that way. Raising this
 * makes the city open up faster and makes fog decorative; lowering it strands the player.
 */
export const REVEAL_M = 500;

/** Every place you have somebody standing right now. The player counts; idle crew do not. */
export function presenceBlocks(w: World): Id[] {
  const out = new Set<Id>();
  if (w.blocks[w.player.currentBlockId]) out.add(w.player.currentBlockId);
  for (const id of w.player.crewIds) {
    const c = w.npcs[id]?.crew;
    if (!c || c.status === 'dead' || c.status === 'jailed' || !c.assignment) continue;
    const a = c.assignment;
    if (a.kind === 'guard') { if (w.blocks[a.blockId]) out.add(a.blockId); continue; }
    if (a.kind === 'racket') { const b = w.businesses[w.rackets[a.racketId]?.businessId]; if (b) out.add(b.blockId); continue; }
    if (a.kind === 'production') { const s = w.safehouses[w.productions[a.productionId]?.safehouseId]; if (s) out.add(s.blockId); continue; }
    if (a.kind === 'lieutenant') { for (const b of w.districts[a.districtId]?.blockIds ?? []) if (w.blocks[b]) out.add(b); continue; }
  }
  return [...out];
}

/** Metres from a point to the nearest edge of a chunk; 0 when the point is inside it. */
export function distanceToChunk(p: LatLng, key: string): number {
  const b = chunkBounds(key);
  const lat = Math.min(b.north, Math.max(b.south, p.lat));
  const lng = Math.min(b.east, Math.max(b.west, p.lng));
  return distanceM(p, { lat, lng });
}

/** True when somebody of yours is close enough to this chunk for the cloud to lift. */
export function withinReach(w: World, key: string): boolean {
  for (const id of presenceBlocks(w)) {
    if (distanceToChunk(w.blocks[id].center, key) <= REVEAL_M) return true;
  }
  return false;
}

/**
 * Which of the chunks whose geometry is already cached should be populated now. The UI passes
 * the keys it is holding; anything already in `w.chunks` is done, and anything nobody has
 * walked near stays under cloud.
 */
export function revealable(w: World, cachedKeys: Iterable<string>): string[] {
  const out: string[] = [];
  for (const key of cachedKeys) {
    if (w.chunks[key]) continue;
    if (withinReach(w, key)) out.push(key);
  }
  return out;
}

/** True when this chunk is still under cloud: not populated, and nobody is near enough. */
export function isFogged(w: World, key: string): boolean { return !w.chunks[key] && !withinReach(w, key); }

/**
 * How near the player is to the cloud, for the "you are at the edge of the map" hint. Undefined
 * when everything in reach is already mapped.
 */
export function nearestFoggedDistance(w: World, cachedKeys: Iterable<string>): number | undefined {
  const here = w.blocks[w.player.currentBlockId]?.center;
  if (!here) return undefined;
  let best: number | undefined;
  for (const key of cachedKeys) {
    if (w.chunks[key]) continue;
    const d = distanceToChunk(here, key);
    if (best === undefined || d < best) best = d;
  }
  return best;
}
