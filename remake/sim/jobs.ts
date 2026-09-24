/**
 * Jobs, generated.
 *
 * The original shipped seventy hand-written ops, and a sweep found that a dozen of them never
 * ran in sixty days and that the result card under-reported heat on a whole lane. The remake
 * has fourteen *kinds* of job (and, since, the rest of the original's list — `catalogue.ts`) and builds every actual job from the world: a real target with a
 * real till and real security, a real person who brought it to you, the skills it leans on, and
 * a payout scaled from what is actually there. The same fourteen kinds produce a different board
 * every day in every city.
 *
 * Three rules carried over from the original's audits:
 *   1. The odds shown are the odds rolled. `jobOdds` is the only place a chance is computed.
 *   2. The result says what the purse did. `result` is written from the same numbers applied.
 *   3. Nothing launches blind. A complication stops the job and asks, with each answer's check
 *      and price on the button.
 */
import { APPROACH_INFO, BUSINESSES, JOBS, SPECIALISTS } from '@r/content/world';
import { NAME_GROUP_IDS, personName } from '@r/content/names';
import { COMPLICATIONS, PITCH, TITLE } from '@r/content/jobtext';
import { openCase } from './law';
import { armourOf, kitOf, skillOf } from './kit';
import { holdHostage, holdingRoom } from './hostages';
import { SETPIECES, SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { buildCatalogue, catalogueEffect, catalogueKindsFor, catalogueText, isCatalogue, likeOf, pickCatalogueTarget } from './catalogue';
import { gainXp, injure, jail, kill, practise, spreadWord } from './people';
import { Rng } from './rng';
import type { Approach, Id, Job, JobKind, JobPayout, Npc, Owner, Skill, SpecialistKind, World } from './types';
import { PLAYER } from './types';
import { addHeat, addInfluence, clamp, fullName, log, money, nid, remember, shortName } from './util';

const LEAN_W = [1, 0.7, 0.5, 0.35];

export interface Odds { chance: number; factors: { label: string; n: number }[]; required: number; team: number }

/** How a team stacks up on one skill: the best of them, plus a third of everybody else. */
function teamSkill(w: World, crewIds: Id[], skill: Skill, withPlayer: boolean, specialist?: Job['specialist']): number {
  // each person counts with what they carry: a pistol in the gunman's belt, not the bookkeeper's
  const vals = crewIds.filter(id => w.npcs[id]).map(id => skillOf(w, id, skill) + ((w.npcs[id].crew?.level ?? 1) - 1) * 0.4);
  if (withPlayer) vals.push(skillOf(w, PLAYER, skill));
  if (specialist?.skill === skill) vals.push(specialist.level);
  if (!vals.length) return 0;
  vals.sort((a, b) => b - a);
  return vals[0] + vals.slice(1).reduce((t, x) => t + x, 0) * 0.3;
}

/** Which skills the approach leans on, reordered from the job's own list. */
export function leansFor(job: Job, approach: Approach): Skill[] {
  const pref: Record<Approach, Skill[]> = { quiet: ['tech', 'brains', 'wheels'], loud: ['muscle', 'wheels'], clever: ['charm', 'brains'] };
  const set = new Set<Skill>([...pref[approach].filter(s => job.leans.includes(s) || approach === 'clever'), ...job.leans]);
  return [...set].slice(0, 4);
}

/**
 * The one place a job's chance is worked out. The player goes along on every job (you are the
 * boss, you are there), counted like any other member of the team.
 */
export function jobOdds(w: World, job: Job, crewIds: Id[], approach: Approach): Odds {
  const leans = leansFor(job, approach);
  let team = 0, wsum = 0;
  leans.forEach((s, i) => { team += teamSkill(w, crewIds, s, true, job.specialist) * LEAN_W[i]; wsum += LEAN_W[i]; });
  team = team / (wsum || 1);
  // A difficulty of 30 wants a team skill of about 4.5; 70 wants 8.5. Measured against a solo
  // start: the first draft (difficulty/9 + 2) put every early burglary at 13–28%, so a new player's
  // board was a list of things they could not do.
  const required = job.difficulty / 10 + 1.5;
  const factors: Odds['factors'] = [];
  const skillPart = Math.round((team - required) * 8);
  factors.push({ label: `Your people${job.specialist ? ` and ${job.specialist.name}` : ''} against the job (${leans.join(', ')})`, n: skillPart });
  const intel = Math.min(12, job.intel * 4); if (intel) factors.push({ label: 'Days of planning', n: intel });
  const hands = crewIds.length + (job.specialist ? 1 : 0);
  const extra = Math.max(0, hands - job.crewMin) * 3; if (extra) factors.push({ label: 'Extra hands', n: extra });
  const short = hands < job.crewMin ? -(job.crewMin - hands) * 15 : 0; if (short) factors.push({ label: 'Short-handed', n: short });
  const inside = insider(w, job); if (inside && approach === 'clever') factors.push({ label: `${shortName(inside)} on the inside`, n: 14 }); else if (inside) factors.push({ label: `${shortName(inside)} on the inside`, n: 6 });
  const heat = -Math.round(w.player.heat / 10); if (heat) factors.push({ label: 'Heat on you', n: heat });
  const block = w.blocks[job.blockId];
  const police = -Math.round((w.districts[block.districtId].attention - 40) / 8); if (police) factors.push({ label: 'Police on these streets', n: police });
  if (w.player.background === 'wheelman' && job.leans.includes('wheels')) factors.push({ label: 'You drive', n: 6 });
  const like = likeOf(job.kind);
  if (w.player.background === 'hacker' && (like === 'hack' || like === 'fraud')) factors.push({ label: 'You wrote half of this code', n: 8 });
  if (w.player.background === 'grifter' && like === 'con') factors.push({ label: 'The long game is your game', n: 8 });
  const jitter = junkieDrag(w, crewIds); if (jitter) factors.push({ label: 'Somebody on the team is using', n: jitter });
  const chance = clamp(50 + factors.reduce((t, f) => t + f.n, 0), 5, 95);
  return { chance, factors, required: Math.round(required * 10) / 10, team: Math.round(team * 10) / 10 };
}

function junkieDrag(w: World, ids: Id[]) { return -ids.filter(id => w.npcs[id]?.traits.includes('junkie')).length * 6; }

/** Somebody at the target who trusts you: a regular, an owner you have been kind to. */
export function insider(w: World, job: Job): Npc | undefined {
  const biz = job.targetBusinessId ? w.businesses[job.targetBusinessId] : undefined;
  if (!biz) return undefined;
  return [biz.ownerId, ...biz.patronIds].map(id => w.npcs[id]).find(n => n?.alive && n.rel.trust >= 35);
}

export function payoutFor(job: Job, approach: Approach | undefined): JobPayout {
  const k = approach ? APPROACH_INFO[approach].payout : 1;
  return { dirty: Math.round(job.payout.dirty * k), clean: Math.round(job.payout.clean * k), goods: Math.round(job.payout.goods * k), respect: job.payout.respect, fear: job.payout.fear };
}

// ---------------------------------------------------------------------------------- generation
interface Target { kind: JobKind; blockId: Id; businessId?: Id; npcId?: Id; caseId?: Id; faction?: Owner; source?: Npc }
export type { Target };

/** Build a job on a target. Everything about it — size, difficulty, take — is read off the target. */
export function buildJob(w: World, rng: Rng, t: Target): Job | undefined {
  const def = JOBS[t.kind];
  const biz = t.businessId ? w.businesses[t.businessId] : undefined;
  const npc = t.npcId ? w.npcs[t.npcId] : undefined;
  const fac = t.faction ? w.factions[t.faction] : undefined;
  const block = w.blocks[t.blockId];
  const district = w.districts[block.districtId];
  let difficulty = 40, dirty = 0, clean = 0, goods = 0, respect = 2, fear = 2, tier = def.tier;
  let tname = biz?.name ?? (npc ? fullName(npc) : fac?.short ?? block.name);
  switch (t.kind) {
    case 'burglary': if (!biz) return; difficulty = biz.security * 0.8 + 10; dirty = Math.round(biz.till * 0.9); goods = Math.round(3 + biz.income / 60); break;
    case 'robbery': if (!biz) return; difficulty = biz.security * 0.6 + district.attention / 3; dirty = Math.round(biz.till); fear = 5; break;
    case 'heist': if (!biz) return; difficulty = biz.security + 10; dirty = Math.round(biz.till); tier = biz.type === 'bank' || biz.type === 'armored_depot' ? 4 : 3; respect = 12; fear = 4; break;
    case 'hijack': difficulty = 35 + rng.int(0, 25); goods = rng.int(18, 45); dirty = rng.int(5, 20) * 100; break;
    case 'hit': if (!npc) return; difficulty = npc.nerve / 2 + (npc.faction ? 25 : 0) + (npc.official ? 30 : 0) + (npc.role === 'boss' ? 25 : 0); fear = npc.role === 'boss' ? 20 : npc.role === 'lieutenant' ? 10 : 6; respect = npc.faction ? 6 : 0; dirty = t.source ? rng.int(10, 40) * 100 : 0; tier = npc.role === 'boss' ? 4 : npc.faction ? 3 : 2; break;
    case 'kidnap': if (!npc) return; difficulty = 45 + npc.wealth / 3; dirty = Math.round(npc.wealth * rng.int(120, 220)); fear = 6; break;
    case 'arson': if (!biz) return; difficulty = biz.security * 0.5 + 15; dirty = t.source ? rng.int(8, 25) * 100 : 0; fear = 4; break;
    case 'sabotage': difficulty = 30 + (fac?.soldiers ?? 5) * 1.5; fear = 3; respect = 3; break;
    case 'con': if (!npc) return; difficulty = 25 + npc.skills.brains * 4 + (npc.traits.includes('sly') ? 15 : 0) - (npc.traits.includes('greedy') ? 10 : 0); dirty = Math.round(npc.wealth * rng.int(40, 80)); respect = 1; fear = 0; break;
    case 'fraud': if (!biz) return; difficulty = biz.security * 0.7 + 15; clean = Math.round(biz.income * rng.int(12, 30)); respect = 2; fear = 0; break;
    case 'hack': if (!biz) return; difficulty = biz.security * 0.75 + 10; clean = Math.round(biz.income * rng.int(8, 20)); respect = 1; fear = 0; break;
    case 'smuggle': difficulty = district.attention / 2 + 20; goods = 0; dirty = rng.int(12, 30) * 100; respect = 2; fear = 0; tname = block.name; break;
    case 'raid': if (!fac) return; difficulty = 35 + fac.soldiers * 2; dirty = Math.round(Math.min(fac.cash * 0.25, 20000)); goods = rng.int(10, 30); fear = 8; respect = 6; break;
    case 'frame': if (!npc) return; difficulty = 45 + npc.skills.brains * 2; fear = 2; respect = 4; break;
    case 'setpiece': {
      const sp = setpieceFor(block.landmark); if (!sp) return;
      const r = (x: [number, number]) => Math.round((x[0] + rng.float() * (x[1] - x[0])) / 100) * 100;
      difficulty = sp.difficulty; dirty = r(sp.payout.dirty); clean = r(sp.payout.clean); goods = Math.round(sp.payout.goods[0] + rng.float() * (sp.payout.goods[1] - sp.payout.goods[0]));
      respect = sp.respect; fear = sp.fear; tier = 4;
      tname = block.landmark!;
      break;
    }
  }
  // the rest of the original's jobs: everything about them is read off the target the same way
  const cat = isCatalogue(t.kind) ? buildCatalogue(w, rng, t.kind, t) : undefined;
  if (isCatalogue(t.kind) && !cat) return;
  if (cat) { ({ difficulty, dirty, clean, goods, respect, fear, tier, tname } = cat); }
  const fill = (s: string) => s.replace(/\{T\}/g, tname).replace(/\{B\}/g, block.name).replace(/\{S\}/g, t.source ? shortName(t.source) : 'Word on the street');
  const sp = t.kind === 'setpiece' ? setpieceFor(block.landmark) : undefined;
  const title = cat ? fill(catalogueText(t.kind as never).title) : sp ? sp.title.replace('{L}', tname) : rng.pick(TITLE[t.kind as keyof typeof TITLE]).replace('{T}', tname).replace('{B}', block.name);
  const pitch = cat ? fill(catalogueText(t.kind as never).pitch) : sp ? sp.pitch.replace(/\{L\}/g, tname) : rng.pick(PITCH[t.kind as keyof typeof PITCH]).replace(/\{T\}/g, tname).replace(/\{B\}/g, block.name).replace(/\{S\}/g, t.source ? shortName(t.source) : 'Word on the street');
  const job: Job = {
    id: nid(w, 'job'), kind: t.kind, title, pitch, sourceId: t.source?.id, tier: tier as Job['tier'], blockId: t.blockId,
    targetBusinessId: t.businessId, targetNpcId: t.npcId, targetFaction: t.faction ?? npc?.faction ?? (biz?.protection?.by !== PLAYER ? biz?.protection?.by : undefined),
    crewMin: Math.max(0, def.crew[0] - 1), crewMax: def.crew[1], leans: def.leans, difficulty: Math.round(clamp(difficulty, 5, 95)),
    planDays: def.planDays, expires: w.day + rng.int(3, 6), payout: { dirty, clean, goods, respect, fear }, heat: def.heat, exposure: def.exposure,
    status: 'offer', crewIds: [], daysLeft: def.planDays, intel: 0,
  };
  if (cat) { job.targetCaseId = t.caseId; job.cost = cat.cost; }
  if (sp) { job.leans = sp.leans; job.heat = sp.heat; job.setpiece = { id: sp.id, landmark: block.landmark!, stages: sp.stages, stage: 0, mult: 1, heat: 0, messy: false }; }
  // a target that belongs to an outfit is a declaration, and the board says so
  if (job.targetFaction === PLAYER) job.targetFaction = undefined;
  w.jobs[job.id] = job;
  return job;
}

/** Fill the board. Jobs come from people who trust you, from grudges you know about, and from wars. */
export function generateJobs(w: World, n: number) {
  const rng = new Rng(w.rng);
  const offers = Object.values(w.jobs).filter(j => j.status === 'offer');
  const want = Math.max(0, n - offers.length);
  for (let k = 0; k < want; k++) {
    const t = pickTarget(w, rng);
    if (t) buildJob(w, rng, t);
  }
  w.rng = rng.state;
}

function pickTarget(w: World, rng: Rng): Target | undefined {
  const p = w.player;
  const here = w.blocks[p.blockId];
  const near = new Set<Id>([here.id, ...here.neighborIds, ...here.neighborIds.flatMap(id => w.blocks[id].neighborIds)]);
  const contacts = Object.values(w.npcs).filter(n => n.alive && n.rel.met && n.rel.trust >= 10 && !n.crew);
  const source = contacts.length ? rng.pick(contacts.sort((a, b) => (b.traits.includes('connected') ? 1 : 0) - (a.traits.includes('connected') ? 1 : 0)).slice(0, 8)) : undefined;
  const bizNear = [...near].flatMap(id => w.blocks[id].businessIds).map(id => w.businesses[id]).filter(b => b.ownedBy !== PLAYER && b.protection?.by !== PLAYER && b.closed === 0);
  // a third of the board comes from the rest of the catalogue, sized to who you are
  if (rng.chance(0.35)) { const c = pickCatalogueTarget(w, rng); if (c) return { ...c, source: c.kind === 'buy_case' || c.kind === 'spring_crew' ? (w.fixerId ? w.npcs[w.fixerId] : source) : source }; }
  const r = rng.float();
  // a known grudge is the best kind of job: somebody wants it done and will owe you
  const grudge = Object.values(w.npcs).find(n => n.alive && n.agenda?.known && (n.agenda.kind === 'revenge' || n.agenda.kind === 'rival') && n.agenda.targetId && w.npcs[n.agenda.targetId]?.alive && !Object.values(w.jobs).some(j => j.sourceId === n.id && j.status === 'offer'));
  if (grudge && r < 0.3) {
    const target = w.npcs[grudge.agenda!.targetId!];
    if (grudge.agenda!.kind === 'revenge') return { kind: rng.chance(0.5) ? 'hit' : 'frame', blockId: target.homeBlockId, npcId: target.id, source: grudge };
    const tb = target.workId ? w.businesses[target.workId] : undefined;
    return tb ? { kind: rng.chance(0.5) ? 'arson' : 'sabotage', blockId: tb.blockId, businessId: tb.id, faction: tb.protection?.by, source: grudge } : { kind: 'frame', blockId: target.homeBlockId, npcId: target.id, source: grudge };
  }
  // war work against whoever is at war with you
  const enemies = Object.values(w.factions).filter(f => f.alive && f.standing <= -40);
  if (enemies.length && r < 0.55) {
    const f = rng.pick(enemies);
    const home = w.districts[f.homeDistrictId];
    const blockId = rng.pick(home.blockIds);
    const lt = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive);
    const kind = rng.pick(['raid', 'raid', 'sabotage', 'hit'] as JobKind[]);
    if (kind === 'hit' && lt.length) { const t = rng.pick(lt); return { kind, blockId: t.homeBlockId, npcId: t.id, faction: f.id, source }; }
    if (kind === 'sabotage') { const rk = Object.values(w.rackets).filter(x => x.owner === f.id); if (rk.length) { const x = rng.pick(rk); const b = w.businesses[x.businessId]; return { kind, blockId: b.blockId, businessId: b.id, faction: f.id, source }; } }
    return { kind: 'raid', blockId, faction: f.id, source };
  }
  // a set-piece, once in a while, for somebody the street takes seriously
  if (r < 0.62 && r >= 0.55 && w.player.fear + w.player.respect >= SETPIECE_RANK && !Object.values(w.jobs).some(j => j.kind === 'setpiece' && ['offer', 'planning', 'ready'].includes(j.status))) {
    const marks = Object.values(w.blocks).filter(b => setpieceFor(b.landmark));
    if (marks.length) { const b = rng.pick(marks); return { kind: 'setpiece', blockId: b.id, source: w.fixerId ? w.npcs[w.fixerId] : source }; }
  }
  // the fixer deals in paper
  if (r < 0.68 && w.fixerId) {
    const fixer = w.npcs[w.fixerId];
    const marks = Object.values(w.businesses).filter(b => b.tier >= 2 && b.ownedBy !== PLAYER);
    if (fixer?.alive && marks.length) { const b = rng.pick(marks); return { kind: rng.pick(['fraud', 'hack', 'hack'] as JobKind[]), blockId: b.blockId, businessId: b.id, source: fixer.rel.trust >= 0 ? fixer : undefined }; }
  }
  if (r < 0.76) {
    const rich = Object.values(w.npcs).filter(n => n.alive && n.wealth >= 60 && !n.faction && !n.official && !n.crew);
    if (rich.length) { const m = rng.pick(rich); return { kind: rng.chance(0.7) ? 'con' : 'kidnap', blockId: m.homeBlockId, npcId: m.id, source }; }
  }
  if (r < 0.82) { const docks = Object.values(w.blocks).filter(b => b.waterfront); if (docks.length) return { kind: rng.chance(0.5) ? 'smuggle' : 'hijack', blockId: rng.pick(docks).id, source }; }
  // an institution, once you are somebody
  const inst = Object.values(w.businesses).filter(b => BUSINESSES[b.type].vault && b.tier === 3);
  if (r < 0.88 && inst.length && w.player.respect + w.player.fear >= 30) { const b = rng.pick(inst); return { kind: 'heist', blockId: b.blockId, businessId: b.id, source }; }
  if (!bizNear.length) return undefined;
  // street jobs sized to who you are: a nobody hears about the corner shop, not the jeweller
  const reach = 25 + (w.player.fear + w.player.respect) / 2 + w.player.crewIds.length * 5;
  const fits = bizNear.filter(b => b.security <= reach);
  const b = rng.pick(fits.length ? fits : bizNear);
  return { kind: rng.chance(0.55) ? 'burglary' : 'robbery', blockId: b.blockId, businessId: b.id, source };
}

/** What casing a place turns up: the best job on it for someone of your standing. */
export function caseKinds(w: World, target: { businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }): JobKind[] {
  return [...baseCaseKinds(w, target), ...catalogueKindsFor(w, target)];
}
function baseCaseKinds(w: World, target: { businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }): JobKind[] {
  // the water: a load to run in, or somebody else's to take — before, only the board offered these
  if (target.blockId && !target.businessId && !target.npcId && !target.caseId) return w.blocks[target.blockId]?.waterfront ? ['smuggle', 'hijack'] : [];
  if (target.businessId) {
    const b = w.businesses[target.businessId];
    if (!b || b.ownedBy === PLAYER) return [];
    const kinds: JobKind[] = b.tier === 3 && BUSINESSES[b.type].vault ? ['heist', 'hack', 'fraud'] : ['burglary', 'robbery', 'arson'];
    if (b.tier >= 2 && b.tier < 3) kinds.push('fraud', 'hack');
    if (b.racketIds.some(id => w.rackets[id]?.owner !== PLAYER)) kinds.push('sabotage');
    return kinds;
  }
  if (target.npcId) {
    const n = w.npcs[target.npcId];
    if (!n?.alive || n.crew) return [];
    const kinds: JobKind[] = ['hit', 'frame'];
    if (n.wealth >= 50 && !n.faction) kinds.push('kidnap', 'con');
    return kinds;
  }
  return [];
}

// ---------------------------------------------------------------------------------- running it
export function crewBusy(w: World, id: Id) { return !!w.npcs[id]?.crew?.assignment; }

export function takeJob(w: World, job: Job, crewIds: Id[]) {
  job.status = job.planDays > 0 ? 'planning' : 'ready';
  job.daysLeft = job.planDays;
  job.crewIds = crewIds.slice();
  for (const id of crewIds) { const n = w.npcs[id]; if (n?.crew) n.crew.assignment = { kind: 'job', jobId: job.id }; }
  log(w, `You take on ${job.title.toLowerCase()}.${job.planDays ? ` ${job.planDays} day${job.planDays > 1 ? 's' : ''} of planning.` : ' Ready when you are.'}`, 'info');
}

export function dropJob(w: World, job: Job) {
  for (const id of job.crewIds) { const n = w.npcs[id]; if (n?.crew?.assignment?.kind === 'job' && n.crew.assignment.jobId === job.id) n.crew.assignment = undefined; }
  job.crewIds = [];
  job.status = 'expired';
}

export function tickJobs(w: World) {
  for (const j of Object.values(w.jobs)) {
    if (j.status === 'planning') { j.daysLeft--; j.intel++; if (j.daysLeft <= 0) { j.status = 'ready'; log(w, `${j.title} is planned. Launch it when you are ready.`, 'info'); } }
    else if (j.status === 'ready') j.intel = Math.min(j.intel + 0.5, 4);
    else if (j.status === 'offer' && w.day > j.expires) j.status = 'expired';
  }
  // tidy: forget finished jobs after a fortnight so the save stays small
  for (const j of Object.values(w.jobs)) if ((j.status === 'expired' || j.status === 'done' || j.status === 'failed') && w.day - (j.expires ?? 0) > 14) delete w.jobs[j.id];
}

const COMPLICATION_CHANCE = [0, 0.15, 0.3, 0.45, 0.55];

export function launchJob(w: World, job: Job, approach: Approach, rng: Rng) {
  job.approach = approach;
  const odds = jobOdds(w, job, job.crewIds, approach);
  job.rolled = rng.float() * 100 < odds.chance;
  if (job.setpiece) { job.setpiece.stage = 1; job.setpiece.mult = 1; job.setpiece.heat = 0; job.setpiece.messy = false; nextStage(w, job, rng); return; }
  const like = likeOf(job.kind);
  const pool = COMPLICATIONS.filter(c => !c.kinds || c.kinds.includes(like));
  if (pool.length && rng.chance(COMPLICATION_CHANCE[job.tier])) {
    const c = rng.pick(pool);
    job.complication = { id: c.id, title: c.title, text: c.text, options: c.options.map(o => ({ ...o })) };
    job.status = 'paused';
    log(w, `${job.title}: ${c.title.toLowerCase()}. Your call.`, 'warn');
    return;
  }
  finishJob(w, job, rng, 1, 0);
}

/** The chance an answer to a complication comes off, shown on its button. */
export function complicationOdds(w: World, job: Job, optionId: string): number {
  const o = job.complication?.options.find(x => x.id === optionId); if (!o) return 0;
  const v = teamSkill(w, job.crewIds, o.skill, true, job.specialist);
  return clamp(Math.round(50 + (v - (o.difficulty / 10 + 1.5)) * 8), 5, 95);
}

export function answerComplication(w: World, job: Job, optionId: string, rng: Rng) {
  const o = job.complication!.options.find(x => x.id === optionId)!;
  const ok = rng.float() * 100 < complicationOdds(w, job, optionId);
  log(w, ok ? o.pass : o.fail, ok ? 'good' : 'bad');
  // a pass keeps the take the option promised; a fail halves it and the heat comes anyway
  const mult = ok ? o.payout : o.payout * 0.5;
  const heat = ok ? o.heat : o.heat * 1.5 + 3;
  if (!ok && !o.safe) job.rolled = job.rolled && rng.chance(0.5);
  if (o.payout === 0) job.rolled = false;
  const was = job.complication!.id;
  job.complication = undefined;
  const sp = job.setpiece;
  if (sp) {
    sp.mult *= mult; sp.heat += heat; sp.messy ||= !ok;
    // a set-piece goes on to the next stage unless it is already lost or somebody walked
    if (sp.stage < sp.stages && job.rolled && o.payout > 0) { sp.stage++; nextStage(w, job, rng, was); return; }
    finishJob(w, job, rng, Math.min(1.6, sp.mult), sp.heat, sp.messy);
    return;
  }
  finishJob(w, job, rng, mult, heat, !ok);
}

/** A set-piece stops and asks at every stage: always a complication, never the same one twice running. */
function nextStage(w: World, job: Job, rng: Rng, not?: string) {
  const pool = COMPLICATIONS.filter(c => c.id !== not && (!c.kinds || c.kinds.some(k => k === 'heist' || k === 'burglary' || k === 'robbery')));
  const c = rng.pick(pool);
  job.complication = { id: c.id, title: `Stage ${job.setpiece!.stage} of ${job.setpiece!.stages}: ${c.title.toLowerCase()}`, text: c.text, options: c.options.map(o => ({ ...o })) };
  job.status = 'paused';
  log(w, `${job.title}, stage ${job.setpiece!.stage}: ${c.title.toLowerCase()}. Your call.`, 'warn');
}

function finishJob(w: World, job: Job, rng: Rng, mult: number, extraHeat: number, messy = false) {
  const p = w.player;
  const def = JOBS[job.kind];
  const ap = APPROACH_INFO[job.approach ?? 'quiet'];
  const success = !!job.rolled;
  const pay = payoutFor(job, job.approach);
  const k = success ? mult : 0;
  let dirty = Math.round(pay.dirty * k);
  const clean = Math.round(pay.clean * k), goods = Math.round(pay.goods * k);
  // a snatch with somewhere to keep them is a hostage, not a payout: the family pays more by the day
  let heldAt: Id | undefined;
  if (success && job.kind === 'kidnap' && job.targetNpcId) { heldAt = holdingRoom(w); if (heldAt) { holdHostage(w, job.targetNpcId, dirty, heldAt); dirty = 0; } else dirty = Math.round(dirty * 0.5); }
  const heatBefore = p.heat;
  const bgHeat = p.background === 'hacker' && ['hack', 'fraud'].includes(likeOf(job.kind)) ? 0.6 : 1;
  addHeat(w, (job.heat * ap.heat * (success ? 1 : 1.4) + extraHeat) * bgHeat, job.blockId);
  p.dirty += dirty; p.cash += clean;
  if (goods) { const lot = p.stash.goods; lot.q = lot.n + goods > 0 ? Math.round((lot.q * lot.n + 55 * goods) / (lot.n + goods)) : 0; lot.n += goods; }
  const injured: Id[] = [], jailed: Id[] = [], killed: Id[] = [];
  // people get hurt on bad nights, and on loud ones
  const hurtChance = (success ? 0.08 : 0.3) * ap.injury * (messy ? 1.5 : 1);
  for (const id of job.crewIds) {
    const n = w.npcs[id]; if (!n?.alive) continue;
    if (!success && rng.chance(0.18 * (job.approach === 'loud' ? 1.3 : 0.8))) { jail(w, id, rng.int(5, 15), `caught on ${job.title.toLowerCase()}`); jailed.push(id); continue; }
    // armour turns aside a share of what a bad night does, and the shot that would have killed
    const armour = armourOf(kitOf(w, id));
    if (rng.chance(hurtChance * (1 - armour))) { if (!success && job.approach === 'loud' && rng.chance(0.15 * (1 - armour))) { kill(w, id, `shot on ${job.title.toLowerCase()}`); killed.push(id); } else { injure(w, id, rng.int(2, 6), `on ${job.title.toLowerCase()}`); injured.push(id); } }
    gainXp(w, id, success ? 25 + job.tier * 10 : 10);
    if (n.crew && n.crew.status !== 'jailed') n.crew.loyalty = clamp(n.crew.loyalty + (success ? 3 : -2));
  }
  for (const s of job.leans.slice(0, 2)) practise(w, s, success ? 6 + job.tier * 2 : 3);
  // the target, and what it means for whoever it belonged to
  const effect = success ? applyTargetEffect(w, job, rng) : '';
  if (success) spreadWord(w, job.targetNpcId, job.blockId, job.payout.fear, job.payout.respect);
  if (job.targetFaction && w.factions[job.targetFaction]) {
    const f = w.factions[job.targetFaction];
    f.standing = clamp(f.standing - (success ? 12 + job.tier * 4 : 6), -100, 100);
    f.grievances.unshift(job.title); f.grievances = f.grievances.slice(0, 5);
  }
  // somebody saw something
  if (rng.chance(def.exposure * (success ? 1 : 1.6) * ap.heat)) {
    const witnesses = Object.values(w.npcs).filter(n => n.alive && n.homeBlockId === job.blockId && !n.crew && !n.faction && n.rel.fear < 50);
    const wit = witnesses.length ? rng.pick(witnesses) : undefined;
    const suspect = job.crewIds.length && rng.chance(0.6) ? rng.pick(job.crewIds) : PLAYER;
    openCase(w, def.crime, suspect, wit?.id, `${def.label} — ${job.title}.`, 12 + job.tier * 5);
  }
  // the person who brought it to you
  if (job.sourceId && success) {
    const s = w.npcs[job.sourceId];
    if (s?.alive) {
      s.rel.trust = clamp(s.rel.trust + 8, -100, 100);
      if (s.agenda && s.agenda.targetId && (s.agenda.targetId === job.targetNpcId || w.npcs[s.agenda.targetId]?.workId === job.targetBusinessId)) {
        s.agenda = undefined; s.rel.owes += 1; s.rel.trust = clamp(s.rel.trust + 20, -100, 100);
        remember(s, w.day, 'helped', `You settled a score for them: ${job.title.toLowerCase()}.`);
        log(w, `${fullName(s)} owes you for that, and knows it.`, 'good', { npcId: s.id });
      }
    }
  }
  const heat = Math.round(p.heat - heatBefore);
  const text = success
    ? `${job.title}: done.${dirty ? ` ${money(dirty)} dirty.` : ''}${clean ? ` ${money(clean)} clean.` : ''}${goods ? ` ${goods} lots of hot goods.` : ''}${effect ? ` ${effect}` : ''}`
    : `${job.title}: it went wrong.${jailed.length ? ` ${jailed.length} picked up.` : ''}${killed.length ? ` ${killed.length} did not come home.` : ''}`;
  job.result = { success, text, dirty, clean, goods, heat, injured, jailed, killed };
  // what you have pulled off, by kind: the catalogue's later jobs are offered on the strength of it
  if (success) { p.done ??= {}; p.done[job.kind] = (p.done[job.kind] ?? 0) + 1; }
  job.status = success ? 'done' : 'failed';
  job.expires = w.day;
  for (const id of job.crewIds) { const n = w.npcs[id]; if (n?.crew?.assignment?.kind === 'job') n.crew.assignment = undefined; }
  log(w, text, success ? 'money' : 'bad', { blockId: job.blockId });
}

/** What a successful job does to the thing it was pointed at. */
function applyTargetEffect(w: World, job: Job, rng: Rng): string {
  const biz = job.targetBusinessId ? w.businesses[job.targetBusinessId] : undefined;
  const npc = job.targetNpcId ? w.npcs[job.targetNpcId] : undefined;
  const fac = job.targetFaction ? w.factions[job.targetFaction] : undefined;
  switch (job.kind) {
    case 'robbery': case 'burglary': if (biz) { biz.till = Math.round(biz.till * 0.2); const o = w.npcs[biz.ownerId]; if (o) remember(o, w.day, 'robbed', 'Somebody cleaned out the till.'); } return '';
    case 'heist': if (biz) { biz.till = Math.round(biz.till * 0.1); biz.security = clamp(biz.security + 12); } return 'They will double the guard now.';
    case 'hit': if (npc) { kill(w, npc.id, 'a job of yours'); return ''; } return '';
    case 'kidnap': if (npc && !Object.values(w.hostages).some(h => h.npcId === npc.id)) { npc.rel.fear = clamp(npc.rel.fear + 50); remember(npc, w.day, 'hurt', 'Taken, and let go when the family paid what was in the house.'); npc.wealth = Math.max(5, npc.wealth - 30); return 'Nowhere to keep them, so you took what the family had in the house.'; } return npc ? `${fullName(npc)} is yours to bargain with.` : '';
    case 'setpiece': return setpieceEffect(w, job);
    case 'arson': if (biz) { biz.closed = rng.int(6, 14); for (const rid of biz.racketIds) if (w.rackets[rid]) w.rackets[rid].down = biz.closed; return `${biz.name} is shut for ${biz.closed} days.`; } return '';
    case 'sabotage': if (biz) { let n = 0; for (const rid of biz.racketIds) { const r = w.rackets[rid]; if (r && r.owner !== PLAYER) { r.down = rng.int(4, 9); n++; } } return n ? `Their operation at ${biz.name} is down.` : ''; } return '';
    case 'raid': if (fac) { const took = Math.min(fac.cash, job.payout.dirty); fac.cash -= took; fac.soldiers = Math.max(0, fac.soldiers - rng.int(1, 3)); addInfluence(w, job.blockId, fac.id, -12); return `The ${fac.short} are short money and men.`; } return '';
    case 'frame': if (npc) {
      if (npc.faction && w.factions[npc.faction]) { const f = w.factions[npc.faction]; f.lieutenantIds = f.lieutenantIds.filter(x => x !== npc.id); if (f.bossId === npc.id) f.soldiers = Math.max(0, f.soldiers - 4); }
      npc.jailedDays = 40; npc.homeBlockId = npc.homeBlockId;
      // the heat they carried goes with them, and some of yours too
      for (const c of Object.values(w.cases)) if (c.status === 'open' && c.suspectId === PLAYER && rng.chance(0.5)) { c.evidence = clamp(c.evidence - 30); }
      return `${fullName(npc)} is going away for a while, and some of the paper on you went with them.`;
    } return '';
    case 'smuggle': { const n = rng.int(10, 25); const prod = rng.pick(['booze', 'green', 'pills'] as const); const lot = w.player.stash[prod]; lot.q = Math.round((lot.q * lot.n + 60 * n) / (lot.n + n)); lot.n += n; return `${n} lots of ${prod} in the stash.`; }
    default: return catalogueEffect(w, job, rng);
  }
}

/** What a specialist costs for this job: a flat fee by tier and a small share of the take. */
export function specialistFee(job: Job, kind: SpecialistKind): number {
  return Math.round((SPECIALISTS[kind].base * job.tier + (job.payout.dirty + job.payout.clean) * 0.06) / 50) * 50;
}
export function hireSpecialist(w: World, job: Job, kind: SpecialistKind, rng: Rng) {
  const fee = specialistFee(job, kind);
  const pn = personName(rng, rng.pick(NAME_GROUP_IDS));
  job.specialist = { kind, name: `${pn.first} ${pn.last}`, face: rng.int(1, 2 ** 30), skill: SPECIALISTS[kind].skill, level: rng.int(8, 10), fee };
  log(w, `The fixer finds you a ${SPECIALISTS[kind].label.toLowerCase()} for ${job.title.toLowerCase()}: ${job.specialist.name}, ${money(fee)} up front.`, 'info');
}

/** What a set-piece does beyond the money. The evidence locker is the only way to burn paper in bulk. */
function setpieceEffect(w: World, job: Job): string {
  const sp = SETPIECES.find(x => x.id === job.setpiece?.id); if (!sp) return '';
  switch (sp.effect) {
    case 'evidence': {
      let n = 0;
      for (const c of Object.values(w.cases)) {
        const ours = c.suspectId === PLAYER || w.player.crewIds.includes(c.suspectId as Id);
        if (!ours || (c.status !== 'open' && c.status !== 'charged')) continue;
        c.evidence = clamp(c.evidence - 70); if (c.status === 'charged') { c.status = 'open'; c.trialDay = undefined; } n++;
      }
      return n ? `${n} file${n > 1 ? 's' : ''} on you and yours went up in smoke.` : 'There was nothing on you down there — this time.';
    }
    case 'sacrilege': return 'Every church on every corner is praying about you tonight.';
    case 'police': addHeat(w, 10, job.blockId); return 'Every cop in the city takes this one personally.';
    case 'records': return 'On paper, some of the city now belongs to people who work for you.';
    default: return '';
  }
}
