/**
 * People with lives of their own: agendas that advance whether or not you show up,
 * grudges that spread through the relationship graph, and what a block remembers.
 */
import { connectionsOf, familyOf } from './connections';
import { resolveScheme, schemeTarget } from './nemesis';
import type { Rng } from './rng';
import { PLAYER, type Agenda, type AgendaKind, type Block, type BlockMemory, type GameEvent, type Id, type Npc, type World } from './types';
import { addHeat, bleedRel, clamp, log, money, nid } from './util';

export const AGENDA_LABEL: Record<AgendaKind, string> = {
  debt: 'owes money to the wrong people', leave: 'wants out of this life', revenge: 'wants to get even', ambition: 'wants to be somebody', family: 'is protecting their family',
};

/** Hand agendas to the people worth watching. Called once per populated chunk. */
export function assignAgendas(w: World, npcs: Npc[], rng: Rng) {
  for (const n of npcs) {
    if (n.agenda) continue;
    let kind: AgendaKind | undefined;
    // 'family' is only ever real: it needs somebody in the web to be frightened for.
    const family = familyOf(w, n);
    if (n.role === 'owner' && rng.chance(0.35)) kind = rng.weighted([{ item: 'debt' as AgendaKind, w: 3 }, { item: 'leave', w: 2 }, { item: 'family', w: family.length ? 2 : 0 }, { item: 'revenge', w: 1 }]);
    else if (n.role === 'patron' && rng.chance(0.15)) kind = rng.weighted([{ item: 'ambition' as AgendaKind, w: 3 }, { item: 'debt', w: 2 }, { item: 'revenge', w: 1 }]);
    else if (n.role === 'lieutenant' && rng.chance(0.4)) kind = rng.chance(0.6) ? 'ambition' : 'revenge';
    // A lieutenant's ambition used to mean exactly one thing — the chair, eventually — so every
    // ambitious lieutenant in the city wanted the same one and none of them ever moved on each
    // other. Sometimes what they actually want is the person standing between them and it.
    if (kind === 'ambition' && n.role === 'lieutenant' && rng.chance(0.45)) {
      const rival = schemeTarget(w, n, rng);
      if (rival) { n.agenda = { kind, progress: rng.int(5, 40), rate: rng.int(2, 5), target: rival }; continue; }
    }
    if (!kind) continue;
    if (n.traits.includes('ambitious') && rng.chance(0.5)) kind = 'ambition';
    if (n.traits.includes('gambler') && rng.chance(0.5)) kind = 'debt';
    if (kind === 'family' && !family.length) continue;   // never flavour text with nobody behind it
    const factions = Object.keys(w.factions);
    const target = kind === 'debt' || kind === 'revenge' ? (factions.length ? rng.pick(factions) : undefined)
      : kind === 'family' ? rng.pick(family).id   // the person they are actually protecting
      : undefined;
    n.agenda = { kind, progress: rng.int(5, 40), rate: rng.int(2, 5), target };
  }
}

/** One day of everybody's private business. Milestones surface as events or quiet changes. */
export function tickAgendas(w: World, rng: Rng) {
  for (const n of Object.values(w.npcs)) {
    const a = n.agenda; if (!a || a.done || !n.alive || n.crew || n.hostage) continue; // held people are not getting on with their lives
    a.progress = clamp(a.progress + a.rate);
    if (a.progress >= 50 && !a.milestone50) { a.milestone50 = true; milestone(w, n, a, 50, rng); }
    if (a.progress >= 100) { a.done = true; milestone(w, n, a, 100, rng); }
  }
}

function milestone(w: World, n: Npc, a: Agenda, at: 50 | 100, rng: Rng) {
  const biz = Object.values(w.businesses).find(b => b.ownerId === n.id && !b.shut);
  const known = n.known || n.rel.trust >= 20;
  const ev = (kind: string, title: string, text: string, options: GameEvent['options'], refs: GameEvent['refs'] = {}) => { w.pendingEvents.push({ id: nid(w, 'e'), day: w.day, kind, title, text, options, refs }); };
  const f = a.target ? w.factions[a.target] : undefined;
  switch (a.kind) {
    case 'debt':
      if (at === 50 && known && biz) ev('agenda_debt', `${n.name} needs money`, `${n.name} owes ${f ? f.short : 'a loan shark'} and the interest is eating ${biz.name} alive. "Lend me ${money(1500)}. I'll pay it back. I swear on my mother."`, [
        { id: 'lend', label: 'Lend $1,500', detail: 'Big trust; they owe you', costCash: 1500 }, { id: 'buy', label: 'Offer to buy them out cheap', detail: 'Works if they trust you' }, { id: 'no', label: 'Not my problem', detail: '−trust' },
      ], { npcId: n.id, businessId: biz.id });
      else if (at === 100 && biz && biz.ownedBy === 'npc') {
        if (f && f.alive) { biz.protection = { factionId: f.id, rate: 0.3, since: w.day }; n.faction = f.id; addMemory(w, biz.blockId, 'debt', `${f.short} took over ${biz.name} for an unpaid debt.`, { npcId: n.id, businessId: biz.id }); log(w, `${f.name} took ${biz.name} for ${n.name}'s debts. They collect 30% now.`, 'warn', { businessId: biz.id, factionId: f.id }); }
        else { biz.condition = clamp(biz.condition - 30); log(w, `${n.name}'s debts caught up with them. ${biz.name} is half boarded up.`, 'info', { businessId: biz.id }); }
      }
      break;
    case 'leave':
      if (at === 50 && known && biz) log(w, `${n.name} keeps talking about selling ${biz.name} and leaving town.`, 'info', { npcId: n.id, businessId: biz.id });
      if (at === 100 && biz && biz.ownedBy === 'npc') {
        if (n.rel.trust >= 25) ev('agenda_leave', `${n.name} is leaving`, `"I'm done. ${biz.name} is yours for ${money(Math.round(biz.value * 0.6))} if you want it. Otherwise ${f ? f.short : 'somebody else'} gets it."`, [
          { id: 'buy', label: `Buy for ${money(Math.round(biz.value * 0.6))}`, costCash: Math.round(biz.value * 0.6) }, { id: 'pass', label: 'Let them go' },
        ], { npcId: n.id, businessId: biz.id });
        else { const fresh = Object.values(w.npcs).find(x => x.role === 'patron' && x.homeBlockId === n.homeBlockId && x.alive && !x.crew); if (fresh) { biz.ownerId = fresh.id; fresh.role = 'owner'; fresh.favouriteBusinessIds = []; biz.patronIds = biz.patronIds.filter(id => id !== fresh.id); n.alive = false; log(w, `${n.name} sold ${biz.name} to ${fresh.name} and left town.`, 'info', { businessId: biz.id }); } }
      }
      break;
    case 'revenge': {
      const grudgeAgainstYou = !!n.grudge;
      if (at === 50 && known) log(w, `${n.name} has been asking around about ${grudgeAgainstYou ? 'you' : f ? f.short : 'somebody'}.`, 'warn', { npcId: n.id });
      if (at === 100) {
        if (grudgeAgainstYou || n.rel.trust < -30) { addHeat(w, 10); log(w, `${n.name} sat down with a detective and told them everything they know about you. (+10 heat)`, 'bad', { npcId: n.id }); }
        else if (f && f.alive && n.rel.trust >= 20) ev('agenda_revenge', `${n.name} wants to hurt ${f.short}`, `"They ruined me. I know where ${w.npcs[f.lieutenantIds[0] ?? f.bossId]?.name ?? 'their lieutenant'} keeps the week's take. I'll tell you. Just make it hurt."`, [
          { id: 'take', label: 'Take the tip', detail: `A raid on ${f.short} with no planning time` }, { id: 'pass', label: 'Not interested' },
        ], { npcId: n.id, factionId: f.id });
      }
      break;
    }
    case 'ambition':
      if (at === 50 && (n.rel.trust >= 15 || n.rel.respect >= 30) && !n.crew && !n.faction) ev('agenda_ambition', `${n.name} wants in`, `"I've watched you work. I want to be part of something. Give me a shot and I won't let you down."`, [
        { id: 'take', label: 'Take them on', detail: 'Joins your crew, eager and loyal' }, { id: 'later', label: 'Not yet', detail: 'They keep looking' },
      ], { npcId: n.id });
      // a scheme against a named rival resolves inside the faction, on the sim's own clock,
      // whether or not the player is anywhere near it
      else if (at === 100 && n.role === 'lieutenant' && a.target && w.npcs[a.target]) resolveScheme(w, n, rng);
      else if (at === 100 && !n.crew && !n.faction) { const fs = Object.values(w.factions).filter(x => x.alive); if (fs.length) { const pick = rng.pick(fs); n.faction = pick.id; n.role = n.role === 'lieutenant' ? 'lieutenant' : 'soldier'; pick.soldiers++; log(w, `${n.name} went to work for ${pick.name}.`, 'info', { npcId: n.id, factionId: pick.id }); } }
      break;
    case 'family': {
      // a real person in the web, named: the target is an NPC id for this agenda
      const kin = a.target ? w.npcs[a.target] : familyOf(w, n)[0];
      const tie = kin ? (n.connections.find(c => c.npcId === kin.id)?.label ?? 'family') : 'family';
      const who = kin ? `${kin.name}, their ${tie},` : 'their family';
      if (at === 50 && known) log(w, `${n.name} is scared for ${kin ? `${kin.name} (${tie})` : 'their family'}. Pressure will push them to the police; kindness will not be forgotten.`, 'info', { npcId: n.id });
      if (at === 100) {
        if (n.rel.fear >= 40 && n.rel.trust < 20) { addHeat(w, 8); log(w, `${n.name} went to the police to keep ${who} out of it. (+8 heat)`, 'bad', { npcId: n.id }); }
        else if (n.rel.trust >= 30) { bleedRel(w, n, { trust: 15 }); if (kin) bleedRel(w, kin, { trust: 8 }); log(w, `${n.name} says you're the only one who never went near ${who} (+15 trust)`, 'good', { npcId: n.id }); }
      }
      break;
    }
  }
}

/** A humiliation you handed someone. They will talk. */
export function addGrudge(w: World, n: Npc, reason: string) {
  n.grudge = { since: w.day, reason, spread: 0 };
  if (n.agenda?.kind === 'revenge') n.agenda.rate += 3;
}

/** Word travels along the relationship graph: same block, same bar — and along real family and friends. */
export function tickGossip(w: World, rng: Rng) {
  for (const n of Object.values(w.npcs)) {
    const g = n.grudge; if (!g || !n.alive || n.hostage) continue; // you cannot spread a story from a cellar
    if (n.rel.fear >= 60 || w.day - g.since > 20) { n.grudge = undefined; continue; } // scared quiet, or old news
    if (g.spread >= 4 || !rng.chance(0.5)) continue;
    const circle = new Set<Id>();
    for (const bid of [...n.favouriteBusinessIds, ...Object.values(w.businesses).filter(b => b.ownerId === n.id && !b.shut).map(b => b.id)]) { const b = w.businesses[bid]; if (!b || b.shut) continue; circle.add(b.ownerId); for (const p of b.patronIds) circle.add(p); }
    for (const bid of w.blocks[n.homeBlockId]?.businessIds ?? []) { const b = w.businesses[bid]; if (b) circle.add(b.ownerId); }
    // and the people who actually matter to them: a sister across the district hears it before the man at the next stool
    for (const c of connectionsOf(w, n)) circle.add(c.npc.id);
    circle.delete(n.id);
    const listeners = rng.shuffle([...circle].map(id => w.npcs[id]).filter(x => x && x.alive && !x.crew)).slice(0, 2);
    for (const l of listeners) { bleedRel(w, l, { trust: -3, respect: -2 }); if (l.role === 'owner') l.nerve = clamp(l.nerve + 2); }
    g.spread += listeners.length;
    if (g.spread === listeners.length && listeners.length) log(w, `Word is going around ${w.blocks[n.homeBlockId]?.name ?? 'the block'}: ${g.reason}`, 'warn', { npcId: n.id, blockId: n.homeBlockId });
  }
}

export function addMemory(w: World, blockId: Id, kind: string, text: string, about?: BlockMemory['about']) {
  const b: Block | undefined = w.blocks[blockId]; if (!b) return;
  b.memory.push({ day: w.day, kind, text, about });
  if (b.memory.length > 8) b.memory.splice(0, b.memory.length - 8);
}

export function isHome(w: World, blockId: Id): boolean { return w.player.homeBlockId === blockId; }
void PLAYER;
