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

export type SpecialistRole =
  | 'safecracker' | 'wheelman' | 'inside_man' | 'alarms' | 'fixer_face'
  // The second bench. Picked to fill the two gaps the first five left rather than to lengthen a
  // list: every one of the originals is hired for `tech`, `wheels` or `charm`, so a crew could be
  // staffed end to end without one person being brought in for **muscle** or for **brains**.
  | 'demolitions' | 'forger' | 'lookout';

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

  // The demolition man is what a door is worth when the safecracker is the wrong answer to it. He
  // fills the `muscle` gap, and he is the second-dearest seat on the bench because a wall is not a
  // subtle way in: his failure line is the loudest one here, which is the cost baked into taking
  // him rather than a number.
  demolitions: { role: 'demolitions', label: 'Demolition Man', blurb: 'Does not pick the lock. Puts a hole where there was not one and walks through it.', skill: 'muscle', worth: 15, fee: 11_000, failLine: 'The charge went early, the wall stayed up, and every dog on the street started.' },
  // Paper rather than doors: a provenance, a manifest, a bill of lading that has always been there.
  forger:      { role: 'forger',      label: 'Forger',        blurb: 'Nothing he makes is new. Everything he makes has been in a drawer for eleven years.', skill: 'brains', worth: 13, fee: 8_500, failLine: 'Somebody actually read the paperwork, and the paperwork did not hold.' },
  // The cheap one, and deliberately: the entry-level part, worth least, and the only specialist a
  // player can afford before their first real score. A bench whose cheapest seat is $5,500 is a
  // bench nobody sits on until day forty.
  lookout:     { role: 'lookout',     label: 'Lookout',       blurb: 'On the roof opposite with a radio, and has been there since four.', skill: 'brains', worth: 7, fee: 2_200, failLine: 'Nobody said anything about the second car, and by then it was parked.' },
};

/**
 * Which roles each set-piece actually has a part for. A job not listed here takes no specialists
 * at all, which is most of them — a stick-up does not have a safecracker-shaped hole in it.
 */
export const JOB_ROLES: Partial<Record<OpKind, SpecialistRole[]>> = {
  heist_armored:   ['wheelman', 'alarms', 'fixer_face', 'demolitions'],
  heist_payroll:   ['inside_man', 'wheelman', 'lookout'],
  heist_bank:      ['safecracker', 'alarms', 'wheelman', 'inside_man', 'demolitions'],
  // Two tech seats and nothing else: the second pair of eyes is the part it was missing.
  heist_jeweller:  ['safecracker', 'alarms', 'lookout'],
  // A painting is worth what its paperwork says it is worth, which is a forger's whole trade.
  heist_gallery:   ['alarms', 'inside_man', 'forger'],
  heist_countroom: ['safecracker', 'inside_man', 'fixer_face', 'lookout'],
  heist_containers: ['wheelman', 'fixer_face', 'forger'],
  // A warehouse job had **no parts at all** — a set-piece in the tree and a staffing question in
  // the code. A wall and a watchman is the shape of it, so that is the bench it gets.
  heist_warehouse: ['demolitions', 'lookout', 'wheelman'],
  count_night:     ['safecracker', 'inside_man', 'alarms', 'fixer_face', 'lookout'],
  dome_job:        ['safecracker', 'alarms', 'wheelman', 'demolitions'],
  manifest_swap:   ['inside_man', 'fixer_face', 'forger'],
  // The other two landmark jobs, which had none either. A basement of paper wants somebody who
  // writes it; a station concourse wants somebody watching the concourse.
  records_room:    ['forger', 'inside_man', 'lookout'],
  left_luggage:    ['lookout', 'fixer_face'],
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
