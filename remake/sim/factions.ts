/**
 * The other outfits. They run the same economy you do — protection, rackets, soldiers, ground —
 * and they remember what you did to them. Standing with the player is one number, −100..100, and
 * the stance is read off it, so a sit-down, a tribute or a raid all move the same dial.
 */
import { BUSINESSES, RACKETS } from '@r/content/world';
import { openCase } from './law';
import { succeed } from './legacy';
import { armourOf, kitBonus, kitOf } from './kit';
import { snatchCrew } from './hostages';
import { injure, kill } from './people';
import { Rng } from './rng';
import { racketIncome } from './economy';
import type { Faction, Id, Owner, RacketKind, Stance, World } from './types';
import { PLAYER } from './types';
import { addInfluence, cap, clamp, controller, fullName, log, money, nid, shortName, theName } from './util';

export function stanceOf(f: Faction, day: number): Stance {
  if (f.truceUntil !== undefined && day < f.truceUntil && f.standing < 10) return 'peace';
  const s = f.standing;
  // A new outfit starts at zero, and zero is peace: the first draft put the dividing line at +10 and
  // every rival in the city opened the game at "Tension" before the player had done anything.
  return s >= 50 ? 'allied' : s >= -10 ? 'peace' : s >= -30 ? 'tension' : s >= -55 ? 'beef' : 'war';
}
export const STANCE_LABEL: Record<Stance, string> = { allied: 'Allied', peace: 'At peace', tension: 'Tension', beef: 'Beef', war: 'War' };

export const factionBlocks = (w: World, id: Owner) => Object.values(w.blocks).filter(b => controller(b) === id);

export function tickFactions(w: World, rng: Rng) {
  for (const f of Object.values(w.factions)) {
    if (!f.alive) continue;
    const boss = w.npcs[f.bossId];
    const aggression = f.temperament === 'aggressive' ? 1.4 : f.temperament === 'cautious' ? 0.7 : 1;
    // ---- money in: protection on their ground, and their own rackets
    let income = 0;
    for (const b of Object.values(w.businesses)) if (b.protection?.by === f.id && b.closed === 0) income += b.income * b.protection.rate;
    for (const r of Object.values(w.rackets)) if (r.owner === f.id) { const x = racketIncome(w, r); r.lastIncome = x; income += x; }
    // the street pays whoever holds it: corners, card games, a cut of everything nobody itemises
    income += factionBlocks(w, f.id).length * 70;
    f.cash += Math.round(income) - f.soldiers * 20;
    // an outfit that cannot pay its people loses them
    if (f.cash < 0 && f.soldiers > 0 && rng.chance(0.3)) f.soldiers--;
    // ---- spend: soldiers first when threatened, ground when rich
    // soldiers are bought, and an outfit only carries as many as its ground can feed
    const heldN = factionBlocks(w, f.id).length;
    if (f.cash > 6000 && f.soldiers < 10 + heldN / 3 && rng.chance(0.35)) { f.soldiers++; f.cash -= 1500; }
    const held = factionBlocks(w, f.id);
    const border = [...new Set(held.flatMap(b => b.neighborIds))].map(id => w.blocks[id]).filter(b => controller(b) !== f.id);
    // Pushing onto new ground costs money and men's time, so a broke outfit holds rather than grows.
    // Measured without this: one gang went from 12 blocks to 47 in thirty days and the city was
    // three-fifths spoken for before the player had rented a flat.
    if (border.length && f.cash > 2500 && rng.chance(0.3 * aggression)) {
      f.cash -= 400;
      const target = border.sort((a, b) => score(w, f.id, b) - score(w, f.id, a))[Math.min(border.length - 1, rng.int(0, 2))];
      const push = rng.int(2, 4) * aggression * Math.min(1.4, f.soldiers / 14);
      addInfluence(w, target.id, f.id, push);
      if ((target.influence[PLAYER] ?? 0) > 20) {
        addInfluence(w, target.id, PLAYER, -push * 0.5);
        f.standing = clamp(f.standing - 1, -100, 100);
      }
    }
    for (const b of held) addInfluence(w, b.id, f.id, 1.2);
    // ---- protection and rackets on their own ground
    for (const b of held) for (const bizId of b.businessIds) {
      const biz = w.businesses[bizId];
      if (biz.tier < 3 && !biz.protection && biz.ownedBy === 'npc' && rng.chance(0.025 * aggression)) biz.protection = { by: f.id, rate: rng.int(10, 18) / 100, since: w.day };
      if (biz.protection?.by === f.id && biz.racketIds.length === 0 && f.cash > 5000 && rng.chance(0.015)) {
        const kinds = BUSINESSES[biz.type].rackets; if (!kinds.length) continue;
        const kind = rng.pick(kinds) as RacketKind;
        if (kind === 'laundering' || RACKETS[kind].sells) continue;
        const id = nid(w, 'r');
        w.rackets[id] = { id, kind, businessId: biz.id, owner: f.id, level: 1, started: w.day, lastIncome: 0, down: 0 };
        biz.racketIds.push(id); f.cash -= RACKETS[kind].setup;
      }
    }
    // ---- what you are doing on their ground
    let incursion = 0;
    for (const b of held) if ((b.influence[PLAYER] ?? 0) > 15) incursion++;
    const homeHits = Object.values(w.businesses).filter(b => b.protection?.by === PLAYER && w.blocks[b.blockId].districtId === f.homeDistrictId).length;
    f.standing = clamp(f.standing - incursion * 0.4 - homeHits * 0.3 + (f.standing < 0 ? 0.6 : f.standing > 20 ? -0.2 : 0.2), -100, 100);
    const stance = stanceOf(f, w.day);
    // ---- acting on it
    if (stance === 'tension' && rng.chance(0.04)) log(w, `A message from ${theName(f)}: stay off their streets.`, 'war');
    if (stance === 'beef' || stance === 'war') hostile(w, f, rng, stance === 'war' ? 1.6 * aggression : aggression);
    // ---- the other outfits
    for (const [oid, rel] of Object.entries(f.relations)) {
      const o = w.factions[oid]; if (!o?.alive) continue;
      let r = rel + (rng.float() - 0.5) * 3 - (f.temperament === 'aggressive' ? 0.3 : 0);
      // shared borders rub
      if (held.some(b => b.neighborIds.some(n => controller(w.blocks[n]) === oid))) r -= 0.4;
      f.relations[oid] = clamp(Math.round(r * 10) / 10, -100, 100);
      if (f.relations[oid] < -60 && rng.chance(0.15)) war(w, f, o, rng);
    }
    // ---- a boss can be lost to the city on his own
    if (boss?.alive && rng.chance(0.0015)) kill(w, boss.id, 'found in the river, and nobody is saying anything');
    // ---- the end of an outfit
    if (f.soldiers <= 0 && f.cash < 0 && factionBlocks(w, f.id).length === 0) dissolve(w, f);
    else if (!w.npcs[f.bossId]?.alive && f.lieutenantIds.every(id => !w.npcs[id]?.alive) && f.soldiers < 4) dissolve(w, f);
  }
}

function score(w: World, fid: Owner, b: { id: Id; wealth: number; influence: Record<string, number>; districtId: Id }) {
  const opp = Object.entries(b.influence).filter(([k]) => k !== fid).reduce((t, [, v]) => t + v, 0);
  return b.wealth - opp * 0.8 - w.districts[b.districtId].attention * 0.3;
}

/** Beef and war: what they do to you. */
function hostile(w: World, f: Faction, rng: Rng, k: number) {
  const p = w.player;
  const mine = p.racketIds.map(id => w.rackets[id]).filter(r => r && r.down === 0);
  if (mine.length && rng.chance(0.07 * k)) {
    const r = rng.pick(mine); r.down = rng.int(2, 5);
    log(w, `The ${f.short} wreck your ${RACKETS[r.kind].label.toLowerCase()} at ${w.businesses[r.businessId].name}. Down ${r.down} days.`, 'war', { businessId: r.businessId });
  }
  const protectedBiz = Object.values(w.businesses).filter(b => b.protection?.by === PLAYER);
  if (protectedBiz.length && rng.chance(0.05 * k)) {
    const b = rng.pick(protectedBiz);
    const guard = p.crewIds.some(id => w.npcs[id]?.crew?.assignment?.kind === 'guard' && (w.npcs[id].crew!.assignment as { blockId: Id }).blockId === b.blockId);
    // people dug in (`defend_racket`) turn them away every time; a guard, most of the time
    if ((b.dugIn ?? 0) >= w.day) log(w, `The ${f.short} came for ${b.name}. Your people were dug in and waiting, and they left.`, 'good', { businessId: b.id });
    else if (guard && rng.chance(0.6)) log(w, `The ${f.short} came to lean on ${b.name}. Your people were there first.`, 'good', { businessId: b.id });
    else { b.protection = { by: f.id, rate: 0.15, since: w.day }; addInfluence(w, b.blockId, PLAYER, -8); log(w, `The ${f.short} take ${b.name} off you. The owner pays them now.`, 'war', { businessId: b.id }); }
  }
  const crew = p.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew?.status !== 'jailed' && n.crew?.status !== 'held');
  if (crew.length && rng.chance((f.standing < -55 ? 0.06 : 0.02) * k)) {
    const n = rng.pick(crew);
    // at war, one time in four they take somebody instead — one at a time, so there is a price to pay
    const holding = Object.values(w.hostages).some(h => h.holder === f.id);
    if (f.standing < -55 && !holding && rng.chance(0.25)) snatchCrew(w, f.id, n.id, rng);
    else if (rng.chance(0.25 * (1 - armourOf(kitOf(w, n.id))))) kill(w, n.id, `shot by the ${f.short}`);
    else injure(w, n.id, rng.int(3, 8), `jumped by ${f.short} soldiers`);
  }
  // at war, somebody eventually comes for you personally
  if (f.standing < -55 && rng.chance(0.012 * k)) attemptOnPlayer(w, f, rng);
}

function attemptOnPlayer(w: World, f: Faction, rng: Rng) {
  const p = w.player;
  const guardIds = p.crewIds.filter(id => { const n = w.npcs[id]; return n?.alive && n.crew?.assignment?.kind === 'guard' && (n.crew.assignment as { blockId: Id }).blockId === p.blockId; });
  const guards = guardIds.length;
  // what you and the people watching you carry: a gun on you is worth about what a guard is, a
  // gun on the guard adds to them. Measured against the old flat gear level (0.1 a step).
  const armed = kitBonus(kitOf(w, PLAYER), 'muscle') * 0.05 + guardIds.reduce((t, id) => t + kitBonus(kitOf(w, id), 'muscle') * 0.03, 0);
  const defence = 0.35 + guards * 0.18 + armed + p.skills.muscle * 0.02;
  if (rng.float() < defence) { log(w, `Two ${f.short} soldiers come for you outside ${w.blocks[p.blockId].name}. They do not get close${guards ? ' — your people saw them first' : ''}.`, 'war'); f.soldiers = Math.max(0, f.soldiers - 1); return; }
  // armour is the difference between hospital and the morning paper
  if (rng.chance(0.3 * (1 - armourOf(kitOf(w, PLAYER))))) {
    log(w, `The ${f.short} got to you on ${w.blocks[p.blockId].name}.`, 'war');
    succeed(w, 'dead', `${cap(theName(f))} got to you on ${w.blocks[p.blockId].name}. ${w.city.name} reads about it in the morning paper.`);
    f.standing = clamp(f.standing + 30, -100, 100);   // they have had their blood
    return;
  }
  p.ap = 0; p.heat = clamp(p.heat + 10);
  log(w, `The ${f.short} put you in hospital for a day. You were lucky. Next time, have somebody watching your back.`, 'war');
}

function war(w: World, a: Faction, b: Faction, rng: Rng) {
  // a skirmish on the border: both lose men, the stronger takes ground
  const la = rng.int(0, 2), lb = rng.int(0, 2);
  a.soldiers = Math.max(0, a.soldiers - la); b.soldiers = Math.max(0, b.soldiers - lb);
  const border = factionBlocks(w, b.id).filter(x => x.neighborIds.some(n => controller(w.blocks[n]) === a.id));
  if (border.length) { const t = rng.pick(border); const k = a.soldiers >= b.soldiers ? 1 : -1; addInfluence(w, t.id, a.id, 6 * k); addInfluence(w, t.id, b.id, -6 * k); }
  if (rng.chance(0.1)) log(w, `The ${a.short} and the ${b.short} are shooting at each other on ${border[0]?.name ?? 'the border'}.`, 'war');
}

function dissolve(w: World, f: Faction) {
  f.alive = false;
  for (const b of Object.values(w.blocks)) delete b.influence[f.id];
  for (const biz of Object.values(w.businesses)) if (biz.protection?.by === f.id) biz.protection = undefined;
  for (const r of Object.values(w.rackets)) if (r.owner === f.id) { const biz = w.businesses[r.businessId]; biz.racketIds = biz.racketIds.filter(x => x !== r.id); delete w.rackets[r.id]; }
  for (const o of Object.values(w.factions)) delete o.relations[f.id];
  w.player.respect = clamp(w.player.respect + 10);
  log(w, `${cap(theName(f))} are finished. Their streets are up for grabs.`, 'war');
}

// ---------------------------------------------------------------------------------- diplomacy
export function tributeEffect(f: Faction, amount: number) { return Math.round(Math.min(25, amount / (f.temperament === 'greedy' ? 150 : 250))); }

export type SitDownOffer = 'truce' | 'alliance' | 'split';
export function sitDownOdds(w: World, f: Faction, offer: SitDownOffer): { chance: number; cost: number; text: string } {
  const p = w.player;
  const base = 30 + f.standing * 0.5 + p.respect / 3 + p.skills.charm * 3;
  if (offer === 'truce') return { chance: clamp(Math.round(base + 20), 5, 95), cost: 2000 + Math.max(0, -f.standing) * 60, text: 'A truce for 20 days. Nobody moves on anybody.' };
  if (offer === 'alliance') return { chance: clamp(Math.round(base - 25 + (f.temperament === 'cunning' ? 10 : 0)), 3, 90), cost: 5000, text: 'Allies: they leave your streets alone and your standing with them climbs.' };
  return { chance: clamp(Math.round(base), 5, 95), cost: 0, text: 'Split the difference: you give up a block you both want, they call off the beef.' };
}

export function sitDown(w: World, f: Faction, offer: SitDownOffer, rng: Rng) {
  const o = sitDownOdds(w, f, offer);
  const boss = w.npcs[f.bossId];
  if (rng.float() * 100 >= o.chance) {
    f.standing = clamp(f.standing - 5, -100, 100);
    log(w, `${boss ? fullName(boss) : 'Their boss'} hears you out, and says no. ${f.grievances[0] ? `"${f.grievances[0]}. You think I forgot?"` : ''}`, 'war');
    return;
  }
  if (offer === 'truce') { f.truceUntil = w.day + 20; f.standing = clamp(Math.max(f.standing, -20) + 10, -100, 100); log(w, `A truce with ${theName(f)}, twenty days. Hands are shaken.`, 'good'); }
  if (offer === 'alliance') { f.standing = clamp(Math.max(f.standing, 50) + 5, -100, 100); log(w, `You and ${theName(f)} are allies now. ${boss ? shortName(boss) : 'Their boss'} says it will be good for everybody.`, 'good'); }
  if (offer === 'split') {
    const contested = Object.values(w.blocks).filter(b => (b.influence[PLAYER] ?? 0) > 5 && (b.influence[f.id] ?? 0) > 5);
    const give = contested.sort((a, b) => (a.influence[PLAYER] ?? 0) - (b.influence[PLAYER] ?? 0))[0];
    if (give) { addInfluence(w, give.id, PLAYER, -(give.influence[PLAYER] ?? 0)); addInfluence(w, give.id, f.id, 20); log(w, `You give the ${f.short} ${give.name}. The beef is off.`, 'info'); }
    f.standing = clamp(Math.max(f.standing, -10) + 10, -100, 100);
    f.truceUntil = w.day + 10;
  }
  f.grievances = [];
  void money; void openCase; void Rng;
}
