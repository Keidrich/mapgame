/**
 * What a business's tier actually does.
 *
 * Tier is the one property that decides at once what a place can host, what it costs to set up
 * inside it, and — the part that matters — whether fear is a way in at all. That last one is not
 * a new system: it plugs into the standing pass through two existing doors. `nerveFloor` raises
 * an established owner's nerve above what `STAKES.words` and `STAKES.backed` can reach on their
 * own, so talking somebody round stops working and a demonstrated act starts to; and an
 * institution's empty racket list refuses extortion outright, which is the rule the bank and the
 * armoured depot already lived under, generalised.
 *
 * The important thing about tier 2 is that nothing refuses the player *by name*. A raised voice
 * stops being enough because of where the number sits, not because a branch says so. Wreck the
 * place and the same `protectRoute` opens; do them a real favour and the friendly route opens.
 * The rules did not change — the ground did.
 */
import { BUSINESS_DEFS, TIERS, TIER_EXCLUDES, standingOf, type BusinessTier } from '@content/businesses';
import { RACKET_DEFS } from '@content/rackets';
import { concessionReason, leverageOver } from './standing';
import type { Business, Npc, RacketKind, World } from './types';

export function tierOf(b: Business): BusinessTier { return BUSINESS_DEFS[b.type].tier; }
export function tierInfo(b: Business) { return TIERS[tierOf(b)]; }

/** The owner nerve this tier will not go below, applied once at generation. */
export function nerveFloorFor(type: Business['type']): number { return TIERS[BUSINESS_DEFS[type].tier].nerveFloor; }

/**
 * Which rackets can actually run here: the type's own list intersected with what the tier will
 * carry. An intersection and never a replacement — a bar is still a bar, it just cannot host
 * what a bar could never host.
 */
export function racketsAllowed(b: Business): RacketKind[] {
  const own = BUSINESS_DEFS[b.type].rackets;
  const out = TIER_EXCLUDES[tierOf(b)];
  if (out === 'all') return [];
  if (out === 'none') return own;
  return own.filter(k => !out.includes(k));
}
export function canHost(b: Business, kind: RacketKind): boolean { return racketsAllowed(b).includes(kind); }

/** Setting up inside an established place costs more, because everything there does. */
export function setupCost(b: Business, kind: RacketKind): number {
  return Math.round(RACKET_DEFS[kind].setupCost * TIERS[tierOf(b)].value);
}

/**
 * Why this place can never be leaned on, whatever the player brings. Undefined when the ordinary
 * `protectReason` / shakedown rules apply — which is every tier 1 and 2 place, unchanged.
 */
export function extortReason(b: Business): string | undefined {
  if (tierInfo(b).extort && canHost(b, 'protection')) return undefined;
  if (!tierInfo(b).extort) {
    return `${b.name} is not a shop with a man behind the counter. Nobody there is frightened of you and nobody there can say yes. ${wayIn()}`;
  }
  return `${BUSINESS_DEFS[b.type].label} is not the kind of place that pays protection.`;
}

/**
 * Why the room will not deal with you, whatever you are offering. Undefined at tiers 1–3, which
 * have no standing floor and are therefore unchanged by this existing at all.
 *
 * Deliberately the same shape as `nerveFloorFor`: a number on the tier, compared arithmetically
 * against a number about the situation, with nothing anywhere naming a business type. `nerveFloor`
 * asks whether fear can reach the owner; this asks whether the player is somebody a chartered
 * institution takes a meeting with. Adding a tier 5 would need no new branch here, which is the
 * test of whether a gate is really arithmetic or a hardcoded check wearing a table.
 */
export function standingReason(w: World, b: Business): string | undefined {
  const floor = tierInfo(b).standingFloor;
  if (!floor) return undefined;
  const have = standingOf(w.player.respect, w.player.fear);
  if (have >= floor) return undefined;
  return `${TIERS[tierOf(b)].label} money does not take meetings with strangers. You need ${floor} standing — respect, or half as much again in fear — and you have ${Math.round(have)}.`;
}

/** What to do instead, for a place no threat opens. The same route the bank always had. */
export function wayIn(): string {
  return 'Get inside their books or do the owner a real turn — that is the only door.';
}

/**
 * Whether the player currently has the one thing an institution responds to. Read by the UI to
 * turn the hint from "here is the idea" into "you have this now", and by nothing else: it grants
 * no access on its own, because what leverage unlocks is the ops, not the counter.
 */
export function hasWayIn(w: World, owner: Npc | undefined): boolean {
  if (!owner) return false;
  return !!leverageOver(w, owner) || !concessionReason(w, owner, 'anything');
}
