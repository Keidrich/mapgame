/**
 * The remake's soak bot. It plays the game through `dispatch` exactly as the UI does — no side
 * doors — and counts what it touched, so "the bot never reached it" is a number rather than a
 * surprise. Same idea as the original's bot, built in from day one this time instead of after
 * three passes shipped blind.
 *
 * It plays in one of five temperaments, from a boss who never takes a job under 75% and pays every
 * corner crew off, to one who declares war on everybody by day ten and kills every hostage. The
 * same seed under each is the ferocity sweep: `npm run sim2 -- 60 7 medium grifter all`.
 */
import { BUSINESSES, JOBS, LABS, RACKETS } from '@r/content/world';
import { ITEMS, SLOTS_ORDER, type ItemId, type Slot } from '@r/content/kit';
import { SETPIECES, SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { CATALOGUE, CATALOGUE_KINDS } from '@r/content/catalogue';
import { can, dispatch, newWorld, select, PLAYER, type Action, type Background, type Id, type Job, type World } from '@r/sim/index';
import { Rng } from '@r/sim/rng';
import type { CitySize } from '@r/sim/city';
import type { Approach, JobKind, RacketKind } from '@r/sim/types';

export type Counter =
  | 'days' | 'chats' | 'threats' | 'protected' | 'squeezed' | 'recruited' | 'bribed' | 'settled' | 'leaned' | 'bought' | 'favours'
  | 'rackets' | 'upgrades' | 'washes' | 'fixer' | 'safehouses' | 'labs' | 'restocks' | 'street_sales' | 'gear'
  | 'jobs_taken' | 'jobs_done' | 'jobs_failed' | 'complications' | 'cased' | 'events' | 'tributes' | 'sitdowns' | 'wars'
  | 'lieutenants' | 'guards' | 'runners' | 'lawyer' | 'lay_low' | 'travel' | 'cases_opened' | 'raids' | 'busts'
  | 'crews_paid' | 'crews_taken' | 'crews_run' | 'audits' | 'specialists'
  | 'kit_bought' | 'kit_equipped' | 'hostages_taken' | 'hostages_resolved' | 'crew_snatched' | 'ransom_paid'
  | 'meetings' | 'lobbied' | 'voted' | 'setpieces_cased' | 'setpiece_stages' | 'setpieces_done' | 'declared'
  | 'cities' | 'routes' | 'route_sales' | 'remote_jobs' | 'crew_moved' | 'nights' | 'night_events'
  | 'made' | 'appointed' | 'rats_found' | 'coups'
  | 'fights' | 'fights_won' | 'ambushes' | 'bullets_bought';

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
  { label: 'buying kit', needs: ['kit_bought'] },
  { label: 'handing out kit', needs: ['kit_equipped'] },
  { label: 'jobs', needs: ['jobs_done', 'jobs_failed'] },
  { label: 'complications', needs: ['complications'] },
  { label: 'casing a target', needs: ['cased'] },
  { label: 'events', needs: ['events'] },
  { label: 'nightfall', needs: ['nights'] },
  { label: 'making members', needs: ['made'] },
  { label: 'the posts', needs: ['appointed'] },
  { label: 'rats and coups', needs: ['rats_found', 'coups'] },
  { label: 'street fights', needs: ['fights', 'ambushes'] },
  { label: 'buying rounds', needs: ['bullets_bought'] },
  { label: 'night encounters', needs: ['night_events'] },
  { label: 'diplomacy', needs: ['tributes', 'sitdowns'] },
  { label: 'lieutenants', needs: ['lieutenants'] },
  { label: 'guards', needs: ['guards'] },
  { label: 'street crews', needs: ['crews_paid', 'crews_taken', 'crews_run'] },
  { label: 'audits', needs: ['audits'] },
  { label: 'specialists', needs: ['specialists'] },
  { label: 'hostages', needs: ['hostages_resolved'] },
  { label: 'the Commission', needs: ['lobbied', 'voted'] },
  { label: 'set-pieces', needs: ['setpieces_done'] },
  { label: 'war', needs: ['declared'] },
  // the region: reached in natural play only once a quarter of a city is yours, which is late in
  // sixty days; the region scenario (`npm run sim2 -- 60 7 medium grifter region`) always reaches them
  { label: 'another city', needs: ['cities'] },
  { label: 'trade routes', needs: ['route_sales'] },
  { label: 'remote work', needs: ['remote_jobs'] },
  { label: 'moving crew', needs: ['crew_moved'] },
];
/** The rows only the region reaches: excluded from the natural sweep's must-reach list, held by the region scenario instead. */
export const REGION_SYSTEMS = ['another city', 'trade routes', 'remote work', 'moving crew'];
/** Rows only the family scenario reaches: a well-run outfit has no rats and no coups in sixty days. */
export const FAMILY_SYSTEMS = ['rats and coups'];
/** Every row that a natural sixty days is not expected to reach, held by its own scenario instead. */
export const SCENARIO_ONLY = [...REGION_SYSTEMS, ...FAMILY_SYSTEMS];

// ---------------------------------------------------------------------------------- temperaments
/**
 * How a boss plays. Every number here is a threshold the bot already had, pulled out so the same
 * bot can be timid or rabid. `steady` is the bot as it was before temperaments existed, and is the
 * default so `npm run sim2 -- 60` keeps meaning what it meant.
 */
export interface Style {
  label: string;
  blurb: string;
  /** Take a job at this chance or better; drop a planned one that has fallen under `launchAt`. */
  takeAt: number; launchAt: number;
  /** Jobs planned at once. */
  maxJobs: number;
  /** Points off the loud approach when choosing (negative: prefers it), and onto clever. */
  loudCost: number; cleverBonus: number;
  /** How much heat worries it, in complications and events. */
  heatCare: number;
  /** Weight on threats versus talk, and how often it squeezes a till. */
  threaten: number; squeeze: number;
  /** How it deals with a corner crew: a bias toward that answer. */
  corner: 'crew_pay' | 'crew_take' | 'crew_run';
  /** Heat at which it lays low (undefined: never) and starts buying officials (Infinity: never). */
  layLow?: number; bribeAt: number;
  /** Sit down for a truce below this standing (undefined: never); send tribute when cool. */
  truceAt?: number; tribute: boolean;
  /** Wars it starts: none, on the weakest outfit once it has a crew, or on everybody. */
  war: 'never' | 'weakest' | 'everyone';
  /** Kit: buys an item when the purse is this many times its price, in this slot order. */
  kitMult: number; kitSlots: Slot[];
  /** Hostages: what it does and after how many days; pays for its own people at purse ≥ ransom × this (undefined: never). */
  hostage: 'ransom' | 'release' | 'trade' | 'kill'; holdDays: number; payFor?: number;
  /** Cases a kidnap target when it has somewhere to keep them. */
  kidnaps: boolean;
  /** The Commission: never lobbies, only when it is the target, or on everything. And whether it wants peace. */
  lobby: 'never' | 'defend' | 'always'; peace: boolean;
  /** Goes after the landmark set-pieces. */
  setpieces: boolean;
  /**
   * Appetite for the rest of the catalogue: the daily chance of casing the least-tried job in
   * reach, and how much a never-run kind jumps the queue on the board (in dollars of value).
   */
  curiosity: number; novelty: number;
  /** Takes the train once a road opens, and sets up in the next city. */
  roams: boolean;
}
export type StyleId = 'timid' | 'steady' | 'schemer' | 'ruthless' | 'maniac' | 'collector';
export const STYLES: Record<StyleId, Style> = {
  timid: { label: 'Timid', blurb: 'Only sure things, pays everybody off, lays low early.', takeAt: 75, launchAt: 60, maxJobs: 1, loudCost: 20, cleverBonus: 0, heatCare: 2.5, threaten: 0.4, squeeze: 0.03, corner: 'crew_pay', layLow: 55, bribeAt: 25, truceAt: -30, tribute: true, war: 'never', kitMult: 6, kitSlots: ['armour', 'car', 'look'], hostage: 'ransom', holdDays: 0, payFor: 1.2, kidnaps: false, lobby: 'defend', peace: true, setpieces: false, curiosity: 0.1, novelty: 0, roams: false },
  steady: { label: 'Steady', blurb: 'The bot as it always played: good odds, fair dealing, a war only if it comes.', takeAt: 55, launchAt: 35, maxJobs: 2, loudCost: 6, cleverBonus: 0, heatCare: 1, threaten: 0.8, squeeze: 0.25, corner: 'crew_take', layLow: 85, bribeAt: 35, truceAt: -50, tribute: true, war: 'never', kitMult: 4, kitSlots: ['weapon', 'tool', 'car', 'armour', 'tech', 'look'], hostage: 'ransom', holdDays: 3, payFor: 2, kidnaps: false, lobby: 'defend', peace: true, setpieces: true, curiosity: 0.2, novelty: 1500, roams: true },
  schemer: { label: 'Schemer', blurb: 'Clever over loud, officials early, works every vote at the table.', takeAt: 55, launchAt: 40, maxJobs: 2, loudCost: 14, cleverBonus: 6, heatCare: 1.2, threaten: 0.5, squeeze: 0.1, corner: 'crew_take', layLow: 80, bribeAt: 15, truceAt: -45, tribute: true, war: 'never', kitMult: 4, kitSlots: ['look', 'tech', 'tool', 'car', 'armour'], hostage: 'trade', holdDays: 2, payFor: 1.5, kidnaps: true, lobby: 'always', peace: true, setpieces: true, curiosity: 0.5, novelty: 5000, roams: true },
  ruthless: { label: 'Ruthless', blurb: 'Takes long odds, runs crews off, picks a war with the weakest outfit.', takeAt: 45, launchAt: 30, maxJobs: 2, loudCost: 0, cleverBonus: 0, heatCare: 0.5, threaten: 1.4, squeeze: 0.5, corner: 'crew_run', layLow: 92, bribeAt: 50, truceAt: -85, tribute: false, war: 'weakest', kitMult: 2.5, kitSlots: ['weapon', 'armour', 'car', 'tool'], hostage: 'ransom', holdDays: 5, payFor: 3, kidnaps: true, lobby: 'defend', peace: false, setpieces: true, curiosity: 0.3, novelty: 3000, roams: true },
  maniac: { label: 'Maniac', blurb: 'Anything over 30%, always loud, war on everybody, no hostage comes home.', takeAt: 30, launchAt: 20, maxJobs: 3, loudCost: -10, cleverBonus: 0, heatCare: 0, threaten: 2, squeeze: 0.8, corner: 'crew_run', bribeAt: Infinity, tribute: false, war: 'everyone', kitMult: 1.5, kitSlots: ['weapon', 'armour'], hostage: 'kill', holdDays: 1, kidnaps: true, lobby: 'never', peace: false, setpieces: true, curiosity: 0.3, novelty: 5000, roams: true },
  // not a temperament: the catalogue scenario's player, who wants to have done everything once
  collector: { label: 'Collector', blurb: 'Plays the catalogue scenario: every job once, whatever it pays.', takeAt: 20, launchAt: 10, maxJobs: 8, loudCost: 0, cleverBonus: 0, heatCare: 0.5, threaten: 1, squeeze: 0.3, corner: 'crew_take', layLow: 90, bribeAt: 30, tribute: false, war: 'never', kitMult: 3, kitSlots: ['weapon', 'armour', 'tool', 'tech'], hostage: 'ransom', holdDays: 2, payFor: 1.5, kidnaps: true, lobby: 'always', peace: false, setpieces: true, curiosity: 1, novelty: 1e6, roams: false },
};
/** The five temperaments the sweep compares, mildest first. The collector is a scenario, not a temperament. */
export const STYLE_IDS: StyleId[] = ['timid', 'steady', 'schemer', 'ruthless', 'maniac'];

/** `kinds`: every job kind that reached a result (done or failed), and how often — the catalogue's coverage. */
export interface RunResult { w: World; counts: Partial<Record<Counter, number>>; kinds: Partial<Record<JobKind, number>>; offered: Partial<Record<JobKind, number>>; taken: Partial<Record<JobKind, number>>; actions: number; refused: number }
interface Ctx { w: World; rng: Rng; s: Style; counts: Partial<Record<Counter, number>>; kinds: Partial<Record<JobKind, number>>; offered: Partial<Record<JobKind, number>>; taken: Partial<Record<JobKind, number>>; actions: number; refused: number; seen: Set<Id> }

const bump = (c: Ctx, k: Counter, n = 1) => { c.counts[k] = (c.counts[k] ?? 0) + n; };
/** Crew work only in the city they are in (`region.ts`): every pick of people goes through this. */
const inCity = (city: string) => (n: { crew?: { cityId?: string } }) => (n.crew?.cityId || 'c0') === city;
const jobCity = (w: World, j: Job) => select.cityOfBlock(w, j.blockId);
/**
 * How many times the bot has tried a kind — except that the first link of a chain it never pulled
 * off counts as untried while a later link waits on it. A failed smuggle run once meant the
 * dockside pickup and the convoy behind it never came up again.
 */
function tried(c: Ctx, k: JobKind): number {
  const n = c.kinds[k] ?? 0;
  if (!n || c.w.player.done?.[k]) return n;
  const waiting = CATALOGUE_KINDS.some(x => !c.kinds[x] && CATALOGUE[x].needs?.after?.includes(k));
  const inside = k === 'rat' && !Object.values(c.w.npcs).some(x => x.alive && x.inside) && CATALOGUE_KINDS.some(x => !c.kinds[x] && CATALOGUE[x].target === 'inside');
  return waiting || inside ? 0 : n;
}
function act(c: Ctx, a: Action): boolean {
  const ok = can(c.w, a);
  if (!ok.ok) { c.refused++; return false; }
  c.w = dispatch(c.w, a); c.actions++;
  return true;
}

export function run(opts: { days: number; seed: number; size?: CitySize; background?: Background; style?: StyleId; scenario?: Scenario; onDay?: (w: World) => void }): RunResult {
  const w0 = newWorld({ seed: opts.seed, size: opts.size ?? 'medium', name: 'Bot', background: opts.background ?? 'grifter' });
  if (opts.scenario === 'catalogue') boost(w0);
  if (opts.scenario === 'region') boostRegion(w0);
  if (opts.scenario === 'family') boostFamily(w0);
  const c: Ctx = { w: w0, rng: new Rng(opts.seed * 31 + 7), s: STYLES[opts.scenario === 'catalogue' ? 'collector' : opts.style ?? 'steady'], counts: {}, kinds: {}, offered: {}, taken: {}, actions: 0, refused: 0, seen: new Set() };
  while (c.w.day <= opts.days && !c.w.over) {
    day(c);
    opts.onDay?.(c.w);
    check(c);
    watch(c);
    bump(c, 'days');
  }
  return { w: c.w, counts: c.counts, kinds: c.kinds, offered: c.offered, taken: c.taken, actions: c.actions, refused: c.refused };
}

function day(c: Ctx) {
  answerEverything(c);
  const p = () => c.w.player;
  if (c.s.layLow !== undefined && p().heat > c.s.layLow && p().lowDays === 0) { if (act(c, { type: 'lay_low', days: 3 })) bump(c, 'lay_low'); answerEverything(c); return; }
  // two halves: the same routine by day and again after dark. Every step asks `can()`, so what is
  // shut at this hour is simply refused — the bot does not need its own copy of the clock
  shift(c);
  if (act(c, { type: 'nightfall' })) { bump(c, 'nights'); answerEverything(c); shift(c); }
  answerEverything(c);
  if (act(c, { type: 'end_day' })) { /* counted in run */ }
  answerEverything(c);
}
function shift(c: Ctx) {
  manageCrew(c);
  family(c);
  legal(c);
  fights(c);
  hostages(c);
  // building comes before the street work: the street loop spends every action point it can
  // find, and a safehouse needs one — the first draft never rented a single one in sixty days
  build(c);
  corners(c);
  runJobs(c);
  region(c);   // before money: the stash is what a route ships, and money() sells it on the corner
  money(c);
  kit(c);
  street(c);
  politics(c);
  commission(c);
  answerEverything(c);
}

// ------------------------------------------------------------------------------------ fights
/**
 * Rounds for whoever carries a gun, and — after dark, for the temperaments that fight wars — taking
 * it to an outfit you are at war or beef with, on one of its blocks next to you, when the odds are
 * good enough for the temperament. A war the bot is not in is a war it does not start here.
 */
function fights(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  const armed = [PLAYER as string, ...p().crewIds].some(id => select.GUNS.includes((id === PLAYER ? p().kit : w().npcs[id]?.crew?.kit)?.weapon as never));
  if (armed && p().bullets < 30 && p().cash + p().dirty > 3000 && act(c, { type: 'buy_bullets', n: 100, at: 'fixer' })) bump(c, 'bullets_bought');
  if (c.s.war === 'never' || !select.isNight(w()) || p().ap < select.ATTACK.ap + 1) return;
  const need = c.s.war === 'everyone' ? 45 : 58;
  const here = w().blocks[p().blockId];
  const city = select.currentCity(w());
  const crew = select.crew(w()).filter(n => (n.crew!.cityId || 'c0') === city && n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job').sort((a, b) => b.skills.muscle - a.skills.muscle).slice(0, select.ATTACK.maxCrew);
  for (const bid of [here.id, ...here.neighborIds]) {
    const b = w().blocks[bid];
    const f = Object.values(w().factions).find(x => x.alive && (b.influence[x.id] ?? 0) >= 10 && ['war', 'beef'].includes(select.stanceOf(x, w().day)) && !(x.truceUntil !== undefined && w().day < x.truceUntil));
    if (!f) continue;
    if (select.fightOdds(w(), select.sideOf(w(), crew.map(n => n.id)), select.soldiersOn(w(), f)) < need) continue;
    if (!goTo(c, bid)) continue;
    if (act(c, { type: 'attack', factionId: f.id, blockId: bid, crewIds: crew.map(n => n.id) })) { bump(c, 'fights'); if (w().fight?.won) bump(c, 'fights_won'); }
    break;
  }
}

// ------------------------------------------------------------------------------------ the law
/**
 * A file against you grows while its witnesses talk. Lean on a talking witness (45 fear and they
 * go quiet), and take a lawyer once a file is getting serious. The bots did neither until the
 * family pass, and a single early burglary with two witnesses convicted the steady bot by day 27.
 */
function legal(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  const files = select.openCases(w()).filter(x => x.suspectId === PLAYER && x.status === 'open' && x.evidence > 20);
  if (!files.length) return;
  if (!p().lawyer && files.some(x => x.evidence > 40) && act(c, { type: 'lawyer', on: true })) bump(c, 'lawyer');
  let tries = 0;
  for (const f of files.sort((a, b) => b.evidence - a.evidence)) for (const id of f.witnessIds) {
    const n = w().npcs[id]; if (!n?.alive || n.rel.fear >= 45 || tries >= 2 || p().ap < 2) continue;
    const q = select.quote(w(), 'intimidate', n.id);
    if (q.chance < 35) continue;
    tries++;
    if (goTo(c, select.whereIs(w(), n)) && act(c, { type: 'scene', kind: 'intimidate', npcId: n.id })) bump(c, 'threats');
  }
}

// ------------------------------------------------------------------------------------ the family
/**
 * Make whoever qualifies once there is money for it three times over, and keep both posts filled:
 * the underboss is the best-levelled made man, the consigliere the best talker among the rest.
 */
function family(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  for (const n of select.crew(w())) {
    if (select.makeBlock(n) || p().cash + p().dirty < select.MAKING.cost * 3) continue;
    if (act(c, { type: 'make_member', npcId: n.id })) bump(c, 'made');
  }
  const made = select.crew(w()).filter(n => n.crew!.made && n.crew!.status === 'ready');
  if (!select.underboss(w())) { const ub = made.slice().sort((a, b) => b.crew!.level - a.crew!.level)[0]; if (ub && act(c, { type: 'appoint', post: 'underboss', npcId: ub.id })) bump(c, 'appointed'); }
  if (!select.consigliere(w())) { const cg = made.filter(n => n.id !== w().player.family?.underboss).sort((a, b) => b.skills.charm - a.skills.charm)[0]; if (cg && act(c, { type: 'appoint', post: 'consigliere', npcId: cg.id })) bump(c, 'appointed'); }
}

// ------------------------------------------------------------------------------------ events
function answerEverything(c: Ctx) {
  let guard = 0;
  while (guard++ < 10) {
    const j = select.pendingJob(c.w);
    if (j?.complication) {
      const best = j.complication.options.map(o => ({ o, v: select.complicationOdds(c.w, j, o.id) / 100 * o.payout - o.heat / 40 * c.s.heatCare })).sort((a, b) => b.v - a.v)[0];
      if (act(c, { type: 'answer', jobId: j.id, optionId: best.o.id })) {
        bump(c, 'complications'); if (j.setpiece) bump(c, 'setpiece_stages');
        const r = c.w.jobs[j.id]?.result; if (r) { bump(c, r.success ? 'jobs_done' : 'jobs_failed'); if (j.kind === 'setpiece') bump(c, 'setpieces_done'); }
      }
      continue;
    }
    const e = c.w.events[0]; if (!e) break;
    const scored = e.options.filter(o => !o.disabled).map(o => ({ o, v: scoreEffects(c, o.effects) }));
    const pick = scored.sort((a, b) => b.v - a.v)[0]?.o ?? e.options[e.options.length - 1];
    if (act(c, { type: 'resolve_event', eventId: e.id, optionId: pick.id })) { bump(c, 'events'); if (e.template.startsWith('night_')) bump(c, 'night_events'); if (e.template === 'rat_found') bump(c, 'rats_found'); if (e.template === 'coup') bump(c, 'coups'); if (e.template === 'night_ambush') { bump(c, 'ambushes'); if (pick.id === 'fight') { bump(c, 'fights'); if (c.w.fight?.won) bump(c, 'fights_won'); } } }
    else break;
  }
}
function scoreEffects(c: Ctx, effects: World['events'][number]['options'][number]['effects']): number {
  const hot = c.w.player.heat;
  let v = 0;
  for (const e of effects) {
    if (e.k === 'cash' || e.k === 'dirty') v += e.n / 400;
    if (e.k === 'heat') v -= e.n * (hot > 50 ? 0.6 : 0.2) * c.s.heatCare;
    if (e.k === 'respect' || e.k === 'fear') v += e.n * 0.4;
    if (e.k === 'loyalty') v += e.n * 0.15;
    if (e.k === 'standing') v += e.n * 0.12;
    if (e.k === 'influence') v += e.n * 0.2;
    if (e.k === 'evidence') v -= e.n * 0.4;
    if (e.k === 'jobOffer' || e.k === 'agendaKnown' || e.k === 'secretKnown' || e.k === 'recruit') v += 2;
    if (e.k === 'fire' || e.k === 'injure' || e.k === 'jail' || e.k === 'kill') v -= 3;
    if (e.k === 'goods' || e.k === 'product') v += e.n * 0.05;
    // a fight is worth its odds: a sure one is a win, a coin toss is somebody in hospital
    if (e.k === 'fight') v += (e.odds - 55) / 8;
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
    const rc = select.cityOfBlock(w(), w().businesses[r.businessId].blockId);
    const free = select.crew(w()).filter(inCity(rc)).filter(n => !n.crew!.assignment && n.crew!.status === 'ready').sort((a, b) => b.skills[skill] - a.skills[skill])[0];
    if (!free) continue;
    if (reserveForJobs(c) && select.crew(w()).filter(n => !n.crew!.assignment && n.crew!.status === 'ready').length <= 1) break;
    if (act(c, { type: 'assign', npcId: free.id, assignment: { kind: 'racket', racketId: rid } })) bump(c, 'runners');
  }
  // workers on labs
  for (const sid of w().player.safehouseIds) for (const l of w().safehouses[sid].labs) {
    if (l.workerId) continue;
    const free = select.crew(w()).filter(inCity(select.cityOfBlock(w(), w().safehouses[sid].blockId))).find(n => !n.crew!.assignment && n.crew!.status === 'ready');
    if (free) act(c, { type: 'assign', npcId: free.id, assignment: { kind: 'lab', labId: l.id } });
  }
  // a lieutenant over the district you hold most of
  const lt = crew.find(n => n.crew!.level >= 2 && n.crew!.loyalty >= 55 && n.crew!.assignment?.kind !== 'district' && n.crew!.assignment?.kind !== 'job');
  if (lt) {
    const counts: Record<Id, number> = {};
    for (const b of select.playerBlocks(w()).filter(b => select.cityOfBlock(w(), b.id) === (lt.crew!.cityId || 'c0'))) counts[b.districtId] = (counts[b.districtId] ?? 0) + 1;
    const d = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(x => x[0]).find(did => !Object.values(w().npcs).some(n => n.crew?.assignment?.kind === 'district' && n.crew.assignment.districtId === did));
    if (d && act(c, { type: 'assign', npcId: lt.id, assignment: { kind: 'district', districtId: d } })) bump(c, 'lieutenants');
  }
  // a guard when somebody is at war with you
  const war = Object.values(w().factions).some(f => f.alive && f.standing < -40);
  const hereCrew = () => select.crew(w()).filter(inCity(select.currentCity(w())));
  if ((war || hereCrew().length >= 5) && !hereCrew().some(n => n.crew?.assignment?.kind === 'guard')) {
    const g = hereCrew().filter(n => !n.crew!.assignment && n.crew!.status === 'ready').sort((a, b) => b.skills.muscle - a.skills.muscle)[0];
    if (g && act(c, { type: 'assign', npcId: g.id, assignment: { kind: 'guard', blockId: w().player.blockId } })) bump(c, 'guards');
  }
}
const reserveForJobs = (c: Ctx) => Object.values(c.w.jobs).some(j => j.status === 'offer');

// -------------------------------------------------------------------------------------- jobs
function runJobs(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  // top up a plan somebody dropped out of, before deciding whether it is still worth launching
  for (const j of Object.values(w().jobs).filter(x => (x.status === 'planning' || x.status === 'ready') && x.crewIds.length < Math.max(x.crewMin, x.kind === 'setpiece' ? x.crewMax : 0))) {
    const spare = select.crew(w()).filter(inCity(jobCity(w(), j))).filter(n => n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job' && (j.kind === 'setpiece' || !n.crew!.assignment || n.crew!.assignment.kind === 'guard')).sort((a, b) => j.leans.reduce((t, s) => t + b.skills[s] - a.skills[s], 0));
    for (const n of spare) { if (w().jobs[j.id].crewIds.length >= Math.max(j.crewMin, j.kind === 'setpiece' ? j.crewMax : 0)) break; act(c, { type: 'join_job', jobId: j.id, npcId: n.id }); }
  }
  for (const j of Object.values(w().jobs).filter(x => x.status === 'ready')) {
    // the big ones get a specialist when the money is there
    if (j.tier >= 2 && !j.specialist && w().player.cash + w().player.dirty > 15000) {
      const kind = (['safecracker', 'hacker', 'driver', 'gunman', 'face'] as const).find(k => can(w(), { type: 'hire_specialist', jobId: j.id, kind: k }).ok && j.leans.includes(({ safecracker: 'brains', hacker: 'tech', driver: 'wheels', gunman: 'muscle', face: 'charm' } as const)[k]));
      if (kind && act(c, { type: 'hire_specialist', jobId: j.id, kind })) bump(c, 'specialists');
    }
    // a job waits for its own hour — the dark for a break-in, office hours for a con — unless it
    // would be gone before that hour comes round again
    // (not the collector: it wants every kind run once, not the best odds, and a chain waiting on
    // office hours ran out of days before its last link)
    if (c.s.curiosity < 1 && select.jobHour(j.kind) !== select.half(w()) && j.expires > w().day) continue;
    const approach = bestApproach(c, j, j.crewIds);
    if (select.jobOdds(w(), j, j.crewIds, approach.a).chance < c.s.launchAt) { act(c, { type: 'drop_job', jobId: j.id }); continue; }
    const away = !select.present(w(), j);
    // a job in another city needs somebody to go; with nobody on it, send somebody or let it go
    if (away && !j.crewIds.length) {
      const spare = select.crew(w()).filter(inCity(jobCity(w(), j))).find(n => n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job');
      if (!spare || !act(c, { type: 'join_job', jobId: j.id, npcId: spare.id })) { act(c, { type: 'drop_job', jobId: j.id }); continue; }
    }
    if (act(c, { type: 'launch_job', jobId: j.id, approach: approach.a })) {
      if (away) bump(c, 'remote_jobs');
      const r = w().jobs[j.id];
      if (r?.status === 'paused') answerEverything(c);
      else if (r?.result) bump(c, r.result.success ? 'jobs_done' : 'jobs_failed');
    }
  }
  // a set-piece, cased on purpose, once the street takes us seriously and there are hands for it
  // the collector cases one on purpose too, once: it used to leave the set-piece to the board, where
  // it came up on one seed in three and a change to the event mix took even that one away
  if (c.s.setpieces && !(c.s.curiosity >= 1 && tried(c, 'setpiece')) && p().fear + p().respect >= SETPIECE_RANK && select.crew(w()).length >= 2 && p().ap >= 2 && !Object.values(w().jobs).some(j => j.kind === 'setpiece' && ['offer', 'planning', 'ready'].includes(j.status))) {
    // the evidence locker first if there is paper worth burning, otherwise the richest
    const paper = select.openCases(w()).some(x => x.evidence > 40);
    const marks = Object.values(w().blocks).filter(b => select.setpieceOpen(w(), b.id)).map(b => ({ b, d: setpieceFor(b.landmark)! }))
      .sort((x, y) => (y.d.effect === 'evidence' && paper ? 1e6 : 0) + y.d.payout.dirty[1] + y.d.payout.clean[1] + y.d.payout.goods[1] * 50 - ((x.d.effect === 'evidence' && paper ? 1e6 : 0) + x.d.payout.dirty[1] + x.d.payout.clean[1] + x.d.payout.goods[1] * 50));
    const m = marks.find(x => x.d.effect !== 'sacrilege' || c.s.war !== 'never');
    if (m && act(c, { type: 'case', kind: 'setpiece', blockId: m.b.id })) bump(c, 'setpieces_cased');
  }
  // take the best offer we can staff
  const offers = Object.values(w().jobs).filter(j => j.status === 'offer');
  const free = select.crew(w()).filter(n => n.crew!.status === 'ready' && (!n.crew!.assignment || n.crew!.assignment.kind === 'guard'));
  // a kind the bot has never run jumps the queue, so a sixty-day soak tests the catalogue and not
  // just the three most lucrative jobs in it
  const novel = (j: Job) => value(j) + (c.kinds[j.kind] ? 0 : c.s.novelty);
  // a file about to become a trial ends the collector's run, and with it the coverage: killing the
  // worst one on you comes before anything else on the board
  const danger = (j: Job) => c.s.curiosity >= 1 && j.kind === 'buy_case' && (w().cases[j.targetCaseId!]?.suspectId === PLAYER) ? -1e6 : 0;
  // the collector wants breadth, not money: least-tried kind first, the big crews before the small
  // ones eat the hands, then whatever expires soonest
  const order = c.s.curiosity >= 1
    ? (a: Job, b: Job) => danger(a) - danger(b) || tried(c, a.kind) - tried(c, b.kind) || b.crewMin - a.crewMin || a.expires - b.expires
    : (a: Job, b: Job) => novel(b) - novel(a);
  for (const j of offers.sort(order)) {
    if (Object.values(w().jobs).filter(x => x.status === 'planning' || x.status === 'ready').length >= c.s.maxJobs) break;
    // a set-piece takes every hand it can hold; anything else, two
    // and a set-piece is worth pulling runners off their rackets for, which the bot would never
    // otherwise do — without this the bot cased the courthouse three times with nobody free to send
    // the collector sends the fewest it can, so eight people cover as many jobs at once as they can
    const hands = j.kind === 'setpiece' ? j.crewMax : c.s.curiosity >= 1 ? j.crewMin : 2;
    const pool = (j.kind === 'setpiece' || c.s.curiosity >= 1 ? select.crew(w()).filter(n => n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job') : free).filter(inCity(jobCity(w(), j)));
    const team = pool.sort((a, b) => j.leans.reduce((t, s) => t + b.skills[s] - a.skills[s], 0)).slice(0, Math.max(j.crewMin, Math.min(j.crewMax, hands)));
    if (team.length < j.crewMin) continue;
    if (j.kind === 'kidnap' && !c.s.kidnaps) continue;
    const ap = bestApproach(c, j, team.map(n => n.id));
    // five days of planning add about eight points before launch; the set-piece is the only job
    // long enough for the bot to count on them
    if (ap.chance + (j.kind === 'setpiece' ? 8 : 0) < c.s.takeAt) continue;
    for (const n of team) if (n.crew!.assignment) act(c, { type: 'assign', npcId: n.id, assignment: null });
    // one a day, except for the collector, who takes everything it can staff
    if (act(c, { type: 'take_job', jobId: j.id, crewIds: team.map(n => n.id) })) { bump(c, 'jobs_taken'); if (c.s.curiosity < 1) break; }
  }
  // case something now and then, so the board is not only what the city offers
  if (c.rng.chance(0.25) && w().player.ap >= 3) {
    const here = select.businessesIn(w(), w().player.blockId).filter(b => b.ownedBy !== PLAYER && b.protection?.by !== PLAYER);
    const t = here[0];
    if (t) { const kinds = select.caseKinds(w(), { businessId: t.id }); if (kinds.length && act(c, { type: 'case', kind: kinds[0], businessId: t.id })) bump(c, 'cased'); }
  }
  // and now and then something off the rest of the catalogue: the kind the bot has run least that
  // any target in reach will carry. Without this the board's own mix decides what gets tested, and
  // a job that needs a file, a cell or a derelict block would be offered too rarely to ever run.
  if (c.rng.chance(c.s.curiosity) && p().ap >= 3) curious(c);
  if (c.s.curiosity >= 1 && p().ap >= 3) curious(c);   // the collector cases twice a day
  // somebody worth taking, when there is a back room to keep them in
  if (c.s.kidnaps && select.holdingRoom(w()) && p().ap >= 2 && c.rng.chance(0.3) && !Object.values(w().jobs).some(j => j.kind === 'kidnap' && j.status !== 'done' && j.status !== 'failed' && j.status !== 'expired')) {
    const rich = select.peopleOn(w(), p().blockId).concat(w().blocks[p().blockId].neighborIds.flatMap(id => select.peopleOn(w(), id)))
      .filter(n => n.wealth >= 50 && !n.faction && !n.official && !select.isHeld(w(), n.id)).sort((a, b) => b.wealth - a.wealth)[0];
    if (rich && act(c, { type: 'case', kind: 'kidnap', npcId: rich.id })) bump(c, 'cased');
  }
}
// a set-piece goes to the top of the pile: the bot cased it on purpose, and the courthouse locker
// pays nothing in money at all — valued by its purse alone it sat behind every burglary and expired
const value = (j: Job) => (j.setpiece ? 1e6 : 0) + j.payout.dirty + j.payout.clean * 1.3 + j.payout.goods * 50 + j.payout.respect * 200;
function bestApproach(c: Ctx, j: Job, crewIds: Id[]): { a: Approach; chance: number } {
  const all: Approach[] = ['quiet', 'loud', 'clever'];
  // the bias is for choosing only; the chance returned is the real one
  return all.map(a => { const chance = select.jobOdds(c.w, j, crewIds, a).chance; return { a, chance, v: chance - (a === 'loud' ? c.s.loudCost : 0) + (a === 'clever' ? c.s.cleverBonus : 0) }; }).sort((x, y) => y.v - x.v)[0];
}

// ------------------------------------------------------------------------------------- money
function money(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  // the fixer: meet them once, then wash when clean money is what we are short of
  const fx = w().fixerId ? w().npcs[w().fixerId!] : undefined;
  if (fx?.alive && !fx.rel.met && p().ap >= 3) { goTo(c, select.whereIs(w(), fx)); if (act(c, { type: 'scene', kind: 'chat', npcId: fx.id })) bump(c, 'chats'); }
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
  if (!p().lawyer && select.openCases(w()).some(x => x.evidence > 50) && act(c, { type: 'lawyer', on: true })) bump(c, 'lawyer');
}

function goTo(c: Ctx, blockId: Id): boolean {
  if (c.w.player.blockId === blockId) return true;
  if (act(c, { type: 'travel', blockId })) { bump(c, 'travel'); return true; }
  return false;
}

// ------------------------------------------------------------------------------------ street
/**
 * How much more a soft-spoken style likes talk. Exactly 1 at `steady`'s 0.8 and above, so the
 * default bot is the bot it always was. The first cut divided by `threaten`, which made a chat worth
 * 70 to the schemer — more than protecting anything — and the schemer and the timid boss spent sixty
 * days talking and ended holding 0–4% of the city.
 */
const chatLean = (c: Ctx) => (c.s.threaten >= 0.8 ? 1 : 1 + (0.8 - c.s.threaten) * 0.5);
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
          if (o.rel.fear < 50 && t.chance >= 45) cands.push({ a: { type: 'scene', kind: 'intimidate', npcId: o.id }, v: t.chance * c.s.threaten, k: 'threats', block: select.whereIs(w(), o) });
          if (o.rel.trust < 30) cands.push({ a: { type: 'scene', kind: 'chat', npcId: o.id }, v: (25 + (o.rel.met ? 0 : 10)) * chatLean(c), k: 'chats', block: select.whereIs(w(), o) });
        }
      }
      if (o.agenda?.known && o.agenda.cost && o.agenda.cost < (p().cash + p().dirty) * 0.25) cands.push({ a: { type: 'scene', kind: 'settle', npcId: o.id }, v: 55, k: 'settled', block: select.whereIs(w(), o) });
      if (o.rel.owes && b.protection?.by === PLAYER) cands.push({ a: { type: 'scene', kind: 'favour', npcId: o.id }, v: 50, k: 'favours', block: select.whereIs(w(), o) });
      if (!o.rel.met) cands.push({ a: { type: 'scene', kind: 'chat', npcId: o.id }, v: 20, k: 'chats', block: select.whereIs(w(), o) });
      if (o.secret?.known && c.rng.chance(0.3)) cands.push({ a: { type: 'scene', kind: 'lean', npcId: o.id }, v: 30, k: 'leaned', block: select.whereIs(w(), o) });
      if (b.protection?.by !== PLAYER && b.till > b.income * 1.5 && o.rel.fear > 25 && c.rng.chance(c.s.squeeze)) cands.push({ a: { type: 'scene', kind: 'squeeze', npcId: o.id, businessId: b.id }, v: 20 + Math.max(0, c.s.threaten - 0.8) * 30, k: 'squeezed', block: b.blockId });
      // patrons: future crew
      for (const pid of b.patronIds) {
        const n = w().npcs[pid]; if (!n?.alive || n.crew || n.faction) continue;
        const best = Math.max(...Object.values(n.skills));
        if (p().crewIds.length < select.bedsTotal(w())) {
          const q = select.quote(w(), 'recruit', n.id);
          if (!q.disabled && q.chance >= 40 && best >= 5) cands.push({ a: { type: 'scene', kind: 'recruit', npcId: n.id }, v: 60 + best * 4, k: 'recruited', block: select.whereIs(w(), n) });
          else if (best >= 6 && n.rel.trust < 20 && p().crewIds.length < 8) cands.push({ a: { type: 'scene', kind: 'chat', npcId: n.id }, v: 22 + best * 2, k: 'chats', block: select.whereIs(w(), n) });
        }
      }
    }
    // officials when hot
    if (p().heat > c.s.bribeAt) for (const o of select.officials(w())) {
      if (o.payroll) continue;
      const q = select.quote(w(), 'bribe', o.id);
      if (!q.disabled && q.chance >= 40 && (q.cash ?? 0) * 3 < p().cash + p().dirty) cands.push({ a: { type: 'scene', kind: 'bribe', npcId: o.id }, v: 70, k: 'bribed', block: select.whereIs(w(), o) });
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
    // the second tier opens the heists and the long runs, so it comes early; the third is a luxury
    if (s.tier < 3 && purse() > (s.tier === 1 ? 12000 : 30000) && act(c, { type: 'upgrade_safehouse', safehouseId: sid })) { /* ok */ }
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
  // the collector keeps one crew nobody has dealt with until it has tried taking a corner by force:
  // `takeover` needs such a crew, and with every crew bought or run off the job was never offered
  const spare = c.s.curiosity >= 1 && !tried(c, 'takeover') ? Object.values(w().crews ?? {}).find(x => x.terms === 'none')?.id : undefined;
  for (const cr of Object.values(w().crews ?? {})) {
    if (cr.terms !== 'none' || p().ap < 2 || cr.id === spare) continue;
    const b = w().blocks[cr.blockId];
    const near = [b.id, ...b.neighborIds].some(id => (w().blocks[id].influence[PLAYER] ?? 0) > 5);
    if (!near && cr.members < 10) continue;
    const opts = (['crew_take', 'crew_pay', 'crew_run'] as const).map(k => ({ k, q: select.quote(w(), k, cr.bossId) })).filter(x => !x.q.disabled || x.q.disabled.startsWith('Go to'));
    const lean = (k: string) => (k === c.s.corner ? 15 : 0);
    const best = opts.sort((a, x) => x.q.chance + lean(x.k) - a.q.chance - lean(a.k))[0];
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
    if (c.s.truceAt !== undefined && f.standing < c.s.truceAt && p().ap >= 2 && act(c, { type: 'sit_down', factionId: f.id, offer: 'truce' })) { bump(c, 'sitdowns'); continue; }
    if (c.s.tribute && f.standing < -20 && f.standing >= (c.s.truceAt ?? -50) && p().cash + p().dirty > 6000 && act(c, { type: 'tribute', factionId: f.id, amount: 1500 })) bump(c, 'tributes');
  }
  // starting wars: the ruthless pick the weakest outfit once they have the people for it; the
  // maniac declares on somebody new every five days from day ten
  const live = Object.values(w().factions).filter(f => f.alive && (f.truceUntil ?? 0) < w().day);
  const atWar = live.filter(f => f.standing <= -56);
  if (c.s.war === 'weakest' && !atWar.length && select.crew(w()).length >= 6 && w().day >= 20) {
    const f = live.sort((a, b) => a.soldiers - b.soldiers)[0];
    if (f && act(c, { type: 'declare_war', factionId: f.id })) bump(c, 'declared');
  }
  if (c.s.war === 'everyone' && w().day >= 10 && w().day % 5 === 0) {
    const f = live.find(x => x.standing > -56);
    if (f && act(c, { type: 'declare_war', factionId: f.id })) bump(c, 'declared');
  }
}

/**
 * Case the least-tried job kind that anything in the city will carry: kind first, then the first
 * target that fits it and that `can()` allows — nearest ground first. Sampling targets and then
 * picking a kind (the first cut) almost never landed on a jeweller or a file, so the rare kinds
 * never ran.
 */
function curious(c: Ctx) {
  const w = c.w; const p = w.player;
  const worst = select.openCases(w).filter(x => x.suspectId === PLAYER && x.evidence >= 55).sort((a, b) => b.evidence - a.evidence)[0];
  if (c.s.curiosity >= 1 && worst && can(w, { type: 'case', kind: 'buy_case', caseId: worst.id }).ok) { if (act(c, { type: 'case', kind: 'buy_case', caseId: worst.id })) bump(c, 'cased'); return; }
  const here = w.blocks[p.blockId];
  const near = new Set([here.id, ...here.neighborIds]);
  const first = <T,>(xs: T[], at: (x: T) => Id) => [...xs.filter(x => near.has(at(x))), ...xs.filter(x => !near.has(at(x)))];
  const pools: { businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }[][] = [
    first(Object.values(w.businesses), b => b.blockId).map(b => ({ businessId: b.id })),
    first(Object.values(w.npcs).filter(n => n.alive), n => n.homeBlockId).map(n => ({ npcId: n.id })),
    first(Object.values(w.blocks), b => b.id).map(b => ({ blockId: b.id })),
    Object.values(w.cases).map(x => ({ caseId: x.id })),
  ];
  const kinds = (Object.keys(JOBS) as JobKind[]).filter(k => k !== 'setpiece')
    .map(k => ({ k, n: tried(c, k) + c.rng.float() * 0.5 })).sort((a, b) => a.n - b.n).slice(0, 12);
  for (const { k } of kinds) {
    if (Object.values(w.jobs).some(j => j.kind === k && ['offer', 'planning', 'ready', 'paused'].includes(j.status))) continue;
    for (const pool of pools) {
      const t = pool.find(x => select.caseKinds(w, x).includes(k) && can(w, { type: 'case', kind: k, ...x }).ok);
      if (t) { if (act(c, { type: 'case', kind: k, ...t })) bump(c, 'cased'); return; }
    }
  }
}

// ------------------------------------------------------------------------------------ region
/**
 * The road: once one opens, a roaming style with a crew and money takes the train and starts up in
 * the city that pays best for what it makes; in any city without a back room it takes one; with
 * back rooms in two cities it opens a route for whatever it holds a lot of and the far end wants.
 */
function region(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  if (!c.s.roams || !w().region) return;
  const here = select.currentCity(w());
  const purse = () => p().cash + p().dirty;
  const next = w().region!.cities.filter(x => x.open && !x.founded).sort((a, b) => Object.values(b.demand).reduce((t, v) => t + v, 0) - Object.values(a.demand).reduce((t, v) => t + v, 0))[0];
  // one city at a time: it moves on only once the city it is in is a quarter its own
  const settled = here === select.HOME ? true : select.controlIn(w(), here) >= select.REGION.unlockAt;
  if (next && settled && p().crewIds.length >= 3 && purse() > select.fare(w(), next.id) + 8000 && p().ap >= select.REGION.trainAp) {
    // bring the free half of the people here; the posted ones stay and keep things running
    const idle = select.crew(w()).filter(inCity(here)).filter(n => n.crew!.status === 'ready' && !n.crew!.assignment);
    const bring = idle.slice(0, Math.max(1, Math.ceil(idle.length / 2))).map(n => n.id);
    if (act(c, { type: 'travel_city', cityId: next.id, bring })) { bump(c, 'cities'); return; }
  }
  if (!select.safehouseIn(w(), here) && here !== select.HOME && purse() > 3000) act(c, { type: 'rent_safehouse', blockId: p().blockId });
  // a city of yours with almost nobody in it gets somebody sent from where there are people to spare
  const founded = w().region!.cities.filter(x => x.founded);
  if (founded.length > 1) {
    const thin = founded.filter(x => select.crewIn(w(), x.id).length < 2).sort((a, b) => select.crewIn(w(), a.id).length - select.crewIn(w(), b.id).length)[0];
    const rich = founded.filter(x => x.id !== thin?.id).sort((a, b) => select.crewIn(w(), b.id).length - select.crewIn(w(), a.id).length)[0];
    const spare = thin && rich ? select.crewIn(w(), rich.id).filter(n => n.crew!.status === 'ready' && !n.crew!.assignment) : [];
    // an empty city gets the one spare person; a thin one only when the other can spare two
    const need = thin && select.crewIn(w(), thin.id).length === 0 ? 1 : 2;
    if (thin && spare.length >= need && purse() > select.fareBetween(w(), rich.id, thin.id) + 1000 && act(c, { type: 'move_crew', npcId: spare[0].id, to: thin.id })) bump(c, 'crew_moved');
  }
  // a route to whichever of its cities pays best for what it holds a lot of, from any other with a door
  const mine = w().region!.cities.filter(x => x.founded && select.safehouseIn(w(), x.id));
  for (const prod of ['booze', 'green', 'pills', 'goods'] as const) {
    if (p().stash[prod].n < 15 || purse() < 6000 || mine.length < 2) continue;
    const to = mine.slice().sort((a, b) => b.demand[prod] - a.demand[prod])[0];
    const from = mine.find(x => x.id !== to.id)!;
    if (to.demand[prod] < 1.05) continue;
    if (act(c, { type: 'open_route', from: from.id, to: to.id, product: prod })) bump(c, 'routes');
  }
}

export type Scenario = 'catalogue' | 'region' | 'family';

/**
 * The family scenario: the catalogue's mid-game empire, whose family has gone sour — an associate
 * who hates the job with a file open on you, and an ambitious capo who has stopped caring. Proves
 * a rat talks and is found, and a capo makes his move.
 */
export function boostFamily(w: World) {
  boost(w);
  const crew = w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.crew);
  const [rat, capo] = crew;
  if (rat?.crew) { rat.crew.loyalty = 20; rat.crew.made = false; rat.crew.rat = { since: w.day }; }
  if (capo?.crew) {
    const d = Object.values(w.districts).find(x => !x.cityId && x.blockIds.some(id => (w.blocks[id].influence[PLAYER] ?? 0) > 0)) ?? Object.values(w.districts)[0];
    capo.crew.assignment = { kind: 'district', districtId: d.id }; capo.crew.loyalty = 10; capo.crew.made = true; capo.crew.level = Math.max(capo.crew.level, 2);
    if (!capo.traits.includes('ambitious')) capo.traits = [...capo.traits.slice(0, 1), 'ambitious'];
  }
}

// ---------------------------------------------------------------------------------- scenario
/**
 * The region scenario: the catalogue's mid-game empire, holding a third of its home city, so the
 * road is open on day one. Not an economy curve; it proves the train, the second city, the routes
 * and remote work run.
 */
export function boostRegion(w: World) {
  boost(w);
  const here = w.blocks[w.player.blockId].center;
  const home = Object.values(w.blocks).filter(b => !w.districts[b.districtId].cityId).sort((a, b) => Math.hypot(a.center.x - here.x, a.center.y - here.y) - Math.hypot(b.center.x - here.x, b.center.y - here.y));
  for (const b of home.slice(0, Math.ceil(home.length * 0.32))) b.influence[PLAYER] = 70;
  for (const k of ['booze', 'green', 'pills', 'goods'] as const) w.player.stash[k] = { n: 60, q: 60 };
}

// ---------------------------------------------------------------------------------- scenario
/**
 * The catalogue scenario: a mid-game empire on day one, so every job in the catalogue has what it
 * needs — money, crew, a tier-2 back room, places you own running the rackets the paper jobs lean
 * on, a gun, a war, two of yours in a cell and a file open on you. The Remake's stand-in for the
 * original's admin panel. **Not an economy curve**: it proves every job runs end to end, nothing
 * about what the game pays.
 */
export function boost(w: World) {
  const p = w.player;
  p.cash = 150000; p.dirty = 60000; p.fear = 50; p.respect = 50; p.lawyer = true;
  p.kit = { weapon: 'pistol', armour: 'kevlar', tool: 'drill', tech: 'jammer' };
  const here = w.blocks[p.blockId];
  // two tier-2 back rooms: one here, one next door
  for (const bid of [here.id, here.neighborIds.find(id => !w.blocks[id].safehouseId)!].filter(Boolean)) {
    const id = `s${w.nextId++}`;
    w.safehouses[id] = { id, blockId: bid, name: `Scenario rooms on ${w.blocks[bid].name}`, tier: 2, labs: [] };
    w.blocks[bid].safehouseId = id; p.safehouseIds.push(id);
  }
  // eight crew: the best-skilled civilians in the city
  const civ = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.faction && !n.official && n.id !== w.fixerId && !Object.values(w.crews ?? {}).some(c => c.bossId === n.id))
    .sort((a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills))).slice(0, 8);
  for (const n of civ) { n.crew = { loyalty: 70, cut: 120, joined: 0, status: 'ready', statusDays: 0, xp: 0, level: 2, kit: { weapon: 'bat' } }; n.faction = PLAYER; n.role = 'crew'; p.crewIds.push(n.id); }
  // two of them inside, for springing and supplying
  for (const n of civ.slice(6)) { n.crew!.status = 'jailed'; n.crew!.statusDays = 50; }
  // three places of your own, with the rackets the paper and wire jobs need
  const mine = [here.id, ...here.neighborIds].flatMap(id => w.blocks[id].businessIds).map(id => w.businesses[id]).filter(b => b.tier < 3 && b.closed <= 0).slice(0, 3);
  const kinds: RacketKind[] = ['laundering', 'bookmaking', 'union_dues', 'smuggling', 'fencing', 'dealing'];
  mine.forEach((b, i) => {
    b.ownedBy = PLAYER; b.protection = undefined; p.businessIds.push(b.id);
    for (const k of kinds.slice(i * 2, i * 2 + 2)) { const id = `r${w.nextId++}`; w.rackets[id] = { id, kind: k, businessId: b.id, owner: PLAYER, level: 1, started: 0, lastIncome: 0, down: 0 }; b.racketIds.push(id); p.racketIds.push(id); }
  });
  // one outfit at war with you, and a file open on you
  const f = Object.values(w.factions).find(x => x.alive)!; f.standing = -70; f.truceUntil = undefined;
  w.cases[`c${w.nextId++}`] = { id: `c${w.nextId - 1}`, crime: 'fraud', opened: 0, evidence: 45, suspectId: PLAYER, witnessIds: [], status: 'open', summary: 'Paper nobody could explain.' };
  w.events = [];
}

// --------------------------------------------------------------------------------------- kit
/**
 * Buy what the style cares about, best first, where it can: the fixer (once met) or a shop on the
 * block it is standing on or next door. Then hand the armoury out — the boss first, then whoever
 * leans on the slot's skill hardest.
 */
function kit(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  const purse = () => p().cash + p().dirty;
  const worn = (who: Id | typeof PLAYER, slot: Slot) => select.kitOf(w(), who)[slot];
  const score = (id?: ItemId) => (id ? ITEMS[id].bonus + (ITEMS[id].armour ?? 0) * 8 : 0);
  const here = w().blocks[p().blockId];
  const shops = [here.id, ...here.neighborIds].flatMap(id => select.businessesIn(w(), id)).filter(b => select.isShop(w(), b.id));
  const fixerMet = !!(w().fixerId && w().npcs[w().fixerId!]?.rel.met);
  for (const slot of c.s.kitSlots) {
    // who most needs one: the boss, or the crew member with the worst thing in this slot
    const people = [PLAYER as Id, ...select.crew(w()).filter(inCity(select.currentCity(w()))).filter(n => n.crew!.status === 'ready' || n.crew!.status === 'busy').map(n => n.id)];
    const need = people.map(id => score(worn(id, slot))).reduce((a, b) => Math.min(a, b), Infinity);
    const stocked = p().armoury.filter(i => ITEMS[i].slot === slot).map(score).reduce((a, b) => Math.max(a, b), 0);
    if (stocked > need) continue;   // something better is already sitting in the armoury
    const offers: { item: ItemId; at: Id | 'fixer'; block?: Id }[] = [];
    if (fixerMet) for (const i of select.shopItems(w(), 'fixer')) offers.push({ item: i, at: 'fixer' });
    for (const b of shops) for (const i of select.shopItems(w(), b.id)) offers.push({ item: i, at: b.id, block: b.blockId });
    const buy = offers.filter(o => ITEMS[o.item].slot === slot && score(o.item) > need && purse() > ITEMS[o.item].price * c.s.kitMult)
      .sort((a, b) => score(b.item) - score(a.item) || ITEMS[a.item].price - ITEMS[b.item].price)[0];
    if (!buy) continue;
    if (buy.block && !goTo(c, buy.block)) continue;
    if (act(c, { type: 'buy_item', item: buy.item, at: buy.at })) bump(c, 'kit_bought');
  }
  // hand out the armoury
  for (const item of [...p().armoury]) {
    const d = ITEMS[item];
    const takers = [PLAYER as Id, ...select.crew(w()).filter(inCity(select.currentCity(w()))).filter(n => n.crew!.status !== 'jailed' && n.crew!.status !== 'held' && n.crew!.status !== 'travel').sort((a, b) => (d.skill ? b.skills[d.skill] - a.skills[d.skill] : b.skills.muscle - a.skills.muscle)).map(n => n.id)];
    const to = takers.find(id => score(worn(id, d.slot)) < score(item));
    if (to && act(c, { type: 'equip', item, to })) bump(c, 'kit_equipped');
  }
  void SLOTS_ORDER;
}

// ---------------------------------------------------------------------------------- hostages
function hostages(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  for (const h of Object.values(w().hostages)) {
    if (h.holder !== PLAYER) {
      if (c.s.payFor !== undefined && p().cash + p().dirty >= h.ransom * c.s.payFor && act(c, { type: 'hostage', id: h.id, choice: 'pay' })) { bump(c, 'ransom_paid'); bump(c, 'hostages_resolved'); }
      continue;
    }
    const days = w().day - h.since;
    const file = h.caseId ? w().cases[h.caseId]?.evidence ?? 0 : 0;
    const opts = select.hostageChoices(w(), h).filter(o => !o.disabled).map(o => o.choice);
    let choice: typeof c.s.hostage | undefined;
    if (days >= c.s.holdDays) choice = opts.includes(c.s.hostage) ? c.s.hostage : 'ransom';
    // a file this thick changes everybody's mind except the maniac's: the ruthless make it go away
    if (file >= 70 && c.s.hostage !== 'kill') choice = c.s.war === 'never' ? 'release' : 'kill';
    if (choice && act(c, { type: 'hostage', id: h.id, choice })) bump(c, 'hostages_resolved');
  }
}

// -------------------------------------------------------------------------------- commission
/** What this boss wants from the table: yes, no, or nothing worth an envelope. */
function wants(c: Ctx, prop: NonNullable<World['commission']['proposal']>): 'yes' | 'no' | undefined {
  const w = c.w;
  switch (prop.kind) {
    case 'sanction': return prop.target === PLAYER ? 'no' : c.s.lobby === 'always' ? 'yes' : undefined;
    case 'seat': return 'yes';
    case 'tax': return prop.target === PLAYER ? 'yes' : select.commissionOf(w, prop.city ?? 'c0').seated ? 'no' : undefined;
    case 'peace': return c.s.peace ? 'yes' : 'no';
    case 'claim': return w.districts[prop.districtId!]?.blockIds.some(id => (w.blocks[id].influence[PLAYER] ?? 0) > 10) ? 'no' : undefined;
  }
}
function commission(c: Ctx) {
  const w = () => c.w; const p = () => w().player;
  const table = () => select.commissionOf(w(), select.currentCity(w()));
  const prop = table().proposal; if (!prop) return;
  const want = wants(c, prop); if (!want) return;
  if (table().seated && table().vote !== want && act(c, { type: 'commission_vote', vote: want })) bump(c, 'voted');
  if (c.s.lobby === 'never') return;
  if (c.s.lobby === 'defend' && !(prop.target === PLAYER || prop.kind === 'seat')) return;
  const t = select.tally(w(), prop);
  if ((t.passes ? 'yes' : 'no') === want) return;   // already going our way
  // the cheapest boss an envelope would actually turn
  const here = select.currentCity(w());
  const turnable = Object.values(w().factions).filter(f => f.alive && (w().districts[f.homeDistrictId]?.cityId || 'c0') === here && !table().pulls[f.id])
    .map(f => ({ f, lean: select.leanOf(w(), f, prop) }))
    .filter(x => (want === 'yes' ? x.lean <= 0 && x.lean + select.LOBBY_PULL > 0 : x.lean > 0 && x.lean - select.LOBBY_PULL <= 0))
    .sort((a, b) => select.lobbyCost(a.f) - select.lobbyCost(b.f));
  for (const x of turnable) {
    if (p().cash + p().dirty < select.lobbyCost(x.f) * 2) break;
    if (act(c, { type: 'lobby', factionId: x.f.id, side: want })) bump(c, 'lobbied');
    if ((select.tally(w(), prop).passes ? 'yes' : 'no') === want) break;
  }
}

/** Things that happen to the bot rather than things it does, counted as they appear. */
function watch(c: Ctx) {
  const sold = (c.w.routes ?? []).reduce((t, r) => t + (r.moved ?? 0), 0);
  if (sold > (c.counts.route_sales ?? 0)) c.counts.route_sales = sold;
  for (const j of Object.values(c.w.jobs)) {
    // offered, taken and finished, per kind: "never run" alone cannot say whether a job was never
    // on the board, never worth taking, or taken and dropped
    if (!c.seen.has(`o${j.id}`)) { c.seen.add(`o${j.id}`); c.offered[j.kind] = (c.offered[j.kind] ?? 0) + 1; }
    if (j.status !== 'offer' && j.status !== 'expired' && !c.seen.has(`t${j.id}`)) { c.seen.add(`t${j.id}`); c.taken[j.kind] = (c.taken[j.kind] ?? 0) + 1; }
    if (!j.result || c.seen.has(j.id)) continue;
    c.seen.add(j.id); c.kinds[j.kind] = (c.kinds[j.kind] ?? 0) + 1;
  }
  for (const h of Object.values(c.w.hostages)) {
    if (c.seen.has(h.id)) continue;
    c.seen.add(h.id);
    bump(c, h.holder === PLAYER ? 'hostages_taken' : 'crew_snatched');
  }
  const meetings = c.w.commission.history.length + Object.values(c.w.commissions ?? {}).reduce((t, x) => t + x.history.length, 0);
  if (meetings > (c.counts.meetings ?? 0)) c.counts.meetings = meetings;
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
  for (const h of Object.values(w.hostages)) if (!w.npcs[h.npcId]?.alive) throw new Error(`hostage ${h.id} is somebody dead`);
  for (const i of p.armoury) if (!ITEMS[i]) throw new Error(`armoury holds ${i}, which is nothing`);
  void SETPIECES;
}

export function missing(counts: RunResult['counts']): string[] {
  return SYSTEMS.filter(s => !s.needs.some(n => (counts[n] ?? 0) > 0)).map(s => s.label);
}
