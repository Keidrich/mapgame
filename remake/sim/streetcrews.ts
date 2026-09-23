/**
 * Street crews: a handful of kids on a corner, belonging to nobody.
 *
 * They skim a quarter of whatever you take off their block, and left alone they grow. A crew that
 * reaches `CREW.outfitAt` stops being a crew: its boss names it, colours it and it becomes an outfit
 * with a home and ground — the city grows a new rival on its own, out of a corner you ignored.
 * Dealing with one is a face-to-face with its boss: pay them (they leave your places alone and hold
 * the corner for you), take them in (their corner builds your ground), or run them off.
 *
 * Generated from their **own** rng stream, after everything else, so adding them changed no existing
 * seed's city — and a city saved before they existed gets its crews when it is next opened.
 */
import { STYLES } from '@r/content/world';
import { factionName, nickname, personName, styleGroup } from '@r/content/names';
import { rollTraits } from './generate';
import { Rng } from './rng';
import type { Faction, Id, Npc, StreetCrew, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, controller, fullName, log, money, nid, theName } from './util';

export const CREW = {
  /** Members at which a crew becomes an outfit. */
  outfitAt: 14,
  /** Share of your protection take on their block they skim while they are nobody's. */
  skim: 0.25,
  /** Days between new members, roughly, while nobody deals with them. */
  growEvery: 7,
};

export function generateStreetCrews(w: World) {
  if (!w.crews) w.crews = {};
  const rng = new Rng(w.seed ^ 0x5ec2e);
  const cores = new Set(Object.values(w.blocks).filter(b => controller(b)).map(b => b.id));
  const pool = Object.values(w.blocks).filter(b => !cores.has(b.id) && b.businessIds.length && ['projects', 'docks', 'market', 'strip', 'industrial'].includes(w.districts[b.districtId].kind) && b.id !== w.player?.blockId);
  const n = Math.min(pool.length, Math.max(2, Math.round(Object.keys(w.blocks).length / 55)));
  for (const b of rng.shuffle(pool).slice(0, n)) {
    const pn = personName(rng, styleGroup(rng, 'gang'));
    const id = nid(w, 'n');
    const boss: Npc = {
      id, first: pn.first, last: pn.last, nick: nickname(rng), pronoun: pn.pronoun, age: rng.int(19, 34), face: rng.int(1, 2 ** 30),
      role: 'patron', homeBlockId: b.id, skills: { muscle: rng.int(4, 8), brains: rng.int(2, 6), charm: rng.int(3, 7), wheels: rng.int(3, 7), tech: rng.int(1, 5) },
      traits: rollTraits(rng), nerve: rng.int(50, 85), wealth: rng.int(10, 30), rel: { trust: 0, fear: 0, respect: 0, owes: 0 }, memory: [], ties: [], known: false, alive: true,
    };
    w.npcs[id] = boss;
    const cid = nid(w, 'c');
    const name = factionName(rng, 'gang', boss, b.name.split(' & ')[0]).name.replace(/^The /, '');
    w.crews[cid] = { id: cid, name, bossId: id, blockId: b.id, members: rng.int(3, 5), since: 1, terms: 'none', wage: 0 };
  }
}

export const crewOn = (w: World, blockId: Id): StreetCrew | undefined => Object.values(w.crews ?? {}).find(c => c.blockId === blockId);
export const crewOf = (w: World, npcId: Id): StreetCrew | undefined => Object.values(w.crews ?? {}).find(c => c.bossId === npcId);

/** What a crew wants a day to leave your places alone and hold the corner for you. */
export const crewWage = (c: StreetCrew) => 20 + c.members * 12;
/** What they want a day to be yours. */
export const crewCost = (c: StreetCrew) => 30 + c.members * 18;

export function tickStreetCrews(w: World, rng: Rng, pay: (n: number) => boolean) {
  for (const c of Object.values(w.crews ?? {})) {
    const boss = w.npcs[c.bossId];
    if (!boss?.alive || c.members <= 0) { delete w.crews[c.id]; continue; }
    if (c.terms !== 'none') {
      if (!pay(c.wage)) { log(w, `You missed the ${c.name}'s money. The arrangement is off.`, 'bad', { blockId: c.blockId }); c.terms = 'none'; c.wage = 0; boss.rel.trust = clamp(boss.rel.trust - 20, -100, 100); continue; }
      // a paid crew holds the corner for you; your own crew builds your ground there
      addInfluence(w, c.blockId, PLAYER, c.terms === 'yours' ? 2 + c.members * 0.15 : 1);
      if (c.terms === 'yours' && rng.chance(0.08) && c.members < 10) c.members++;
      continue;
    }
    // nobody's: they grow, and a big enough crew becomes an outfit
    if (rng.chance(1 / CREW.growEvery)) c.members++;
    const b = w.blocks[c.blockId];
    const holder = controller(b);
    if (holder && holder !== PLAYER && rng.chance(0.08)) { c.members = Math.max(0, c.members - 1); }
    if (c.members >= CREW.outfitAt) promote(w, c, rng);
  }
}

/** A corner nobody dealt with becomes a new outfit. */
function promote(w: World, c: StreetCrew, rng: Rng) {
  const boss = w.npcs[c.bossId];
  const b = w.blocks[c.blockId];
  const id = `f${Object.keys(w.factions).length + Object.keys(w.crews).length + w.day}`;
  const color = rng.pick(['#9b59b6', '#1abc9c', '#e74c3c', '#f1c40f', '#00a8ff']);
  const f: Faction = {
    id, name: c.name.startsWith('The ') ? c.name : `The ${c.name}`, short: c.name.split(' ').slice(-1)[0], style: 'gang', temperament: 'aggressive', color,
    emblem: { shape: rng.int(0, 4), charge: rng.int(0, 11), fg: '#f4efe6', bg: color },
    bossId: boss.id, lieutenantIds: [], soldiers: Math.round(c.members * 0.8), cash: 3000, homeDistrictId: b.districtId, alive: true,
    standing: -10, relations: {}, grievances: ['Nobody took us seriously'],
  };
  boss.role = 'boss'; boss.faction = id;
  for (const o of Object.values(w.factions)) { f.relations[o.id] = -20; o.relations[id] = -20; }
  w.factions[id] = f;
  addInfluence(w, b.id, id, 45);
  for (const nb of b.neighborIds) addInfluence(w, nb, id, 15);
  delete w.crews[c.id];
  log(w, `${fullName(boss)} has stopped calling it a crew. ${theName(f)} are an outfit now, on ${b.name}, and they did not ask anybody.`, 'war', { blockId: b.id });
  void STYLES; void money;
}
