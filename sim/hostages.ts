/**
 * Holding people. A kidnap moves somebody into one of your safehouses: still alive, but out
 * of their own life, so their agenda stops advancing and nobody can find them.
 *
 * The risk of holding someone is built from the fields that already drive every other risk
 * in the game: the holding block's `police` and `population`, multiplied by how long you
 * have had them. Nothing here says "an abandoned block is safer" — it just is, because a
 * derelict block generates with almost no police and almost nobody living on it.
 */
import { effectivePolice } from './authority';
import type { Rng } from './rng';
import { PLAYER, type Id, type Npc, type Safehouse, type World } from './types';
import { addHeat, adjustRel, clamp, log, money, spreadRep } from './util';
import { openCase } from './cases';
import { addMemory } from './people';

/** Daily chance of something going wrong, before the block and the clock are applied. */
export const HOSTAGE_BASE_RISK = 0.06;
/** Each day held adds this much to the multiplier. A week doubles it. */
export const HOSTAGE_DAY_RISK = 0.14;
/** Beds are beds: a hostage takes one of the safehouse's crew places. */
export const HOSTAGE_ROOM = 1;

export function hostagesOf(w: World, s: Safehouse): Npc[] { return s.hostageIds.map(id => w.npcs[id]).filter(Boolean); }
export function allHostages(w: World): Npc[] {
  return w.player.safehouseIds.flatMap(id => { const s = w.safehouses[id]; return s ? hostagesOf(w, s) : []; });
}
export function isHeld(n: Npc): boolean { return !!n.hostage; }
export function daysHeld(w: World, n: Npc): number { return n.hostage ? Math.max(0, w.day - n.hostage.since) : 0; }

/** Room left for another body. Hostages and crew share the safehouse's beds. */
export function roomFor(s: Safehouse, beds: number): number {
  return beds - s.hostageIds.length * HOSTAGE_ROOM;
}

/** What somebody is worth to the people who want them back. */
export function ransomValue(w: World, n: Npc): number {
  const f = n.faction ? w.factions[n.faction] : undefined;
  const role = n.role === 'boss' ? 6 : n.role === 'lieutenant' ? 3 : n.role === 'owner' ? 2 : 1;
  const biz = Object.values(w.businesses).find(b => b.ownerId === n.id);
  const base = 1200 * role + (biz ? biz.value * 0.25 : 0) + (f ? Math.max(0, f.cash) * 0.1 : 0);
  return Math.round(Math.max(600, Math.min(60000, base)));
}

export function take(w: World, n: Npc, s: Safehouse) {
  n.hostage = { safehouseId: s.id, since: w.day };
  if (!s.hostageIds.includes(n.id)) s.hostageIds.push(n.id);
  adjustRel(w, n, { trust: -60, fear: 40 }, 'grave');
}

/** Let somebody go, for whatever reason. Clears both sides of the link. */
export function release(w: World, n: Npc) {
  const s = n.hostage ? w.safehouses[n.hostage.safehouseId] : undefined;
  if (s) s.hostageIds = s.hostageIds.filter(id => id !== n.id);
  n.hostage = undefined;
}

/** The daily chance this hostage becomes a problem, on the block you are holding them. */
export function holdRisk(w: World, n: Npc): number {
  const s = n.hostage ? w.safehouses[n.hostage.safehouseId] : undefined;
  const b = s ? w.blocks[s.blockId] : undefined;
  if (!b) return 0;
  const place = (effectivePolice(w, b.id) / 50) * (0.25 + b.population / 60); // quiet, empty ground is the cheap place to do this
  const time = 1 + daysHeld(w, n) * HOSTAGE_DAY_RISK;
  const loud = n.traits.includes('hothead') ? 1.4 : n.traits.includes('coward') ? 0.7 : 1;
  const connected = n.traits.includes('connected') ? 1.3 : 1;
  return Math.max(0, HOSTAGE_BASE_RISK * place * time * loud * connected);
}

/** Every held person, once a day: pressure builds, and sometimes it breaks. */
export function tickHostages(w: World, rng: Rng) {
  for (const n of allHostages(w)) {
    const s = w.safehouses[n.hostage!.safehouseId]; if (!s) { release(w, n); continue; }
    const b = w.blocks[s.blockId];
    const days = daysHeld(w, n);
    // the people who want them back get louder
    if (n.faction && w.factions[n.faction]?.alive && days > 0 && days % 3 === 0) {
      const f = w.factions[n.faction];
      f.standing[PLAYER] = clamp(f.standing[PLAYER] - 4, -100, 100);
    }
    if (!rng.chance(holdRisk(w, n))) continue;
    const roll = rng.float();
    if (roll < 0.4) {
      addHeat(w, 6 + days, b.id);
      log(w, `Somebody on ${b.name} heard ${n.name} through the wall and called it in. (+${6 + days} heat)`, 'bad', { npcId: n.id, blockId: b.id });
      if (!(w.cases ?? []).some(c => c.status === 'open' && c.refs.npcId === n.id)) {
        openCase(w, 'hit', `${n.name.split(' ').slice(-1)[0]} disappearance`, { npcId: n.id, blockId: b.id }, w.player.crewIds.slice(0, 2), rng, 20);
      }
    } else if (roll < 0.75) {
      release(w, n);
      n.grudge = { since: w.day, reason: 'you held them in a basement', spread: 0 };
      adjustRel(w, n, { trust: -40, fear: 20 }, 'grave');
      spreadRep(w, b.id, { fear: 6, trust: -4 }, 2, 'grave');
      addHeat(w, 8, b.id);
      addMemory(w, b.id, 'escape', `${n.name} got out of a cellar here and told everyone.`, { npcId: n.id });
      log(w, `${n.name} got loose and made it to the street. Everybody on ${b.name} knows now. (+8 heat)`, 'bad', { npcId: n.id, blockId: b.id });
    } else {
      const guard = w.player.crewIds.map(id => w.npcs[id]).find(c => c.crew && c.crew.status === 'idle');
      if (guard?.crew) { guard.crew.status = 'injured'; guard.crew.statusDays = rng.int(2, 5); log(w, `${n.name} put up a fight. ${guard.name} is laid up ${guard.crew.statusDays} days.`, 'bad', { npcId: guard.id }); }
      else { addHeat(w, 4, b.id); log(w, `${n.name} nearly got out. Nobody was watching the door.`, 'warn', { npcId: n.id, blockId: b.id }); }
    }
  }
}

/** Ransom, leverage or let them walk. Returns the log tone. */
export function resolveHostage(w: World, n: Npc, mode: 'ransom' | 'leverage' | 'release', rng: Rng): 'good' | 'bad' | 'info' {
  const p = w.player;
  const f = n.faction ? w.factions[n.faction] : undefined;
  const days = daysHeld(w, n);
  const blockId = n.hostage ? w.safehouses[n.hostage.safehouseId]?.blockId : undefined;
  if (mode === 'ransom') {
    const ask = ransomValue(w, n);
    const payer = f && f.alive ? f.cash : Object.values(w.businesses).find(b => b.ownerId === n.id)?.value ?? 0;
    const paid = Math.round(Math.min(ask, Math.max(0, payer)));
    release(w, n);
    if (paid < ask * 0.4) {
      addHeat(w, 5, blockId);
      if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 25, -100, 100); f.grudges.push(`took:${n.name.split(' ')[0]}`); }
      log(w, `Nobody came up with the money for ${n.name}. You let them go with nothing to show for it, and ${f ? f.short : 'their people'} will not forget.`, 'bad', { npcId: n.id });
      return 'bad';
    }
    p.dirty += paid;
    if (f) { f.cash -= paid; f.standing[PLAYER] = clamp(f.standing[PLAYER] - 15, -100, 100); f.grudges.push(`ransom:${n.name.split(' ')[0]}`); }
    p.fear = clamp(p.fear + 5);
    if (blockId) spreadRep(w, blockId, { fear: 5 }, 1, 'grave');
    log(w, `${money(paid)} for ${n.name}, after ${days} day${days === 1 ? '' : 's'}. They go home with a story.`, 'money', { npcId: n.id });
    return 'good';
  }
  if (mode === 'leverage') {
    release(w, n);
    const bend = rng.int(1, 100) <= 45 + p.skills.charm * 3 + Math.min(25, days * 4) - n.nerve * 0.3;
    if (bend) {
      adjustRel(w, n, { fear: 45, trust: -10 }, 'grave');
      n.notes.push('Owes you for a week in the dark.');
      if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 8, -100, 100); f.truceUntil[PLAYER] = Math.max(f.truceUntil[PLAYER] ?? 0, w.day + 10); }
      p.fear = clamp(p.fear + 3);
      log(w, `${n.name} will do what you ask now${f ? `, and ${f.short} back off rather than push it` : ''}.`, 'good', { npcId: n.id });
      return 'good';
    }
    adjustRel(w, n, { trust: -50, fear: 15 }, 'grave');
    n.grudge = { since: w.day, reason: 'you held them', spread: 0 };
    if (f) { f.standing[PLAYER] = clamp(f.standing[PLAYER] - 20, -100, 100); f.grudges.push(`took:${n.name.split(' ')[0]}`); }
    log(w, `${n.name} looks at you the whole way out and says nothing. That one is going to cost you.`, 'bad', { npcId: n.id });
    return 'bad';
  }
  release(w, n);
  adjustRel(w, n, { trust: 10, fear: 25 }, 'grave');
  if (f) f.standing[PLAYER] = clamp(f.standing[PLAYER] - 5, -100, 100);
  log(w, `You put ${n.name} out on a corner with their coat and cab fare. Cheapest way out of a bad idea.`, 'info', { npcId: n.id });
  return 'info';
}

/** Held people are out of circulation: no agendas, no gossip, nobody finds them. */
export function heldIds(w: World): Set<Id> { return new Set(allHostages(w).map(n => n.id)); }
