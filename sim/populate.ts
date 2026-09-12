/**
 * Fill a freshly loaded chunk with districts, businesses, people and (sometimes)
 * a new faction. Deterministic given the world's RNG state and the chunk data.
 */
import { BUSINESS_DEFS, DISTRICT_DEFS, type DistrictDef } from '@content/businesses';
import { BUSINESS_NAME_PARTS, FACTION_ARCHETYPES, FIRST_NAMES, LAST_NAMES, NICKNAMES, STYLE_LAST } from '@content/names';
import type { GeoChunk } from '@geo/chunks';
import { distanceM } from '@geo/project';
import type { Rng } from './rng';
import {
  PLAYER, type Block, type Business, type BusinessType, type District, type DistrictKind, type Faction, type FactionId,
  type Id, type LatLng, type Npc, type ProductKind, type Trait, type World,
} from './types';

export const STEP_M = 330;
export const MAX_FACTIONS = 10;
const PRODUCTS: ProductKind[] = ['booze', 'green', 'pills', 'hot_goods', 'counterfeit'];
const TRAITS: Trait[] = ['greedy', 'loyal', 'coward', 'hothead', 'connected', 'honest', 'ambitious', 'junkie', 'gambler', 'quiet'];
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface PopulateOptions { first?: boolean; factionCount?: number; startAt?: LatLng }

export function populateChunk(w: World, chunk: GeoChunk, rng: Rng, opts: PopulateOptions = {}): Block[] {
  if (w.chunks[chunk.key]) return [];
  const nid = (p: string) => `${p}${w.nextId++}`;
  // ---- blocks + adjacency (within the chunk, and to already-loaded neighbours via shared edges) ----
  const edgeIndex = new Map<string, Id>();
  for (const b of Object.values(w.blocks)) for (const e of b.edgeKeys) edgeIndex.set(e, b.id);
  const added: Block[] = [];
  for (const gb of chunk.blocks) {
    if (w.blocks[gb.id]) continue;
    const b: Block = {
      id: gb.id, hex: gb.hex, chunkKey: chunk.key, polygon: gb.polygon, center: gb.center, areaM2: gb.areaM2,
      neighborIds: gb.neighborIds.filter(id => chunk.blocks.some(x => x.id === id)), edgeKeys: gb.edgeKeys ?? [], streetNames: gb.streetNames,
      name: '', districtId: '', wealth: 50, police: 40, heat: 0, population: 50, demand: demandFor(50, 50, 'market'), influence: {}, businessIds: [],
    };
    for (const e of b.edgeKeys) {
      const other = edgeIndex.get(e);
      if (other && other !== b.id && w.blocks[other]) { if (!b.neighborIds.includes(other)) b.neighborIds.push(other); if (!w.blocks[other].neighborIds.includes(b.id)) w.blocks[other].neighborIds.push(b.id); }
    }
    w.blocks[b.id] = b; added.push(b);
  }
  if (!added.length) { w.chunks[chunk.key] = { key: chunk.key, source: chunk.source, populatedDay: w.day, districtIds: [] }; return []; }

  // ---- districts ----
  const anchor = opts.startAt ?? added[0].center;
  const seeds = planDistricts(w, chunk, added, rng, anchor, nid, !!opts.first);
  for (const b of added) {
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
  const seenNames = new Map<string, number>();
  for (const b of Object.values(w.blocks)) { const n = seenNames.get(b.name) ?? 0; seenNames.set(b.name, n + 1); if (n) b.name = `${b.name} ${n + 1}`; }

  // ---- businesses: real POIs first, procedural fill after ----
  const used = new Set(Object.values(w.businesses).map(b => b.name));
  const poisByBlock = new Map<string, GeoChunk['pois']>();
  for (const p of chunk.pois) { if (!p.blockId) continue; if (!poisByBlock.has(p.blockId)) poisByBlock.set(p.blockId, []); poisByBlock.get(p.blockId)!.push(p); }
  for (const b of added) {
    const def = seeds.find(s => s.district.id === b.districtId)!.def;
    for (const p of (poisByBlock.get(b.id) ?? []).slice(0, 6)) addBusiness(rng, w, nid, b, p.type, used, p.name);
    const target = rng.int(def.perBlock[0], def.perBlock[1]) * (chunk.source === 'osm' ? Math.min(1.5, Math.max(0.4, b.areaM2 / 40000)) : 1);
    const mix = Object.entries(def.mix).map(([t, wt]) => ({ item: t as BusinessType, w: wt as number }));
    let guard = 0;
    while (b.businessIds.length < Math.round(target) && guard++ < 12) {
      let type = rng.weighted(mix);
      if ((type === 'bank' || type === 'armored_depot') && (b.wealth < 55 || b.businessIds.some(id => w.businesses[id].type === type))) type = 'restaurant';
      addBusiness(rng, w, nid, b, type, used);
    }
    const patronCount = Math.round(2 + b.population / 25 + rng.int(0, 2));
    for (let i = 0; i < patronCount && b.businessIds.length; i++) {
      const p = mkNpc(rng, w, nid, { role: 'patron', homeBlockId: b.id, nerveBias: 40 });
      for (const f of rng.shuffle(b.businessIds).slice(0, rng.int(1, 2))) { w.businesses[f].patronIds.push(p.id); p.favouriteBusinessIds.push(f); }
    }
  }

  // ---- factions: several on the first chunk, sometimes one more in a new area ----
  const want = opts.first ? (opts.factionCount ?? clamp(Math.round(added.length / 45), 1, 4)) : (Object.keys(w.factions).length < MAX_FACTIONS && added.length >= 30 && rng.chance(0.55) ? 1 : 0);
  const usedArch = new Set(Object.values(w.factions).map(f => f.short));
  const homes = rng.shuffle(seeds.filter(s => s.def.kind !== 'downtown' && s.district.blockIds.length >= 3));
  for (let i = 0; i < want; i++) {
    const arch = rng.shuffle(FACTION_ARCHETYPES).find(a => !usedArch.has(a.short.replace('{L}', ''))) ?? rng.pick(FACTION_ARCHETYPES);
    const home = homes[i % Math.max(1, homes.length)] ?? seeds[0];
    const f = spawnFaction(w, rng, nid, arch, home.district, opts.startAt);
    usedArch.add(arch.short.replace('{L}', ''));
    if (!opts.first) w.log.push({ day: w.day, text: `${f.name} run ${home.district.name}. New turf, new people to deal with.`, tone: 'warn', refs: { factionId: f.id } });
  }
  // stances between factions
  const ids = Object.keys(w.factions);
  for (const a of ids) for (const b of ids) if (a < b && w.factions[a].standing[b] === undefined) {
    const s = rng.int(-60, 30); w.factions[a].standing[b] = w.factions[b].standing[a] = s; w.factions[a].stance[b] = w.factions[b].stance[a] = stanceFor(s);
  }
  // protection rackets for whoever controls each new block
  for (const b of added) {
    const ctrl = controller(b); if (!ctrl) continue;
    for (const bid of b.businessIds) {
      const biz = w.businesses[bid];
      if (BUSINESS_DEFS[biz.type].rackets.includes('protection') && rng.chance(0.55)) { biz.protection = { factionId: ctrl, rate: 0.15, since: w.day }; w.npcs[biz.ownerId].faction = ctrl; }
    }
  }
  w.chunks[chunk.key] = { key: chunk.key, source: chunk.source, populatedDay: w.day, districtIds: seeds.map(s => s.district.id) };
  return added;
}

function spawnFaction(w: World, rng: Rng, nid: (p: string) => string, arch: typeof FACTION_ARCHETYPES[number], home: District, avoid?: LatLng): Faction {
  const last = rng.pick(STYLE_LAST[arch.style]);
  const f: Faction = {
    id: nid('f'), name: arch.name.replace('{L}', last), short: arch.short.replace('{L}', last), color: arch.color,
    temperament: arch.temperament, homeDistrictId: home.id, bossId: '', lieutenantIds: [],
    soldiers: rng.int(8, 14), cash: rng.int(15000, 40000), standing: { [PLAYER]: 0 }, stance: { [PLAYER]: 'peace' }, truceUntil: {}, tributeFrom: {}, alive: true, grudges: [],
  };
  const homeBlock = w.blocks[rng.pick(home.blockIds)];
  f.bossId = mkNpc(rng, w, nid, { role: 'boss', homeBlockId: homeBlock.id, faction: f.id, style: arch.style, strong: true }).id;
  for (let k = 0; k < 2; k++) f.lieutenantIds.push(mkNpc(rng, w, nid, { role: 'lieutenant', homeBlockId: w.blocks[rng.pick(home.blockIds)].id, faction: f.id, style: arch.style, strong: true }).id);
  w.factions[f.id] = f;
  // starting turf: home block and neighbours strong, next ring weak
  const ring = new Map<string, number>([[homeBlock.id, 0]]);
  let frontier = [homeBlock.id];
  for (let depth = 1; depth <= 3; depth++) { const next: string[] = []; for (const id of frontier) for (const n of w.blocks[id].neighborIds) if (!ring.has(n)) { ring.set(n, depth); next.push(n); } frontier = next; }
  for (const [id, d] of ring) {
    const b = w.blocks[id];
    if (avoid && distanceM(b.center, avoid) < 120) continue; // never on the player's doorstep
    if (controller(b) && controller(b) !== f.id) continue;
    b.influence[f.id] = d <= 1 ? rng.int(60, 90) : d === 2 ? rng.int(18, 38) : rng.int(4, 14);
  }
  return f;
}

// ---------- districts ----------
interface Seed { center: LatLng; district: District; def: DistrictDef }

function planDistricts(w: World, chunk: GeoChunk, blocks: Block[], rng: Rng, anchor: LatLng, nid: (p: string) => string, first: boolean): Seed[] {
  const usedNames = new Set(Object.values(w.districts).map(d => d.name));
  const seeds: Seed[] = [];
  const centreDef = DISTRICT_DEFS.find(d => d.kind === 'downtown')!;
  const mk = (def: DistrictDef, center: LatLng, name?: string) => {
    const fresh = def.names.filter(n => !usedNames.has(n));
    const nm = name ?? (fresh.length ? rng.pick(fresh) : `${rng.pick(def.names)} ${rng.int(2, 9)}`);
    usedNames.add(nm);
    const d: District = { id: nid('d'), kind: def.kind, name: nm, blockIds: [], chunkKey: chunk.key };
    w.districts[d.id] = d; seeds.push({ center, district: d, def });
  };
  const places: GeoChunk['places'] = [];
  for (const p of chunk.places) {
    if (!blocks.some(b => distanceM(b.center, p.pos) < 400)) continue;
    if (places.some(q => distanceM(q.pos, p.pos) < 450)) continue;
    if (usedNames.has(p.name)) continue;
    places.push(p); if (places.length >= 6) break;
  }
  const hasDowntown = Object.values(w.districts).some(d => d.kind === 'downtown');
  if (places.length >= 3) {
    const kinds = inferKinds(w, chunk, places.map(p => p.pos), rng, hasDowntown);
    places.forEach((p, i) => mk(kinds[i], p.pos, p.name));
    if (first && !seeds.some(s => s.def.kind === 'downtown')) { const nearest = seeds.slice().sort((a, b) => distanceM(a.center, anchor) - distanceM(b.center, anchor))[0]; nearest.def = centreDef; nearest.district.kind = 'downtown'; }
    return seeds;
  }
  const count = Math.max(2, Math.min(5, Math.round(blocks.length / 30)));
  const pool = rng.shuffle(DISTRICT_DEFS.filter(d => d.kind !== 'downtown' || (first && !hasDowntown)));
  const defs = first ? [centreDef, ...pool.filter(d => d.kind !== 'downtown').slice(0, count - 1)] : pool.filter(d => d.kind !== 'downtown').slice(0, count);
  const placed: LatLng[] = [];
  defs.forEach((def, i) => {
    const center = i === 0 && first ? anchor : (rng.shuffle(blocks).find(b => placed.every(p => distanceM(p, b.center) >= 2.5 * STEP_M)) ?? rng.pick(blocks)).center;
    placed.push(center); mk(def, center);
  });
  return seeds;
}

function inferKinds(w: World, chunk: GeoChunk, centers: LatLng[], rng: Rng, hasDowntown: boolean): DistrictDef[] {
  const defs = new Map(DISTRICT_DEFS.map(d => [d.kind, d]));
  const counts = centers.map(() => ({ bank: 0, night: 0, food: 0, shop: 0, ind: 0, water: 0, hotel: 0, jewel: 0, total: 0 }));
  const nearest = (p: LatLng) => { let bi = 0, bd = Infinity; centers.forEach((c, i) => { const d = distanceM(c, p); if (d < bd) { bd = d; bi = i; } }); return bi; };
  for (const p of chunk.pois) {
    const c = counts[nearest(p.pos)]; c.total++;
    if (p.type === 'bank') c.bank++; else if (p.type === 'nightclub' || p.type === 'bar') c.night++; else if (p.type === 'restaurant' || p.type === 'diner') c.food++;
    else if (p.type === 'corner_store' || p.type === 'barbershop' || p.type === 'laundromat' || p.type === 'pawn') c.shop++; else if (p.type === 'warehouse' || p.type === 'garage') c.ind++;
    else if (p.type === 'motel') c.hotel++; else if (p.type === 'jeweller') c.jewel++;
  }
  for (const id of chunk.industrialBlockIds) if (w.blocks[id]) counts[nearest(w.blocks[id].center)].ind += 2;
  for (const id of chunk.waterAdjacentBlockIds) if (w.blocks[id]) counts[nearest(w.blocks[id].center)].water++;
  const scores = counts.map(c => {
    const t = Math.max(1, c.total);
    const s: Record<DistrictKind, number> = {
      downtown: hasDowntown ? -99 : c.bank * 3 + c.hotel + c.jewel * 2 + c.total * 0.2,
      strip: c.night * 3 + c.hotel, old_quarter: c.food * 2 + c.shop * 0.5, market: c.shop * 2 + c.food * 0.5,
      industrial: c.ind * 3 - c.food, docks: c.water * 2 + c.ind * 1.5, heights: c.jewel * 2 + c.hotel + (t < 6 ? 2 : 0), projects: c.shop * 1.5 - c.bank * 2 + (t < 4 ? 2 : 0),
    };
    for (const k of Object.keys(s) as DistrictKind[]) s[k] += rng.float() * 1.5;
    return s;
  });
  const out: (DistrictDef | undefined)[] = centers.map(() => undefined);
  const used = new Map<DistrictKind, number>();
  const pairs: { i: number; k: DistrictKind; v: number }[] = [];
  scores.forEach((s, i) => { for (const k of Object.keys(s) as DistrictKind[]) pairs.push({ i, k, v: s[k] }); });
  pairs.sort((a, b) => b.v - a.v);
  for (const p of pairs) { if (out[p.i]) continue; const cap = p.k === 'downtown' ? 1 : 2; if ((used.get(p.k) ?? 0) >= cap) continue; out[p.i] = defs.get(p.k); used.set(p.k, (used.get(p.k) ?? 0) + 1); }
  return out.map(d => d ?? defs.get('market')!);
}

// ---------- shared helpers ----------
export function controller(b: Block): FactionId | undefined {
  let best: FactionId | undefined; let bv = 0;
  for (const [f, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = f; }
  return bv >= 30 ? best : undefined;
}
export function stanceFor(standing: number) {
  if (standing >= 70) return 'alliance' as const; if (standing >= -15) return 'peace' as const;
  if (standing >= -45) return 'tension' as const; if (standing >= -75) return 'beef' as const; return 'war' as const;
}
export function demandFor(wealth: number, population: number, kind: string): Record<ProductKind, number> {
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
  if (b.hex) { const cols = 'ABCDEFGHIJKLMNOPQRSTUV'; return `${districtName} ${cols[b.hex.q + 10] ?? 'X'}${b.hex.r + 10}`; }
  return `${districtName} ${rng.int(1, 99)}`;
}
function shortStreet(n: string): string {
  let s = n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bBoulevard\b/, 'Blvd').replace(/\bRoad\b/, 'Rd').replace(/\bDrive\b/, 'Dr').replace(/\bPlace\b/, 'Pl');
  if (s.split(' ').length >= 3) s = s.replace(/^(North|South|East|West)\b/, m => m[0]);
  return s.length > 22 ? s.slice(0, 21) + '…' : s;
}
export function addBusiness(rng: Rng, w: World, nid: (p: string) => string, b: Block, type: BusinessType, used: Set<string>, realName?: string): Business {
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
    homeBlockId: o.homeBlockId, faction: o.faction, favouriteBusinessIds: [], rel: { trust: 0, fear: 0, respect: 0 }, nerve, alive: true, notes: [],
  };
  w.npcs[n.id] = n; return n;
}
function bizName(rng: Rng, type: BusinessType, owner: Npc, used: Set<string>): string {
  const parts = BUSINESS_NAME_PARTS[type];
  for (let i = 0; i < 8; i++) {
    const a = rng.pick(parts[0]), b = rng.pick(parts[1]);
    const name = rng.chance(0.25) && !['bank', 'armored_depot', 'nightclub'].includes(type) ? `${owner.name.split(' ').slice(-1)[0]}'s ${b}` : `${a} ${b}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  return `${owner.name.split(' ').slice(-1)[0]} & Sons ${rng.int(2, 99)}`;
}
