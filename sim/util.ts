import { Rng } from './rng';
import type { Id, LogEntry, Npc, World, FactionId, Block } from './types';
import { PLAYER } from './types';
import { hexDistance } from './hex';
import { controller } from './generate';

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const round = (v: number) => Math.round(v);

/** Borrow the world's PRNG; call `done()` to write the state back. */
export function rngOf(w: World): { rng: Rng; done: () => void } {
  const rng = new Rng(w.rng);
  return { rng, done: () => { w.rng = rng.state; } };
}

export function nid(w: World, prefix: string): Id { return `${prefix}${w.nextId++}`; }

export function log(w: World, text: string, tone: LogEntry['tone'] = 'info', refs?: LogEntry['refs']) {
  w.log.push({ day: w.day, text, tone, refs });
  if (w.log.length > 300) w.log.splice(0, w.log.length - 300);
}

export function adjustRel(n: Npc, d: { trust?: number; fear?: number; respect?: number }) {
  if (d.trust) n.rel.trust = clamp(n.rel.trust + d.trust, -100, 100);
  if (d.fear) n.rel.fear = clamp(n.rel.fear + d.fear);
  if (d.respect) n.rel.respect = clamp(n.rel.respect + d.respect);
}

export function addHeat(w: World, amount: number, blockId?: Id) {
  w.player.heat = clamp(w.player.heat + amount);
  if (blockId && w.blocks[blockId]) w.blocks[blockId].heat = clamp(w.blocks[blockId].heat + amount * 2);
}

export function addInfluence(w: World, blockId: Id, f: FactionId, amount: number) {
  const b = w.blocks[blockId];
  b.influence[f] = clamp((b.influence[f] ?? 0) + amount);
  if (b.influence[f] <= 0) delete b.influence[f];
}

/** Word gets around: nearby NPCs learn to respect/fear you. */
export function spreadRep(w: World, blockId: Id, d: { respect?: number; fear?: number; trust?: number }, radius = 1) {
  const src = w.blocks[blockId];
  for (const b of Object.values(w.blocks)) {
    const dist = hexDistance(b.hex, src.hex);
    if (dist > radius) continue;
    const k = dist === 0 ? 1 : 0.4;
    for (const bid of b.businessIds) {
      const biz = w.businesses[bid];
      for (const id of [biz.ownerId, ...biz.patronIds]) {
        const n = w.npcs[id]; if (!n?.alive) continue;
        adjustRel(n, { respect: (d.respect ?? 0) * k, fear: (d.fear ?? 0) * k, trust: (d.trust ?? 0) * k });
      }
    }
  }
}

export function factionOf(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }

export function playerSkill(w: World, k: keyof Npc['skills']): number { return w.player.skills[k]; }

export function crewOf(w: World): Npc[] { return w.player.crewIds.map(id => w.npcs[id]).filter(Boolean); }

export function activeCrewCount(w: World): number { return crewOf(w).filter(n => n.crew && n.crew.status !== 'dead' && n.crew.status !== 'jailed').length; }

export function money(n: number): string { return `$${Math.round(n).toLocaleString('en-US')}`; }

export function blocksNear(w: World, blockId: Id, radius: number): Block[] {
  const src = w.blocks[blockId];
  return Object.values(w.blocks).filter(b => hexDistance(b.hex, src.hex) <= radius);
}

export function isPlayerFaction(f?: FactionId) { return f === PLAYER; }

export function takeCash(w: World, amount: number): boolean {
  if (w.player.cash >= amount) { w.player.cash -= amount; return true; }
  return false;
}

export function officialTrust(w: World, kind: 'captain' | 'councillor' | 'judge'): number {
  const o = Object.values(w.npcs).find(n => n.official?.kind === kind);
  return o ? o.rel.trust : 0;
}
/** Days a crew member sits in jail, after lawyer and judge. */
export function jailDays(w: World, base: number): number {
  let d = base;
  if (w.player.lawyer) d *= 0.5;
  if (officialTrust(w, 'judge') >= 40) d *= 0.6;
  return Math.max(2, Math.round(d));
}
export function collectors(w: World): number {
  return crewOf(w).filter(n => n.crew?.status === 'assigned' && n.crew.assignment?.kind === 'collect').length;
}
