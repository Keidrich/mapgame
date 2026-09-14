/**
 * Scenes: the face-to-face part of the game. A scene shows what the person says and
 * the approaches on offer with their odds. The reducer resolves the chosen approach
 * with the same odds, so what the player sees is what they get.
 */
import { PLAYER } from './types';
import { APPROACHES, OPENING, RESULT, type SceneKind } from '@content/lines';
import type { Rng } from './rng';
import { activeCrewCount } from './util';
import { crewOfBoss } from './crews';
import { ownerResistance } from './economy';
import type { Business, Id, Npc, World } from './types';

export interface SceneOption { id: string; label: string; icon: string; blurb: string; good: string; bad: string; chance: number; costAp: number; costCash: number; disabled?: string }
export interface Scene { kind: SceneKind; npcId: Id; businessId?: Id; line: string; options: SceneOption[] }

export function sceneFor(w: World, kind: SceneKind, npcId: Id, businessId?: Id, otherFactionId?: Id): Scene {
  const n = w.npcs[npcId];
  return { kind, npcId, businessId, line: openingLine(w, kind, n), options: APPROACHES[kind].map(a => ({ ...a, chance: approachChance(w, kind, a.id, n, businessId ? w.businesses[businessId] : undefined, otherFactionId), costAp: kind === 'broker' ? 2 : 1, costCash: kind === 'visit' && a.id === 'drinks' ? 50 : kind === 'broker' && a.id === 'split' ? 4000 : 0, disabled: disabledReason(w, kind, a.id, n, otherFactionId) })) };
}

function openingLine(w: World, kind: SceneKind, n: Npc): string {
  const table = OPENING[kind];
  const key = n.rel.trust >= 40 && table.friend ? 'friend' : n.rel.fear >= 50 && table.scared ? 'scared' : n.traits.find(t => table[t]) ?? 'default';
  const lines = table[key as keyof typeof table] ?? table.default ?? ['...'];
  let line = lines[(w.day + n.id.length) % lines.length];
  if (n.grudge && kind !== 'visit') line += ` "And I haven't forgotten last time."`;
  else if (n.grudge) line += ` They are cool with you; the whole block heard about last time.`;
  const mem = w.blocks[n.homeBlockId]?.memory.slice(-1)[0];
  if (mem && w.day - mem.day <= 15 && kind === 'visit') line += ` Everybody is still talking about it: ${mem.text}`;
  if (n.homeBlockId === w.player.homeBlockId && kind === 'visit') line += ` (Home turf.)`;
  return line;
}

function disabledReason(w: World, kind: SceneKind, id: string, n: Npc, otherFactionId?: Id): string | undefined {
  if (kind === 'broker' && id === 'split' && w.player.cash < 4000) return 'Needs $4,000 clean.';
  if (kind === 'broker' && id === 'favour') { const f = n.faction ? w.factions[n.faction] : undefined; const o = otherFactionId ? w.factions[otherFactionId] : undefined; if (!f || !o) return 'No faction.'; if (!(f.owed ?? 0) && f.standing[PLAYER] < 30 && o.standing[PLAYER] < 30) return 'Nobody here owes you anything yet (standing 30+, or a favour owed).'; }
  if (kind === 'threaten' && id === 'crew' && activeCrewCount(w) === 0) return 'No crew to bring.';
  if (kind === 'visit' && id === 'drinks' && w.player.cash < 50) return 'Needs $50.';
  if (kind === 'recruit' && id === 'cut' && w.player.cash < 200) return 'Needs $200 up front.';
  if (kind === 'recruit' && id === 'lean' && n.traits.includes('loyal')) return 'Loyal people do not fold.';
  if (kind === 'parley' && id === 'join' && bedsLeftFor(w) <= 0) return 'No room in your safehouses for their boss.';
  return undefined;
}

/**
 * 3..97 % — the number the player sees and the number the dice use.
 *
 * `bonus` is what a conversation's opening moves bought: a name you both know that landed, a
 * favour they had not forgotten. It is passed in rather than read off the world because it
 * belongs to one conversation and one closing move, and must not leak into anything else.
 */
export function approachChance(w: World, kind: SceneKind, id: string, n: Npc, biz?: Business, otherFactionId?: Id, bonus = 0): number {
  const p = w.player; const s = p.skills; const crew = activeCrewCount(w);
  const fa = n.faction ? w.factions[n.faction] : undefined; const fb = otherFactionId ? w.factions[otherFactionId] : undefined;
  const temperBonus = (f?: import('./types').Faction) => !f ? 0 : f.temperament === 'diplomatic' ? 12 : f.temperament === 'aggressive' ? -10 : f.temperament === 'paranoid' ? -6 : 0;
  const fear = n.rel.fear, trust = n.rel.trust;
  const has = (t: string) => n.traits.includes(t as Npc['traits'][number]);
  let v = 50;
  switch (`${kind}:${id}`) {
    case 'shakedown:lean': v = 30 + s.muscle * 5 + p.fear * 0.4 + fear * 0.6 + crew * 4 - n.nerve * 0.7 + (has('coward') ? 20 : 0) - (has('hothead') ? 15 : 0); break;
    case 'shakedown:reason': v = 25 + s.charm * 5 + trust * 0.5 + fear * 0.3 + p.respect * 0.4 - n.nerve * 0.4 + (has('greedy') ? 10 : 0) - (has('honest') ? 20 : 0); break;
    case 'shakedown:wreck': v = 45 + s.muscle * 3 + crew * 8 + fear * 0.3 - n.nerve * 0.3 - (has('hothead') ? 10 : 0); break;
    case 'threaten:stare': v = 25 + s.muscle * 6 + p.fear * 0.5 + crew * 3 + fear * 0.4 - n.nerve * 0.6 + (has('coward') ? 20 : 0); break;
    case 'threaten:crew': v = 45 + s.muscle * 3 + crew * 10 + p.fear * 0.4 - n.nerve * 0.5; break;
    case 'threaten:family': v = 30 + s.brains * 6 + s.charm * 2 - n.nerve * 0.4 + (has('coward') ? 15 : 0) - (has('honest') ? 25 : 0); break;
    case 'visit:drinks': v = 55 + s.charm * 4 + (has('gambler') || has('junkie') ? 15 : 0) - (has('quiet') ? 15 : 0); break;
    case 'visit:business': v = 35 + s.brains * 5 + s.charm * 2 + (has('connected') || has('ambitious') ? 15 : 0) - (has('honest') ? 10 : 0); break;
    case 'visit:listen': v = 60 + s.charm * 2 + (has('quiet') ? 20 : 0); break;
    case 'parley:tribute': v = 20 + s.charm * 4 + p.respect * 0.6 + p.fear * 0.4 + crew * 4 - (crewOfBoss(w, n.id)?.strength ?? 3) * 4 + (has('greedy') ? 10 : 0) - (has('hothead') ? 10 : 0); break;
    case 'parley:join': v = 10 + s.charm * 4 + trust * 0.8 + p.respect * 0.7 - (crewOfBoss(w, n.id)?.strength ?? 3) * 3 + (has('ambitious') ? 20 : 0) - (has('loyal') ? 10 : 0); break;
    case 'parley:warn': v = 25 + s.muscle * 5 + crew * 8 + p.fear * 0.5 - (crewOfBoss(w, n.id)?.strength ?? 3) * 6 + (has('coward') ? 20 : 0) - (has('hothead') ? 10 : 0); break;
    case 'broker:split': v = 25 + s.charm * 4 + p.respect * 0.4 + temperBonus(fa) + temperBonus(fb) + ((fa?.standing[PLAYER] ?? 0) + (fb?.standing[PLAYER] ?? 0)) * 0.15; break;
    case 'broker:lean': v = 15 + s.muscle * 3 + p.fear * 0.5 + crew * 4 - ((fa?.soldiers ?? 0) + (fb?.soldiers ?? 0)) * 0.6 + temperBonus(fa) * 0.5 + temperBonus(fb) * 0.5; break;
    case 'broker:favour': v = 30 + Math.max(fa?.standing[PLAYER] ?? 0, fb?.standing[PLAYER] ?? 0) * 0.6 + ((fa?.owed ?? 0) ? 20 : 0) + s.charm * 2 + temperBonus(fb); break;
    case 'recruit:cut': v = 50 + trust * 0.6 + (has('greedy') || has('ambitious') ? 20 : 0) - (has('loyal') ? 15 : 0); break;
    case 'recruit:promise': v = 25 + s.charm * 5 + trust * 0.6 + p.respect * 0.5 + (has('ambitious') ? 15 : 0) - (has('loyal') ? 10 : 0); break;
    case 'recruit:lean': v = 10 + s.muscle * 3 + fear * 0.8 + p.fear * 0.3 + (has('coward') ? 30 : -10); break;
  }
  if (kind === 'recruit' && n.role === 'owner') v -= ownerResistance(w, n); // walking away from your own place is a big ask
  if (biz && biz.protection && biz.protection.factionId !== 'player' && kind === 'shakedown') v -= 20;
  if (n.grudge && (kind === 'shakedown' || kind === 'threaten' || kind === 'recruit')) v -= 10; // they have their guard up
  if (n.homeBlockId === w.player.homeBlockId) v += 5; // home turf
  return Math.max(3, Math.min(97, Math.round(v + bonus)));
}

export function resultLine(kind: SceneKind, id: string, ok: boolean, rng: Rng): string {
  const lines = RESULT[`${kind}:${id}:${ok ? 'ok' : 'fail'}`] ?? [ok ? 'It works.' : 'It does not work.'];
  return rng.pick(lines);
}

function bedsLeftFor(w: World): number { const beds = 2 + w.player.safehouseIds.reduce((t, id) => t + [3, 6, 12][w.safehouses[id].tier - 1], 0); return beds - w.player.crewIds.filter(id => w.npcs[id].crew?.status !== 'dead').length; }
