/**
 * Every money formula in the remake, in one place. The UI asks these same functions what a
 * number will be, so what the screen promises is what the day pays — the lesson the original's
 * op-payout audit taught the hard way.
 */
import { unmindedFloor } from './family';
import { incomeMult, priceMult } from './seasons';
import { BUSINESSES, LABS, PRODUCTS, RACKETS, RACKET_LEVEL, RANKS, SATURATION, SYNERGY } from '@r/content/world';
import type { Business, Lab, Npc, Product, Racket, Skill, World } from './types';
import { PLAYER } from './types';

// ------------------------------------------------------------------------------------- standing
/** What the street thinks you are: fear and respect together. */
export const notoriety = (w: World) => Math.round(w.player.fear + w.player.respect);
export function rankOf(w: World) {
  const n = notoriety(w);
  let r = RANKS[0];
  for (const x of RANKS) if (n >= x.at) r = x;
  return r;
}
export function nextRank(w: World) { const n = notoriety(w); return RANKS.find(x => x.at > n); }

// ---------------------------------------------------------------------------------- businesses
/** What owning it costs. A councillor on the payroll takes a fifth off. */
export function businessPrice(w: World, b: Business): number {
  const def = BUSINESSES[b.type];
  const onPayroll = Object.values(w.npcs).some(n => n.official === 'councillor' && n.payroll && n.alive);
  const greedy = w.npcs[b.ownerId]?.traits.includes('greedy') ? 0.9 : 1;
  const tierK = b.tier === 3 ? 1.6 : 1;
  return Math.round(b.income * def.valueDays * tierK * greedy * (onPayroll ? 0.8 : 1) / 50) * 50;
}
/** Respect you need before an institution will sell to you at all. */
export const INSTITUTION_RESPECT = 60;

export function protectionTake(b: Business): number {
  if (!b.protection || b.closed > 0) return 0;
  return Math.round(b.income * b.protection.rate);
}
/** Above this, an owner resents paying you and trust leaks every day. */
export const FAIR_RATE = 0.15;

// -------------------------------------------------------------------------------------- rackets
export function levelMult(r: Racket) { return RACKET_LEVEL.mult[r.level - 1]; }

/**
 * How well a racket is minded: nobody at all is 0.6, a lieutenant over the district 0.85, a
 * runner of your own 0.8 plus 4% per point of the skill it wants.
 */
export function runnerFactor(w: World, r: Racket): number {
  const def = RACKETS[r.kind];
  const runner = r.runnerId ? w.npcs[r.runnerId] : undefined;
  if (runner?.alive && runner.crew?.status !== 'jailed' && runner.crew?.status !== 'injured') {
    const skill = runner.skills[def.skill];
    const skim = runner.traits.includes('greedy') && (runner.crew?.loyalty ?? 50) < 50 ? 0.9 : 1;
    return (0.8 + skill * 0.04) * skim;
  }
  const b = w.businesses[r.businessId];
  const d = b ? w.blocks[b.blockId].districtId : '';
  const lt = Object.values(w.npcs).find(n => n.crew?.assignment?.kind === 'district' && n.crew.assignment.districtId === d && n.alive && n.crew.status !== 'jailed');
  // the underboss keeps an eye on what nobody is minding (`family.ts`)
  return Math.max(lt ? 0.85 : 0.6, unmindedFloor(w));
}

export function saturationMult(w: World, r: Racket): number {
  const b = w.businesses[r.businessId]; if (!b) return 1;
  const d = w.blocks[b.blockId].districtId;
  const peers = Object.values(w.rackets).filter(x => x.owner === r.owner && x.kind === r.kind && w.blocks[w.businesses[x.businessId]?.blockId]?.districtId === d)
    .sort((a, c) => a.started - c.started || a.id.localeCompare(c.id));
  const rank = Math.max(0, peers.findIndex(x => x.id === r.id));
  const over = rank - (SATURATION.free - 1);
  return over <= 0 ? 1 : Math.max(SATURATION.floor, Math.pow(SATURATION.decay, over));
}
export function synergyOf(w: World, r: Racket) {
  const s = SYNERGY[r.kind]; if (!s) return undefined;
  const b = w.businesses[r.businessId]; if (!b) return undefined;
  const d = w.blocks[b.blockId].districtId;
  const fed = Object.values(w.rackets).some(x => x.owner === r.owner && x.kind === s.needs && x.down === 0 && w.blocks[w.businesses[x.businessId]?.blockId]?.districtId === d);
  return fed ? s : undefined;
}

/** A plain earning racket's day. Sellers and the laundry are worked out where they act. */
export function racketIncome(w: World, r: Racket): number {
  const def = RACKETS[r.kind];
  const b = w.businesses[r.businessId];
  if (!b || r.down > 0 || b.closed > 0 || def.base === 0) return 0;
  const block = w.blocks[b.blockId];
  const bg = r.owner === PLAYER && w.player.background === 'brain' ? 1.12 : 1;
  return Math.round(def.base * levelMult(r) * (0.55 + block.wealth / 100) * runnerFactor(w, r) * saturationMult(w, r) * (1 + (synergyOf(w, r)?.bonus ?? 0)) * bg * incomeMult(w));
}

export function upgradeCost(r: Racket): number { return Math.round(RACKETS[r.kind].setup * ((RACKET_LEVEL.upgrade as readonly number[])[r.level] ?? 0)); }

// ------------------------------------------------------------------------------------- laundry
export function washCap(w: World, r: Racket): number {
  const def = RACKETS[r.kind]; if (!def.wash) return 0;
  return Math.round(def.wash.cap * levelMult(r) * runnerFactor(w, r));
}
export function washRate(w: World): number { return 0.85 + (w.player.background === 'brain' ? 0.04 : 0); }
/** The fixer: worse rate, smaller window, no machine of your own needed. */
export function fixerRate(w: World) { return 0.68 + w.player.skills.charm * 0.005; }
export function fixerCap(w: World) { return 1200 + w.player.skills.brains * 150; }

// -------------------------------------------------------------------------------------- product
export function qualityMult(q: number) { return 0.7 + (q / 100) * 0.55; }
export function streetPrice(w: World, product: Product, blockId: string): number {
  const b = w.blocks[blockId];
  const lot = w.player.stash[product];
  // each city of the region pays its own price for each thing (`region.ts`); the home city pays the street's
  const city = b ? w.districts[b.districtId]?.cityId || 'c0' : 'c0';
  const demand = w.region?.cities.find(c => c.id === city)?.demand[product] ?? 1;
  return Math.round(PRODUCTS[product].price * qualityMult(lot.q || 50) * (0.7 + (b?.wealth ?? 50) / 100 * 0.6) * demand * priceMult(w));
}
/** Units a selling racket can move in a day. */
export function sellCapacity(r: Racket) { return [0, 8, 14, 22][r.level]; }

export function labOutput(w: World, lab: Lab): number {
  const def = LABS[lab.kind];
  const worker = lab.workerId ? w.npcs[lab.workerId] : undefined;
  const hands = worker?.alive && worker.crew?.status !== 'jailed' && worker.crew?.status !== 'injured' ? 0.7 + worker.skills[def.skill] * 0.06 : 0.45;
  return Math.round(def.output * [1, 1.7, 2.5][lab.level - 1] * hands);
}
export function labQuality(w: World, lab: Lab): number {
  const def = LABS[lab.kind];
  const worker = lab.workerId ? w.npcs[lab.workerId] : undefined;
  const skill = worker?.alive ? worker.skills[def.skill] : 2;
  // each stolen recipe (`steal_formula`) is worth a level's worth of quality, to three
  return Math.max(10, Math.min(98, 30 + skill * 5 + lab.level * 8 + Math.min(3, w.player.recipes ?? 0) * 6));
}
export function stashTotal(w: World) { return Object.values(w.player.stash).reduce((t, l) => t + l.n, 0); }

// ----------------------------------------------------------------------------------------- crew
/** What someone wants a day to work for you. Better people cost more; a junkie costs less. */
export function crewCut(n: Npc): number {
  const best = Math.max(...Object.values(n.skills));
  const lvl = n.crew?.level ?? 1;
  return Math.round((25 + best * 7 + (lvl - 1) * 12) * (n.traits.includes('junkie') ? 0.6 : 1) * (n.traits.includes('greedy') ? 1.25 : 1));
}
export const XP_PER_LEVEL = 100;
export function crewPower(w: World, ids: string[], skill: Skill): number {
  return ids.reduce((t, id) => t + (w.npcs[id]?.skills[skill] ?? 0) + ((w.npcs[id]?.crew?.level ?? 1) - 1) * 0.5, 0);
}

// ------------------------------------------------------------------------------------ net worth
export function netWorth(w: World): number {
  const p = w.player;
  const biz = p.businessIds.reduce((t, id) => t + (w.businesses[id] ? businessPrice(w, w.businesses[id]) * 0.8 : 0), 0);
  const rackets = p.racketIds.reduce((t, id) => t + (w.rackets[id] ? RACKETS[w.rackets[id].kind].setup * levelMult(w.rackets[id]) * 0.5 : 0), 0);
  const stash = (Object.keys(p.stash) as Product[]).reduce((t, k) => t + p.stash[k].n * PRODUCTS[k].price * 0.6, 0);
  return Math.round(p.cash + p.dirty + biz + rackets + stash);
}
