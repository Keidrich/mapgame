/** Income formulas for rackets and productions. Shared by the tick and by estimates. */
import { LIEUTENANT, PRODUCTION_DEFS, PRODUCTION_LEVEL, PRODUCT_INFO, RACKET_DEFS, RECIPES } from '@content/rackets';
import { coverFor } from './lieutenants';
import type { Business, Id, Npc, Production, Racket, World } from './types';

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

/** Two ways a place ends up under your protection. Fear is the classic one: they are more afraid of you than
 *  their own nerve. Friendship is the other: somebody who trusts you will let you look after the place, but
 *  only as a favour — a friend does not hand over a third of the till, so the friendly route caps the rate. */
export const PROTECT_TRUST = 40;      // trust that counts as "we are friends"
export const PROTECT_FAVOUR_RATE = 0.2; // the most a friend will agree to without being leaned on
export const PROTECT_NERVE = 0.6;     // fear + respect needed, as a share of their nerve
export type ProtectRoute = 'fear' | 'friend';
export function protectRoute(owner: Npc, rate: number): ProtectRoute | undefined {
  if (owner.rel.fear + owner.rel.respect >= owner.nerve * PROTECT_NERVE) return 'fear';
  if (owner.rel.trust >= PROTECT_TRUST && rate <= PROTECT_FAVOUR_RATE) return 'friend';
  return undefined;
}
/** Why they said no, in their words. */
export function protectReason(owner: Npc, rate: number): string | undefined {
  if (protectRoute(owner, rate)) return undefined;
  if (owner.rel.trust >= PROTECT_TRUST) return `${owner.name} trusts you, but ${Math.round(rate * 100)}% is not a favour. Ask ${Math.round(PROTECT_FAVOUR_RATE * 100)}% or less as a friend, or make them afraid of you first.`;
  return `${owner.name} is neither scared of you nor close to you. Shake them down or send a message — or get their trust to ${PROTECT_TRUST} and ask for ${Math.round(PROTECT_FAVOUR_RATE * 100)}% as a favour.`;
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
  return def.launderCap * (1 + (r.level - 1) * 0.8) * runnerFactor(w, r.runnerId, def.skill, coverFor(w, biz)) * (0.5 + biz.baseIncome / 400);
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
