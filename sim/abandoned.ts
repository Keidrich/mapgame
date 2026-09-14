/**
 * Blocks the city forgot. No businesses, nobody watching, and nobody who could take the
 * stand. A derelict block is worth finding (`scout_block`) and worth taking
 * (`claim_abandoned`), after which you can squat a safehouse there rent-free.
 *
 * There is deliberately no special heat or risk rule here. The existing racket and
 * production formulas in tick.ts already scale with the block's `police`, and abandoned
 * blocks generate with genuinely low police and population, so the discount falls out of
 * the numbers that already exist rather than being bolted on twice.
 */
import type { Rng } from './rng';
import { PLAYER, type Block, type District, type FactionId, type Id, type World } from './types';
import { addMemory } from './people';
import { clamp, log } from './util';

/** How often a procedurally-filled block in these districts is derelict instead. */
export const ABANDON_CHANCE: Partial<Record<District['kind'], number>> = { industrial: 0.3, docks: 0.2 };
/**
 * Elsewhere, only a block that is genuinely dead on its own numbers: at the bottom of its
 * district's population and police bands. Districts vary far more by generation than by
 * name, and a real city has quiet corners outside the yards, so the underlying test is the
 * one that matters — low population, low police — rather than the label on the district.
 */
export const QUIET_CHANCE = 0.25;
/** Nowhere is derelict in the parts of town with money and eyes. */
export const NEVER: District['kind'][] = ['downtown', 'heights'];
/** Some are obviously derelict from the street and need no scouting. */
export const OBVIOUS = 0.05;

/** The chance this block comes out derelict, given its district and its own generated stats. */
export function abandonChance(kind: District['kind'], b: Block, band: { police: [number, number] }): number {
  const byKind = ABANDON_CHANCE[kind];
  if (byKind !== undefined) return byKind;
  if (NEVER.includes(kind)) return 0;
  // Population is scaled by block area and pegs near the top of every band, so it is a poor
  // instrument here. Police is not scaled: the bottom third of a district's police band is
  // the part of it nobody is watching.
  const [lo, hi] = band.police;
  const quiet = b.police <= lo + (hi - lo) * 0.35;
  return quiet ? QUIET_CHANCE : 0;
}

export function isAbandoned(b: Block): boolean { return !!b.abandoned; }
export function isKnownAbandoned(b: Block): boolean { return !!b.abandoned?.known; }
export function isClaimable(b: Block): boolean { return !!b.abandoned?.known && !b.abandoned.claimedBy; }
export function claimedByPlayer(b: Block): boolean { return b.abandoned?.claimedBy === PLAYER; }

export function abandonedBlocks(w: World, opts: { known?: boolean; unclaimed?: boolean } = {}): Block[] {
  return Object.values(w.blocks).filter(b => {
    if (!b.abandoned) return false;
    if (opts.known !== undefined && b.abandoned.known !== opts.known) return false;
    if (opts.unclaimed && b.abandoned.claimedBy) return false;
    return true;
  });
}

/**
 * Turn a block derelict during generation. Only ever called on a block that was about to be
 * filled procedurally, never on one carrying real map data.
 */
export function makeAbandoned(b: Block, rng: Rng, low: { police: number; population: number }) {
  b.abandoned = { known: rng.chance(OBVIOUS) };
  b.police = clamp(Math.round(low.police * (0.3 + rng.float() * 0.3)), 2, 100);
  b.population = clamp(Math.round(low.population * (0.1 + rng.float() * 0.2)), 1, 100);
  b.demand = { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0, streetwear: 0 };
}

/** Blocks in this district the player has not found yet. */
export function unknownIn(w: World, districtId: Id): Block[] {
  return abandonedBlocks(w, { known: false }).filter(b => b.districtId === districtId);
}

/**
 * A scout turns up at most one derelict block. Returns what was found, or undefined when
 * the district had nothing left to find: the op can succeed and still come back empty.
 */
export function revealOne(w: World, districtId: Id, rng: Rng): Block | undefined {
  const pool = unknownIn(w, districtId);
  if (!pool.length) return undefined;
  const b = rng.pick(pool);
  b.abandoned!.known = true;
  return b;
}

/** Take a derelict block. The claim is territory, not property: a safehouse is a separate step. */
export function claim(w: World, b: Block, by: FactionId = PLAYER) {
  b.abandoned = { known: true, claimedBy: by };
  addMemory(w, b.id, 'claim', by === PLAYER ? 'Somebody moved into the empty lots and made them theirs.' : 'The empty lots changed hands.');
  if (by === PLAYER) log(w, `${b.name} is yours. Nobody holds a lease on it, so a safehouse here costs nothing to keep.`, 'good', { blockId: b.id });
}
