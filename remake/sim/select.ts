/**
 * Read-only questions for the UI. Components never compute an outcome; they ask here, and every
 * answer comes from the same function the simulation itself uses.
 */
import { RACKETS } from '@r/content/world';
import { protectionTake, racketIncome, washCap, washRate } from './economy';
import { PLAYER } from './types';
import type { Block, Business, Id, Npc, World } from './types';
import { controller } from './util';

export { businessPrice, crewCut, fixerCap, fixerRate, labOutput, labQuality, levelMult, netWorth, nextRank, notoriety, protectionTake, racketIncome, rankOf, runnerFactor, saturationMult, sellCapacity, stashTotal, streetPrice, synergyOf, upgradeCost, washCap, washRate, INSTITUTION_RESPECT, FAIR_RATE } from './economy';
export { bedsTotal, controlShare, playerBlocks, travelCost } from './select-core';
export { quote, agendaLine, secretLine, type SceneKind, type SceneQuote } from './scenes';
export { jobOdds, payoutFor, complicationOdds, caseKinds, insider, leansFor } from './jobs';
export { stanceOf, sitDownOdds, tributeEffect, factionBlocks, STANCE_LABEL } from './factions';
export { evidenceRate, convictionOdds, openCases } from './law';
export { depth, accrualMult, heldDays, T as TERRITORY } from './territory';
export { stashCapacity, STRAIGHT, WIN_SHARE } from './tick';
export { restockCost } from './reducer';
export { controller, fullName, shortName, money } from './util';

export const blockController = (w: World, id: Id) => { const b = w.blocks[id]; return b ? controller(b) : undefined; };
export const businessesIn = (w: World, blockId: Id): Business[] => (w.blocks[blockId]?.businessIds ?? []).map(id => w.businesses[id]).filter(Boolean);
export const peopleOn = (w: World, blockId: Id): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.homeBlockId === blockId && !n.crew);
export const crew = (w: World): Npc[] => w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew);
export const known = (w: World): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.rel.met && !n.crew).sort((a, b) => (b.rel.met ?? 0) - (a.rel.met ?? 0));
export const officials = (w: World): Npc[] => Object.values(w.npcs).filter(n => n.alive && n.official);
export const protectedBy = (w: World, who = PLAYER): Business[] => Object.values(w.businesses).filter(b => b.protection?.by === who);
export const isParkBlock = (b: Block) => !!b.landmark && /Park|Gardens|Common|Green|Fields/.test(b.landmark) && b.businessIds.length === 0;

/** Tomorrow's money, forecast from the same formulas the tick uses. Sellers and the laundry are estimates. */
export function forecast(w: World): { dirty: number; clean: number; costs: number; washed: number } {
  const p = w.player;
  let dirty = 0, clean = 0, costs = 0, washed = 0;
  for (const b of protectedBy(w)) dirty += protectionTake(b);
  for (const id of p.businessIds) { const b = w.businesses[id]; if (b && b.closed === 0) clean += Math.round(b.income * 0.45); }
  for (const id of p.racketIds) {
    const r = w.rackets[id]; if (!r || r.down > 0) continue;
    const def = RACKETS[r.kind];
    if (def.wash) { if (r.on !== false) washed += washCap(w, r); continue; }
    if (def.sells) continue;
    const x = racketIncome(w, r); if (def.clean) clean += x; else dirty += x;
  }
  for (const id of p.crewIds) costs += w.npcs[id]?.crew?.cut ?? 0;
  const wash = Math.min(washed, p.dirty + dirty);
  return { dirty: dirty - wash, clean: clean + Math.round(wash * washRate(w)), costs, washed: wash };
}

/** The label of whoever holds a block, for the map key and the sheets. */
export function holderName(w: World, blockId: Id): string {
  const c = blockController(w, blockId);
  if (!c) return 'Nobody';
  return c === PLAYER ? 'You' : w.factions[c]?.name ?? 'Nobody';
}
export const pendingJob = (w: World) => Object.values(w.jobs).find(j => j.status === 'paused');
