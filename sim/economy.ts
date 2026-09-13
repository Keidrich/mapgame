/** Income formulas for rackets and productions. Shared by the tick and by estimates. */
import { LIEUTENANT, PRODUCTION_DEFS, PRODUCTION_LEVEL, PRODUCT_INFO, RACKET_DEFS, RECIPES } from '@content/rackets';
import { coverFor } from './lieutenants';
import type { Npc, Production, Racket, World } from './types';

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
