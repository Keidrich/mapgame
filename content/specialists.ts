/**
 * The people you bring in for one job and never see again.
 *
 * A big heist has always been "do you have enough crew with enough muscle". That is a staffing
 * question, not a heist: the thing that makes a set-piece a set-piece is that it has *parts*, and
 * each part needs somebody who does only that. A safecracker is not a better crew member, they
 * are the reason the door opens at all.
 *
 * Three things make a specialist different from a recruit, and all three are the point:
 *
 *  - **They cost cash, not a wage.** One fee, up front, per job.
 *  - **They are not reliable.** `reliability` is the chance they actually come through on the
 *    night. A cheap wheelman is cheap because he is a coin toss, and the expensive one is
 *    expensive because he is not.
 *  - **They are hired through the ordinary doors.** `recruit`-style trust, or leverage, or money
 *    — `sim/specialists.ts` reads `concessionReason` and `leverageOver` exactly as every other
 *    ask in the game does, so a specialist you have history with is cheaper and one you have
 *    something on is cheaper still.
 */
import type { OpKind, Skills } from '@sim/types';

export type SpecialistRole = 'safecracker' | 'wheelman' | 'inside_man' | 'alarms' | 'fixer_face';

export interface SpecialistDef {
  role: SpecialistRole;
  label: string;
  blurb: string;
  /** The skill they are actually being hired for. */
  skill: keyof Skills;
  /** What they add to `opChance` when they come through. */
  worth: number;
  /** Base fee. Scaled by the job's payout in `specialistFee`. */
  fee: number;
  /** What goes wrong when they do not. One line, shown at resolution. */
  failLine: string;
}

export const SPECIALISTS: Record<SpecialistRole, SpecialistDef> = {
  safecracker: { role: 'safecracker', label: 'Safecracker', blurb: 'Does one thing, has done it two hundred times, and will not be hurried.', skill: 'tech', worth: 14, fee: 9_000, failLine: 'The box did not open, and the man who said it would was not there when it did not.' },
  wheelman:    { role: 'wheelman',    label: 'Wheelman',    blurb: 'Sits outside with the engine running and does not get out of the car.', skill: 'wheels', worth: 11, fee: 6_000, failLine: 'The car was not where the car was supposed to be.' },
  inside_man:  { role: 'inside_man',  label: 'Inside Man',  blurb: 'Works there. Has worked there eleven years. Nobody looks at him.', skill: 'charm', worth: 16, fee: 12_000, failLine: 'Their man inside did not come in that day, and nobody had a second way through.' },
  alarms:      { role: 'alarms',      label: 'Alarm Man',   blurb: 'Knows which wires are real and which are there to be cut.', skill: 'tech', worth: 12, fee: 8_000, failLine: 'Something rang somewhere, and after that it was a question of how fast everybody could move.' },
  fixer_face:  { role: 'fixer_face',  label: 'The Face',    blurb: 'Talks to whoever has to be talked to, and is never the one holding anything.', skill: 'charm', worth: 10, fee: 5_500, failLine: 'Nobody smoothed it over, and it needed smoothing over.' },
};

/**
 * Which roles each set-piece actually has a part for. A job not listed here takes no specialists
 * at all, which is most of them — a stick-up does not have a safecracker-shaped hole in it.
 */
export const JOB_ROLES: Partial<Record<OpKind, SpecialistRole[]>> = {
  heist_armored:   ['wheelman', 'alarms', 'fixer_face'],
  heist_payroll:   ['inside_man', 'wheelman'],
  heist_bank:      ['safecracker', 'alarms', 'wheelman', 'inside_man'],
  heist_jeweller:  ['safecracker', 'alarms'],
  heist_gallery:   ['alarms', 'inside_man'],
  heist_countroom: ['safecracker', 'inside_man', 'fixer_face'],
  heist_containers: ['wheelman', 'fixer_face'],
  count_night:     ['safecracker', 'inside_man', 'alarms', 'fixer_face'],
  dome_job:        ['safecracker', 'alarms', 'wheelman'],
  manifest_swap:   ['inside_man', 'fixer_face'],
};

export const SPECIALIST_FEE = {
  /** Fee also scales with what the job pays: nobody works a bank for a pawn-shop rate. */
  perPayout: 0.06,
  /** Knocked off for somebody who already trusts you. */
  trustDiscount: 0.004,
  /** …and for somebody you have something on. They are not doing it for the money. */
  leverageShare: 0.55,
  minShare: 0.5,
};

/** Reliability, before anything about the person. Better people are not on this table — they cost more. */
export const RELIABILITY = { base: 0.62, perSkill: 0.035, perTrust: 0.002, max: 0.95 };
