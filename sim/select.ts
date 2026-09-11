/** Read-only helpers for the UI. Never mutate. */
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_DEFS, RACKET_DEFS } from '@content/rackets';
import { controller, stanceFor } from './generate';
import { hexDistance } from './hex';
import { PLAYER, type Block, type Business, type FactionId, type Id, type Npc, type OpKind, type RacketKind, type Stance, type World } from './types';

export { controller, stanceFor };

export function blockController(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }
export function factionColor(w: World, f?: FactionId): string {
  if (!f) return '#666a70';
  if (f === PLAYER) return '#f2c94c';
  return w.factions[f]?.color ?? '#666a70';
}
export function factionName(w: World, f?: FactionId): string {
  if (!f) return 'Unclaimed'; if (f === PLAYER) return w.player.name; return w.factions[f]?.name ?? '?';
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
export function opChance(w: World, kind: OpKind, crewIds: Id[]): number {
  const d = OP_DEFS[kind]; const s = crewSkillSum(w, crewIds);
  let ratio = 0, n = 0;
  for (const [k, need] of Object.entries(d.needs)) { ratio += Math.min(1.3, s[k] / (need || 1)); n++; }
  ratio = n ? ratio / n : 1;
  const base = 50 + (ratio - 1) * 70 - (d.difficulty - 50) * 0.6 - w.player.heat * 0.15;
  return Math.max(3, Math.min(97, Math.round(base)));
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
export function distanceFromStart(w: World, blockId: Id): number { return hexDistance(w.blocks[blockId].hex, { q: 0, r: 0 }); }
export function npcLocation(w: World, n: Npc): Business | undefined {
  if (n.favouriteBusinessIds.length) return w.businesses[n.favouriteBusinessIds[0]];
  if (n.role === 'owner') return Object.values(w.businesses).find(b => b.ownerId === n.id);
  return undefined;
}
export function relLabel(n: Npc): string {
  const { trust, fear } = n.rel;
  if (trust >= 60) return 'Friend'; if (trust >= 25) return 'Warm'; if (fear >= 60) return 'Terrified';
  if (trust <= -50) return 'Enemy'; if (trust <= -20) return 'Cold'; if (fear >= 30) return 'Wary';
  return 'Neutral';
}
export function controlShare(w: World): number {
  const all = Object.values(w.blocks); return all.filter(b => controller(b) === PLAYER).length / all.length;
}
