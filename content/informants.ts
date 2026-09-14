/**
 * Somebody on the inside, and somebody who will vouch for you.
 *
 * Both are the "phase 2 leverage" the connections graph was built for and then deferred, because
 * when it shipped there was no mechanism underneath to hang them on. There is now: `leverageOver`
 * and `doFavour` decide who will do something real for you, and `familiar` decides who knows you
 * well enough for it to mean anything.
 *
 * An asset is deliberately *not* a favour. A favour is spent once. An asset is standing — it pays
 * out again and again, quietly, until something breaks it — so it costs the same to set up as any
 * other major concession and then keeps working.
 */
export const ASSET = {
  /** Chance per faction attack that an informant placed to hear about it gets word out first. */
  warnChance: 0.7,
  /** What being warned is worth when they do arrive: you were standing ready, not surprised. */
  warnedBonus: 14,
  /** What a pair of hands is worth on a job against the faction they are close to. */
  activeBonus: 11,
  /** Heat an informant draws when they are used — somebody notices who keeps being near it. */
  heatPerUse: 1,
  /** They will not do it for ever without hearing from you. Days of silence before they drift. */
  goesCold: 25,
};

/**
 * An introduction. The point is the familiarity floor: somebody who vouches for you does not
 * make a stranger trust you, they make you *not a stranger*, which is the thing three days and
 * two meetings were otherwise the only way to buy.
 */
export const REFERRAL = {
  /** Contacts the introduction is worth, and how far back it dates your acquaintance. */
  contacts: 2,
  daysBack: 3,
  /** A little warmth comes with it, capped by the ordinary ceiling like anything else. */
  trust: 8,
  /** The introducer has to actually know you this well before their word carries. */
  minTrust: 35,
  ap: 1,
};
