/**
 * What goes wrong in the middle of a big job.
 *
 * A tier-2+ op used to be one hidden roll: you launched it, and in the morning it had worked or
 * it had not. A complication cuts that roll in half. Something happens partway — the mark is not
 * alone, the vault is on a timer, a beat cop wanders in early — and the job *stops* and asks you
 * about it, through exactly the same machinery a faction showing up at your door uses:
 * `Confrontation`, `queueConfrontation`, `confrontOptions`, `resolveConfrontation`. There is no
 * second pending-action system, and there must never be one.
 *
 * The three answers stay `fight` / `flee` / `backup`, because that is what `sim/items.ts` reads
 * to price your kit. What changes per complication is what those three words *mean* on this job
 * and how well each one does, which is the `bias` below.
 *
 * Street work never gets one: a tier-0/1 job is a fast single roll, and that difference is the
 * point of the tiers.
 */
import type { ConfrontApproach } from '@sim/types';

export type ComplicationKind = 'not_alone' | 'time_lock' | 'beat_cop' | 'inside_wobble' | 'wrong_load' | 'second_crew';

export interface ComplicationDef {
  label: string;
  icon: string;
  /** What the player is told is happening, with `%s` replaced by the target's name. */
  text: string;
  /** How each answer reads on this particular problem. */
  options: Record<ConfrontApproach, { label: string; blurb: string; good: string; bad: string }>;
  /** Added to each answer's odds on this complication: some problems have an obvious right answer. */
  bias: Record<ConfrontApproach, number>;
  /** Which ops it can happen on. Empty means any tier-2+ job. */
  only?: string[];
}

/**
 * Answering well swings the op's own roll by this much, answering badly by the negative of it,
 * and never turning up is worse than either. Tuned so a complication is worth real attention
 * without making the original planning meaningless: a well-handled one is roughly the value of
 * one more competent crew member.
 */
export const COMPLICATION = {
  /** Chance a tier-2+ op raises one at all. */
  chance: 0.34,
  /** Per tier above 2, the chance climbs — a bank job is a mess more often than a warehouse. */
  chancePerTier: 0.07,
  handledBonus: 18,
  fumbledPenalty: 16,
  absentPenalty: 30,
  /** Heat is worse when you answered loud, better when you talked your way out. */
  heatBy: { fight: 1.35, flee: 0.85, backup: 1.05 } as Record<ConfrontApproach, number>,
  /** The lowest tier that can raise one. Below this a job is a single roll, on purpose. */
  minTier: 2,
};

export const COMPLICATIONS: Record<ComplicationKind, ComplicationDef> = {
  not_alone: {
    label: 'They are not alone',
    icon: 'crew',
    text: 'There are more people inside %s than anybody counted. Somebody in the back room stands up.',
    options: {
      fight: { label: 'Put them all on the floor', blurb: 'Nobody in the room is a problem if nobody in the room is standing.', good: 'It stays your job', bad: 'Somebody outside hears it' },
      backup: { label: 'Wave your people in early', blurb: 'Bring the ones on the door inside now.', good: 'Numbers settle it quietly', bad: 'The door is unwatched while they do' },
      flee: { label: 'Take what you have and go', blurb: 'Cut it short. Half a job is still a job.', good: 'Everybody walks out', bad: 'You leave most of it behind' },
    },
    bias: { fight: 4, backup: 10, flee: -2 },
  },
  time_lock: {
    label: 'It is on a timer',
    icon: 'clock',
    text: 'The door at %s is on a delay nobody mentioned. It opens when it opens, and not before.',
    options: {
      fight: { label: 'Force it', blurb: 'Whatever is in your hands against whatever is in the wall.', good: 'You are through and moving', bad: 'Noise, and a door that still is not open' },
      backup: { label: 'Sit on it and wait', blurb: 'Hold the room until the clock finishes.', good: 'It opens for you like it opens for anyone', bad: 'Every minute is a minute somebody could walk in' },
      flee: { label: 'Leave it', blurb: 'Take the drawers and forget the vault.', good: 'Out clean before the clock matters', bad: 'The good part stays in the wall' },
    },
    bias: { fight: -6, backup: 8, flee: 6 },
  },
  beat_cop: {
    label: 'A uniform, early',
    icon: 'precinct',
    text: 'A patrol car pulls up outside %s. Whoever is in it is not expected for another hour.',
    options: {
      fight: { label: 'Go through them', blurb: 'The worst option, available anyway.', good: 'The job continues', bad: 'You have just made this a much bigger file' },
      backup: { label: 'Somebody talks to them', blurb: 'A friendly face at the door, doing nothing wrong.', good: 'They move along none the wiser', bad: 'One of yours is now a face they remember' },
      flee: { label: 'Scatter and regroup', blurb: 'Out the back, separately, now.', good: 'Nobody is caught holding anything', bad: 'The job is over and it took nothing' },
    },
    bias: { fight: -14, backup: 8, flee: 12 },
  },
  inside_wobble: {
    label: 'Your inside man is losing it',
    icon: 'fear',
    text: 'Whoever let you into %s has gone grey and quiet, and is looking at the door.',
    options: {
      fight: { label: 'Make them more afraid of you', blurb: 'They hold it together for the wrong reason.', good: 'They do their part', bad: 'They do it badly, and hate you after' },
      backup: { label: 'Talk them down', blurb: 'Two minutes and a steady voice.', good: 'They come back to themselves', bad: 'Two minutes you did not have' },
      flee: { label: 'Cut them loose and finish it yourself', blurb: 'Put them out the door and carry on short-handed.', good: 'One less liability in the room', bad: 'Nobody is covering the part they had' },
    },
    bias: { fight: 0, backup: 12, flee: -4 },
  },
  wrong_load: {
    label: 'It is the wrong load',
    icon: 'hot_goods',
    text: 'What is actually in there is not what you were told would be in there. Somebody sold you a list from last month.',
    options: {
      fight: { label: 'Take it anyway', blurb: 'Whatever it is, it is worth something to somebody.', good: 'You do not leave empty', bad: 'Heavy, slow, and half of it is junk' },
      backup: { label: 'Send word and re-task', blurb: 'Somebody of yours knows where the real one is.', good: 'You end up on the right one', bad: 'The delay costs you the window' },
      flee: { label: 'Walk away from it', blurb: 'Not tonight. Nobody knows you were here.', good: 'No exposure at all', bad: 'Nothing at all, either' },
    },
    bias: { fight: 2, backup: 6, flee: 4 },
  },
  second_crew: {
    label: 'Somebody else had the same idea',
    icon: 'long_con',
    text: 'There is another crew already inside %s. They are as surprised as you are.',
    options: {
      fight: { label: 'It is yours', blurb: 'Settle whose job this is, in the room.', good: 'They leave, you finish', bad: 'Two crews fighting is a siren magnet' },
      backup: { label: 'Split it with them', blurb: 'Nobody has time for this. Half each, out in five.', good: 'Everybody walks with something', bad: 'Half' },
      flee: { label: 'Let them have it', blurb: 'Back out and let them take the weight.', good: 'They are the ones on the cameras', bad: 'They are also the ones with the money' },
    },
    bias: { fight: -2, backup: 10, flee: 2 },
  },
};

export const COMPLICATION_KINDS = Object.keys(COMPLICATIONS) as ComplicationKind[];
