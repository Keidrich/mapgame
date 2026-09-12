/**
 * Scenes: the face-to-face part of the game. A scene shows what the person says and
 * the approaches on offer with their odds. The reducer resolves the chosen approach
 * with the same odds, so what the player sees is what they get.
 */
import { APPROACHES, OPENING, RESULT, type SceneKind } from '@content/lines';
import type { Rng } from './rng';
import { activeCrewCount } from './util';
import type { Business, Id, Npc, World } from './types';

export interface SceneOption { id: string; label: string; icon: string; blurb: string; good: string; bad: string; chance: number; costAp: number; costCash: number; disabled?: string }
export interface Scene { kind: SceneKind; npcId: Id; businessId?: Id; line: string; options: SceneOption[] }

export function sceneFor(w: World, kind: SceneKind, npcId: Id, businessId?: Id): Scene {
  const n = w.npcs[npcId];
  return { kind, npcId, businessId, line: openingLine(w, kind, n), options: APPROACHES[kind].map(a => ({ ...a, chance: approachChance(w, kind, a.id, n, businessId ? w.businesses[businessId] : undefined), costAp: kind === 'visit' && a.id === 'listen' ? 1 : 1, costCash: kind === 'visit' && a.id === 'drinks' ? 50 : 0, disabled: disabledReason(w, kind, a.id, n) })) };
}

function openingLine(w: World, kind: SceneKind, n: Npc): string {
  const table = OPENING[kind];
  const key = n.rel.trust >= 40 && table.friend ? 'friend' : n.rel.fear >= 50 && table.scared ? 'scared' : n.traits.find(t => table[t]) ?? 'default';
  const lines = table[key as keyof typeof table] ?? table.default ?? ['...'];
  return lines[(w.day + n.id.length) % lines.length];
}

function disabledReason(w: World, kind: SceneKind, id: string, n: Npc): string | undefined {
  if (kind === 'threaten' && id === 'crew' && activeCrewCount(w) === 0) return 'No crew to bring.';
  if (kind === 'visit' && id === 'drinks' && w.player.cash < 50) return 'Needs $50.';
  if (kind === 'recruit' && id === 'cut' && w.player.cash < 200) return 'Needs $200 up front.';
  if (kind === 'recruit' && id === 'lean' && n.traits.includes('loyal')) return 'Loyal people do not fold.';
  return undefined;
}

/** 3..97 % — the number the player sees and the number the dice use. */
export function approachChance(w: World, kind: SceneKind, id: string, n: Npc, biz?: Business): number {
  const p = w.player; const s = p.skills; const crew = activeCrewCount(w);
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
    case 'recruit:cut': v = 50 + trust * 0.6 + (has('greedy') || has('ambitious') ? 20 : 0) - (has('loyal') ? 15 : 0); break;
    case 'recruit:promise': v = 25 + s.charm * 5 + trust * 0.6 + p.respect * 0.5 + (has('ambitious') ? 15 : 0) - (has('loyal') ? 10 : 0); break;
    case 'recruit:lean': v = 10 + s.muscle * 3 + fear * 0.8 + p.fear * 0.3 + (has('coward') ? 30 : -10); break;
  }
  if (biz && biz.protection && biz.protection.factionId !== 'player' && kind === 'shakedown') v -= 20;
  return Math.max(3, Math.min(97, Math.round(v)));
}

export function resultLine(kind: SceneKind, id: string, ok: boolean, rng: Rng): string {
  const lines = RESULT[`${kind}:${id}:${ok ? 'ok' : 'fail'}`] ?? [ok ? 'It works.' : 'It does not work.'];
  return rng.pick(lines);
}
