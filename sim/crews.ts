/**
 * Street crews: a boss and a few soldiers holding one block. Low-stakes texture between the
 * big factions. Talk them onto your payroll, fold them into your outfit, run them off, or take
 * the corner by force. Ignore them and they grow, or a nearby faction swallows them.
 */
import { onJoin } from './production';
import type { Rng } from './rng';
import { mkNpc } from './populate';
import { PLAYER, type Block, type District, type FactionId, type Id, type Npc, type StreetCrew, type World } from './types';
import { addHeat, addInfluence, adjustRel, clamp, log, money, spreadRep } from './util';
import { addMemory } from './people';

const CHANCE_BY_KIND: Record<District['kind'], number> = { docks: 0.25, projects: 0.28, market: 0.14, strip: 0.15, industrial: 0.14, old_quarter: 0.08, downtown: 0.03, heights: 0.03 };
const SUFFIX = ['Boys', 'Crew', 'Kings', 'Mob', 'Posse', 'Set', 'Family'];

export const CREW_COLOR = '#9a7b4f';

export function spawnCrews(w: World, blocks: Block[], rng: Rng, nid: (p: string) => string) {
  for (const b of blocks) {
    const d = w.districts[b.districtId]; if (!d) continue;
    if (!rng.chance(CHANCE_BY_KIND[d.kind] ?? 0.1)) continue;
    if (b.id === w.player.homeBlockId) continue;
    if (Object.entries(b.influence).some(([k, v]) => k !== PLAYER && v >= 30)) continue; // faction turf
    if (!b.businessIds.length) continue;
    const boss = mkNpc(rng, w, nid, { role: 'gang_boss', homeBlockId: b.id, nerveBias: 60, strong: rng.chance(0.4) });
    const soldiers: Id[] = [];
    for (let i = 0; i < rng.int(2, 3); i++) soldiers.push(mkNpc(rng, w, nid, { role: 'gang', homeBlockId: b.id, nerveBias: 50 }).id);
    const street = b.streetNames[0]?.split(' ').slice(0, 2).join(' ') || d.name.split(' ')[0];
    const crew: StreetCrew = { id: nid('c'), name: `${street} ${rng.pick(SUFFIX)}`, blockId: b.id, bossId: boss.id, soldierIds: soldiers, strength: rng.int(2, 4), mood: 0, since: w.day };
    w.crews[crew.id] = crew;
    b.influence[crew.id] = rng.int(35, 55);
    boss.notes.push(`Runs the ${crew.name}.`);
    const bar = b.businessIds.map(id => w.businesses[id]).find(z => z.type === 'bar' || z.type === 'corner_store') ?? w.businesses[b.businessIds[0]];
    for (const id of [boss.id, ...soldiers]) { w.npcs[id].favouriteBusinessIds = [bar.id]; if (!bar.patronIds.includes(id)) bar.patronIds.push(id); }
  }
}

export function crewAt(w: World, blockId: Id): StreetCrew | undefined { return Object.values(w.crews).find(c => c.blockId === blockId); }
export function crewOfBoss(w: World, bossId: Id): StreetCrew | undefined { return Object.values(w.crews).find(c => c.bossId === bossId); }

/** Dissolve a crew: its people become recruitable patrons (or your crew boss if they joined). */
export function dissolveCrew(w: World, c: StreetCrew, how: 'joined' | 'taken' | 'absorbed', by?: FactionId) {
  const b = w.blocks[c.blockId];
  delete b.influence[c.id];
  for (const id of c.soldierIds) { const n = w.npcs[id]; if (!n) continue; if (how === 'absorbed' && by) { n.faction = by; n.role = 'soldier'; } else { n.role = 'patron'; if (how === 'joined') { n.rel.trust = Math.max(n.rel.trust, 30); n.known = true; } else { n.rel.fear = Math.max(n.rel.fear, 50); } } }
  const boss = w.npcs[c.bossId];
  if (boss) { if (how === 'absorbed' && by) { boss.faction = by; boss.role = 'soldier'; } else if (how === 'taken') { boss.role = 'patron'; boss.rel.fear = Math.max(boss.rel.fear, 60); boss.rel.trust = Math.min(boss.rel.trust, -20); } }
  delete w.crews[c.id];
}

/** Daily: crews grow when ignored, pay if on your payroll, or get swallowed by the neighbours. */
export function tickCrews(w: World, rng: Rng) {
  void rng;
  for (const c of Object.values(w.crews)) {
    const b = w.blocks[c.blockId]; if (!b) { delete w.crews[c.id]; continue; }
    if (c.mood !== 0) c.mood += c.mood > 0 ? -1 : 1;
    if (c.tribute === PLAYER) {
      const pay = Math.round(c.strength * 45);
      if (w.day % 7 === 0) { w.player.dirty += pay * 7; log(w, `The ${c.name} paid their week: ${money(pay * 7)}.`, 'money', { blockId: b.id }); }
      addInfluence(w, b.id, PLAYER, 1);
      continue;
    }
    if (c.tribute) continue; // a faction's now; nothing more happens to it
    c.strength = Math.min(10, c.strength + 0.15);
    b.influence[c.id] = clamp((b.influence[c.id] ?? 40) + 0.5);
    // your rackets on their corner pay them a street tax
    for (const bid of b.businessIds) { const z = w.businesses[bid]; for (const rid of z.racketIds) { const r = w.rackets[rid]; if (r?.owner === PLAYER && r.lastIncome > 0) { const tax = Math.round(r.lastIncome * 0.2); w.player.dirty = Math.max(0, w.player.dirty - tax); } } }
    if (c.strength >= 6 && !b.businessIds.some(id => w.businesses[id].protection?.factionId === c.id)) {
      const target = b.businessIds.map(id => w.businesses[id]).find(z => !z.protection && z.ownedBy === 'npc');
      if (target) { target.protection = { factionId: c.id, rate: 0.15, since: w.day }; log(w, `The ${c.name} started collecting from ${target.name}. They are a real racket now.`, 'warn', { blockId: b.id, businessId: target.id }); }
    }
    if (c.strength >= 8) {
      const nearby = b.neighborIds.map(id => Object.entries(w.blocks[id]?.influence ?? {}).filter(([k, v]) => v >= 30 && w.factions[k]?.alive).map(([k]) => k)[0]).find(Boolean);
      if (nearby) { const f = w.factions[nearby]; f.soldiers += c.soldierIds.length + 1; addInfluence(w, b.id, f.id, 45); dissolveCrew(w, c, 'absorbed', f.id); addMemory(w, b.id, 'absorbed', `${f.short} took the ${c.name} under their wing.`); log(w, `${f.name} absorbed the ${c.name}. ${b.name} is theirs now.`, 'warn', { blockId: b.id, factionId: f.id }); }
    }
  }
}

/** Resolve a parley approach with the crew's boss. Returns the log tone. */
export function parley(w: World, c: StreetCrew, boss: Npc, approach: string, ok: boolean, rng: Rng): 'good' | 'bad' {
  void rng;
  const b = w.blocks[c.blockId];
  if (approach === 'tribute') {
    if (ok) { c.tribute = PLAYER; c.mood += 20; addInfluence(w, b.id, PLAYER, (b.influence[c.id] ?? 40) + 5); delete b.influence[c.id]; adjustRel(boss, { respect: 15, trust: 5 }); log(w, `The ${c.name} are on your payroll: about ${money(c.strength * 45 * 7)} a week, and ${b.name} is yours.`, 'good', { blockId: b.id }); return 'good'; }
    c.mood -= 15; adjustRel(boss, { respect: -5 }); c.strength = Math.min(10, c.strength + 0.5); return 'bad';
  }
  if (approach === 'join') {
    if (ok) {
      addInfluence(w, b.id, PLAYER, (b.influence[c.id] ?? 40) + 10);
      const cut = 40 + Math.round((boss.skills.muscle + boss.skills.brains + boss.skills.charm) * 4);
      boss.crew = { loyalty: 55, cut, status: 'idle', statusDays: 0, joinedDay: w.day }; boss.role = 'crew'; w.player.crewIds.push(boss.id);
      for (const bid of boss.favouriteBusinessIds) { const z = w.businesses[bid]; if (z) z.patronIds = z.patronIds.filter(id => id !== boss.id); }
      const name = c.name; dissolveCrew(w, c, 'joined'); onJoin(w, boss);
      log(w, `${boss.name} and the ${name} come over. ${boss.name} joins your crew at ${money(cut)}/day; their people are yours to recruit.`, 'good', { blockId: b.id, npcId: boss.id });
      return 'good';
    }
    adjustRel(boss, { trust: 3 }); return 'bad';
  }
  // warn
  if (ok) { c.strength = Math.max(1, c.strength - 2); c.mood -= 25; b.influence[c.id] = clamp((b.influence[c.id] ?? 40) - 20); adjustRel(boss, { fear: 25 }); spreadRep(w, b.id, { fear: 5 }); w.player.fear = clamp(w.player.fear + 3); addHeat(w, 2, b.id); log(w, `The ${c.name} get small. The block notices.`, 'good', { blockId: b.id }); return 'good'; }
  c.mood -= 30; addHeat(w, 4, b.id);
  const victim = w.player.crewIds.map(id => w.npcs[id]).find(n => n.crew && (n.crew.status === 'idle' || n.crew.status === 'assigned'));
  if (victim?.crew && rng.chance(0.6)) { victim.crew.status = 'injured'; victim.crew.statusDays = rng.int(2, 5); victim.crew.assignment = undefined; log(w, `The ${c.name} jumped ${victim.name} that night. Laid up ${victim.crew.statusDays} days.`, 'bad', { blockId: b.id, npcId: victim.id }); }
  else log(w, `The ${c.name} come back at you. Windows, tyres, a message.`, 'bad', { blockId: b.id });
  return 'bad';
}
