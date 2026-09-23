/**
 * A whole new game from a seed: the city, then everybody in it.
 *
 * Order matters and is fixed, because every step draws from the same rng stream: city, then
 * businesses and their people block by block, then the web between people, then the outfits
 * and the ground they hold, then the officials and the fixer, then where you start. Change the
 * order and every existing seed becomes a different city — which is allowed, but bump
 * `WORLD_VERSION` when you do, because a saved seed would no longer mean what it meant.
 */
import { BACKGROUNDS, BUSINESSES, DISTRICTS, OFFICIALS, STYLES, TRAITS } from '@r/content/world';
import { NAME_GROUP_IDS, businessName, factionName, nickname, personName, styleGroup, type NameGroup } from '@r/content/names';
import { generateCity, type CitySize } from './city';
import { pointInPoly } from './geom';
import { Rng } from './rng';
import { addInfluence, nid } from './util';
import { generateJobs } from './jobs';
import { generateStreetCrews } from './streetcrews';
import type { AgendaKind, Background, Block, Business, BusinessType, District, Faction, FactionStyle, Id, Npc, OfficialKind, Role, SecretKind, Skill, Skills, Temperament, Trait, World } from './types';
import { PLAYER, SKILLS } from './types';

export const WORLD_VERSION = 1;

export interface NewGame {
  seed: number;
  size: CitySize;
  name: string;
  nick?: string;
  background: Background;
}

const TRAIT_WEIGHTS: [Trait, number][] = [
  ['greedy', 12], ['loyal', 10], ['coward', 10], ['hothead', 9], ['honest', 9], ['ambitious', 8],
  ['gambler', 7], ['junkie', 4], ['quiet', 9], ['connected', 7], ['tough', 9], ['sly', 7],
];
const OPPOSED: [Trait, Trait][] = [['coward', 'hothead'], ['coward', 'tough'], ['honest', 'sly'], ['honest', 'greedy'], ['loyal', 'ambitious']];

export function newWorld(opts: NewGame): World {
  const gen = generateCity(opts.seed, opts.size);
  const rng = new Rng(opts.seed ^ 0x7e11);
  const w: World = {
    version: WORLD_VERSION, seed: opts.seed, rng: 0, day: 1,
    city: gen.city, districts: gen.districts, blocks: gen.blocks,
    businesses: {}, npcs: {}, factions: {}, rackets: {}, safehouses: {}, jobs: {}, cases: {}, crews: {},
    events: [], scheduled: [], log: [], news: [], history: [], nextId: 1,
    player: undefined as unknown as World['player'],
  };

  // ---- the look of each district's names: cosmetic only, never read by a number
  const groupsOf: Record<Id, { g: NameGroup; w: number }[]> = {};
  for (const d of Object.values(w.districts)) {
    const lead = rng.shuffle(NAME_GROUP_IDS).slice(0, 3);
    groupsOf[d.id] = NAME_GROUP_IDS.map(g => ({ g, w: g === lead[0] ? 6 : g === lead[1] ? 3 : g === lead[2] ? 2 : 1 }));
  }
  const groupFor = (blockId: Id): NameGroup => rng.weighted(groupsOf[w.blocks[blockId].districtId].map(x => ({ item: x.g, w: x.w })));

  const mkNpc = (role: Role, homeBlockId: Id, extra: Partial<Npc> & { group?: NameGroup; last?: string } = {}): Npc => {
    const pn = personName(rng, extra.group ?? groupFor(homeBlockId));
    const traits = rollTraits(rng);
    const skills = rollSkills(rng, role);
    const id = nid(w, 'n');
    const n: Npc = {
      id, first: pn.first, last: extra.last ?? pn.last, pronoun: pn.pronoun,
      age: role === 'patron' ? rng.int(19, 70) : rng.int(24, 66), face: rng.int(1, 2 ** 30),
      role, homeBlockId, skills, traits,
      nerve: Math.max(5, Math.min(98, Math.round(rng.gauss(45, 15) + (traits.includes('tough') ? 18 : 0) + (traits.includes('hothead') ? 10 : 0) - (traits.includes('coward') ? 22 : 0)))),
      wealth: Math.round(rng.gauss(40, 18)),
      rel: { trust: 0, fear: 0, respect: 0, owes: 0 }, memory: [], ties: [], known: false, alive: true,
      ...stripGen(extra),
    };
    if (rng.chance(role === 'boss' || role === 'lieutenant' ? 0.9 : 0.12)) n.nick = nickname(rng);
    w.npcs[id] = n;
    return n;
  };

  // ---- businesses, block by block, and the people who own and use them
  const blocks = Object.values(w.blocks);
  const bankCount: Record<Id, number> = {};
  for (const b of blocks) {
    if (b.landmark && /Park|Gardens|Common|Green|Fields/.test(b.landmark)) continue;
    const d = w.districts[b.districtId];
    const def = DISTRICTS[d.kind];
    const [i0, j0, i1, j1] = b.cells;
    const cellsN = (i1 - i0 + 1) * (j1 - j0 + 1);
    const n = Math.max(1, Math.min(4, Math.round((cellsN > 1 ? 2 : 1) + rng.float() * (def.population / 45))));
    for (let k = 0; k < n; k++) {
      let type = rng.weighted(Object.entries(def.business).map(([t, wt]) => ({ item: t as BusinessType, w: wt! })));
      // institutions are rare on purpose: one bank to a district, a handful in a city
      if (BUSINESSES[type].tier === 3) {
        const c = bankCount[d.id] ?? 0;
        if (c >= 1 || rng.chance(0.4)) type = rng.pick(['bar', 'restaurant', 'corner_store', 'diner'] as BusinessType[]);
        else bankCount[d.id] = c + 1;
      }
      mkBusiness(w, rng, b, type, mkNpc);
    }
  }

  // ---- the web: family under one roof, friends down the street, the odd feud
  weave(w, rng);

  // ---- agendas and secrets: what people want, and what they are hiding
  const agendaKinds: AgendaKind[] = ['debt', 'revenge', 'sick', 'escape', 'rival', 'kid'];
  const secretKinds: SecretKind[] = ['affair', 'skimming', 'debts', 'past', 'informant', 'habit'];
  const civilians = Object.values(w.npcs);
  for (const n of civilians) {
    if (rng.chance(0.28)) {
      const kind = n.traits.includes('gambler') && rng.chance(0.6) ? 'debt' : rng.pick(agendaKinds);
      const pool = kind === 'revenge' || kind === 'rival' ? civilians.filter(x => x.id !== n.id && x.homeBlockId !== n.homeBlockId && w.blocks[x.homeBlockId].districtId === w.blocks[n.homeBlockId].districtId) : [];
      const target = pool.length ? rng.pick(pool) : undefined;
      if ((kind === 'revenge' || kind === 'rival') && !target) continue;
      n.agenda = { kind, known: false, since: 1, targetId: target?.id, cost: kind === 'debt' ? rng.int(8, 40) * 100 : kind === 'sick' ? rng.int(15, 60) * 100 : kind === 'escape' ? rng.int(10, 30) * 100 : kind === 'kid' ? rng.int(5, 20) * 100 : undefined };
    }
    if (rng.chance(0.3)) n.secret = { kind: n.traits.includes('gambler') ? 'debts' : n.traits.includes('junkie') ? 'habit' : rng.pick(secretKinds), known: false };
  }

  // ---- the outfits
  const size = { small: 3, medium: 4, large: 5 }[opts.size];
  mkFactions(w, rng, size, mkNpc);

  // ---- the law and the people who run the city
  for (const p of gen.precincts) {
    const cap = mkNpc('official', p.blockId, { official: 'captain' });
    cap.nerve = Math.max(cap.nerve, 60);
    for (const did of p.districtIds) w.districts[did].precinctId = p.id;
    cap.precinctId = p.id;
  }
  const officials: [OfficialKind, Id][] = [['judge', gen.courthouseBlockId], ['prosecutor', gen.courthouseBlockId], ['councillor', gen.cityHallBlockId]];
  for (const [k, bid] of officials) { const o = mkNpc('official', bid, { official: k }); o.wealth = 70; void OFFICIALS[k]; }

  // ---- the fixer: somebody who washes money for a fee, found somewhere unglamorous
  const fixBlock = rng.pick(blocks.filter(b => ['market', 'oldtown', 'strip', 'docks'].includes(w.districts[b.districtId].kind) && b.businessIds.length));
  if (fixBlock) { const f = mkNpc('fixer', fixBlock.id); f.nick = f.nick ?? nickname(rng); f.traits = ['quiet', 'greedy']; w.fixerId = f.id; }

  // ---- you
  const start = pickStart(w, rng);
  const bg = BACKGROUNDS[opts.background];
  const skills: Skills = { ...bg.skills };
  if (opts.background === 'drifter') {
    // a life dealt from the seed: twenty points, none below two
    for (const s of SKILLS) skills[s] = 2;
    for (let k = 0; k < 10; k++) { const s = rng.pick(SKILLS); if (skills[s] < 8) skills[s]++; else k--; }
  }
  w.player = {
    name: opts.name.trim() || 'Nobody', nick: opts.nick?.trim() || undefined, background: opts.background, face: rng.int(1, 2 ** 30),
    skills, xp: { muscle: 0, brains: 0, charm: 0, wheels: 0, tech: 0 },
    cash: bg.cash, dirty: 0, heat: 0, fear: opts.background === 'bruiser' ? 8 : 0, respect: 0, ap: 8, apMax: 8,
    blockId: start.id, crewIds: [], businessIds: [], racketIds: [], safehouseIds: [],
    stash: { booze: { n: 0, q: 0 }, green: { n: 0, q: 0 }, pills: { n: 0, q: 0 }, goods: { n: 0, q: 0 } },
    gear: { weapons: 0, tools: 0, wheels: 0, tech: 0 }, lawyer: false, washedToday: 0, lowDays: 0, straightDays: 0, busts: 0, generation: 1,
  };
  addInfluence(w, start.id, PLAYER, 12);
  // a couple of people on your own street already know your face
  const locals = Object.values(w.npcs).filter(n => n.homeBlockId === start.id && !n.faction && !n.official);
  for (const n of rng.shuffle(locals).slice(0, 2)) { n.rel.met = 1; n.rel.trust = rng.int(8, 22); n.known = true; n.memory.push({ day: 1, kind: 'met', text: 'Knows you from the neighbourhood.' }); }

  w.rng = rng.state;
  generateJobs(w, 3);
  // street crews come from their own stream, after everything else, so they changed no seed's city
  generateStreetCrews(w);
  ensureFixer(w);
  w.log.push({ day: 1, text: `${w.city.name}. ${w.city.motto} You start on ${start.name}, in ${w.districts[start.districtId].name}, with ${bg.cash.toLocaleString('en-US')} dollars and nobody's respect.`, tone: 'info', blockId: start.id });
  return w;
}

/**
 * The generator-only keys come off, and so does anything explicitly undefined — `{ last: undefined }`
 * spread over a person used to wipe out the surname it had just drawn, and a lieutenant who
 * happened not to inherit the family name had no surname at all.
 */
function stripGen<T extends { group?: unknown; last?: unknown }>(x: T): Partial<Npc> {
  const { group: _g, last: _l, ...rest } = x;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<Npc>;
}

export function rollTraits(rng: Rng): Trait[] {
  const a = rng.weighted(TRAIT_WEIGHTS.map(([t, wt]) => ({ item: t, w: wt })));
  for (let k = 0; k < 20; k++) {
    const b = rng.weighted(TRAIT_WEIGHTS.map(([t, wt]) => ({ item: t, w: wt })));
    if (b !== a && !OPPOSED.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return [a, b];
  }
  return [a];
}
void TRAITS;

function rollSkills(rng: Rng, role: Role): Skills {
  const s = {} as Skills;
  for (const k of SKILLS) s[k] = Math.max(1, Math.min(10, Math.round(rng.gauss(4, 1.8))));
  const lean: Partial<Record<Role, Skill[]>> = { soldier: ['muscle'], lieutenant: ['muscle', 'brains'], boss: ['brains', 'charm'], official: ['brains', 'charm'], fixer: ['brains', 'charm'] };
  for (const k of lean[role] ?? [rng.pick(SKILLS)]) s[k] = Math.min(10, s[k] + rng.int(1, 3));
  return s;
}

function randomPointIn(rng: Rng, b: Block) {
  const xs = b.poly.map(p => p.x), ys = b.poly.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let k = 0; k < 30; k++) {
    const p = { x: Math.round(x0 + (x1 - x0) * (0.15 + rng.float() * 0.7)), y: Math.round(y0 + (y1 - y0) * (0.15 + rng.float() * 0.7)) };
    if (pointInPoly(p, b.poly)) return p;
  }
  return { ...b.center };
}

function mkBusiness(w: World, rng: Rng, b: Block, type: BusinessType, mkNpc: (role: Role, home: Id, extra?: Partial<Npc> & { group?: NameGroup; last?: string }) => Npc): Business {
  const def = BUSINESSES[type];
  const owner = mkNpc('owner', b.id);
  owner.nerve = Math.round((owner.nerve + def.nerve) / 2);
  owner.wealth = Math.max(owner.wealth, 30 + def.tier * 15);
  const id = nid(w, 'biz');
  const street = b.name.split(' & ')[rng.int(0, 1)];
  const other = personName(rng, rng.pick(NAME_GROUP_IDS)).last;
  const wealthK = 0.6 + b.wealth / 100;
  const income = Math.round((def.income[0] + rng.float() * (def.income[1] - def.income[0])) * wealthK);
  const biz: Business = {
    id, name: businessName(rng, type, owner, other, street), type, tier: def.tier, blockId: b.id, pos: randomPointIn(rng, b),
    ownerId: owner.id, patronIds: [], income,
    security: Math.round(def.security[0] + rng.float() * (def.security[1] - def.security[0])),
    till: def.vault ? Math.round((def.vault[0] + rng.float() * (def.vault[1] - def.vault[0])) * wealthK) : Math.round(income * (1.5 + rng.float() * 2)),
    ownedBy: 'npc', racketIds: [], closed: 0,
  };
  w.businesses[id] = biz; b.businessIds.push(id);
  owner.workId = id;
  const np = rng.int(def.patrons[0], def.patrons[1]);
  for (let k = 0; k < np; k++) {
    const home = rng.chance(0.6) || !b.neighborIds.length ? b.id : rng.pick(b.neighborIds);
    // a quarter of the regulars are the owner's own family
    const fam = rng.chance(0.25);
    const p = mkNpc('patron', home, fam ? { last: owner.last } : {});
    if (fam) { p.ties.push({ id: owner.id, kind: 'family' }); owner.ties.push({ id: p.id, kind: 'family' }); }
    p.workId = undefined;
    biz.patronIds.push(p.id);
  }
  return biz;
}

/** Friends down the street and across the district, and a few old grudges. */
function weave(w: World, rng: Rng) {
  const byDistrict: Record<Id, Npc[]> = {};
  for (const n of Object.values(w.npcs)) (byDistrict[w.blocks[n.homeBlockId].districtId] ??= []).push(n);
  const tie = (a: Npc, b: Npc, kind: 'friend' | 'rival' | 'partner') => {
    if (a.id === b.id || a.ties.some(t => t.id === b.id)) return;
    a.ties.push({ id: b.id, kind }); b.ties.push({ id: a.id, kind });
  };
  for (const list of Object.values(byDistrict)) {
    for (const n of list) {
      const friends = rng.int(0, 2);
      for (let k = 0; k < friends; k++) tie(n, rng.pick(list), 'friend');
      if (rng.chance(0.06)) tie(n, rng.pick(list), 'rival');
      if (rng.chance(0.05) && n.age > 22) tie(n, rng.pick(list), 'partner');
    }
  }
}

function mkFactions(w: World, rng: Rng, count: number, mkNpc: (role: Role, home: Id, extra?: Partial<Npc> & { group?: NameGroup; last?: string }) => Npc) {
  const districts = Object.values(w.districts).filter(d => d.blockIds.length >= 6);
  // homes spread apart: farthest-point over district centres
  const homes: District[] = [rng.pick(districts)];
  while (homes.length < Math.min(count, districts.length)) {
    const next = districts.filter(d => !homes.includes(d)).reduce((a, b) => (minD(a, homes) >= minD(b, homes) ? a : b));
    homes.push(next);
  }
  const styles = rng.shuffle(['family', 'syndicate', 'gang', 'cartel', 'crew'] as FactionStyle[]);
  const usedColors = new Set<string>();
  homes.forEach((home, k) => {
    const style = styles[k % styles.length];
    const def = STYLES[style];
    const hq = rng.pick(home.blockIds.filter(id => w.blocks[id].businessIds.length) .concat(home.blockIds).slice(0, 8));
    const group = styleGroup(rng, style);
    const boss = mkNpc('boss', hq, { group });
    const id = `f${k}`;
    const fname = factionName(rng, style, boss, w.blocks[hq].name.split(' & ')[0]);
    const color = def.colors.find(c => !usedColors.has(c)) ?? def.colors[0]; usedColors.add(color);
    const temperament: Temperament = rng.pick(def.temperaments);
    const f: Faction = {
      id, name: fname.name, short: fname.short, style, temperament, color,
      emblem: { shape: rng.int(0, 4), charge: rng.int(0, 11), fg: '#f4efe6', bg: color },
      bossId: boss.id, lieutenantIds: [], soldiers: rng.int(8, 16) + (temperament === 'aggressive' ? 4 : 0),
      cash: rng.int(8, 22) * 1000, homeDistrictId: home.id, alive: true, standing: temperament === 'aggressive' ? -5 : 0,
      relations: {}, grievances: [],
    };
    boss.faction = id; boss.traits = rollTraits(rng); boss.nerve = Math.max(boss.nerve, 70); boss.wealth = 90;
    const lts = rng.int(2, 3);
    for (let i = 0; i < lts; i++) {
      const lt = mkNpc('lieutenant', rng.pick(home.blockIds), { group: rng.chance(0.7) ? group : undefined, last: rng.chance(0.4) && style === 'family' ? boss.last : undefined });
      lt.faction = id; lt.nerve = Math.max(lt.nerve, 55);
      f.lieutenantIds.push(lt.id);
    }
    w.factions[id] = f;
    // Ground: a solid core around the headquarters, the rest of the district leaning their way,
    // and nothing much past it. The first draft gave them the whole district and a ring around
    // it, and four outfits between them held two-thirds of the city on day one.
    const hqc = w.blocks[hq].center;
    const byDist = home.blockIds.slice().sort((a, b) => Math.hypot(w.blocks[a].center.x - hqc.x, w.blocks[a].center.y - hqc.y) - Math.hypot(w.blocks[b].center.x - hqc.x, w.blocks[b].center.y - hqc.y));
    const core = byDist.slice(0, rng.int(7, 11));
    for (const bid of core) addInfluence(w, bid, id, rng.int(45, 80));
    for (const bid of byDist.slice(core.length)) addInfluence(w, bid, id, rng.int(8, 26));
    for (const bid of core) for (const nb of w.blocks[bid].neighborIds) if (!core.includes(nb) && w.blocks[nb].districtId !== home.id) addInfluence(w, nb, id, rng.int(4, 14));
    // most businesses on their core already pay them
    for (const bid of core) for (const bizId of w.blocks[bid].businessIds) {
      const biz = w.businesses[bizId];
      if (biz.tier < 3 && rng.chance(0.65)) biz.protection = { by: id, rate: rng.int(10, 18) / 100, since: 1 };
    }
  });
  for (const a of Object.values(w.factions)) for (const b of Object.values(w.factions)) if (a.id !== b.id) a.relations[b.id] = b.relations[a.id] ?? rng.int(-30, 25);
}

function minD(d: District, homes: District[]) { return Math.min(...homes.map(h => Math.hypot(h.center.x - d.center.x, h.center.y - d.center.y))); }

/** Somewhere modest, away from every outfit's home turf, with people and doors on it. */
function pickStart(w: World, rng: Rng): Block {
  const homes = new Set(Object.values(w.factions).map(f => f.homeDistrictId));
  const good = Object.values(w.blocks).filter(b => !homes.has(b.districtId) && b.businessIds.length >= 2 && !b.landmark && ['market', 'oldtown', 'projects', 'docks', 'strip', 'suburb'].includes(w.districts[b.districtId].kind));
  const pool = good.length ? good : Object.values(w.blocks).filter(b => b.businessIds.length >= 1 && !homes.has(b.districtId));
  // prefer ground nobody holds yet
  const quiet = pool.filter(b => Object.keys(b.influence).length === 0);
  return rng.pick(quiet.length ? quiet : pool.length ? pool : Object.values(w.blocks));
}

/**
 * Bring a save from an earlier release up to date without changing anything it already had.
 * Additions are generated from their own streams, so an old city gains them exactly as a new one
 * with the same seed would.
 */
export function migrate(w: World): World {
  if (!w.crews) generateStreetCrews(w);
  ensureFixer(w);
  return w;
}

/**
 * Every city has a fixer. The main pass looks for one in a market, old quarter, strip or dock
 * district, and a city generated without any of those had none — no washing before your own laundry,
 * no specialists, ever. This finds one anywhere, from its own stream, so no other part of any seed's
 * city moves.
 */
export function ensureFixer(w: World) {
  if (w.fixerId && w.npcs[w.fixerId]) return;
  const rng = new Rng(w.seed ^ 0xf1ce5);
  const blocks = Object.values(w.blocks).filter(b => b.businessIds.length && !Object.values(w.factions).some(f => f.homeDistrictId === b.districtId));
  const b = rng.pick(blocks.length ? blocks : Object.values(w.blocks).filter(x => x.businessIds.length));
  if (!b) return;
  const pn = personName(rng, rng.pick(NAME_GROUP_IDS));
  const id = nid(w, 'n');
  w.npcs[id] = {
    id, first: pn.first, last: pn.last, nick: nickname(rng), pronoun: pn.pronoun, age: rng.int(35, 64), face: rng.int(1, 2 ** 30),
    role: 'fixer', homeBlockId: b.id, skills: { muscle: 3, brains: rng.int(6, 9), charm: rng.int(6, 9), wheels: 4, tech: rng.int(3, 7) },
    traits: ['quiet', 'greedy'], nerve: 70, wealth: 60, rel: { trust: 0, fear: 0, respect: 0, owes: 0 }, memory: [], ties: [], known: false, alive: true,
  };
  w.fixerId = id;
}
