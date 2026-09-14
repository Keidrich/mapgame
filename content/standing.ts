/**
 * The numbers behind fear, trust, familiarity and word-of-mouth.
 *
 * These four used to be flat: a threat bought the same fear as a broken leg, a hundred small
 * pleasantries bought the same trust as a debt paid off, and anything notable painted every
 * face within a block of it. The tables here are the corrective, and they are all one idea —
 * **what a relationship is allowed to become is set by what it actually cost to build.**
 *
 * Balance lives here rather than at the call sites so a pass that wants people to fold faster
 * has one file to open. See `sim/standing.ts` for the machinery and `docs/DESIGN.md` §3.6.
 */

/**
 * What an act actually cost the player to commit, which is what decides how much fear it can
 * buy. The ceiling is the hard part: a stake can never take somebody past it, however often you
 * repeat the act. You get to 90 fear by breaking something of theirs, or you do not get there.
 *
 * `mult` scales the raw number the call site asked for; `ceiling` caps where it can land.
 */
export type Stake =
  | 'words'      // a scene: a stare, a raised voice, a name dropped. Reversible, costs nothing
  | 'backed'     // the same words with crew in the doorway, or their family named out loud
  | 'property'   // something of theirs is broken, taken, or burned
  | 'violence'   // somebody got hurt, and they know who did it
  | 'grave';     // somebody was taken, or did not come home

export const STAKES: Record<Stake, { mult: number; ceiling: number; label: string }> = {
  // 0.45 and a ceiling of 35 is the whole point of the rework: talk plateaus at "wary", and no
  // amount of repeat visits gets past it. 35 sits deliberately below PROTECT_NERVE × an average
  // nerve of ~50, so a shakedown can never be talked into existence.
  words:    { mult: 0.45, ceiling: 35,  label: 'talk' },
  backed:   { mult: 0.70, ceiling: 50,  label: 'a threat with something behind it' },
  property: { mult: 1.30, ceiling: 80,  label: 'something of theirs broken' },
  violence: { mult: 1.80, ceiling: 95,  label: 'somebody hurt' },
  grave:    { mult: 2.40, ceiling: 100, label: 'somebody taken, or worse' },
};

/** Everything from `property` up is a demonstrated act: it introduces you all by itself. */
export const DEMONSTRATED: Stake[] = ['property', 'violence', 'grave'];

/**
 * The familiarity floor, generalised from the one place that already had it: a lieutenant
 * cannot be promoted before `LIEUTENANT.minDays` however loyal they are. Same shape, smaller
 * numbers, applied to every deep relationship: a stranger cannot be deeply trusted, and cannot
 * be deeply afraid of you either, until you have actually been in front of them a few times.
 *
 * A demonstrated act is exempt from the fear floor — breaking somebody's window is its own
 * introduction — but never from the trust floor. Nothing introduces you into being trusted.
 */
export const FAMILIARITY = {
  minDays: 3,        // days since you first dealt with them, the LIEUTENANT.minDays pattern
  minContacts: 2,    // and separate occasions, so three visits in one afternoon is not a history
  shallowTrust: 25,  // trust stops here until both of the above are true
  shallowFear: 30,   // and so does fear, from anything short of a demonstrated act
};

/**
 * Concessions: protection, a place in the crew, a discount on a sale, a partner's cut. These
 * are the things repeated pleasantries used to buy on their own, and no longer can.
 *
 * Two separate ideas, deliberately not merged into one bigger trust number:
 *   - **Ordinary trust plateaus.** Visits, drinks and small talk take somebody to `ordinary` —
 *     friendly — and stop. Only a favour actually resolved raises that ceiling.
 *   - **A concession needs leverage or reciprocity on top.** Being liked is not a reason to
 *     hand over a third of your till.
 */
export const CONCESSION = {
  ordinary: 45,          // where trust from ordinary dealing stops
  perFavour: 15,         // each real favour resolved raises that ceiling
  favourCeiling: 85,     // ...to here, and no further. Nobody is bought outright
  groundInfluence: 55,   // your influence on their block that counts as holding the ground
  dirtDays: 30,          // how long what you found inside their books stays usable
};

/**
 * Coercing somebody into your crew needs them actually frightened, not merely wary. Sits above
 * `STAKES.words.ceiling` on purpose: you cannot talk anybody into this, you have to have done
 * something. `STAKES.backed.ceiling` is 50, so a threat with crew behind it still reaches.
 */
export const RECRUIT_LEAN_FEAR = 38;

/**
 * Word of mouth travels along people, not across a map. Index is degrees of separation from
 * whoever was actually there: 0 is a witness, 1 is somebody they know, 2 is a friend of a
 * friend. There is no index 3 — past that nobody has heard of you, which is the point: a
 * reputation built in one district does not follow you into a district you have never touched.
 */
export const REPUTATION = {
  degrees: [1, 0.45, 0.18],
  /** Nobody's whole address book hears at once; word reaches the people closest to them. */
  fanout: 5,
};
