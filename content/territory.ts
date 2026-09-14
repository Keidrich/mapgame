/**
 * Why you would ever run anything but protection, and why holding a block should feel like
 * holding it.
 *
 * Two numbers drove both problems. Protection costs nothing to set up and works on any business
 * in the city, so there was never a reason to pay for anything else. And influence accrued at a
 * flat +1 a day per racket wherever it sat, so three rackets on one block did exactly as much
 * for you as three rackets on three blocks — depth bought nothing, and city control sat near the
 * same low percentage from the first soak in this project onward.
 *
 * The fix is one tension, expressed in two directions:
 *
 *   - **The same kind, spread thin, pays less.** Flood a district with five protection rackets
 *     and the fifth is worth a fraction of the first. Saturation is per district and per kind.
 *   - **Different kinds, stacked deep, pay more.** Rackets that feed each other get a synergy
 *     bonus, and a block with several of your operations on it accrues influence far faster than
 *     the sum of its parts.
 *
 * So the profitable shape stops being "protection everywhere" and becomes "a few blocks you
 * actually own, running several things each". Which is also the shape the territory game wanted
 * all along.
 */
import type { RacketKind } from '@sim/types';

export const SATURATION = {
  /**
   * How many of a kind a district carries before flooding shows. Measured the hard way: with no
   * grace at all, saturation punished exactly the player who could not yet afford to diversify —
   * the early game is cash-starved, every racket it can afford is protection, and decaying the
   * second one made the escape *harder*. Three free means an early player is untouched and a late
   * one still has to spread out.
   */
  free: 3,
  /**
   * What each additional racket past the free ones is worth, compounding: the nth beyond is
   * `pow(decay, n)`. At 0.8 that is 100% / 100% / 80% / 64% / 51%.
   */
  decay: 0.8,
  /** Never worth literally nothing: a saturated racket still ticks over. */
  floor: 0.25,
};

/**
 * Rackets that feed each other. The bonus is paid to the *dependent* kind when the feeder is
 * running in the same district — dealing has something to fence, carding has somewhere to wash.
 * One-directional on purpose: the feeder does not need the dependent to work.
 */
export interface Synergy { needs: RacketKind; bonus: number; why: string }
export const SYNERGIES: Partial<Record<RacketKind, Synergy>> = {
  fencing:      { needs: 'dealing', bonus: 0.35, why: 'the people moving product bring you everything else they lift' },
  laundering:   { needs: 'carding', bonus: 0.3, why: 'card paper gives the wash a plausible shape' },
  carding:      { needs: 'laundering', bonus: 0.25, why: 'somewhere clean to put it means you can take more of it' },
  dealing:      { needs: 'smuggling', bonus: 0.3, why: 'product coming in cheap through your own route' },
  loansharking: { needs: 'gambling_den', bonus: 0.35, why: 'a room full of people who just lost everything' },
  bookmaking:   { needs: 'numbers', bonus: 0.25, why: 'the same runners, the same slips, twice the book' },
  no_show_jobs: { needs: 'union_dues', bonus: 0.4, why: 'you are the one writing the payroll' },
  union_dues:   { needs: 'protection', bonus: 0.2, why: 'nobody votes against a friend of the neighbourhood' },
  counterfeiting: { needs: 'fencing', bonus: 0.3, why: 'a fence who will take paper as readily as goods' },
  after_hours:  { needs: 'smuggling', bonus: 0.3, why: 'the bar never runs dry and never buys legally' },
};

export const TERRITORY = {
  /**
   * Influence accrual multiplies with how much you actually run on a block. One operation is
   * the old flat trickle; each additional one past the first adds this much again, so a block
   * with four of your things on it accrues about two and a half times as fast as four separate
   * blocks with one each. Depth is the point.
   */
  depthBonus: 0.5,
  /** Past this many operations the compounding stops, so a mega-block cannot run away. */
  depthCap: 4,
  /** Every consecutive day you have actually held a block adds this much to accrual… */
  tenurePerDay: 0.02,
  /** …up to here. Roughly a month of holding ground doubles nothing, but it does settle it. */
  tenureCap: 0.5,
  /**
   * A block you run deeply pushes rivals off it, rather than only out-accruing them. Without
   * this, a contested block stays contested forever because both sides keep adding.
   */
  pushPerDepth: 0.5,
  /**
   * The actual territory lever, found by measuring rather than assuming. Accrual speed was never
   * what held city control down: a bot sixty days in had every block it ran anything on already
   * at influence 100 — and there were three of them, out of forty-five. What was missing was any
   * way for holding ground to *spread*. A block you control and run deeply now bleeds influence
   * into its neighbours, the way `spreadRep` bleeds reputation, so an empire grows outward from
   * strongholds instead of stopping at the doors you happen to own.
   */
  spillPerDepth: 0.45,
  /** Spill only comes off a block you actually hold, and only past this much depth. */
  spillFromDepth: 2,
  /** Control is this much influence, and the most of it. Unchanged — the accrual is the lever. */
  controlAt: 30,
};
