import { BUSINESS_DEFS, DISTRICT_DEFS } from '@content/businesses';
import { BUSINESS_NAME_PARTS, FACTION_ARCHETYPES, FIRST_NAMES, LAST_NAMES, NICKNAMES, STYLE_LAST } from '@content/names';
import { hexCenter, hexDistance, hexKey, spiral } from './hex';
import { Rng, hashString } from './rng';
import {
  PLAYER, type Block, type Business, type BusinessType, type District, type Faction, type FactionId,
  type Id, type LatLng, type Npc, type Player, type ProductKind, type Skills, type Stance, type Trait, type World,
} from './types';

export const WORLD_VERSION = 1;
export const GRID_RADIUS = 6;
export const HEX_SIZE_M = 190; // circumradius; ~330m across flats

export interface NewGameOptions {
  seed?: number;
  origin: LatLng;
  placeName: string;
  playerName: string;
  background: Player['background'];
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

  const w: World = {
    version: WORLD_VERSION, seed, rng: seed, day: 1, origin: opts.origin, placeName: opts.placeName, hexSizeM: HEX_SIZE_M,
    districts: {}, blocks: {}, businesses: {}, npcs: {}, rackets: {}, safehouses: {}, productions: {}, ops: {}, factions: {},
    player: {
      name: opts.playerName, background: opts.background, skills: startingSkills(opts.background),
      cash: 2500, dirty: 0, heat: 0, respect: 5, fear: 0, ap: 8, apMax: 8, stash: emptyStash(),
      crewIds: [], safehouseIds: [], businessIds: [], racketIds: [], opIds: [], lawyer: false, jailedDays: 0, busts: 0, launderedToday: 0,
    },
    pendingEvents: [], log: [], nextId: 0,
  };

  // ---- districts via Voronoi over hex seeds ----
  const hexes = spiral(GRID_RADIUS);
  const defs = rng.shuffle(DISTRICT_DEFS);
  const districtCount = 7;
  const usedNames = new Set<string>();
  const seeds: { hex: { q: number; r: number }; district: District; def: typeof DISTRICT_DEFS[number] }[] = [];
  // downtown always near the centre; others ring around
  const centreDef = DISTRICT_DEFS.find(d => d.kind === 'downtown')!;
  const ringDefs = defs.filter(d => d.kind !== 'downtown').slice(0, districtCount - 1);
  const ringHexes = rng.shuffle(hexes.filter(h => hexDistance(h, { q: 0, r: 0 }) >= 3 && hexDistance(h, { q: 0, r: 0 }) <= 5));
  const placed: { q: number; r: number }[] = [];
  const pickSeed = () => {
    for (const h of ringHexes) if (placed.every(p => hexDistance(p, h) >= 3)) { placed.push(h); return h; }
    return ringHexes[placed.length % ringHexes.length];
  };
  const mkDistrict = (def: typeof DISTRICT_DEFS[number], hex: { q: number; r: number }) => {
    const name = rng.pick(def.names.filter(n => !usedNames.has(n)));
    usedNames.add(name);
    const d: District = { id: nid('d'), kind: def.kind, name, blockIds: [] };
    w.districts[d.id] = d; seeds.push({ hex, district: d, def });
  };
  mkDistrict(centreDef, { q: rng.int(-1, 1), r: rng.int(-1, 1) });
  for (const def of ringDefs) mkDistrict(def, pickSeed());

  // ---- blocks ----
  const blockByHex = new Map<string, Block>();
  for (const h of hexes) {
    let best = seeds[0]; let bd = Infinity;
    for (const s of seeds) { const d = hexDistance(h, s.hex) + rng.float() * 0.8; if (d < bd) { bd = d; best = s; } }
    const def = best.def;
    const wealth = clamp(rng.gauss((def.wealth[0] + def.wealth[1]) / 2, (def.wealth[1] - def.wealth[0]) / 3));
    const police = clamp(rng.gauss((def.police[0] + def.police[1]) / 2, (def.police[1] - def.police[0]) / 3));
    const population = clamp(rng.gauss((def.population[0] + def.population[1]) / 2, 12), 10, 100);
    const b: Block = {
      id: nid('b'), hex: h, center: hexCenter(opts.origin, h, HEX_SIZE_M), name: '', districtId: best.district.id,
      wealth, police, heat: 0, population, demand: demandFor(wealth, population, def.kind),
      influence: {}, businessIds: [],
    };
    b.name = `${best.district.name} ${blockLabel(h)}`;
    w.blocks[b.id] = b; blockByHex.set(hexKey(h), b); best.district.blockIds.push(b.id);
  }

  // ---- businesses + owners + patrons ----
  const usedBizNames = new Set<string>();
  for (const b of Object.values(w.blocks)) {
    const def = seeds.find(s => s.district.id === b.districtId)!.def;
    const n = rng.int(def.perBlock[0], def.perBlock[1]);
    const mix = Object.entries(def.mix).map(([t, wt]) => ({ item: t as BusinessType, w: wt as number }));
    for (let i = 0; i < n; i++) {
      let type = rng.weighted(mix);
      // rare types: at most one bank / depot per block, none in poor blocks
      if ((type === 'bank' || type === 'armored_depot') && (b.wealth < 55 || b.businessIds.some(id => w.businesses[id].type === type))) type = 'restaurant';
      const bd = BUSINESS_DEFS[type];
      const income = Math.round(rng.int(bd.income[0], bd.income[1]) * (0.6 + b.wealth / 125));
      const owner = mkNpc(rng, w, nid, { role: 'owner', homeBlockId: b.id, nerveBias: bd.nerve });
      const biz: Business = {
        id: nid('z'), name: bizName(rng, type, owner, usedBizNames), type, blockId: b.id, ownerId: owner.id, patronIds: [],
        baseIncome: income, value: Math.max(1500, Math.round(income * bd.valueMult / 100) * 100), condition: rng.int(60, 100),
        ownedBy: 'npc', racketIds: [], insured: rng.chance(0.35), flags: [],
      };
      w.businesses[biz.id] = biz; b.businessIds.push(biz.id);
    }
    // patrons: shared across the block's businesses
    const patronCount = Math.round(2 + b.population / 25 + rng.int(0, 2));
    for (let i = 0; i < patronCount && b.businessIds.length; i++) {
      const p = mkNpc(rng, w, nid, { role: 'patron', homeBlockId: b.id, nerveBias: 40 });
      const favs = rng.shuffle(b.businessIds).slice(0, rng.int(1, 2));
      for (const f of favs) { w.businesses[f].patronIds.push(p.id); p.favouriteBusinessIds.push(f); }
    }
  }

  // ---- factions ----
  const archetypes = rng.shuffle(FACTION_ARCHETYPES).slice(0, 4);
  const homeCandidates = rng.shuffle(seeds.filter(s => s.def.kind !== 'downtown'));
  const factionIds: FactionId[] = [];
  archetypes.forEach((a, i) => {
    const home = homeCandidates[i % homeCandidates.length];
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
    // influence: home district strong, falloff outward
    for (const b of Object.values(w.blocks)) {
      const d = hexDistance(b.hex, home.hex);
      const inf = d <= 1 ? rng.int(60, 90) : d === 2 ? rng.int(18, 38) : d === 3 ? rng.int(4, 14) : 0;
      if (inf > 0) b.influence[f.id] = inf;
    }
  });
  // standings between factions
  for (const a of factionIds) {
    const fa = w.factions[a];
    fa.standing[PLAYER] = 0; fa.stance[PLAYER] = 'peace';
    for (const b of factionIds) if (a !== b) {
      const s = rng.int(-60, 30);
      fa.standing[b] = s; fa.stance[b] = stanceFor(s);
    }
  }
  // make stances symmetric
  for (const a of factionIds) for (const b of factionIds) if (a < b) {
    const s = Math.round((w.factions[a].standing[b] + w.factions[b].standing[a]) / 2);
    w.factions[a].standing[b] = s; w.factions[b].standing[a] = s;
    w.factions[a].stance[b] = w.factions[b].stance[a] = stanceFor(s);
  }
  // protection rackets for factions in blocks they control
  for (const b of Object.values(w.blocks)) {
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
  const downtown = seeds.find(s => s.def.kind === 'downtown')!.district;
  const cityHall = w.blocks[downtown.blockIds[0]];
  for (const kind of ['captain', 'councillor', 'judge'] as const) {
    const o = mkNpc(rng, w, nid, { role: 'official', homeBlockId: cityHall.id, nerveBias: 70 });
    o.official = { kind, corruption: rng.int(20, 80) };
    o.name = `${kind === 'captain' ? 'Capt.' : kind === 'judge' ? 'Judge' : 'Councillor'} ${o.name.split(' ').slice(-1)[0]}`;
  }

  // ---- player start: centre block, one friendly patron ----
  const start = blockByHex.get(hexKey({ q: 0, r: 0 }))!;
  start.influence[PLAYER] = 12;
  const friend = start.businessIds.flatMap(id => w.businesses[id].patronIds).map(id => w.npcs[id])[0];
  if (friend) { friend.rel.trust = 45; friend.rel.respect = 30; friend.notes.push('Knew you from before.'); }
  const startOwner = w.npcs[w.businesses[start.businessIds[0]].ownerId];
  startOwner.rel.trust = 20; startOwner.rel.respect = 15;

  w.nextId = nextId; w.rng = rng.state;
  w.log.push({ day: 1, text: `You arrive in ${opts.placeName}. ${start.name} is where you'll start. Nobody knows your name yet.`, tone: 'info', refs: { blockId: start.id } });
  return w;
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

function blockLabel(h: { q: number; r: number }): string {
  const cols = 'ABCDEFGHIJKLMNOPQ';
  return `${cols[h.q + GRID_RADIUS + 2] ?? 'X'}${h.r + GRID_RADIUS + 1}`;
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
