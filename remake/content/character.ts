/**
 * Your character: training, study, boosts and the habit they leave, and the name you have made.
 * Data, read by `sim/character.ts`.
 *
 * Until this pass skills only grew by doing — every threat was muscle, every job its skills — so a
 * boss who wanted to be better at something had to do more of the thing they were bad at. Now there
 * is a gym, a garage, the books: hours and a little money for a skill, once a day each, faster if you
 * keep at it. Boosts buy hours or an edge today and leave a habit that takes hours back tomorrow.
 */
import type { BusinessType, Skill } from '@r/sim/types';
import type { Half } from './clock';

/** Where each skill is trained, and in which half. Brains is studied with the books, anywhere. */
export const TRAINING: Record<Skill, { at: BusinessType[] | 'books'; half: Half; verb: string; blurb: string }> = {
  muscle: { at: ['gym'], half: 'night', verb: 'Train', blurb: 'The heavy bag after closing, with the fighters.' },
  charm: { at: ['nightclub', 'bar', 'casino'], half: 'night', verb: 'Work the room', blurb: 'Buy rounds, remember names, laugh at the right moment.' },
  wheels: { at: ['garage', 'cab_company'], half: 'day', verb: 'Drive a shift', blurb: 'A cab or a tow truck all afternoon, learning every street.' },
  tech: { at: ['electronics', 'pawn'], half: 'day', verb: 'Tinker', blurb: 'Take apart what the back room is selling and put it back.' },
  brains: { at: 'books', half: 'day', verb: 'Study', blurb: 'Ledgers, law books and the paper, cover to cover.' },
};

export const TRAIN = {
  /** Two hours a session; one session per skill a day, because a body and a head both need rest. */
  ap: 2,
  /** Experience a session: this much, more at a better place (per tier above the first). */
  xp: 16, perTier: 6,
  /** Keep at it: each day in a row that you train adds this, up to the cap. A missed day starts over. */
  streak: 2, streakCap: 10,
  /** What a session costs at somebody else's place, per tier. Free where you own or protect it. */
  fee: 60,
};

export type BoostKind = 'pep' | 'nerve';

/**
 * Boosts: bought and taken on the spot, from the fixer at any hour, a pharmacy by day, a nightclub
 * by night. Each adds to your habit; the habit fades by itself, but while it is high a day without
 * a boost takes hours from the morning.
 */
export const BOOSTS: Record<BoostKind, { label: string; blurb: string; price: number; habit: number; at: BusinessType[] }> = {
  pep: { label: 'Bennies', blurb: 'Two more hours today. Less, once you are used to them.', price: 120, habit: 10, at: ['pharmacy', 'nightclub'] },
  nerve: { label: 'A bump', blurb: 'Muscle and charm +2 for the rest of the day, and every conversation goes a little easier.', price: 250, habit: 15, at: ['nightclub'] },
};

export const HABIT = {
  /** Fades this much a day without a boost. */
  fade: 4,
  /** Past this, a day without a boost is a bad morning: an hour lost per `perHour` of habit above it, up to `maxLost`. */
  withdrawal: 25, perHour: 25, maxLost: 3,
  /** Bennies give their full two hours below this habit, one hour above it. */
  tolerance: 50,
  /** A bump: skill bonus, and the odds on every scene. */
  nerveSkill: 2, nerveOdds: 6,
  /** Shaking: the odds on every scene while in withdrawal. */
  shaking: -5,
  /** Drying out, through the fixer's doctor: money, hours, and most of the habit gone. */
  dryOut: { price: 900, ap: 3, cut: 50 },
};

/**
 * The name you have made, from fear and respect. It opens doors (the odds on the conversations it
 * suits) and closes others. `hard` scenes are the ones fear helps; `soft` the ones respect helps.
 */
export type Reputation = 'nobody' | 'rising' | 'feared' | 'respected' | 'honoured';
export const REPUTATION: Record<Reputation, { label: string; blurb: string; hard: number; soft: number }> = {
  nobody: { label: 'A nobody', blurb: 'Nobody knows your name yet. Nobody fears it either.', hard: 0, soft: 0 },
  rising: { label: 'On the way up', blurb: 'People have started to notice you.', hard: 0, soft: 0 },
  feared: { label: 'Feared', blurb: 'People cross the street. Threats land; friendly words sound like threats.', hard: 6, soft: -2 },
  respected: { label: 'Respected', blurb: 'Your word is good. Deals come easy; threats sound out of character.', hard: -2, soft: 6 },
  honoured: { label: 'A man of honour', blurb: 'Feared and respected both. Every door is a little more open.', hard: 4, soft: 4 },
};
/**
 * Thresholds: a reputation is 50 of one, and 15 more of it than the other; both at 50 is honour.
 * The penalties are small on purpose: at −6 on protection and recruiting, the bots (whose fear runs
 * ahead of their respect) held 17% of the city at day 60 instead of 24.6%. A name mostly opens doors.
 */
export const REP_AT = { high: 50, lead: 15, rising: 25 };
export const HARD_SCENES = ['intimidate', 'squeeze', 'lean', 'crew_take', 'crew_run'];
export const SOFT_SCENES = ['protect', 'recruit', 'bribe', 'settle', 'buy', 'favour', 'crew_pay'];
