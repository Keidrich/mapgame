/**
 * Read-only presentation helpers that the sim's `select` module does not cover.
 * Nothing here mutates or decides game logic; it only shapes data for display.
 */
import { OP_DEFS, PRODUCT_INFO, RACKET_DEFS, PRODUCTION_DEFS } from '@content/rackets';
import { BUSINESS_DEFS } from '@content/businesses';
import { select, hex } from '@sim/index';
import { PLAYER, type Assignment, type Block, type Business, type FactionId, type Id, type Npc, type Op, type ProductKind, type Stash, type World, type Stance } from '@sim/types';

export const PRODUCTS: ProductKind[] = ['booze', 'green', 'pills', 'hot_goods', 'counterfeit'];
export const STANCES: Stance[] = ['alliance', 'peace', 'tension', 'beef', 'war'];
export const STANCE_COLOR: Record<Stance, string> = { alliance: '#4cd88a', peace: '#4cd88a', tension: '#f0954c', beef: '#f0954c', war: '#e5484d' };
export const SKILL_KEYS = ['muscle', 'brains', 'charm', 'wheels', 'tech'] as const;

export const fmtMoney = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
export const fmtMoneyShort = (n: number) => {
  const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${s}$${(a / 1000).toFixed(1)}k`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const initials = (name: string) => name.replace(/"[^"]*"/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export function topInfluence(b: Block): { faction?: FactionId; value: number } {
  let best: FactionId | undefined; let bv = 0;
  for (const [f, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = f; }
  return { faction: best, value: bv };
}
export function influenceRows(w: World, b: Block): { faction: FactionId; value: number; color: string; name: string }[] {
  return Object.entries(b.influence)
    .filter(([, v]) => v > 0)
    .sort((a, b2) => b2[1] - a[1])
    .map(([faction, value]) => ({ faction, value, color: select.factionColor(w, faction), name: w.factions[faction]?.short ?? select.factionName(w, faction) }));
}
export function districtName(w: World, b: Block): string { return w.districts[b.districtId]?.name ?? ''; }

export function ownerLabel(w: World, biz: Business): string {
  if (biz.ownedBy === 'player') return 'Yours';
  if (biz.ownedBy === 'npc') return w.npcs[biz.ownerId]?.name ?? 'Unknown';
  return w.factions[biz.ownedBy]?.name ?? biz.ownedBy;
}
export function protectionLabel(w: World, biz: Business): string | undefined {
  if (!biz.protection) return undefined;
  return biz.protection.factionId === PLAYER ? `Protected by you (${pct(biz.protection.rate)})` : `Protected by ${select.factionName(w, biz.protection.factionId)}`;
}
export function bizIcon(biz: Business) { return BUSINESS_DEFS[biz.type].icon; }
export function bizTypeLabel(biz: Business) { return BUSINESS_DEFS[biz.type].label; }
export function roleLabel(n: Npc): string {
  if (n.crew) return 'Crew';
  if (n.official) return cap(n.official.kind);
  return { owner: 'Owner', patron: 'Patron', crew: 'Crew', boss: 'Boss', lieutenant: 'Lieutenant', soldier: 'Soldier', cop: 'Cop', official: 'Official', fixer: 'Fixer' }[n.role];
}

export function playerBusinesses(w: World): Business[] { return w.player.businessIds.map(id => w.businesses[id]).filter(Boolean); }
export function playerRackets(w: World) { return w.player.racketIds.map(id => w.rackets[id]).filter(Boolean); }
export function playerSafehouses(w: World) { return w.player.safehouseIds.map(id => w.safehouses[id]).filter(Boolean); }
export function playerOps(w: World): Op[] { return w.player.opIds.map(id => w.ops[id]).filter(Boolean); }
export function activeOps(w: World): Op[] { return playerOps(w).filter(o => o.status === 'planning' || o.status === 'ready'); }
export function finishedOps(w: World): Op[] { return playerOps(w).filter(o => o.status === 'done' || o.status === 'failed' || o.status === 'aborted').reverse(); }

export function stashTotals(w: World): Stash {
  const t: Stash = { ...w.player.stash };
  for (const s of playerSafehouses(w)) for (const p of PRODUCTS) t[p] += s.stash[p];
  return t;
}
export function stashUnits(s: Stash): number { return PRODUCTS.reduce((a, p) => a + (s[p] || 0), 0); }
export function stashLine(s: Stash): string {
  const parts = PRODUCTS.filter(p => s[p] > 0).map(p => `${PRODUCT_INFO[p].icon}${Math.round(s[p])}`);
  return parts.length ? parts.join(' ') : 'empty';
}

export function assignmentLabel(w: World, a?: Assignment): string {
  if (!a) return 'Idle';
  switch (a.kind) {
    case 'racket': { const r = w.rackets[a.racketId]; return r ? `Running ${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId]?.name ?? '?'}` : 'Running a racket'; }
    case 'production': { const p = w.productions[a.productionId]; return p ? `Working the ${PRODUCTION_DEFS[p.kind].label} at ${w.safehouses[p.safehouseId]?.name ?? '?'}` : 'Working production'; }
    case 'op': { const o = w.ops[a.opId]; return o ? `On op: ${OP_DEFS[o.kind].label}` : 'On an op'; }
    case 'guard': return `Guarding ${w.blocks[a.blockId]?.name ?? '?'}`;
    case 'collect': return 'Collecting';
  }
}
export function opTargetLabel(w: World, o: Op): string {
  if (o.targetBusinessId) return w.businesses[o.targetBusinessId]?.name ?? '?';
  if (o.targetNpcId) return w.npcs[o.targetNpcId]?.name ?? '?';
  if (o.targetFactionId) return w.factions[o.targetFactionId]?.name ?? '?';
  if (o.targetBlockId) return w.blocks[o.targetBlockId]?.name ?? '?';
  return 'Out of town';
}

/** Bounding box of the whole hex grid, for fitBounds on a new game. */
export function gridBounds(w: World): [[number, number], [number, number]] {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const b of Object.values(w.blocks)) for (const c of hex.hexCorners(w.origin, b.hex, w.hexSizeM)) {
    if (c.lat < minLat) minLat = c.lat; if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng; if (c.lng > maxLng) maxLng = c.lng;
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

export function npcById(w: World, id?: Id): Npc | undefined { return id ? w.npcs[id] : undefined; }
export function crewName(w: World, id?: Id): string { return id ? (w.npcs[id]?.name ?? '?') : 'nobody'; }
export function safehouseAt(w: World, b: Block) { return b.safehouseId ? w.safehouses[b.safehouseId] : undefined; }
export function rivalBlocks(w: World, f: FactionId): Block[] { return select.blocksOf(w, f); }
export function conditionTone(c: number) { return c >= 70 ? 'var(--green)' : c >= 40 ? 'var(--orange)' : 'var(--red)'; }
export function heatTone(h: number) { return h >= 70 ? 'var(--red)' : h >= 40 ? 'var(--orange)' : 'var(--green)'; }
