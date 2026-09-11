import { BUSINESS_DEFS, DISTRICT_DEFS, type DistrictDef } from '@content/businesses';
import { BUSINESS_NAME_PARTS, FACTION_ARCHETYPES, FIRST_NAMES, LAST_NAMES, NICKNAMES, STYLE_LAST } from '@content/names';
import type { GeoCity, GeoBlock } from '@geo/types';
import { hexCity } from '@geo/hexcity';
import { distanceM } from '@geo/project';
import { Rng, hashString } from './rng';
import {
  PLAYER, type Block, type Business, type BusinessType, type District, type DistrictKind, type Faction, type FactionId,
  type Id, type LatLng, type Npc, type Player, type ProductKind, type Skills, type Stance, type Trait, type World,
} from './types';

export const WORLD_VERSION = 2;
export const HEX_SIZE_M = 190;
/** One "step" of distance, for rules written in block units (a hex is ~330 m across). */
export const STEP_M = 330;

export interface NewGameOptions {
  seed?: number;
  origin: LatLng;
  placeName: string;
  playerName: string;
  background: Player['background'];
  city?: GeoCity; // real blocks from OSM; defaults to the hex disc
}

const PRODUCTS: ProductKind[] = ['booze', 'green', 'pills', 'hot_goods', 'counterfeit'];
const TRAITS: Trait[] = ['greedy', 'loyal', 'coward', 'hothead', 'connected', 'honest', 'ambitious', 'junkie', 'gambler', 'quiet'];

export const emptyStash = () => ({ booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 });
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function generateWorld(opts: NewGameOptions): World {
  const seed = opts.seed ?? hashString(`${opts.origin.lat.toFixed(4)},${opts.origin.lng.toFixed(4)}`);
  const rng = new Rng(seed);
  let nextId = 1;
  const nid = (p: string) => `${p}${nextId++}`;
  const city = opts.city ?? hexCity(opts.origin);

  const w: World = {
    version: WORLD_VERSION, seed, rng: seed, day: 1, origin: opts.origin, placeName: opts.placeName, mapSource: city.source, hexSizeM: HEX_SIZE_M,
    districts: {}, blocks: {}, businesses: {}, npcs: {}, rackets: {}, safehouses: {}, productions: {}, ops: {}, factions: {},
    player: {
      name: opts.playerName, background: opts.background, skills: startingSkills(opts.background),
      cash: 2500, dirty: 0, heat: 0, respect: 5, fear: 0, ap: 8, apMax: 8, stash: emptyStash(),
      crewIds: [], safehouseIds: [], businessIds: [], racketIds: [], opIds: [], lawyer: false, jailedDays: 0, busts: 0, launderedToday: 0,
    },
    pendingEvents: [], log: [], nextId: 0,
  };

  // ---- blocks (geometry comes from the city; stats are filled in after districts) ----
  const geoById = new Map<string, GeoBlock>();
  for (const gb of city.blocks) {
    geoById.set(gb.id, gb);
    const b: Block = {
      id: gb.id, hex: gb.hex, polygon: gb.polygon, center: gb.center, areaM2: gb.areaM2, neighborIds: gb.neighborIds.slice(), streetNames: gb.streetNames,
      name: '', districtId: '', wealth: 50, police: 40, heat: 0, population: 50, demand: demandFor(50, 50, 'market'), influence: {}, businessIds: [],
    };
    w.blocks[b.id] = b;
  }
  const blocks = Object.values(w.blocks);
  const distStart = (b: Block) => distanceM(b.center, opts.origin);
  const startBlock = blocks.slice().sort((a, b) => distStart(a) - distStart(b))[0];

  // ---- districts: real neighbourhood names when OSM has them, seeded Voronoi otherwise ----
  const seeds = planDistricts(w, city, rng, startBlock, nid);
  for (const b of blocks) {
    let best = seeds[0]; let bd = Infinity;
    for (const s of seeds) { const d = distanceM(b.center, s.center) * (0.85 + rng.float() * 0.3); if (d < bd) { bd = d; best = s; } }
    const def = best.def;
    b.districtId = best.district.id; best.district.blockIds.push(b.id);
    b.wealth = clamp(rng.gauss((def.wealth[0] + def.wealth[1]) / 2, (def.wealth[1] - def.wealth[0]) / 3));
    b.police = clamp(rng.gauss((def.police[0] + def.police[1]) / 2, (def.police[1] - def.police[0]) / 3));
    b.population = clamp(rng.gauss((def.population[0] + def.population[1]) / 2, 12) * Math.min(1.6, Math.max(0.5, Math.sqrt(b.areaM2 / 60000))), 8, 100);
    b.demand = demandFor(b.wealth, b.population, def.kind);
    b.name = blockName(b, best.district.name, rng);
  }
  // unique block names
  const seenNames = new Map<string, number>();
  for (const b of blocks) { const n = seenNames.get(b.name) ?? 0; seenNames.set(b.name, n + 1); if (n) b.name = `${b.name} ${n + 1}`; }

  // ---- businesses: real POIs first, procedural fill after ----
  const usedBizNames = new Set<string>();
  const poisByBlock = new Map<string, GeoCity['pois']>();
  for (const p of city.pois) { if (!p.blockId) continue; if (!poisByBlock.has(p.blockId)) poisByBlock.set(p.blockId, []); poisByBlock.get(p.blockId)!.push(p); }
  for (const b of blocks) {
    const def = seeds.find(s => s.district.id === b.districtId)!.def;
    const real = (poisByBlock.get(b.id) ?? []).slice(0, 6);
    for (const p of real) addBusiness(rng, w, nid, b, p.type, usedBizNames, p.name);
    const target = rng.int(def.perBlock[0], def.perBlock[1]) * (city.source === 'osm' ? Math.min(1.5, Math.max(0.4, b.areaM2 / 40000)) : 1);
    const mix = Object.entries(def.mix).map(([t, wt]) => ({ item: t as BusinessType, w: wt as number }));
    let guard = 0;
    while (b.businessIds.length < Math.round(target) && guard++ < 12) {
      let type = rng.weighted(mix);
      if ((type === 'bank' || type === 'armored_depot') && (b.wealth < 55 || b.businessIds.some(id => w.businesses[id].type === type))) type = 'restaurant';
      addBusiness(rng, w, nid, b, type, usedBizNames);
    }
    const patronCount = Math.round(2 + b.population / 25 + rng.int(0, 2));
    for (let i = 0; i < patronCount && b.businessIds.length; i++) {
      const p = mkNpc(rng, w, nid, { role: 'patron', homeBlockId: b.id, nerveBias: 40 });
      const favs = rng.shuffle(b.businessIds).slice(0, rng.int(1, 2));
      for (const f of favs) { w.businesses[f].patronIds.push(p.id); p.favouriteBusinessIds.push(f); }
    }
  }

  // ---- factions ----
  const archetypes = rng.shuffle(FACTION_ARCHETYPES).slice(0, 4);
  const homeCandidates = rng.shuffle(seeds.filter(s => s.def.kind !== 'downtown' && s.district.blockIds.length >= 3));
  const factionIds: FactionId[] = [];
  archetypes.forEach((a, i) => {
    const home = homeCandidates[i % Math.max(1, homeCandidates.length)] ?? seeds[0];
    const last = rng.pick(STYLE_LAST[a.style]);
    const f: Faction = {
      id: nid('f'), name: a.name.replace('{L}', last), short: a.short.replace('{L}', last), color: a.color,
      temperament: a.temperament, homeDistrictId: home.district.id, bossId: '', lieutenantIds: [],
      soldiers: rng.int(8, 14), cash: rng.int(15000, 40000), standing: {}, stance: {}, truceUntil: {}, tributeFrom: {}, alive: true, grudges: [],
    };
    const homeBlock = w.blocks[rng.pick(home.district.blockIds)];
    const boss = mkNpc(rng, w, nid, { role: 'boss', homeBlockId: homeBlock.id, faction: f.id, style: a.style, strong: true });
    f.bossId = boss.id;
    for (let k = 0; k < 2; k++) {
      const lt = mkNpc(rng, w, nid, { role: 'lieutenant', homeBlockId: w.blocks[rng.pick(home.district.blockIds)].id, faction: f.id, style: a.style, strong: true });
      f.lieutenantIds.push(lt.id);
    }
    w.factions[f.id] = f; factionIds.push(f.id);
    // influence rings around the home block, measured in steps
    for (const b of blocks) {
      const d = distanceM(b.center, homeBlock.center) / STEP_M;
      const inf = d <= 1.2 ? rng.int(60, 90) : d <= 2.3 ? rng.int(18, 38) : d <= 3.3 ? rng.int(4, 14) : 0;
      if (inf > 0 && b.id !== startBlock.id) b.influence[f.id] = inf;
    }
  });
  for (const a of factionIds) {
    const fa = w.factions[a];
    fa.standing[PLAYER] = 0; fa.stance[PLAYER] = 'peace';
    for (const b of factionIds) if (a !== b) { const s = rng.int(-60, 30); fa.standing[b] = s; fa.stance[b] = stanceFor(s); }
  }
  for (const a of factionIds) for (const b of factionIds) if (a < b) {
    const s = Math.round((w.factions[a].standing[b] + w.factions[b].standing[a]) / 2);
    w.factions[a].standing[b] = s; w.factions[b].standing[a] = s;
    w.factions[a].stance[b] = w.factions[b].stance[a] = stanceFor(s);
  }
  for (const b of blocks) {
    const ctrl = controller(b);
    if (!ctrl) continue;
    for (const bid of b.businessIds) {
      const biz = w.businesses[bid];
      if (BUSINESS_DEFS[biz.type].rackets.includes('protection') && rng.chance(0.55)) {
        biz.protection = { factionId: ctrl, rate: 0.15, since: 1 };
        w.npcs[biz.ownerId].faction = ctrl;
      }
    }
  }

  // ---- officials ----
  const downtown = seeds.find(s => s.def.kind === 'downtown')?.district ?? seeds[0].district;
  const cityHall = w.blocks[downtown.blockIds[0]] ?? startBlock;
  for (const kind of ['captain', 'councillor', 'judge'] as const) {
    const o = mkNpc(rng, w, nid, { role: 'official', homeBlockId: cityHall.id, nerveBias: 70 });
    o.official = { kind, corruption: rng.int(20, 80) };
    o.name = `${kind === 'captain' ? 'Capt.' : kind === 'judge' ? 'Judge' : 'Councillor'} ${o.name.split(' ').slice(-1)[0]}`;
  }

  // ---- player start ----
  if (!startBlock.businessIds.length) addBusiness(rng, w, nid, startBlock, 'bar', usedBizNames);
  startBlock.influence[PLAYER] = 12;
  const friend = startBlock.businessIds.flatMap(id => w.businesses[id].patronIds).map(id => w.npcs[id])[0];
  if (friend) { friend.rel.trust = 45; friend.rel.respect = 30; friend.notes.push('Knew you from before.'); }
  const startOwner = w.npcs[w.businesses[startBlock.businessIds[0]].ownerId];
  startOwner.rel.trust = 20; startOwner.rel.respect = 15;

  w.nextId = nextId; w.rng = rng.state;
  w.log.push({ day: 1, text: `You arrive in ${opts.placeName}. ${startBlock.name} is where you'll start. Nobody knows your name yet.`, tone: 'info', refs: { blockId: startBlock.id } });
  return w;
}

// ---------- districts ----------
interface Seed { center: LatLng; district: District; def: DistrictDef }

function planDistricts(w: World, city: GeoCity, rng: Rng, startBlock: Block, nid: (p: string) => string): Seed[] {
  const blocks = Object.values(w.blocks);
  const usedNames = new Set<string>();
  const seeds: Seed[] = [];
  const centreDef = DISTRICT_DEFS.find(d => d.kind === 'downtown')!;
  const mk = (def: DistrictDef, center: LatLng, name?: string) => {
    const nm = name ?? rng.pick(def.names.filter(n => !usedNames.has(n)) ?? def.names);
    usedNames.add(nm);
    const d: District = { id: nid('d'), kind: def.kind, name: nm, blockIds: [] };
    w.districts[d.id] = d; seeds.push({ center, district: d, def });
  };
  // real neighbourhoods within the play area, at least 700 m apart
  const places: GeoCity['places'] = [];
  for (const p of city.places) {
    if (!blocks.some(b => distanceM(b.center, p.pos) < 400)) continue;   // outside the play area
    if (places.some(q => distanceM(q.pos, p.pos) < 450)) continue;       // too close to one we kept
    places.push(p); if (places.length >= 8) break;
  }
  if (places.length >= 4) {
    const kinds = inferKinds(w, city, places.map(p => p.pos), rng);
    places.forEach((p, i) => mk(kinds[i], p.pos, p.name));
    // make sure the start is in a downtown-ish district for a fair opening
    if (!seeds.some(s => s.def.kind === 'downtown')) { const nearest = seeds.slice().sort((a, b) => distanceM(a.center, startBlock.center) - distanceM(b.center, startBlock.center))[0]; nearest.def = centreDef; nearest.district.kind = 'downtown'; }
    return seeds;
  }
  const districtCount = Math.max(4, Math.min(7, Math.round(blocks.length / 18)));
  const ringDefs = rng.shuffle(DISTRICT_DEFS.filter(d => d.kind !== 'downtown')).slice(0, districtCount - 1);
  mk(centreDef, startBlock.center);
  const far = blocks.filter(b => { const d = distanceM(b.center, startBlock.center); return d >= 3 * STEP_M && d <= 5.5 * STEP_M; });
  const pool = rng.shuffle(far.length ? far : blocks);
  const placed: LatLng[] = [startBlock.center];
  for (const def of ringDefs) {
    const pick = pool.find(b => placed.every(p => distanceM(p, b.center) >= 2.5 * STEP_M)) ?? pool[placed.length % pool.length];
    if (!pick) break;
    placed.push(pick.center); mk(def, pick.center);
  }
  return seeds;
}

/** Guess what kind of neighbourhood each real place is from what OSM says is there. */
function inferKinds(w: World, city: GeoCity, centers: LatLng[], rng: Rng): DistrictDef[] {
  const defs = new Map(DISTRICT_DEFS.map(d => [d.kind, d]));
  const counts = centers.map(() => ({ bank: 0, night: 0, food: 0, shop: 0, ind: 0, water: 0, hotel: 0, jewel: 0, total: 0 }));
  const nearest = (p: LatLng) => { let bi = 0, bd = Infinity; centers.forEach((c, i) => { const d = distanceM(c, p); if (d < bd) { bd = d; bi = i; } }); return bi; };
  for (const p of city.pois) {
    const c = counts[nearest(p.pos)]; c.total++;
    if (p.type === 'bank') c.bank++; else if (p.type === 'nightclub' || p.type === 'bar') c.night++; else if (p.type === 'restaurant' || p.type === 'diner') c.food++;
    else if (p.type === 'corner_store' || p.type === 'barbershop' || p.type === 'laundromat' || p.type === 'pawn') c.shop++; else if (p.type === 'warehouse' || p.type === 'garage') c.ind++;
    else if (p.type === 'motel') c.hotel++; else if (p.type === 'jeweller') c.jewel++;
  }
  for (const id of city.industrialBlockIds) counts[nearest(w.blocks[id].center)].ind += 2;
  for (const id of city.waterAdjacentBlockIds) counts[nearest(w.blocks[id].center)].water++;
  const scores = counts.map(c => {
    const t = Math.max(1, c.total);
    const s: Record<DistrictKind, number> = {
      downtown: c.bank * 3 + c.hotel + c.jewel * 2 + c.total * 0.2,
      strip: c.night * 3 + c.hotel,
      old_quarter: c.food * 2 + c.shop * 0.5,
      market: c.shop * 2 + c.food * 0.5,
      industrial: c.ind * 3 - c.food,
      docks: c.water * 2 + c.ind * 1.5,
      heights: c.jewel * 2 + c.hotel + (t < 6 ? 2 : 0),
      projects: c.shop * 1.5 - c.bank * 2 + (t < 4 ? 2 : 0),
    };
    for (const k of Object.keys(s) as DistrictKind[]) s[k] += rng.float() * 1.5;
    return s;
  });
  // greedy assignment: highest score first, each kind at most twice, downtown exactly once
  const out: (DistrictDef | undefined)[] = centers.map(() => undefined);
  const used = new Map<DistrictKind, number>();
  const pairs: { i: number; k: DistrictKind; v: number }[] = [];
  scores.forEach((s, i) => { for (const k of Object.keys(s) as DistrictKind[]) pairs.push({ i, k, v: s[k] }); });
  pairs.sort((a, b) => b.v - a.v);
  for (const p of pairs) {
    if (out[p.i]) continue;
    const cap = p.k === 'downtown' ? 1 : 2;
    if ((used.get(p.k) ?? 0) >= cap) continue;
    out[p.i] = defs.get(p.k); used.set(p.k, (used.get(p.k) ?? 0) + 1);
  }
  return out.map(d => d ?? defs.get('market')!);
}

// ---------- helpers ----------
export function controller(b: Block): FactionId | undefined {
  let best: FactionId | undefined; let bv = 0;
  for (const [f, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = f; }
  return bv >= 30 ? best : undefined;
}

export function stanceFor(standing: number): Stance {
  if (standing >= 70) return 'alliance';
  if (standing >= -15) return 'peace';
  if (standing >= -45) return 'tension';
  if (standing >= -75) return 'beef';
  return 'war';
}

function startingSkills(bg: Player['background']): Skills {
  const s = { muscle: 4, brains: 4, charm: 4, wheels: 3, tech: 2 };
  if (bg === 'muscle') s.muscle = 8; else if (bg === 'brains') { s.brains = 8; s.tech = 4; } else s.charm = 8;
  return s;
}

function demandFor(wealth: number, population: number, kind: string): Record<ProductKind, number> {
  const base = population / 20;
  const d: Record<ProductKind, number> = { booze: base * 1.2, green: base, pills: base * (wealth / 100), hot_goods: base * 0.5, counterfeit: base * 0.6 };
  if (kind === 'strip') { d.pills *= 2; d.booze *= 1.5; }
  if (kind === 'projects') { d.green *= 1.5; d.pills *= 0.7; }
  if (kind === 'heights') { d.pills *= 1.5; d.hot_goods *= 1.5; }
  for (const k of PRODUCTS) d[k] = Math.round(d[k] * 10) / 10;
  return d;
}

function blockName(b: Block, districtName: string, rng: Rng): string {
  const s = b.streetNames.map(shortStreet);
  if (s.length >= 2) return `${s[0]} & ${s[1]}`;
  if (s.length === 1) return `${s[0]} block`;
  if (b.hex) { const cols = 'ABCDEFGHIJKLMNOPQ'; return `${districtName} ${cols[b.hex.q + 8] ?? 'X'}${b.hex.r + 7}`; }
  return `${districtName} ${rng.int(1, 99)}`;
}
function shortStreet(n: string): string {
  let s = n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bBoulevard\b/, 'Blvd').replace(/\bRoad\b/, 'Rd').replace(/\bDrive\b/, 'Dr').replace(/\bPlace\b/, 'Pl');
  // "West 42nd St" → "W 42nd St", but "South St" stays as it is
  if (s.split(' ').length >= 3) s = s.replace(/^(North|South|East|West)\b/, m => m[0]);
  return s.length > 22 ? s.slice(0, 21) + '…' : s;
}

function addBusiness(rng: Rng, w: World, nid: (p: string) => string, b: Block, type: BusinessType, used: Set<string>, realName?: string): Business {
  const bd = BUSINESS_DEFS[type];
  const income = Math.round(rng.int(bd.income[0], bd.income[1]) * (0.6 + b.wealth / 125));
  const owner = mkNpc(rng, w, nid, { role: 'owner', homeBlockId: b.id, nerveBias: bd.nerve });
  let name = realName && !used.has(realName) ? realName : bizName(rng, type, owner, used);
  used.add(name);
  if (name.length > 34) name = name.slice(0, 32) + '…';
  const biz: Business = {
    id: nid('z'), name, type, blockId: b.id, ownerId: owner.id, patronIds: [],
    baseIncome: income, value: Math.max(1500, Math.round(income * bd.valueMult / 100) * 100), condition: rng.int(60, 100),
    ownedBy: 'npc', racketIds: [], insured: rng.chance(0.35), flags: realName ? ['real'] : [],
  };
  w.businesses[biz.id] = biz; b.businessIds.push(biz.id);
  return biz;
}

interface NpcOpts { role: Npc['role']; homeBlockId: Id; faction?: FactionId; style?: string; strong?: boolean; nerveBias?: number }
export function mkNpc(rng: Rng, w: World, nid: (p: string) => string, o: NpcOpts): Npc {
  const first = rng.pick(FIRST_NAMES);
  const last = o.style ? rng.pick(STYLE_LAST[o.style]) : rng.pick(LAST_NAMES);
  const nick = (o.role === 'boss' || o.role === 'lieutenant' || rng.chance(0.15)) ? ` "${rng.pick(NICKNAMES)}"` : '';
  const sk = (base: number) => clamp(Math.round(rng.gauss(base, 2)), 1, 10);
  const strong = o.strong ? 3 : 0;
  const traits = rng.shuffle(TRAITS).slice(0, 2);
  const nerve = clamp(Math.round(rng.gauss(o.nerveBias ?? 45, 15) + (traits.includes('coward') ? -20 : 0) + (traits.includes('hothead') ? 15 : 0) + strong * 5));
  const n: Npc = {
    id: nid('n'), name: `${first}${nick} ${last}`, role: o.role, traits,
    skills: { muscle: sk(4 + strong), brains: sk(4 + strong / 2), charm: sk(4), wheels: sk(3), tech: sk(2) },
    homeBlockId: o.homeBlockId, faction: o.faction, favouriteBusinessIds: [],
    rel: { trust: 0, fear: 0, respect: 0 }, nerve, alive: true, notes: [],
  };
  w.npcs[n.id] = n;
  return n;
}

function bizName(rng: Rng, type: BusinessType, owner: Npc, used: Set<string>): string {
  const parts = BUSINESS_NAME_PARTS[type];
  for (let i = 0; i < 8; i++) {
    const a = rng.pick(parts[0]), b = rng.pick(parts[1]);
    const name = rng.chance(0.25) && !['bank', 'armored_depot', 'nightclub'].includes(type)
      ? `${owner.name.split(' ').slice(-1)[0]}'s ${b}` : `${a} ${b}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  return `${owner.name.split(' ').slice(-1)[0]} & Sons`;
}
