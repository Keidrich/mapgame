/**
 * Stories: people whose business is you, for weeks at a time. Data, read by `sim/stories.ts` and the
 * story cards in `sim/events.ts`.
 *
 * The game is a sandbox, so no story is written in. There is a catalogue of kinds, and each game
 * decides from its own seed which of them are on the table at all and what sets them off. What
 * actually starts one is what you did: get hot enough and somebody opens a file; get famous and a
 * reporter comes; make an outfit hate you and an heir rises; have somebody killed and their family
 * may come for you; let somebody go and they may sell what they know. Two games on two seeds
 * rarely share a story, and some go weeks with none.
 */
export type ArcKind = 'detective' | 'reporter' | 'heir' | 'avenger' | 'turncoat' | 'friend';

export const ARCS: Record<ArcKind, {
  /** The chance this seed has one at all, and the chance of another after that one ends. */
  chance: number; again: number;
  /** What the panel calls the meter. */
  meter: string;
  blurb: string;
}> = {
  detective: { chance: 0.75, again: 0.4, meter: 'The file on you', blurb: 'A detective with your name on a folder. The file grows every day, faster when you are hot.' },
  reporter: { chance: 0.55, again: 0.35, meter: 'The story', blurb: 'A reporter who has decided you are the story. When it runs, the whole city reads it.' },
  heir: { chance: 0.7, again: 0.35, meter: 'The grudge', blurb: 'The heir of an outfit you have hurt, with a grudge that only grows.' },
  avenger: { chance: 0.6, again: 0.5, meter: 'Their hate', blurb: 'Somebody whose family you buried, and who has decided to do something about it.' },
  turncoat: { chance: 0.6, again: 0.5, meter: 'What they have told', blurb: 'Somebody who used to work for you, selling what they know to whoever will pay.' },
  friend: { chance: 0.45, again: 0.3, meter: 'The plan', blurb: 'An old friend in town with a big score and not quite enough money. Maybe it is real.' },
};

/** No more than this many at once: a city with five people after you is a siege, not a story. */
export const MAX_ACTIVE = 2;
/** Days after one of a kind ends before another of that kind can begin. */
export const REST = 20;

export const DETECTIVE = {
  /** The detective turns up past a heat of 30-55 or after day 12-37: where in those ranges is the seed's call. */
  heat: [30, 55], day: [12, 37],
  /** The file: a daily base, more with heat, more for every open case against you. */
  perDay: 0.4, perHeat: 1 / 100, perCase: 0.3,
  watch: 30, witness: 60, raid: 90, afterRaid: 40,
  raidSeize: 0.5, raidEvidence: 50, witnessEvidence: 25,
  honest: 0.6,
  dig: { ap: 2, base: 30, perBrains: 6 },
  blackmail: { ap: 1, cut: 50 },
  bribe: { ap: 1, base: 4000, perFile: 40, refused: 10 },
  lean: { ap: 1, base: 20, perMuscle: 4, perFear: 0.25, perNerve: 0.5, win: -20, lose: 15, heat: 5 },
  transfer: { ap: 1, cost: 3000 },
  disappear: { ap: 2, cost: 5000, heat: 35, evidence: 30 },
  boughtDays: 20,
};

export const REPORTER = {
  /** Fear and respect together past 50-90 (the seed's call), from day 8. */
  fame: [50, 90], from: 8,
  perDay: 0.6, perHeat: 1 / 120, perFame: 1 / 200,
  questions: 35, draft: 65, runs: 100, afterRun: 30, pieces: 2,
  /** What a piece does when it runs. */
  run: { heat: 12, respect: -4, fear: 2 },
  feed: { ap: 1, cut: 35, standing: -5 },
  editor: { ap: 1, cost: 6000 },
  lean: { ap: 1, base: 25, perMuscle: 4, perFear: 0.25, win: -25, lose: 20, heat: 3 },
  silence: { ap: 2, heat: 40, evidence: 30 },
};

export const HEIR = {
  /** An heir rises in an outfit whose standing with you has sunk past -40 to -65 (the seed's call). */
  standing: [-40, -65],
  start: 40, perDay: 0.5, bitter: 0.5,
  beatEvery: 7, boil: 90,
  gift: { cost: 2000, cut: 15 },
  meet: { ap: 2, base: 30, perCharm: 5, cut: 25, worse: 10 },
  partner: { cost: 5000, standing: 50, truce: 20 },
  duel: { respect: 8, lostGrudge: 60 },
  kill: { heat: 20 },
};

export const AVENGER = {
  /** Somebody with a revenge agenda against you, some nights: this chance a night once the seed allows. */
  nightly: 0.08,
  perDay: 1.2,
  note: 30, hire: 60, attempt: 100, afterAttempt: 50, attempts: 2,
  /** A failed attempt: you are hurt this long. */
  hurt: 5, heat: 5,
  amends: { ap: 1, cost: 2500, base: 30, perCharm: 5 },
  frighten: { ap: 1, base: 20, perMuscle: 5, perFear: 0.3, perNerve: 0.5, worse: 20 },
  silence: { ap: 2, heat: 15, evidence: 15 },
};

export const TURNCOAT = {
  /** Somebody who left your crew in the last fortnight, some nights. */
  within: 15, nightly: 0.15,
  perDay: 1,
  sell: 35, cops: 70, trial: 100,
  sellStanding: -10, copsEvidence: 20, trialEvidence: 25,
  buyback: { ap: 1, cost: 3000, base: 40, perCharm: 4 },
  frighten: { ap: 1, base: 25, perMuscle: 5, perFear: 0.3, perNerve: 0.5, worse: 20 },
  silence: { ap: 2, heat: 12, evidence: 15 },
};

export const FRIEND = {
  /** Turns up somewhere in days 10-30, when the seed says so. */
  day: [10, 30],
  /** You put hours and money in; the plan does not grow by itself. */
  help: { ap: 2, cost: 1000, add: 25 },
  doubt: 50, doubtCost: 3000,
  /** The payoff, and the chance it was a con all along (the seed's call, not the dice's). */
  payoff: [15000, 40000], con: 0.3,
};
