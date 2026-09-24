/**
 * The catalogue's jobs in the sim: what each can be pointed at, what it needs first, what it
 * pays, and what it does. `jobs.ts` owns the flow (odds, planning, complications, the result card);
 * this file only answers the questions that differ from one kind to the next.
 *
 * One rule, the same as the rest of the Remake: every refusal comes with a reason, and `needsMet`
 * is the only place a catalogue job's prerequisites are checked — the board, the casing buttons and
 * `can()` all ask it.
 */
import { CATALOGUE, CATALOGUE_KINDS, isCatalogue, type CatalogueDef, type CatalogueKind } from '@r/content/catalogue';
import { JOBS } from '@r/content/world';
import { businessPrice } from './economy';
import { heldBy } from './hostages';
import { kill } from './people';
import type { Rng } from './rng';
import type { Block, Business, Id, Job, JobKind, Npc, Owner, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, controller, fullName, remember } from './util';

export { isCatalogue };
const def = (k: CatalogueKind): CatalogueDef => CATALOGUE[k];

// ------------------------------------------------------------------------------------ helpers
/** Outfits you are fighting: a beef or a war. */
export const enemies = (w: World) => Object.values(w.factions).filter(f => f.alive && f.standing <= -40);
const isPark = (b: Block) => !!b.landmark && /Park|Gardens|Common|Green|Fields/.test(b.landmark) && b.businessIds.length === 0;
/**
 * A block nobody holds on the poor end of town. The Remake does not generate the original's
 * abandoned blocks, so "derelict" is read off what is there: wealth under 35 and nobody in charge.
 */
export const isDerelict = (b: Block) => !isPark(b) && b.wealth <= 35 && !controller(b);
const civilian = (w: World, n: Npc | undefined) => !!n && n.alive && !n.crew && !n.faction && !n.official && n.id !== w.fixerId && !heldBy(w, n.id) && !n.jailedDays;
const armed = (w: World) => !!w.player.kit?.weapon || w.player.crewIds.some(id => !!w.npcs[id]?.crew?.kit?.weapon);
const doneAny = (w: World, kinds: JobKind[]) => kinds.some(k => (w.player.done?.[k] ?? 0) > 0);

/** Why this kind is not on the table yet, or undefined if it is. */
export function needsMet(w: World, kind: CatalogueKind): string | undefined {
  const n = def(kind).needs; const p = w.player;
  if (!n) return undefined;
  if (n.weapon && !armed(w)) return 'Somebody on your side has to be carrying a weapon.';
  if (n.crew && p.crewIds.length < n.crew) return `Needs ${n.crew} crew; you have ${p.crewIds.length}.`;
  if (n.safehouse && !p.safehouseIds.some(id => (w.safehouses[id]?.tier ?? 0) >= n.safehouse!)) return n.safehouse > 1 ? `Needs a safehouse of tier ${n.safehouse}.` : 'Needs a safehouse.';
  if (n.rackets && !p.racketIds.some(id => n.rackets!.includes(w.rackets[id]?.kind))) return `Needs a racket of yours: ${n.rackets.slice(0, 4).map(k => k.replace(/_/g, ' ')).join(', ')}${n.rackets.length > 4 ? '…' : ''}.`;
  if (n.after && !doneAny(w, n.after)) return `Pull off ${n.after.map(k => JOBS[k].label.toLowerCase()).join(' or ')} first.`;
  if (n.notoriety && p.fear + p.respect < n.notoriety) return `The street has to take you seriously first: fear and respect of ${n.notoriety} between them.`;
  return undefined;
}

// ------------------------------------------------------------------------------------ targets
export interface CatTarget { businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }

/** Whether this kind can be pointed at this target. Prerequisites are `needsMet`'s business. */
export function fits(w: World, kind: CatalogueKind, t: CatTarget): boolean {
  const d = def(kind);
  const biz = t.businessId ? w.businesses[t.businessId] : undefined;
  const npc = t.npcId ? w.npcs[t.npcId] : undefined;
  const block = t.blockId ? w.blocks[t.blockId] : undefined;
  const foes = enemies(w).map(f => f.id);
  switch (d.target) {
    case 'business': return !!biz && biz.ownedBy !== PLAYER && biz.closed <= 0 && (d.types?.length ? d.types.includes(biz.type) : biz.tier < 3);
    case 'own': return !!biz && biz.ownedBy === PLAYER && biz.closed <= 0;
    case 'rival_racket': return !!biz && biz.racketIds.some(id => foes.includes(w.rackets[id]?.owner as Owner));
    case 'own_racket': return !!biz && foes.length > 0 && biz.racketIds.some(id => w.rackets[id]?.owner === PLAYER);
    case 'npc': return civilian(w, npc) && npc!.wealth >= 40;
    case 'anyone': return civilian(w, npc);
    case 'official': return !!npc?.alive && !!npc.official;
    case 'inside': return !!npc?.alive && !!npc.inside && !npc.crew;
    case 'jailed': return !!npc?.alive && npc.crew?.status === 'jailed';
    case 'lieutenant': return !!npc?.alive && !!npc.faction && foes.includes(npc.faction) && !!w.factions[npc.faction]?.lieutenantIds.includes(npc.id);
    case 'faction': return !!block && foes.includes(controller(block) as Owner);
    case 'block': return !!block && !isPark(block) && block.businessIds.length > 0 && block.wealth >= 45;
    case 'derelict': return !!block && isDerelict(block);
    case 'corner': return !!block && Object.values(w.crews ?? {}).some(c => c.blockId === block.id && c.terms === 'none');
    case 'district': case 'none': return !!block;
    case 'landmark': return !!block?.landmark && !isPark(block) && !!d.landmark?.test(block.landmark);
    case 'waterfront': return !!block?.waterfront && !isPark(block);
    case 'case': { const c = t.caseId ? w.cases[t.caseId] : undefined; return !!c && (c.status === 'open' || c.status === 'charged') && (c.suspectId === PLAYER || w.player.crewIds.includes(c.suspectId as Id)); }
  }
}

/** Which input a kind is cased from on screen: a place's sheet, a person's, a block's, a file. */
export function targetInput(kind: CatalogueKind): 'business' | 'npc' | 'block' | 'case' {
  const t = def(kind).target;
  if (t === 'business' || t === 'own' || t === 'rival_racket' || t === 'own_racket') return 'business';
  if (t === 'npc' || t === 'anyone' || t === 'official' || t === 'inside' || t === 'jailed' || t === 'lieutenant') return 'npc';
  if (t === 'case') return 'case';
  return 'block';
}

/** The catalogue kinds this target could carry, prerequisites or not. */
export function catalogueKindsFor(w: World, t: CatTarget): CatalogueKind[] {
  const input = t.businessId ? 'business' : t.npcId ? 'npc' : t.caseId ? 'case' : t.blockId ? 'block' : undefined;
  if (!input) return [];
  return CATALOGUE_KINDS.filter(k => targetInput(k) === input && fits(w, k, t));
}

/** How far up the catalogue somebody is offered work: a nobody hears about muggings, not count rooms. */
const reachTier = (w: World) => { const n = w.player.fear + w.player.respect; return n < 25 ? 1 : n < 50 ? 2 : n < 80 ? 3 : 4; };

/**
 * A catalogue job for the board: a random kind the player qualifies for and is big enough to
 * hear about, pointed at the nearest thing it fits.
 */
export function pickCatalogueTarget(w: World, rng: Rng, from = w.player.blockId): { kind: CatalogueKind; blockId: Id; businessId?: Id; npcId?: Id; caseId?: Id; faction?: Owner } | undefined {
  const reach = reachTier(w);
  const kinds = rng.shuffle(CATALOGUE_KINDS.filter(k => def(k).tier <= reach && !needsMet(w, k)));
  const here = w.blocks[from];
  const near = new Set<Id>([here.id, ...here.neighborIds, ...here.neighborIds.flatMap(id => w.blocks[id].neighborIds)]);
  const byNear = <T,>(xs: T[], block: (x: T) => Id) => { const a = xs.filter(x => near.has(block(x))); return a.length ? a : xs; };
  for (const kind of kinds.slice(0, 6)) {
    const input = targetInput(kind);
    if (input === 'business') {
      const xs = byNear(Object.values(w.businesses).filter(b => fits(w, kind, { businessId: b.id })), b => b.blockId);
      if (xs.length) { const b = rng.pick(xs); return { kind, blockId: b.blockId, businessId: b.id, faction: b.protection?.by !== PLAYER ? b.protection?.by : undefined }; }
    } else if (input === 'npc') {
      const xs = byNear(Object.values(w.npcs).filter(n => fits(w, kind, { npcId: n.id })), n => n.homeBlockId);
      if (xs.length) { const n = rng.pick(xs.slice(0, 40)); return { kind, blockId: n.homeBlockId, npcId: n.id, faction: n.faction && n.faction !== PLAYER ? n.faction : undefined }; }
    } else if (input === 'case') {
      const xs = Object.values(w.cases).filter(c => fits(w, kind, { caseId: c.id }));
      if (xs.length) return { kind, blockId: w.player.blockId, caseId: rng.pick(xs).id };
    } else {
      const xs = def(kind).target === 'none' || def(kind).target === 'district' ? [here] : byNear(Object.values(w.blocks).filter(b => fits(w, kind, { blockId: b.id })), b => b.id);
      if (xs.length) { const b = rng.pick(xs); const c = controller(b); return { kind, blockId: b.id, faction: def(kind).target === 'faction' && c && c !== PLAYER ? c : undefined }; }
    }
  }
  return undefined;
}

// ------------------------------------------------------------------------------------ building
export interface CatBuild { difficulty: number; dirty: number; clean: number; goods: number; respect: number; fear: number; tier: 1 | 2 | 3 | 4; tname: string; cost?: number }

/** Everything about a catalogue job that is read off its target. */
export function buildCatalogue(w: World, rng: Rng, kind: CatalogueKind, t: CatTarget & { blockId: Id }): CatBuild | undefined {
  const d = def(kind);
  if (!fits(w, kind, t)) return undefined;
  const block = w.blocks[t.blockId];
  const biz = t.businessId ? w.businesses[t.businessId] : undefined;
  const npc = t.npcId ? w.npcs[t.npcId] : undefined;
  const c = t.caseId ? w.cases[t.caseId] : undefined;
  let difficulty = d.difficulty + rng.int(-6, 6);
  if (biz) difficulty += Math.round((biz.security - 40) / 4);
  if (npc) difficulty += Math.round((npc.nerve - 50) / 10);
  if (c) difficulty += Math.round(c.evidence / 10) - 3;
  // the take, scaled to what is actually there: a rich street, a rich mark, a busy place
  const wealth = biz ? w.blocks[biz.blockId].wealth : npc ? npc.wealth : block.wealth;
  const scale = d.target === 'none' ? 1 : 0.7 + wealth / 150;
  let value = Math.round((d.range[0] + rng.float() * (d.range[1] - d.range[0])) * scale / 50) * 50;
  if (d.effect === 'insurance' && biz) value = Math.round(businessPrice(w, biz) * 0.6 / 50) * 50;
  const tname = biz?.name ?? (npc ? fullName(npc) : c ? c.summary.replace(/\.$/, '') : d.target === 'faction' ? (w.factions[controller(block) as Owner]?.short ?? block.name) : d.target === 'district' ? w.districts[block.districtId].name : block.landmark && d.target === 'landmark' ? block.landmark : block.name);
  // buying down heat costs what the heat is worth; everything else costs what the catalogue says
  const cost = kind === 'buy_down' ? Math.round((1500 + w.player.heat * 60) / 100) * 100 : d.cost;
  return {
    difficulty: Math.round(clamp(difficulty, 5, 95)),
    // goods at the street's $80 a lot, to 80 lots — a stash holds 40 and whatever the safehouses
    // add, so a jewel job paid wholly in lots would not fit; the rest goes to a fence on the night at 60%
    dirty: d.pay === 'dirty' ? value : d.pay === 'goods' ? Math.round(Math.max(0, value - Math.min(80, Math.round(value / 80)) * 80) * 0.6 / 50) * 50 : 0,
    clean: d.pay === 'clean' ? value : 0,
    goods: d.pay === 'goods' ? Math.max(1, Math.min(80, Math.round(value / 80))) : 0,
    respect: d.respect, fear: d.fear, tier: d.tier, tname, cost,
  };
}
/**
 * The first-fourteen kind a catalogue job most resembles, for picking its complications: a wire
 * job gets somebody watching the wire, a heist gets the time lock, a hit gets a target who was ready.
 */
export function likeOf(kind: JobKind): JobKind {
  if (!isCatalogue(kind)) return kind;
  const d = def(kind);
  if (d.crime === 'murder') return 'hit';
  if (d.crime === 'arson') return 'arson';
  if (d.crime === 'kidnap') return 'kidnap';
  if (d.crime === 'fraud') return d.leans[0] === 'tech' ? 'hack' : d.leans[0] === 'charm' ? 'con' : 'fraud';
  if (d.crime === 'violence') return d.target === 'faction' || d.target === 'corner' ? 'raid' : 'robbery';
  if (d.tier >= 3) return 'heist';
  return d.leans[0] === 'muscle' ? 'robbery' : d.leans[0] === 'wheels' ? 'hijack' : 'burglary';
}
export const catalogueText = (kind: CatalogueKind) => ({ title: def(kind).title, pitch: def(kind).pitch });

// ------------------------------------------------------------------------------------ effects
/** What a catalogue job does beyond its take, in words for the result card. */
export function catalogueEffect(w: World, job: Job, rng: Rng): string {
  if (!isCatalogue(job.kind)) return '';
  const d = def(job.kind);
  const p = w.player;
  const biz: Business | undefined = job.targetBusinessId ? w.businesses[job.targetBusinessId] : undefined;
  const npc = job.targetNpcId ? w.npcs[job.targetNpcId] : undefined;
  const block = w.blocks[job.blockId];
  const district = w.districts[block.districtId];
  switch (d.effect) {
    case 'none': return '';
    case 'till': if (biz) { biz.till = Math.round(biz.till * 0.2); const o = w.npcs[biz.ownerId]; if (o) remember(o, w.day, 'robbed', `${d.label}, and nobody caught.`); } return '';
    case 'owner_fear': {
      const o = biz ? w.npcs[biz.ownerId] : undefined; if (!o) return '';
      o.rel.fear = clamp(o.rel.fear + (job.kind === 'armed_intimidation' ? 40 : 28)); remember(o, w.day, 'threatened', 'Somebody sent a message.');
      addInfluence(w, block.id, PLAYER, 3);
      return `${fullName(o)} got the message. Protection will be an easier conversation now.`;
    }
    case 'insurance': if (biz) { biz.closed = 10; for (const id of biz.racketIds) if (w.rackets[id]) w.rackets[id].down = 10; return `${biz.name} is a shell for ten days while the builders are in.`; } return '';
    case 'bust_out': if (biz) { biz.closed = 30; biz.income = Math.round(biz.income * 0.6); return `${biz.name} is shut for a month, and its name is worth less for good.`; } return '';
    case 'soldiers': { const f = w.factions[controller(block) as Owner] ?? (job.targetFaction ? w.factions[job.targetFaction] : undefined); if (!f) return ''; const lost = rng.int(1, 3); f.soldiers = Math.max(0, f.soldiers - lost); f.cash = Math.max(0, f.cash - job.payout.dirty); addInfluence(w, block.id, f.id, -6); return `The ${f.short} are ${lost} soldier${lost > 1 ? 's' : ''} short.`; }
    case 'dig_in': if (biz) { biz.dugIn = w.day + 14; return `Your people are dug in at ${biz.name} for two weeks. Anybody who comes for it is turned away.`; } return '';
    case 'war_kill': if (npc) { const f = npc.faction ? w.factions[npc.faction] : undefined; kill(w, npc.id, 'a war strike of yours'); if (f) { f.lieutenantIds = f.lieutenantIds.filter(x => x !== npc.id); f.soldiers = Math.max(0, f.soldiers - 2); } return f ? `The ${f.short} have one lieutenant fewer.` : ''; } return '';
    case 'inside': if (npc) {
      npc.inside = true;
      const found: string[] = [];
      if (npc.secret && !npc.secret.known) { npc.secret.known = true; found.push('a secret'); }
      if (npc.agenda && !npc.agenda.known) { npc.agenda.known = true; found.push('what they want'); }
      return `You are inside ${fullName(npc)}'s business${found.length ? `: you know ${found.join(' and ')}` : ''}. The wire jobs against them are open.`;
    } return '';
    case 'wreck': if (biz) { let n = 0; for (const id of biz.racketIds) { const r = w.rackets[id]; if (r && r.owner !== PLAYER) { r.down = rng.int(5, 10); n++; } } return n ? `Their operation at ${biz.name} is dark.` : ''; } return '';
    case 'corner': { const c = Object.values(w.crews ?? {}).find(x => x.blockId === block.id && x.terms === 'none'); if (c) { delete w.crews[c.id]; addInfluence(w, block.id, PLAYER, 12); return `The ${c.name} are gone from ${block.name}, and it is your corner now.`; } return ''; }
    case 'recipe': p.recipes = Math.min(3, (p.recipes ?? 0) + 1); return `Every lab of yours runs better on it (${p.recipes} of 3 recipes).`;
    case 'scout': {
      const people = Object.values(w.npcs).filter(n => n.alive && !n.crew && w.blocks[n.homeBlockId]?.districtId === district.id && !n.rel.met);
      const met = rng.shuffle(people).slice(0, 4);
      for (const n of met) n.rel.met = w.day;
      const want = met.find(n => n.agenda && !n.agenda.known); if (want) want.agenda!.known = true;
      return `You come back knowing ${met.length} people in ${district.name}${want ? `, and what ${fullName(want)} needs` : ''}.`;
    }
    case 'claim': addInfluence(w, block.id, PLAYER, job.kind === 'claim_abandoned' ? 25 : 12); return `${block.name} starts to answer to you.`;
    case 'free': if (npc?.crew) { npc.crew.status = 'ready'; npc.crew.statusDays = 0; npc.jailedDays = undefined; npc.crew.loyalty = clamp(npc.crew.loyalty + 15); return `${fullName(npc)} is out, and will not forget who did it.`; } return '';
    case 'cool': { const was = p.heat; p.heat = clamp(p.heat - 22); district.attention = clamp(district.attention - 12); return `Heat ${Math.round(was)} → ${Math.round(p.heat)}; the precinct looks elsewhere for a while.`; }
    case 'file': { const c = job.targetCaseId ? w.cases[job.targetCaseId] : undefined; if (c) { c.status = 'closed'; c.trialDay = undefined; return `The file is gone: ${c.summary.replace(/\.$/, '').toLowerCase()}.`; } return ''; }
    case 'booze': case 'green': { const prod = d.effect; const n = prod === 'booze' ? rng.int(20, 40) : rng.int(60, 100); const lot = p.stash[prod]; lot.q = Math.round((lot.q * lot.n + 62 * n) / (lot.n + n)); lot.n += n; return `${n} lots of ${prod} in the stash, at cost.`; }
    case 'charity': { let n = 0; for (const id of block.businessIds) { const o = w.npcs[w.businesses[id]?.ownerId]; if (o) { o.rel.trust = clamp(o.rel.trust + 8, -100, 100); n++; } } return n ? `${n} owner${n > 1 ? 's' : ''} on ${block.name} think better of you.` : ''; }
    case 'dump': for (const id of district.blockIds) w.blocks[id].wealth = Math.max(5, w.blocks[id].wealth - 3); return `${district.name} is a little poorer, and will not know why for years.`;
    case 'friend': if (npc) { npc.payroll = npc.payroll ?? 1; npc.rel.trust = clamp(npc.rel.trust + 25, -100, 100); remember(npc, w.day, 'helped', 'A campaign that suddenly had money.'); return `${fullName(npc)} is on your side now, and costs nothing a week.`; } return '';
    case 'ward': for (const id of district.blockIds) addInfluence(w, id, PLAYER, 10); district.attention = clamp(district.attention - 20); return `${district.name} voted the way you paid it to. Every street there leans your way.`;
    case 'wash': { const amt = Math.min(p.dirty, 25000); const clean = Math.round(amt * 0.85); p.dirty -= amt; p.cash += clean; return amt ? `${amt.toLocaleString('en-US')} dirty came out ${clean.toLocaleString('en-US')} clean.` : 'There was nothing dirty to wash.'; }
    case 'supply': if (npc?.crew) { npc.crew.loyalty = clamp(npc.crew.loyalty + 10); return `${fullName(npc)} runs the wing for you now.`; } return '';
    case 'bid': if (npc) { npc.rel.trust = clamp(npc.rel.trust + 10, -100, 100); npc.rel.owes += 1; return `${fullName(npc)} put it your way and took a taste; they owe you now.`; } return '';
  }
}
