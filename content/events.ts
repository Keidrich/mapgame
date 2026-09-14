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
