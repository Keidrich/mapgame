/**
 * The remake's soak bot. It plays the game through `dispatch` exactly as the UI does — no side
 * doors — and counts what it touched, so "the bot never reached it" is a number rather than a
 * surprise. Same idea as the original's bot, built in from day one this time instead of after
 * three passes shipped blind.
 */
import { BUSINESSES, GEAR, LABS, RACKETS } from '@r/content/world';
import { can, dispatch, newWorld, select, PLAYER, type Action, type Background, type Id, type Job, type World } from '@r/sim/index';
import { Rng } from '@r/sim/rng';
import type { CitySize } from '@r/sim/city';
import type { Approach, RacketKind } from '@r/sim/types';

export type Counter =
  | 'days' | 'chats' | 'threats' | 'protected' | 'squeezed' | 'recruited' | 'bribed' | 'settled' | 'leaned' | 'bought' | 'favours'
  | 'rackets' | 'upgrades' | 'washes' | 'fixer' | 'safehouses' | 'labs' | 'restocks' | 'street_sales' | 'gear'
  | 'jobs_taken' | 'jobs_done' | 'jobs_failed' | 'complications' | 'cased' | 'events' | 'tributes' | 'sitdowns' | 'wars'
  | 'lieutenants' | 'guards' | 'runners' | 'lawyer' | 'lay_low' | 'travel' | 'cases_opened' | 'raids' | 'busts'
  | 'crews_paid' | 'crews_taken' | 'crews_run' | 'audits' | 'specialists';

export const SYSTEMS: { label: string; needs: Counter[] }[] = [
  { label: 'talking to people', needs: ['chats'] },
  { label: 'threats', needs: ['threats'] },
  { label: 'protection', needs: ['protected'] },
  { label: 'squeezing a till', needs: ['squeezed'] },
  { label: 'recruiting', needs: ['recruited'] },
  { label: 'officials on the payroll', needs: ['bribed'] },
  { label: 'settling what people need', needs: ['settled'] },
  { label: 'buying a business', needs: ['bought'] },
  { label: 'rackets', needs: ['rackets'] },
  { label: 'laundering', needs: ['washes', 'fixer'] },
  { label: 'safehouses and labs', needs: ['labs'] },
  { label: 'selling product', needs: ['street_sales'] },
  { label: 'gear', needs: ['gear'] },
  { label: 'jobs', needs: ['jobs_done', 'jobs_failed'] },
  { label: 'complications', needs: ['complications'] },
  { label: 'casing a target', needs: ['cased'] },
  { label: 'events', needs: ['events'] },
  { label: 'diplomacy', needs: ['tributes', 'sitdowns'] },
  { label: 'lieutenants', needs: ['lieutenants'] },
  { label: 'guards', needs: ['guards'] },
  { label: 'street crews', needs: ['crews_paid', 'crews_taken', 'crews_run'] },
  { label: 'audits', needs: ['audits'] },
  { label: 'specialists', needs: ['specialists'] },
];

export interface RunResult { w: World; counts: Partial<Record<Counter, number>>; actions: number; refused: number }
interface Ctx { w: World; rng: Rng; counts: Partial<Record<Counter, number>>; actions: number; refused: number }

const bump = (c: Ctx, k: Counter, n = 1) => { c.counts[k] = (c.counts[k] ?? 0) + n; };
function act(c: Ctx, a: Action): boolean {
  const ok = can(c.w, a);
  if (!ok.ok) { c.refused++; return false; }
  c.w = dispatch(c.w, a); c.actions++;
  return true;
}

export function run(opts: { days: number; seed: number; size?: CitySize; background?: Background }): RunResult {
  const c: Ctx = { w: newWorld({ seed: opts.seed, size: opts.size ?? 'medium', name: 'Bot', background: opts.background ?? 'grifter' }), rng: new Rng(opts.seed * 31 + 7), counts: {}, actions: 0, refused: 0 };
  while (c.w.day <= opts.days && !c.w.over) {
    day(c);
    check(c);
    bump(c, 'days');
  }
  return { w: c.w, counts: c.counts, actions: c.actions, refused: c.refused };
}

function day(c: Ctx) {
  answerEverything(c);
  const p = () => c.w.player;
  if (p().heat > 85 && p().lowDays === 0) { if (act(c, { type: 'lay_low', days: 3 })) bump(c, 'lay_low'); answerEverything(c); return; }
  manageCrew(c);
  // building comes before the street work: the street loop spends every action point it can
  // find, and a safehouse needs one — the first draft never rented a single one in sixty days
  build(c);
  corners(c);
  runJobs(c);
  money(c);
  street(c);
  politics(c);
  answerEverything(c);
  if (act(c, { type: 'end_day' })) { /* counted in run */ }
  answerEverything(c);
}

// ------------------------------------------------------------------------------------ events
function answerEverything(c: Ctx) {
  let guard = 0;
  while (guard++ < 10) {
    const j = select.pendingJob(c.w);
    if (j?.complication) {
      const best = j.complication.options.map(o => ({ o, v: select.complicationOdds(c.w, j, o.id) / 100 * o.payout - o.heat / 40 })).sort((a, b) => b.v - a.v)[0];
      if (act(c, { type: 'answer', jobId: j.id, optionId: best.o.id })) { bump(c, 'complications'); const r = c.w.jobs[j.id]?.result; if (r) bump(c, r.success ? 'jobs_done' : 'jobs_failed'); }
      continue;
    }
    const e = c.w.events[0]; if (!e) break;
    const scored = e.options.filter(o => !o.disabled).map(o => ({ o, v: scoreEffects(c, o.effects) }));
    const pick = scored.sort((a, b) => b.v - a.v)[0]?.o ?? e.options[e.options.length - 1];
    if (act(c, { type: 'resolve_event', eventId: e.id, optionId: pick.id })) bump(c, 'events');
    else break;
  }
}
function scoreEffects(c: Ctx, effects: World['events'][number]['options'][number]['effects']): number {
  const hot = c.w.player.heat;
  let v = 0;
  for (const e of effects) {
    if (e.k === 'cash' || e.k === 'dirty') v += e.n / 400;
    if (e.k === 'heat') v -= e.n * (hot > 50 ? 0.6 : 0.2);
    if (e.k === 'respect' || e.k === 'fear') v += e.n * 0.4;
    if (e.k === 'loyalty') v += e.n * 0.15;
    if (e.k === 'standing') v += e.n * 0.12;
    if (e.k === 'influence') v += e.n * 0.2;
    if (e.k === 'evidence') v -= e.n * 0.4;
    if (e.k === 'jobOffer' || e.k === 'agendaKnown' || e.k === 'secretKnown' || e.k === 'recruit') v += 2;
    if (e.k === 'fire' || e.k === 'injure' || e.k === 'jail' || e.k === 'kill') v -= 3;
    if (e.k === 'goods' || e.k === 'product') v += e.n * 0.05;
  }
  return v;
}

// -------------------------------------------------------------------------------------- crew
function manageCrew(c: Ctx) {
  const w = () => c.w;
  const crew = select.crew(w()).filter(n => n.crew!.status === 'ready' || n.crew!.status === 'busy');
  // runners on unminded rackets, best skill first
  for (const rid of w().player.racketIds) {
    const r = w().rackets[rid]; if (!r || r.runnerId) continue;
    const skill = RACKETS[r.kind].skill;
    const free = select.crew(w()).filter(n => !n.crew!.assignment && n.crew!.status === 'ready').sort((a, b) => b.skills[skill] - a.skills[skill])[0];
    if (!free) break;
    if (reserveForJobs(c) && select.crew(w()).filter(n => !n.crew!.assignment && n.crew!.status === 'ready').length <= 1) break;
    if (act(c, { type: 'assign', npcId: free.id, assignment: { kind: 'racket', racketId: rid } })) bump(c, 'runners');
  }
  // workers on labs
  for (const sid of w().player.safehouseIds) for (const l of w().safehouses[sid].labs) {
    if (l.workerId) continue;
    const free = select.crew(w()).find(n => !n.crew!.assignment && n.crew!.status === 'ready');
    if (free) act(c, { type: 'assign', npcId: free.id, assignment: { kind: 'lab', labId: l.id } });
  }
  // a lieutenant over the district you hold most of
  const lt = crew.find(n => n.crew!.level >= 2 && n.crew!.loyalty >= 55 && n.crew!.assignment?.kind !== 'district' && n.crew!.assignment?.kind !== 'job');
  if (lt) {
    const counts: Record<Id, number> = {};
    for (const b of select.playerBlocks(w())) counts[b.districtId] = (counts[b.districtId] ?? 0) + 1;
    const d = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(x => x[0]).find(did => !Object.values(w().npcs).some(n => n.crew?.assignment?.kind === 'district' && n.crew.assignment.districtId === did));
    if (d && act(c, { type: 'assign', npcId: lt.id, assignment: { kind: 'district', districtId: d } })) bump(c, 'lieutenants');
  }
  // a guard when somebody is at war with you
  const war = Object.values(w().factions).some(f => f.alive && f.standing < -40);
  if ((war || select.crew(w()).length >= 5) && !select.crew(w()).some(n => n.crew?.assignment?.kind === 'guard')) {
    const g = select.crew(w()).filter(n => !n.crew!.assignment && n.crew!.status === 'ready').sort((a, b) => b.skills.muscle - a.skills.muscle)[0];
    if (g && act(c, { type: 'assign', npcId: g.id, assignment: { kind: 'guard', blockId: w().player.blockId } })) bump(c, 'guards');
  }
}
const reserveForJobs = (c: Ctx) => Object.values(c.w.jobs).some(j => j.status === 'offer');

// -------------------------------------------------------------------------------------- jobs
function runJobs(c: Ctx) {
  const w = () => c.w;
  for (const j of Object.values(w().jobs).filter(x => x.status === 'ready')) {
    // the big ones get a specialist when the money is there
    if (j.tier >= 2 && !j.specialist && w().player.cash + w().player.dirty > 15000) {
      const kind = (['safecracker', 'hacker', 'driver', 'gunman', 'face'] as const).find(k => can(w(), { type: 'hire_specialist', jobId: j.id, kind: k }).ok && j.leans.includes(({ safecracker: 'brains', hacker: 'tech', driver: 'wheels', gunman: 'muscle', face: 'charm' } as const)[k]));
      if (kind && act(c, { type: 'hire_specialist', jobId: j.id, kind })) bump(c, 'specialists');
    }
    const approach = bestApproach(c, j, j.crewIds);
    if (select.jobOdds(w(), j, j.crewIds, approach.a).chance < 35) { act(c, { type: 'drop_job', jobId: j.id }); continue; }
    if (act(c, { type: 'launch_job', jobId: j.id, approach: approach.a })) {
      const r = w().jobs[j.id];
      if (r?.status === 'paused') answerEverything(c);
      else if (r?.result) bump(c, r.result.success ? 'jobs_done' : 'jobs_failed');
    }
  }
  // take the best offer we can staff
  const offers = Object.values(w().jobs).filter(j => j.status === 'offer');
  const free = select.crew(w()).filter(n => n.crew!.status === 'ready' && (!n.crew!.assignment || n.crew!.assignment.kind === 'guard'));
  for (const j of offers.sort((a, b) => value(b) - value(a))) {
    if (Object.values(w().jobs).filter(x => x.status === 'planning' || x.status === 'ready').length >= 2) break;
    const team = free.filter(n => !n.crew!.assignment || n.crew!.assignment.kind === 'guard').sort((a, b) => j.leans.reduce((t, s) => t + b.skills[s] - a.skills[s], 0)).slice(0, Math.max(j.crewMin, Math.min(j.crewMax, 2)));
    if (team.length < j.crewMin) continue;
    const ap = bestApproach(c, j, team.map(n => n.id));
    if (ap.chance < 55) continue;
    for (const n of team) if (n.crew!.assignment?.kind === 'guard') act(c, { type: 'assign', npcId: n.id, assignment: null });
    if (act(c, { type: 'take_job', jobId: j.id, crewIds: team.map(n => n.id) })) { bump(c, 'jobs_taken'); break; }
  }
  // case something now and then, so the board is not only what the city offers
  if (c.rng.chance(0.25) && w().player.ap >= 3) {
    const here = select.businessesIn(w(), w().player.blockId).filter(b => b.ownedBy !== PLAYER && b.protection?.by !== PLAYER);
    const t = here[0];
    if (t) { const kinds = select.caseKinds(w(), { businessId: t.id }); if (kinds.length && act(c, { type: 'case', kind: kinds[0], businessId: t.id })) bump(c, 'cased'); }
  }
}
const value = (j: Job) => j.payout.dirty + j.payout.clean * 1.3 + j.payout.goods * 50 + j.payout.respect * 200;
function bestApproach(c: Ctx, j: Job, crewIds: Id[]): { a: Approach; chance: number } {
  const all: Approach[] = ['quiet', 'loud', 'clever'];
  return all.map(a => ({ a, chance: select.jobOdds(c.w, j, crewIds, a).chance - (a === 'loud' ? 6 : 0) })).sort((x, y) => y.chance - x.chance)[0];
}

// ------------------------------------------------------------------------------------- money
function money(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  // the fixer: meet them once, then wash when clean money is what we are short of
  const fx = w().fixerId ? w().npcs[w().fixerId!] : undefined;
  if (fx?.alive && !fx.rel.met && p().ap >= 3) { goTo(c, fx.homeBlockId); if (act(c, { type: 'scene', kind: 'chat', npcId: fx.id })) bump(c, 'chats'); }
  const laundry = p().racketIds.some(id => w().rackets[id] && RACKETS[w().rackets[id].kind].wash);
  if (fx?.rel.met && p().dirty > 1500 && (!laundry || p().cash < 3000)) {
    const amt = Math.min(p().dirty - 500, select.fixerCap(w()) - p().washedToday);
    if (amt > 200 && act(c, { type: 'fixer_wash', amount: amt })) bump(c, 'fixer');
  }
  if (laundry) bump(c, 'washes', 0);
  if (laundry && p().washedToday > 0) bump(c, 'washes');
  // sell product off the corner when there is no dealer
  for (const prod of ['pills', 'green', 'booze'] as const) {
    const n = p().stash[prod].n;
    const dealer = p().racketIds.some(id => w().rackets[id]?.kind === 'dealing');
    if (n >= 10 && (!dealer || n > 60) && act(c, { type: 'sell_street', product: prod, n })) bump(c, 'street_sales');
  }
  // gear, once there is money to spare
  for (const k of ['weapons', 'tools', 'wheels', 'tech'] as const) {
    const lvl = p().gear[k]; if (lvl >= 3) continue;
    const price = GEAR[k].levels[lvl + 1].price;
    if (p().cash + p().dirty > price * 4 && act(c, { type: 'buy_gear', kind: k })) bump(c, 'gear');
  }
  if (!p().lawyer && select.openCases(w()).some(x => x.evidence > 50) && act(c, { type: 'lawyer', on: true })) bump(c, 'lawyer');
}

function goTo(c: Ctx, blockId: Id): boolean {
  if (c.w.player.blockId === blockId) return true;
  if (act(c, { type: 'travel', blockId })) { bump(c, 'travel'); return true; }
  return false;
}

// ------------------------------------------------------------------------------------ street
function street(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  let guard = 0;
  while (p().ap > 1 && guard++ < 14) {
    // the best thing to do with an action point near here
    const here = w().blocks[p().blockId];
    const blocks = [here.id, ...here.neighborIds].filter(id => select.travelCost(w(), id) === 0);
    const people = blocks.flatMap(id => select.businessesIn(w(), id)).filter(b => b.tier < 3 && b.ownedBy !== PLAYER);
    const cands: { a: Action; v: number; k: Counter; block: Id }[] = [];
    for (const b of people) {
      const o = w().npcs[b.ownerId]; if (!o?.alive) continue;
      if (b.protection?.by !== PLAYER) {
        const q = select.quote(w(), 'protect', o.id, { businessId: b.id, rate: 0.12 });
        if ((!q.disabled || q.disabled.startsWith('Go to')) && q.chance >= 45) cands.push({ a: { type: 'scene', kind: 'protect', npcId: o.id, businessId: b.id, rate: 0.12 }, v: q.chance * (b.income / 100) * (b.protection ? 0.5 : 1), k: 'protected', block: b.blockId });
        if (q.chance < 45) {
          const t = select.quote(w(), 'intimidate', o.id);
          if (o.rel.fear < 50 && t.chance >= 45) cands.push({ a: { type: 'scene', kind: 'intimidate', npcId: o.id }, v: t.chance * 0.8, k: 'threats', block: o.homeBlockId });
          if (o.rel.trust < 30) cands.push({ a: { type: 'scene', kind: 'chat', npcId: o.id }, v: 25 + (o.rel.met ? 0 : 10), k: 'chats', block: o.homeBlockId });
        }
      }
      if (o.agenda?.known && o.agenda.cost && o.agenda.cost < (p().cash + p().dirty) * 0.25) cands.push({ a: { type: 'scene', kind: 'settle', npcId: o.id }, v: 55, k: 'settled', block: o.homeBlockId });
      if (o.rel.owes && b.protection?.by === PLAYER) cands.push({ a: { type: 'scene', kind: 'favour', npcId: o.id }, v: 50, k: 'favours', block: o.homeBlockId });
      if (!o.rel.met) cands.push({ a: { type: 'scene', kind: 'chat', npcId: o.id }, v: 20, k: 'chats', block: o.homeBlockId });
      if (o.secret?.known && c.rng.chance(0.3)) cands.push({ a: { type: 'scene', kind: 'lean', npcId: o.id }, v: 30, k: 'leaned', block: o.homeBlockId });
      if (b.protection?.by !== PLAYER && b.till > b.income * 1.5 && o.rel.fear > 25 && c.rng.chance(0.25)) cands.push({ a: { type: 'scene', kind: 'squeeze', npcId: o.id, businessId: b.id }, v: 20, k: 'squeezed', block: b.blockId });
      // patrons: future crew
      for (const pid of b.patronIds) {
        const n = w().npcs[pid]; if (!n?.alive || n.crew || n.faction) continue;
        const best = Math.max(...Object.values(n.skills));
        if (p().crewIds.length < select.bedsTotal(w())) {
          const q = select.quote(w(), 'recruit', n.id);
          if (!q.disabled && q.chance >= 40 && best >= 5) cands.push({ a: { type: 'scene', kind: 'recruit', npcId: n.id }, v: 60 + best * 4, k: 'recruited', block: n.homeBlockId });
          else if (best >= 6 && n.rel.trust < 20 && p().crewIds.length < 8) cands.push({ a: { type: 'scene', kind: 'chat', npcId: n.id }, v: 22 + best * 2, k: 'chats', block: n.homeBlockId });
        }
      }
    }
    // officials when hot
    if (p().heat > 35) for (const o of select.officials(w())) {
      if (o.payroll) continue;
      const q = select.quote(w(), 'bribe', o.id);
      if (!q.disabled && q.chance >= 40 && (q.cash ?? 0) * 3 < p().cash + p().dirty) cands.push({ a: { type: 'scene', kind: 'bribe', npcId: o.id }, v: 70, k: 'bribed', block: o.homeBlockId });
    }
    // buy a place with clean money
    const buyable = people.filter(b => b.protection?.by === PLAYER && select.businessPrice(w(), b) < p().cash * 0.6);
    for (const b of buyable) cands.push({ a: { type: 'scene', kind: 'buy', npcId: b.ownerId, businessId: b.id }, v: 65, k: 'bought', block: b.blockId });
    const pick = cands.filter(x => can(w(), { type: 'travel', blockId: x.block }).ok || x.block === p().blockId)
      .sort((a, b) => b.v - a.v).find(x => { if (x.block !== p().blockId) goTo(c, x.block); return can(w(), x.a).ok; });
    if (!pick) {
      // nothing here: move toward ground we do not hold yet
      const next = here.neighborIds.filter(id => select.blockController(w(), id) !== PLAYER && select.businessesIn(w(), id).length).sort(() => c.rng.float() - 0.5)[0];
      if (!next || !goTo(c, next)) break;
      continue;
    }
    if (act(c, pick.a)) bump(c, pick.k);
    else break;
  }
}

// ------------------------------------------------------------------------------------- build
function build(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  const purse = () => p().cash + p().dirty;
  // rackets on places we protect or own, the best earner the place allows
  const places = Object.values(w().businesses).filter(b => (b.protection?.by === PLAYER || b.ownedBy === PLAYER) && b.tier < 3);
  for (const b of places) {
    const kinds = (BUSINESSES[b.type].rackets as RacketKind[]).filter(k => can(w(), { type: 'start_racket', businessId: b.id, kind: k }).ok);
    const laundry = p().racketIds.some(id => w().rackets[id]?.kind === 'laundering');
    const want = kinds.sort((a, k) => pref(k, laundry, p().dirty) - pref(a, laundry, p().dirty))[0];
    if (want && purse() > RACKETS[want].setup * 1.6 && act(c, { type: 'start_racket', businessId: b.id, kind: want })) bump(c, 'rackets');
  }
  for (const id of p().racketIds) { const r = w().rackets[id]; if (r && r.level < 3 && purse() > select.upgradeCost(r) * 3 && act(c, { type: 'upgrade_racket', racketId: id })) bump(c, 'upgrades'); }
  // a safehouse once there is money, on ground we hold, and a still in it
  if (p().safehouseIds.length === 0 && purse() > 2500) {
    const b = select.playerBlocks(w())[0] ?? Object.values(w().blocks).filter(x => (x.influence[PLAYER] ?? 0) >= 10).sort((a, x) => (x.influence[PLAYER] ?? 0) - (a.influence[PLAYER] ?? 0))[0];
    if (b && goTo(c, b.id) && act(c, { type: 'rent_safehouse', blockId: b.id })) bump(c, 'safehouses');
  }
  if (p().safehouseIds.length === 1 && purse() > 20000 && p().crewIds.length >= select.bedsTotal(w()) - 1) {
    const b = select.playerBlocks(w()).find(x => !x.safehouseId);
    if (b && goTo(c, b.id) && act(c, { type: 'rent_safehouse', blockId: b.id })) bump(c, 'safehouses');
  }
  for (const sid of p().safehouseIds) {
    const s = w().safehouses[sid];
    const kind = s.labs.length === 0 ? 'still' : s.labs.length === 1 && purse() > 8000 ? 'grow' : undefined;
    if (kind && purse() > LABS[kind].setup * 1.8 && act(c, { type: 'build_lab', safehouseId: sid, kind })) bump(c, 'labs');
    for (const l of w().safehouses[sid].labs) if (l.supplies < 2 && act(c, { type: 'restock_lab', safehouseId: sid, labId: l.id, days: 5 })) bump(c, 'restocks');
    if (s.tier < 3 && purse() > 30000 && act(c, { type: 'upgrade_safehouse', safehouseId: sid })) { /* ok */ }
  }
}
function pref(k: RacketKind, laundry: boolean, dirty: number) {
  if (k === 'laundering') return laundry ? -1 : dirty > 2000 ? 900 : 100;
  if (RACKETS[k].sells) return 50;
  return RACKETS[k].base;
}

// ----------------------------------------------------------------------------------- corners
/** Before the street work, like building: this needs action points the street loop would spend. */
function corners(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  // the corners: deal with any crew on ground we are working, the cheapest way that will land
  for (const cr of Object.values(w().crews ?? {})) {
    if (cr.terms !== 'none' || p().ap < 2) continue;
    const b = w().blocks[cr.blockId];
    const near = [b.id, ...b.neighborIds].some(id => (w().blocks[id].influence[PLAYER] ?? 0) > 5);
    if (!near && cr.members < 10) continue;
    const opts = (['crew_take', 'crew_pay', 'crew_run'] as const).map(k => ({ k, q: select.quote(w(), k, cr.bossId) })).filter(x => !x.q.disabled || x.q.disabled.startsWith('Go to'));
    const best = opts.sort((a, x) => x.q.chance - a.q.chance)[0];
    if (!best || best.q.chance < 40) continue;
    if (best.k !== 'crew_run' && (p().cash + p().dirty) < (best.q.label.match(/\$([\d,]+)/) ? 30 * Number(best.q.label.match(/\$([\d,]+)/)![1].replace(/,/g, '')) : 0)) continue;
    if (!goTo(c, cr.blockId)) continue;
    if (act(c, { type: 'scene', kind: best.k, npcId: cr.bossId })) bump(c, best.k === 'crew_take' ? 'crews_taken' : best.k === 'crew_pay' ? 'crews_paid' : 'crews_run');
  }
}

// ---------------------------------------------------------------------------------- politics
function politics(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  // lieutenants' books, once a fortnight
  for (const n of select.crew(w())) if (n.crew?.assignment?.kind === 'district' && w().day % 14 === 0 && act(c, { type: 'audit', npcId: n.id })) bump(c, 'audits');
  for (const f of Object.values(w().factions)) {
    if (!f.alive) continue;
    if (f.standing < -50 && p().ap >= 2 && act(c, { type: 'sit_down', factionId: f.id, offer: 'truce' })) { bump(c, 'sitdowns'); continue; }
    if (f.standing < -20 && f.standing >= -50 && p().cash + p().dirty > 6000 && act(c, { type: 'tribute', factionId: f.id, amount: 1500 })) bump(c, 'tributes');
  }
}

// -------------------------------------------------------------------------------- invariants
function check(c: Ctx) {
  const w = c.w; const p = w.player;
  const bad = (v: number, what: string) => { if (!Number.isFinite(v)) throw new Error(`NaN in ${what} on day ${w.day}`); };
  bad(p.cash, 'cash'); bad(p.dirty, 'dirty'); bad(p.heat, 'heat');
  if (p.cash < 0 || p.dirty < 0) throw new Error(`negative purse on day ${w.day}: ${p.cash} / ${p.dirty}`);
  for (const b of Object.values(w.blocks)) for (const v of Object.values(b.influence)) bad(v, `influence ${b.id}`);
  for (const f of Object.values(w.factions)) { bad(f.cash, `faction cash ${f.id}`); bad(f.standing, `standing ${f.id}`); }
  for (const id of p.crewIds) if (!w.npcs[id]?.crew) throw new Error(`crew list names ${id}, who is not crew`);
  for (const r of Object.values(w.rackets)) if (!w.businesses[r.businessId]?.racketIds.includes(r.id)) throw new Error(`racket ${r.id} not listed on its business`);
}

export function missing(counts: RunResult['counts']): string[] {
  return SYSTEMS.filter(s => !s.needs.some(n => (counts[n] ?? 0) > 0)).map(s => s.label);
}
