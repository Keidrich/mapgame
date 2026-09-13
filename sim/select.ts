/** Read-only helpers for the UI. Never mutate. */
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_APPROACHES, OP_DEFS, RACKET_DEFS, type OpApproach } from '@content/rackets';
import { controller, stanceFor } from './generate';
import { CREW_COLOR, crewAt } from './crews';
export { crewAt };
export { lieutenants, lieutenantOf, districtsRunnable, districtIncome, promoteReason, playerAssetsIn } from './lieutenants';
export { nearPolice } from './tick';
export { brokerReason } from './politics';
export { route, travelCost, isHere, npcIsHere, npcBlockIds, npcReachBlock, currentBlock, yourTurf, footholdBlocks, legworkFor, FOOTHOLD } from './travel';
export { openCases, caseWitnessOf } from './cases';
export { seatReason, members as commissionMembers } from './commission';
export { protectRoute, protectReason, PROTECT_TRUST, PROTECT_FAVOUR_RATE } from './economy';
export { knownRecipes, recipesForKind, restockCost, qualityOf, sellMult, shortageActive, saturationActive, productionQuality } from './production';
import { distanceM } from '@geo/project';
import { STEP_M } from './populate';
import { PLAYER, type Block, type Business, type FactionId, type Id, type Npc, type OpKind, type RacketKind, type Stance, type World } from './types';

export { controller, stanceFor };

export function blockController(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }
export function factionColor(w: World, f?: FactionId): string {
  if (!f) return '#666a70';
  if (f === PLAYER) return '#f2c94c';
  if (w.crews[f]) return CREW_COLOR;
  return w.factions[f]?.color ?? '#666a70';
}
export function factionName(w: World, f?: FactionId): string {
  if (!f) return 'Unclaimed'; if (f === PLAYER) return w.player.name; if (w.crews[f]) return `The ${w.crews[f].name}`; return w.factions[f]?.name ?? '?';
}
export function businessesIn(w: World, blockId: Id): Business[] { return w.blocks[blockId].businessIds.map(id => w.businesses[id]); }
export function patronsOf(w: World, biz: Business): Npc[] { return biz.patronIds.map(id => w.npcs[id]).filter(n => n.alive); }
export function crew(w: World): Npc[] { return w.player.crewIds.map(id => w.npcs[id]); }
export function idleCrew(w: World): Npc[] { return crew(w).filter(n => n.crew?.status === 'idle'); }
export function playerBlocks(w: World): Block[] { return Object.values(w.blocks).filter(b => controller(b) === PLAYER); }
export function blocksOf(w: World, f: FactionId): Block[] { return Object.values(w.blocks).filter(b => controller(b) === f); }
export function officials(w: World): Npc[] { return Object.values(w.npcs).filter(n => n.official); }
export function stanceWithPlayer(w: World, f: FactionId): Stance { return w.factions[f].stance[PLAYER] ?? 'peace'; }
export function racketsAt(w: World, biz: Business) { return biz.racketIds.map(id => w.rackets[id]); }
export function availableRackets(w: World, biz: Business): RacketKind[] {
  const present = new Set(racketsAt(w, biz).map(r => r.kind));
  return BUSINESS_DEFS[biz.type].rackets.filter(k => !present.has(k) && !(k === 'protection' && biz.ownedBy === 'player'));
}
export function opTargets(w: World, kind: OpKind): Business[] {
  const d = OP_DEFS[kind];
  if (d.target !== 'business') return [];
  return Object.values(w.businesses).filter(b => {
    if (d.ownBusiness) return b.ownedBy === 'player';
    if (d.targetTypes) return d.targetTypes.includes(b.type) && b.ownedBy !== 'player';
    if (kind === 'raid_rival') return b.racketIds.some(r => w.rackets[r].owner !== PLAYER) || (b.protection && b.protection.factionId !== PLAYER);
    return b.ownedBy !== 'player' && !['bank', 'armored_depot'].includes(b.type);
  });
}
export function crewSkillSum(w: World, ids: Id[]): Record<string, number> {
  const s: Record<string, number> = { muscle: 0, brains: 0, charm: 0, wheels: 0, tech: 0 };
  for (const id of ids) { const n = w.npcs[id]; if (!n) continue; for (const k of Object.keys(s)) s[k] += n.skills[k as keyof typeof n.skills]; }
  return s;
}
export function opChance(w: World, kind: OpKind, crewIds: Id[], approach?: OpApproach): number {
  const d = OP_DEFS[kind]; const s = crewSkillSum(w, crewIds); const ap = approach ? OP_APPROACHES[approach] : undefined;
  let ratio = 0, n = 0;
  for (const [k, need] of Object.entries(d.needs)) { const wgt = ap?.skillWeight[k as keyof typeof ap.skillWeight] ?? 1; ratio += Math.min(1.3, (s[k] * wgt) / (need || 1)); n++; }
  ratio = n ? ratio / n : 1;
  const base = 50 + (ratio - 1) * 70 - (d.difficulty + (ap?.difficulty ?? 0) - 50) * 0.6 - w.player.heat * 0.15;
  return Math.max(3, Math.min(97, Math.round(base)));
}
/** People at a target who trust you enough to be an inside man (best first). */
export function insidersFor(w: World, businessId?: Id): Npc[] {
  if (!businessId) return [];
  const b = w.businesses[businessId]; if (!b) return [];
  return [b.ownerId, ...b.patronIds].map(id => w.npcs[id]).filter(n => n && n.alive && !n.crew && n.rel.trust >= 35).sort((x, y) => y.rel.trust - x.rel.trust);
}
export function racketLabel(k: RacketKind) { return RACKET_DEFS[k].label; }
export function dailyEstimate(w: World): { clean: number; dirty: number; wages: number; rent: number } {
  let clean = 0, dirty = 0;
  for (const id of w.player.businessIds) clean += w.businesses[id].baseIncome * (w.businesses[id].condition / 100);
  for (const id of w.player.racketIds) { const r = w.rackets[id]; if (RACKET_DEFS[r.kind].dirty) dirty += r.lastIncome; else clean += r.lastIncome; }
  const wages = crew(w).reduce((s, n) => s + (n.crew?.status === 'dead' ? 0 : n.crew?.cut ?? 0), 0);
  const rent = w.player.safehouseIds.reduce((s, id) => s + [600, 2500, 8000][w.safehouses[id].tier - 1] / 30, 0);
  return { clean: Math.round(clean), dirty: Math.round(dirty), wages, rent: Math.round(rent) };
}
/** Distance from the start point in block steps (~330 m). */
export function distanceFromStart(w: World, blockId: Id): number { return distanceM(w.blocks[blockId].center, w.origin) / STEP_M; }
export function startBlock(w: World): Block { return Object.values(w.blocks).slice().sort((a, b) => distanceM(a.center, w.origin) - distanceM(b.center, w.origin))[0]; }
export function neighborsOf(w: World, blockId: Id): Block[] { return w.blocks[blockId].neighborIds.map(id => w.blocks[id]).filter(Boolean); }
export function npcLocation(w: World, n: Npc): Business | undefined {
  if (n.favouriteBusinessIds.length) return w.businesses[n.favouriteBusinessIds[0]];
  if (n.role === 'owner') return Object.values(w.businesses).find(b => b.ownerId === n.id);
  return undefined;
}
export function agendaLabel(n: Npc): string | undefined {
  if (!n.agenda || n.agenda.done || !(n.known || n.rel.trust >= 20)) return undefined;
  const L: Record<string, string> = { debt: 'Owes money to the wrong people', leave: 'Wants out of this life', revenge: 'Wants to get even', ambition: 'Wants to be somebody', family: 'Protecting their family' };
  return `${L[n.agenda.kind]} (${Math.round(n.agenda.progress)}%)`;
}
export function isKnown(n: Npc): boolean { return n.known || n.rel.trust >= 20; }
export function relLabel(n: Npc): string {
  const { trust, fear } = n.rel;
  if (trust >= 60) return 'Friend'; if (trust >= 25) return 'Warm'; if (fear >= 60) return 'Terrified';
  if (trust <= -50) return 'Enemy'; if (trust <= -20) return 'Cold'; if (fear >= 30) return 'Wary';
  return 'Neutral';
}
export function controlShare(w: World): number {
  const all = Object.values(w.blocks); return all.filter(b => controller(b) === PLAYER).length / all.length;
}

// ---------------------------------------------------------------- op progression
/** Why this op is not on the table yet, or undefined when it is. Same shape as availableRackets. */
export function opLocked(w: World, kind: OpKind): string | undefined {
  const req = OP_DEFS[kind].requires; if (!req) return undefined;
  const p = w.player;
  if (req.crewCount !== undefined && p.crewEver < req.crewCount) return `Needs ${req.crewCount} ${req.crewCount === 1 ? 'person' : 'people'} to have joined your crew. You have had ${p.crewEver}.`;
  if (req.safehouseTier !== undefined) {
    const best = Math.max(0, ...p.safehouseIds.map(id => w.safehouses[id]?.tier ?? 0));
    if (best < req.safehouseTier) return `Needs a tier ${req.safehouseTier} safehouse. Your best is ${best || 'none'}.`;
  }
  if (req.businessOwned && !p.businessIds.length) return 'Needs a business of your own.';
  if (req.racketKinds?.length) {
    const running = new Set(p.racketIds.map(id => w.rackets[id]?.kind).filter(Boolean));
    if (!req.racketKinds.some(k => running.has(k))) return 'Needs a racket of your own up and running.';
  }
  if (req.priorOps?.length) {
    const done = new Set(Object.values(w.ops).filter(o => o.status === 'done').map(o => o.kind));
    if (!req.priorOps.some(k => done.has(k))) return `Needs a ${req.priorOps.map(k => OP_DEFS[k].label).join(' or ')} behind you.`;
  }
  return undefined;
}
/** Ops whose requirements are met right now. */
export function opsAvailable(w: World): OpKind[] {
  return (Object.keys(OP_DEFS) as OpKind[]).filter(k => !opLocked(w, k));
}
export { isAbandoned, isKnownAbandoned, isClaimable, claimedByPlayer, abandonedBlocks } from './abandoned';
export { allHostages, hostagesOf, isHeld, daysHeld, ransomValue, holdRisk } from './hostages';
