/**
 * Day and night. The rules are data (`content/clock.ts`); this file reads them against the world:
 * which half it is, how many hours each half has, where a person can be found at this hour, what
 * a job's hour does to its odds, and what happens when night falls.
 *
 * Night falling is not the end of the day. The nightly tick (`tick.endDay`) still runs once, when
 * you go to sleep; nightfall only turns the clock, refills the night's hours, closes the day's
 * doors, opens the night's, and puts tonight in front of you — an encounter, sometimes work that
 * will be gone by morning. `end_day` in daylight still works (idle play and old bots use it): it
 * sleeps through the night without playing it.
 */
import { ACTION_HOURS, CLOSED, JOB_HOUR, SCENE_HOURS, SHOP_WHY, splitHours, type Half } from '@r/content/clock';
import { likeOf } from './catalogue';
import { drawNight } from './events';
import type { Rng } from './rng';
import { crewOf } from './streetcrews';
import type { Action } from './actions';
import type { Id, JobKind, Npc, World } from './types';
import { log } from './util';

export type { Half };
export const half = (w: World): Half => w.phase ?? 'day';
export const isNight = (w: World) => half(w) === 'night';
/** The hours each half of today has, from the day's whole allowance. */
export const hours = (w: World) => splitHours(w.player.apMax);

/** Cons, frauds and anything through an office go best in business hours; the rest want the dark. */
export function jobHour(kind: JobKind): Half {
  const like = likeOf(kind);
  return like === 'con' || like === 'fraud' || like === 'hack' ? 'day' : 'night';
}
/** The odds factor a job gets from the hour it is launched in. */
export function hourFactor(w: World, kind: JobKind): { label: string; n: number } {
  const own = jobHour(kind) === half(w);
  return own
    ? { label: half(w) === 'night' ? 'Under cover of night' : 'Business hours: the mark is at the desk', n: JOB_HOUR.own }
    : { label: half(w) === 'night' ? 'After hours: the offices are empty' : 'In broad daylight', n: JOB_HOUR.wrong };
}

/** How much likelier a witness is: a break-in at three in the morning has fewer eyes on it than one at noon. */
export const seenMult = (w: World, kind: JobKind) => (jobHour(kind) === half(w) ? JOB_HOUR.seenOwn : JOB_HOUR.seenWrong);

// ------------------------------------------------------------------------------------ where people are
/** Where each regular drinks: the first place that counts them as a patron. Indexed once per world. */
const haunts = new WeakMap<World['businesses'], Map<Id, Id>>();
function hauntOf(w: World, id: Id): Id | undefined {
  let m = haunts.get(w.businesses);
  if (!m) { m = new Map(); for (const b of Object.values(w.businesses)) for (const pid of b.patronIds) if (!m.has(pid)) m.set(pid, b.blockId); haunts.set(w.businesses, m); }
  return m.get(id);
}
/**
 * The block a person is on right now. By day an owner or worker is at work and everybody else at
 * home; by night the regulars are out at their haunt, a corner crew's boss is on the corner, and
 * the owners have gone home. Your own crew are wherever they are posted, as before.
 */
export function whereIs(w: World, n: Npc): Id {
  if (n.crew) return n.homeBlockId;
  if (half(w) === 'day') {
    const work = n.workId ? w.businesses[n.workId] : undefined;
    return work && work.closed <= 0 ? work.blockId : n.homeBlockId;
  }
  const corner = crewOf(w, n.id); if (corner) return corner.blockId;
  return hauntOf(w, n.id) ?? n.homeBlockId;
}
/** Where they are, in words, for a person's sheet. */
export function whereLine(w: World, n: Npc): string {
  const b = whereIs(w, n);
  const name = w.blocks[b]?.name ?? '';
  if (half(w) === 'day') { const work = n.workId ? w.businesses[n.workId] : undefined; return work && work.blockId === b ? `At work, ${work.name}` : `At home, ${name}`; }
  if (crewOf(w, n.id)) return `On the corner, ${name}`;
  const haunt = Object.values(w.businesses).find(x => x.patronIds.includes(n.id) && x.blockId === b);
  return haunt ? `Out at ${haunt.name}` : `At home, ${name}`;
}

// ------------------------------------------------------------------------------------ what is open
/** Why an action cannot happen in this half, or nothing. `can()` asks this first. */
export function closedNow(w: World, a: Action): string | undefined {
  const h = half(w);
  if (a.type === 'scene') { const r = SCENE_HOURS[a.kind]; return r && r.half !== h ? r.why : undefined; }
  if (a.type === 'buy_item') return a.at !== 'fixer' && h === 'night' ? SHOP_WHY : undefined;
  if (a.type === 'nightfall') return h === 'night' ? 'It is already night.' : undefined;
  const r = ACTION_HOURS[a.type];
  return r && r.half !== h ? r.why : undefined;
}
export const closedLine = (h: Half) => CLOSED[h];

// ------------------------------------------------------------------------------------ nightfall
/**
 * The day's doors close and the night's open. Unspent daylight is gone — the day is the day — and
 * the night's hours are what the night has. Tonight comes with an encounter, most nights.
 */
export function nightfall(w: World, rng: Rng) {
  w.phase = 'night';
  const p = w.player;
  p.ap = p.lowDays > 0 ? 0 : hours(w).night;
  log(w, `Night falls on ${w.city.name}. The shutters come down and the bars fill up.`, 'info');
  drawNight(w, rng);
}
