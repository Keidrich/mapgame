/** Small shared pieces of the remake's sim. Nothing here decides an outcome on its own. */
import { Rng } from './rng';
import type { Block, Id, LogEntry, Npc, Owner, Tone, World } from './types';
import { PLAYER } from './types';

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const round = (n: number) => Math.round(n);

/** A fresh id. Counter-based so ids never collide and never depend on rng draws. */
export function nid(w: World, prefix: string): Id { return `${prefix}${w.nextId++}`; }

/**
 * The rng for one dispatch. Read from the world and written back by the caller, so every roll in
 * the game comes from `World.rng` and a replay is exact.
 */
export function rngOf(w: World): Rng { return new Rng(w.rng); }

export function log(w: World, text: string, tone: Tone = 'info', refs: Omit<LogEntry, 'day' | 'text' | 'tone'> = {}) {
  w.log.push({ day: w.day, text, tone, ...refs });
  if (w.log.length > 600) w.log.splice(0, w.log.length - 600);
}

export function money(n: number): string {
  const a = Math.abs(Math.round(n));
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e4 ? `$${Math.round(a / 1000)}k` : `$${a.toLocaleString('en-US')}`;
  return n < 0 ? `-${s}` : s;
}

export const fullName = (n: Npc) => (n.nick ? `${n.first} "${n.nick}" ${n.last}` : `${n.first} ${n.last}`);
export const shortName = (n: Npc) => (n.nick ? `"${n.nick}" ${n.last}` : `${n.first} ${n.last}`);
export const they = (n: Npc) => n.pronoun === 'he' ? 'he' : n.pronoun === 'she' ? 'she' : 'they';
export const them = (n: Npc) => n.pronoun === 'he' ? 'him' : n.pronoun === 'she' ? 'her' : 'them';
export const their = (n: Npc) => n.pronoun === 'he' ? 'his' : n.pronoun === 'she' ? 'her' : 'their';
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------------------------ territory
export const CONTROL_AT = 30;

export function addInfluence(w: World, blockId: Id, who: Owner, n: number) {
  const b = w.blocks[blockId]; if (!b) return;
  const v = clamp((b.influence[who] ?? 0) + n);
  if (v <= 0) delete b.influence[who]; else b.influence[who] = Math.round(v * 10) / 10;
}

/** Whoever holds a block: the most influence, and at least `CONTROL_AT` of it. */
export function controller(b: Block): Owner | undefined {
  let best: Owner | undefined, bv = 0;
  for (const [f, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = f; }
  return best && bv >= CONTROL_AT ? best : undefined;
}

export function addHeat(w: World, n: number, blockId?: Id) {
  const p = w.player;
  p.heat = clamp(p.heat + n);
  if (blockId && w.blocks[blockId]) {
    const b = w.blocks[blockId];
    b.heat = clamp(b.heat + n * 1.5);
    const d = w.districts[b.districtId];
    if (n > 0) d.attention = clamp(d.attention + n * 0.6);
  }
}

export function remember(n: Npc, day: number, kind: Npc['memory'][number]['kind'], text: string) {
  n.memory.push({ day, kind, text });
  if (n.memory.length > 12) n.memory.splice(0, n.memory.length - 12);
}

export const isPlayer = (o: Owner | undefined) => o === PLAYER;
export const alive = (w: World, id: Id | undefined) => !!id && !!w.npcs[id]?.alive;

/** Pay from dirty money first, then clean: street costs are paid in street money. */
export function spend(w: World, n: number): boolean {
  const p = w.player;
  if (p.cash + p.dirty < n) return false;
  const fromDirty = Math.min(p.dirty, n);
  p.dirty -= fromDirty; p.cash -= n - fromDirty;
  return true;
}
/** Clean money only: what the law can see you paying for. */
export function spendClean(w: World, n: number): boolean {
  if (w.player.cash < n) return false;
  w.player.cash -= n; return true;
}

/** "the Grove Kings", "the Shanahan Syndicate" — never "the The Shanahan Syndicate". */
export const theName = (f: { name: string }) => `the ${f.name.replace(/^The /, '')}`;
/** A verb that agrees with a person's pronoun: `vb(n, 'have', 'has')`. "He have" is not a crime story. */
export const vb = (n: Npc, plural: string, singular: string) => (n.pronoun === 'they' ? plural : singular);
