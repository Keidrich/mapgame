/**
 * Seasons (`content/seasons.ts`): a week at a time when the whole city is different. The order is
 * a shuffle of the four kinds drawn from the seed (so sixty days sees each of them once), the
 * spacing from a hash of the seed and the day — never the world's rng, so a season does not shift
 * every roll that comes after it. The papers have it a few days ahead; a card opens it; while it
 * lasts, `seasonNow` bends heat, police attention, takings, street prices and supplies; an election
 * leaves twenty days of its result behind it.
 */
import { ELECTION, SEASON, SEASONS, type SeasonDef, type SeasonKind } from '@r/content/seasons';
import { hash01 } from './rng';
import type { World } from './types';
import { log } from './util';

export interface Season { kind: SeasonKind; from: number; to: number; soft?: boolean; backing?: { machine: number; reform: number } }
export interface Aftermath { kind: 'machine' | 'reform'; until: number }

const KINDS: SeasonKind[] = ['election', 'crackdown', 'festival', 'strike'];
/** The seed's order of the four, and which one the n-th season is. */
function kindAt(w: World, n: number): SeasonKind {
  const order = KINDS.map((k, i) => ({ k, h: hash01(`${w.seed}:season:${i}`) })).sort((a, b) => a.h - b.h).map(x => x.k);
  return order[n % order.length];
}
function plan(w: World, after: number) {
  const n = w.seasonCount ?? 0;
  const gap = n === 0 ? SEASON.first : SEASON.gap + Math.round((hash01(`${w.seed}:gap:${n}`) * 2 - 1) * SEASON.jitter);
  w.nextSeason = { kind: kindAt(w, n), day: Math.max(after + SEASON.notice + 1, n === 0 ? SEASON.first : after + gap) };
}

/** The season on the city today, if any. */
export function seasonNow(w: World): (SeasonDef & { kind: SeasonKind }) | undefined {
  const s = w.season;
  return s && w.day >= s.from && w.day < s.to ? { ...SEASONS[s.kind], kind: s.kind } : undefined;
}
/** Multipliers, for the formulas that feel a season. */
export const heatMult = (w: World) => seasonNow(w)?.heat ?? 1;
export const incomeMult = (w: World) => seasonNow(w)?.income ?? 1;
export const priceMult = (w: World) => seasonNow(w)?.price ?? 1;
export const suppliesMult = (w: World) => seasonNow(w)?.supplies ?? 1;
export function attentionAdd(w: World): number {
  const s = seasonNow(w);
  const now = s ? s.attention * (w.season?.soft ? 0.5 : 1) : 0;
  return now + (w.aftermath?.kind === 'reform' && w.day < w.aftermath.until ? ELECTION.reformAttention : 0);
}
export const bribeMult = (w: World) => (w.aftermath?.kind === 'machine' && w.day < w.aftermath.until ? ELECTION.machineBribe : 1);

/** The machine's chance at the polls: its money against the reformers', and your councillors. */
export function machineOdds(w: World): number {
  const b = w.season?.backing ?? { machine: 0, reform: 0 };
  const cllrs = Object.values(w.npcs).filter(n => n.alive && n.official === 'councillor' && n.payroll).length;
  return Math.max(0.1, Math.min(0.9, ELECTION.base + ((b.machine - b.reform) / 1000) * ELECTION.perThousand + cllrs * ELECTION.perCouncillor));
}

/**
 * Called at the end of `day`, before the night's cards are drawn: tomorrow's news, tomorrow's
 * season, and the end of the one that is over.
 */
export function tickSeasons(w: World, day: number) {
  const tomorrow = day + 1;
  // the one ending
  if (w.season && tomorrow >= w.season.to) {
    const s = w.season;
    if (s.kind === 'election') {
      const machine = hash01(`${w.seed}:poll:${day}`) < machineOdds(w);
      w.aftermath = { kind: machine ? 'machine' : 'reform', until: tomorrow + ELECTION.after };
      const text = machine ? 'The machine holds City Hall. Officials will be cheaper for a while.' : 'The reformers take City Hall. Every precinct has something to prove.';
      log(w, `The votes are counted. ${text}${s.backing && (s.backing.machine || s.backing.reform) ? ` You backed ${s.backing.machine >= s.backing.reform ? 'the machine' : 'reform'}.` : ''}`, machine ? 'good' : 'law');
      w.news.push({ day, text: machine ? 'MACHINE HOLDS CITY HALL' : 'REFORMERS SWEEP CITY HALL', weight: 9 });
    } else log(w, `${SEASONS[s.kind].label} over. The city goes back to what it was.`, 'info');
    w.season = undefined;
    plan(w, day);
  }
  if (!w.nextSeason && !w.season) plan(w, day);
  const next = w.nextSeason!;
  if (next && next.day - SEASON.notice === tomorrow) {
    const def = SEASONS[next.kind];
    w.news.push({ day, text: def.headline, weight: 8 });
    log(w, `The papers: ${def.label.toLowerCase()} in ${SEASON.notice} days. ${def.blurb}`, 'info');
  }
  if (next && next.day <= tomorrow && !w.season) {
    w.season = { kind: next.kind, from: tomorrow, to: tomorrow + SEASONS[next.kind].days, ...(next.kind === 'election' ? { backing: { machine: 0, reform: 0 } } : {}) };
    w.seasonCount = (w.seasonCount ?? 0) + 1;
    w.nextSeason = undefined;
    // the opening card is drawn tonight (`drawEvents` runs after this) and waits in the morning
    w.scheduled.push({ day, template: `season_${next.kind}` });
  }
}

export function backBlock(w: World, side: 'machine' | 'reform'): string | undefined {
  void side;
  if (seasonNow(w)?.kind !== 'election') return 'There is no election on.';
  if (w.phase === 'night') return 'Campaign offices keep office hours.';
  return w.player.cash + w.player.dirty < ELECTION.back ? `A campaign wants ${ELECTION.back.toLocaleString()} at a time.` : undefined;
}
export function back(w: World, side: 'machine' | 'reform', amount: number) {
  const b = (w.season!.backing ??= { machine: 0, reform: 0 });
  b[side] += amount;
  log(w, `${amount.toLocaleString()} to the ${side === 'machine' ? 'machine' : 'reformers'}, in envelopes. The machine's chances: ${Math.round(machineOdds(w) * 100)}%.`, 'info');
}
