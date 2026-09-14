/** Income formulas for rackets and productions. Shared by the tick and by estimates. */
import { FIXER, LIEUTENANT, PRODUCTION_DEFS, PRODUCTION_LEVEL, PRODUCT_INFO, RACKET_DEFS, RECIPES } from '@content/rackets';
import { yieldMult } from './territory';
import { coverFor } from './lieutenants';
import type { Business, Id, Npc, Production, Racket, World } from './types';
import { familiar, familiarReason, favours, leverageOver } from './standing';

/** An owner has a place, a name and a living to lose, so they take far more talking round than a regular —
 *  and the better the place is doing, the less your offer is worth to them. */
export const OWNER_RECRUIT_RESIST = 30;
export function businessesOwnedBy(w: World, npcId: Id): Business[] {
  return Object.values(w.businesses).filter(b => b.ownerId === npcId && b.ownedBy === 'npc');
}
export function ownerResistance(w: World, n: Npc): number {
  const own = businessesOwnedBy(w, n.id);
  if (!own.length) return 0;
  return OWNER_RECRUIT_RESIST + Math.min(20, Math.max(...own.map(b => b.baseIncome)) / 20);
}
/** An owner who joins brings their place with them: a partner's cut, fixed, and nobody has to stand over it. */
export const PARTNER_RATE = 0.2;

/**
 * Three ways a place ends up under your protection, and none of them is "we chatted a lot".
 *
 *  - **fear** — they are more afraid of you than their own nerve. Unchanged as a gate, but much
 *    harder to reach now that fear is capped by what an act cost (`content/standing.ts`): talk
 *    tops out at 35, so a shakedown has to be earned with something demonstrated.
 *  - **friend** — they trust you *and* there is a reason beyond liking you: a favour you settled
 *    for them, or leverage — you hold their street, or you have been through their books.
 *    Handing over a fifth of the till every week is not a thing you do because somebody is nice.
 *
 * The trust number and the reason-beyond-trust are separate checks on purpose. Raising
 * `PROTECT_TRUST` would only have made the grind longer; it would not have made it mean anything.
 *
 * Leverage is a layer on top of trust, never a door of its own. A version of this that let
 * leverage in by itself ran for an afternoon and had to come out: protecting one place on a
 * block tipped its influence, which then handed you every other place on it for nothing, which
 * fed the influence again. Honest income came out 1.8× a day and average owner fear fell from
 * 26 to 1 — the whole fear system routed around in a single runaway loop.
 */
export const PROTECT_TRUST = 40;      // trust that counts as "we are friends"
export const PROTECT_FAVOUR_RATE = 0.2; // the most a friend will agree to without being leaned on
export const PROTECT_NERVE = 0.6;     // fear + respect needed, as a share of their nerve
export type ProtectRoute = 'fear' | 'friend';
export function protectRoute(w: World, owner: Npc, rate: number): ProtectRoute | undefined {
  // The fear door needs no familiarity of its own: fear is already floored by `sim/standing.ts`,
  // and a demonstrated act introduces you. The friend door does — being owed a favour by
  // somebody you have never actually dealt with is not a relationship, and without this line a
  // hand-set `favours` walked straight past the floor every other concession enforces.
  if (owner.rel.fear + owner.rel.respect >= owner.nerve * PROTECT_NERVE) return 'fear';
  if (!familiar(w, owner)) return undefined;
  if (owner.rel.trust >= PROTECT_TRUST && rate <= PROTECT_FAVOUR_RATE && (favours(owner) > 0 || leverageOver(w, owner))) return 'friend';
  return undefined;
}
/** Why they said no, in their words. */
export function protectReason(w: World, owner: Npc, rate: number): string | undefined {
  if (protectRoute(w, owner, rate)) return undefined;
  // Order matters: always name the door that is still open. The fear route needs no history at
  // all, so a stranger hears about both — leading with "you have never dealt with them" would
  // read as a wall when the shakedown is right there.
  if (owner.rel.trust >= PROTECT_TRUST && rate > PROTECT_FAVOUR_RATE) return `${owner.name} trusts you, but ${Math.round(rate * 100)}% is not a favour. Ask ${Math.round(PROTECT_FAVOUR_RATE * 100)}% or less, or make them afraid of you first.`;
  if (owner.rel.trust >= PROTECT_TRUST) {
    const stranger = familiarReason(w, owner);
    return stranger ? `${owner.name} is friendly for somebody you barely know. ${stranger} Or make them afraid of you instead.`
      : `${owner.name} likes you well enough, and that is not a reason to hand you ${Math.round(rate * 100)}% a week. Settle something real for them, take their block, or get inside their books — then ask.`;
  }
  return `${owner.name} is neither scared of you nor close to you. Shake them down or send a message — or get their trust to ${PROTECT_TRUST}, do them a turn, and ask for ${Math.round(PROTECT_FAVOUR_RATE * 100)}% as a favour.`;
}

/** How well a racket or production is run. A runner is best; a lieutenant covering the district is a decent second; nobody is half. */
export function runnerFactor(w: World, runnerId: string | undefined, skill: keyof Npc['skills'], cover?: Npc): number {
  const n = runnerId ? w.npcs[runnerId] : undefined;
  if (n && n.crew && n.crew.status === 'assigned') return 0.6 + n.skills[skill] / 10; // 0.7 .. 1.6
  if (cover) return Math.min(LIEUTENANT.coverCap, LIEUTENANT.coverFloor + cover.skills[skill] / 12);
  return 0.5;
}

/** Expected daily gross for a racket, before incidents. Product-scaled rackets return 0 here. */
export function racketIncome(w: World, r: Racket): number {
  return rawRacketIncome(w, r) * yieldMult(w, r);
}

/**
 * The racket's own formula, before the district has its say. Split out so `yieldMult` — the
 * saturation decay and the synergy bonus from `sim/territory.ts` — is applied in exactly one
 * place for the formula-driven kinds. The stash-scale kinds return 0 here and are computed
 * inline in the tick, which applies the same multiplier there; nothing gets it twice.
 */
export function rawRacketIncome(w: World, r: Racket): number {
  const def = RACKET_DEFS[r.kind];
  const biz = w.businesses[r.businessId];
  const block = w.blocks[biz.blockId];
  const lvl = 1 + (r.level - 1) * 0.6;
  const rf = runnerFactor(w, r.runnerId, def.skill, coverFor(w, biz));
  const cond = 0.5 + biz.condition / 200;
  switch (def.scale) {
    case 'business': {
      if (r.kind === 'protection') return biz.baseIncome * (biz.protection?.rate ?? 0.15) * 3 * cond; // owners pay out of gross
      if (r.kind === 'laundering') return 0;
      return def.incomeBase * lvl * rf * (0.6 + biz.baseIncome / 500) * cond;
    }
    case 'block': {
      const pop = 0.5 + block.population / 100; const wealth = 0.6 + block.wealth / 120;
      const patrons = 0.7 + biz.patronIds.length * 0.1;
      return def.incomeBase * lvl * rf * pop * wealth * patrons * cond;
    }
    case 'float': return (r.float ?? 0) * 0.03 * lvl * rf; // 3%/day
    default: return 0;
  }
}

export function launderCapacity(w: World, r: Racket): number {
  const def = RACKET_DEFS[r.kind]; if (!def.launderCap) return 0;
  const biz = w.businesses[r.businessId];
  // capacity saturates too: one neighbourhood can only absorb so much washing, however many
  // machines you put in it
  return def.launderCap * (1 + (r.level - 1) * 0.8) * runnerFactor(w, r.runnerId, def.skill, coverFor(w, biz)) * (0.5 + biz.baseIncome / 400) * yieldMult(w, r);
}

/**
 * A fixer's cut, as a rate on the dollar. Trust-scaled like the price an owner will sell
 * a business for: the better they know you, the less they skim. It rises from FIXER.minRate
 * to FIXER.maxRate and stops there — always under a laundering racket's LAUNDER_RATE, so
 * owning your own capacity stays a real upgrade rather than a faster version of this.
 */
export function fixerRate(trust: number): number {
  const t = Math.max(0, Math.min(FIXER.trustBand, trust)) / FIXER.trustBand;
  return FIXER.minRate + (FIXER.maxRate - FIXER.minRate) * t;
}
/** How much dirty money a fixer will touch in one day. Scales with trust the same way the rate does. */
export function fixerDailyCap(trust: number): number {
  return Math.round(FIXER.capBase + FIXER.capPerTrust * Math.max(0, Math.min(FIXER.trustBand, trust)));
}
/** What they have already washed for you today. The counter resets by day, not by tick. */
export function fixerUsedToday(w: World, n: Npc): number {
  return n.fixer && n.fixer.day === w.day ? n.fixer.amount : 0;
}
/**
 * The window they agreed to today. Fixed the moment they first take money from you, so the
 * trust you earn by using them opens a bigger window *tomorrow* rather than topping up the
 * one they already set — "come back tomorrow" has to mean it.
 */
export function fixerCapToday(w: World, n: Npc): number {
  return n.fixer && n.fixer.day === w.day ? n.fixer.cap : fixerDailyCap(n.rel.trust);
}
export function fixerCapLeft(w: World, n: Npc): number {
  return Math.max(0, fixerCapToday(w, n) - fixerUsedToday(w, n));
}
/** Every fixer the player has come across, nearest first. */
export function fixersKnown(w: World): Npc[] {
  return Object.values(w.npcs).filter(n => n.role === 'fixer' && n.alive);
}

export function productionOutput(w: World, p: Production): number {
  const def = PRODUCTION_DEFS[p.kind];
  const recipe = p.recipe ? RECIPES[p.recipe] : undefined;
  return def.outputBase * (1 + (p.level - 1) * PRODUCTION_LEVEL.output) * (recipe?.output ?? 1) * runnerFactor(w, p.workerId, def.skill);
}

export function streetPrice(w: World, blockId: string, product: keyof typeof PRODUCT_INFO): number {
  const b = w.blocks[blockId];
  return PRODUCT_INFO[product].price * (0.7 + b.wealth / 150) * (b.demand[product] > 3 ? 1.1 : 0.9);
}
