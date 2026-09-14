/**
 * What you can actually do about what somebody wants.
 *
 * Every NPC worth watching carries an `Agenda` — a debt, a way out, a score to settle, a name to
 * make, somebody to keep safe — and it advanced daily whether or not the player showed up. You
 * could read it on their sheet and do nothing with it. These are the moves that change that.
 *
 * Each one resolves into `doFavour()` on success, which is the entire hook into the concession
 * system in `sim/standing.ts`: settle somebody's problem and the relationship is allowed to go
 * deeper, which is what protection, a place in the crew and a friendly price have needed since
 * that pass. Nothing else has to be built for the gating to work.
 *
 * `leave` has two modes on purpose. Helping somebody get out and using the fact that they want
 * out against them are both real plays, and neither is the obvious one — the dark route is
 * cheaper, works on somebody who does not trust you, and costs you the person afterwards.
 */
import type { AgendaKind } from '@sim/types';

export type AgendaMode = 'settle' | 'trap';

export interface AgendaMove {
  mode: AgendaMode;
  label: string;
  icon: string;
  blurb: string;
  good: string;
  bad: string;
  /** Cash it costs to try. `scaled` means the reducer computes it from what is actually owed. */
  cash?: number;
  scaled?: boolean;
  /** Base odds before skills and the relationship. Kept here so balance is one file. */
  base: number;
  /** Which of the player's skills carries it. */
  skill: 'charm' | 'brains' | 'muscle';
}

export const AGENDA_MOVES: Record<AgendaKind, AgendaMove[]> = {
  debt: [{
    mode: 'settle', label: 'Pay off what they owe', icon: '💵',
    blurb: 'Clear the book yourself. No roll on the money — it either covers it or it does not.',
    good: 'The debt is gone and they know who did it', bad: 'You are out the cash and they are still frightened',
    scaled: true, base: 78, skill: 'charm',
  }],
  leave: [
    {
      mode: 'settle', label: 'Help them get out', icon: '🚪',
      blurb: 'Vouch for them somewhere else, cover the gap, put them on a bus. Charm.',
      good: 'They go, and they tell people who made it possible', bad: 'The arrangement falls through and they blame you',
      cash: 1200, base: 62, skill: 'charm',
    },
    {
      mode: 'trap', label: 'Make sure they cannot', icon: '🕸️',
      blurb: 'They want out, so the way out is what you own. Quiet word in the right places. Brains.',
      good: 'They stay, and they do what you say', bad: 'They work out who closed the door',
      base: 58, skill: 'brains',
    },
  ],
  revenge: [{
    mode: 'settle', label: 'Settle it for them', icon: '⚖️',
    blurb: 'Go and have the conversation they cannot have. Muscle, and it makes noise.',
    good: 'Their score is settled and it was you who settled it', bad: 'You made an enemy and got nothing for it',
    base: 55, skill: 'muscle',
  }],
  ambition: [{
    mode: 'settle', label: 'Put your name behind them', icon: '👍',
    blurb: 'Vouch for them where it counts. Costs you standing if they are no good. Charm.',
    good: 'They get their shot, and they know who gave it', bad: 'You backed somebody who could not carry it',
    base: 66, skill: 'charm',
  }],
  family: [{
    mode: 'settle', label: 'Put somebody on them', icon: '👀',
    blurb: 'Whoever they are frightened for, make it known they are not to be touched. Muscle.',
    good: 'The person they are scared for is safe, and they know why', bad: 'Word gets out you are watching that house',
    base: 64, skill: 'muscle',
  }],
};

/** What clearing a debt costs. Scaled so a hard case is a real decision, not a rounding error. */
export const DEBT = { base: 1500, perProgress: 18 };

/** What a settled agenda is worth in the relationship, beyond the favour itself. */
export const AGENDA_REWARD = { trust: 18, respect: 8, spreadDegrees: 2, spreadRespect: 5 };
/**
 * And what the dark route buys instead: they stay, and they are afraid of you, and that is all.
 *
 * `again` is the cooldown, and it is load-bearing. A trap resets the agenda's progress without
 * closing it — they still want out, they just cannot — which without this is a loop: shut the
 * door, watch them start looking again, shut it again, for free fear every time. The soak found
 * it immediately, at fifty-four traps to six settlements in one run.
 */
export const TRAP_REWARD = { fear: 26, trust: -30, spreadDegrees: 1, spreadFear: 5, again: 20 };
