/**
 * Stories: two people with a grudge against you by name, whose arcs run for weeks rather than one
 * card. Data, read by `sim/stories.ts` and the story cards in `sim/events.ts`.
 *
 * - **The detective** turns up once you are worth noticing and keeps a file on you: it grows every
 *   day, faster when you are hot, and at each threshold he does something about it. You can dig into
 *   him, buy him, lean on him, have him moved, or have him disappear.
 * - **The heir** is the son or daughter of an outfit that hates you. Their grudge grows every day;
 *   every week they send something; when it boils over there is a showdown.
 */

export const DETECTIVE = {
  /** He turns up once heat has reached this, or on this day, whichever is first. */
  heatTrigger: 40, dayTrigger: 14,
  /** The file: a daily base, more with heat, more for every open case against you. */
  perDay: 0.4, perHeat: 1 / 100, perCase: 0.3,
  /** What he does at each point of the file, once each (the raid resets the file to `afterRaid`). */
  watch: 30, witness: 60, raid: 90, afterRaid: 40,
  raidSeize: 0.5, raidEvidence: 50, witnessEvidence: 25,
  /** Honest, at this chance: a bribe goes in the file instead of his pocket. */
  honest: 0.6,
  /** What you can do about him. */
  dig: { ap: 2, base: 30, perBrains: 6 },
  blackmail: { ap: 1, cut: 50 },
  bribe: { ap: 1, base: 4000, perFile: 40, refused: 10 },
  lean: { ap: 1, base: 20, perMuscle: 4, perFear: 0.25, perNerve: 0.5, win: -20, lose: 15, heat: 5 },
  transfer: { ap: 1, cost: 3000 },
  disappear: { ap: 2, cost: 5000, heat: 35, evidence: 30 },
  /** A bought detective wants paying again after this many days, or he flips back. */
  boughtDays: 20,
};

export const HEIR = {
  /** An heir rises in an outfit whose standing with you has sunk this far. */
  standingTrigger: -50,
  /** The grudge: a starting weight, a daily rise, more while their standing is below -60. */
  start: 40, perDay: 0.5, bitter: 0.5,
  /** A beat a week while it runs; the showdown at `boil`. */
  beatEvery: 7, boil: 90,
  /** Buying them down: a gift, or a sit-down (charm). */
  gift: { cost: 2000, cut: 15 },
  meet: { ap: 2, base: 30, perCharm: 5, cut: 25, worse: 10 },
  /** The showdown: a partner (money, a truce), a duel (a fight on the night), or a killing. */
  partner: { cost: 5000, standing: 50, truce: 20 },
  duel: { respect: 8, lostGrudge: 60 },
  kill: { heat: 20 },
};
