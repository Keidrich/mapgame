/**
 * The law as an entity, not a faction.
 *
 * Criminal factions have soldiers, cash, tribute and a standing toward each other; declaring
 * war on them means something. None of that fits the police. An Authority has no treasury and
 * no allies, it cannot be paid tribute or brought to a sit-down, and you do not "declare war"
 * on it — it decides how hard to look at you, and the only inputs are how much trouble you are
 * making and how much of it is on paper.
 *
 * Numbers here, mechanics in `sim/authority.ts`.
 */

export type AuthorityKind = 'precinct' | 'city_hall';
export type AuthorityPosture = 'routine' | 'watching' | 'investigating' | 'task_force' | 'crackdown';

export interface AuthorityKindDef {
  label: string;
  icon: string;
  /** Patrol strength added to the block it sits on, before posture. */
  reach: number;
  /** How much of the previous hop's strength survives one block further out. */
  falloff: number;
  /**
   * What kind of trouble this one is built to notice. A precinct is boots on the ground and
   * answers to noise in the street; city hall reads reports, and the wire is all report.
   * These are why `cyberHeat` is a separate input and not just more heat.
   */
  streetWeight: number;
  wireWeight: number;
  caseWeight: number;
}

/**
 * reach 25 with falloff 0.4 reproduces exactly the old one-time generation bump — +25 on the
 * station's block, +10 on its neighbours — except now it belongs to something the player can
 * see, and it grows when the Authority starts paying attention.
 */
export const AUTHORITY_KINDS: Record<AuthorityKind, AuthorityKindDef> = {
  precinct:  { label: 'Precinct', icon: '🚔', reach: 25, falloff: 0.4, streetWeight: 1, wireWeight: 0.45, caseWeight: 6 },
  city_hall: { label: 'City Hall', icon: '🏛️', reach: 14, falloff: 0.5, streetWeight: 0.55, wireWeight: 1.2, caseWeight: 9 },
};

export interface PostureDef {
  label: string;
  icon: string;
  blurb: string;
  /** Attention at or above this, and below the next rung's, puts them here. */
  at: number;
  /** How many blocks out the monitoring reaches. */
  radius: number;
  /** Multiplier on the patrol strength inside that radius. */
  mult: number;
  /** Multiplier on the nightly raid chance the tick already rolls. */
  raidMult: number;
}

/** The ladder. Nothing here is the faction stance ladder and nothing converts between them. */
export const POSTURES: Record<AuthorityPosture, PostureDef> = {
  routine:       { label: 'Routine', icon: '😐', at: 0,  radius: 1, mult: 1,    raidMult: 1,   blurb: 'Ordinary patrols. Nobody has your name on a board.' },
  watching:      { label: 'Watching', icon: '👀', at: 25, radius: 2, mult: 1.1,  raidMult: 1.15, blurb: 'Your name has come up. Cars go past slower than they used to.' },
  investigating: { label: 'Investigating', icon: '🔍', at: 45, radius: 2, mult: 1.25, raidMult: 1.4, blurb: 'Somebody has been assigned to you. They are building it properly.' },
  task_force:    { label: 'Task Force', icon: '🚨', at: 68, radius: 3, mult: 1.45, raidMult: 1.8, blurb: 'A standing unit, with your operation as its only job.' },
  crackdown:     { label: 'Crackdown', icon: '🔴', at: 86, radius: 3, mult: 1.7, raidMult: 2.2, blurb: 'Everything they have, all at once, until somebody is charged.' },
};

/** Rungs low to high; the ladder is read in order and nowhere is it a `Stance`. */
export const POSTURE_ORDER: AuthorityPosture[] = ['routine', 'watching', 'investigating', 'task_force', 'crackdown'];

export const AUTHORITY = {
  /** Attention chases pressure this fast, so escalation builds and decays rather than flipping. */
  climbPerDay: 6,
  coolPerDay: 3,
  /** An open case is worth this much pressure, times the kind's caseWeight/10. */
  caseUnit: 10,
  /** A bought official inside the building takes this share off what it notices. */
  boughtRelief: 0.18,
  maxBoughtRelief: 0.45,
};
