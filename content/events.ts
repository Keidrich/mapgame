/**
 * Thresholds the event deck weights on.
 *
 * The rule these encode: an event about a system only comes up when that system is actually in
 * play for this player. `whale` needs a bookmaking racket, `debtor` needs a float — and police
 * attention needs the police to have actually noticed you. That last one was not true: the
 * "a detective is asking around" card weighted purely on owning any racket, so a player's first
 * protection job on day one could summon a plainclothes cop who had supposedly been watching it
 * for two nights. These exist so that cannot happen again by accident.
 */

/** Heat at which the police could plausibly be interested in you at all. The glossary tells the
 *  player they get noticed at 45; half that is where somebody starts asking quietly. */
export const POLICE_NOTICE = 30;

/** A racket has to have been running this long before anybody can have sat on it for two nights. */
export const RACKET_WATCHABLE_AFTER = 4;

/** Freshness at which a card is worth a use-it-or-lose-it decision rather than passive decay. */
export const CARD_STALE_AT = 45;

/**
 * Going to ground, and what it costs.
 *
 * The heat-60 warning has told the player to "lay low" since the game had a heat meter and there
 * has never been a way to do it: the only answers to a rising ladder were paying somebody
 * (bribes, which want an official who takes your calls and money you may not have) or scrubbing,
 * which only touches the wire. Everything else was waiting.
 *
 * So the cost here is **the thing the player actually has**: their own days. Laying low spends
 * turns, not a multiplier — you are not there, so you do nothing, and the street notices you are
 * not around. Money on top, because rent and wages do not stop for you.
 */
export const LAY_LOW = {
  minDays: 2,
  maxDays: 7,
  /** Per day. You are paying to be somewhere that is not yours and buying nothing with it. */
  costPerDay: 450,
  /**
   * Heat off per day, on top of the ordinary decay.
   *
   * 9 against the tick's `4 + heat × 0.03` means a week under puts roughly 60 points between you
   * and the task force — enough to answer an 80 and walk away from it, and not enough to make a
   * bust something you can shrug at, because seven days is most of a fortnight's earning.
   */
  heatPerDay: 9,
  /** The street forgets you a little. Being nowhere is not free reputationally. */
  respectPerDay: 1,
} as const;

/**
 * The hole in the wall. A solo player's answer to a bust taking everything at once.
 *
 * A bust seizes 80% of dirty cash. An outfit absorbs that — people carry, rackets keep running,
 * somebody else has a float. One person has one pocket, and watched the whole thing go in a
 * night with no way to have hedged.
 *
 * It is deliberately a *solo* mitigation rather than a general one: capacity falls with every
 * body who could be followed to it, and is gone entirely by the fourth. That is the honest
 * version of why a lone operator can hide money and an outfit cannot, and it keeps the stakes of
 * a bust intact for the player the mechanic was written for.
 */
export const CACHE = {
  /** Most a lone operator can ever have put away. */
  base: 5000,
  /** Off that, per crew member alive and not in a cell. Four people and there is no hole. */
  perCrew: 1400,
  /** They do turn the place over. Sometimes they find it — this is a hedge, not immunity. */
  bustChance: 0.25,
} as const;
