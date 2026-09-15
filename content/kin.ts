/**
 * When the name on the job belongs to somebody your own people love.
 *
 * The game already knew this was true — `Npc.connections` has held the family and friend web since
 * generation, and a hit has always been allowed to land on anybody — it simply never said so. A
 * player put a job on a man and found out afterwards, from a loyalty number, that he was somebody's
 * brother. The number was the whole of it.
 *
 * So the web comes to the door instead. Four answers, and the point of them is that there is no
 * clean one: every branch costs you something you were using.
 */
import type { Skills } from '@sim/types';

export type KinAnswer = 'straight' | 'theirs' | 'call_off' | 'nothing';

export interface KinAnswerDef {
  id: KinAnswer;
  label: string;
  icon: string;
  blurb: string;
  good: string;
  bad: string;
  /** The skill the roll leans on. `theirs` and `call_off` are decisions, not contests. */
  skill?: keyof Skills;
}

export const KIN_ANSWERS: KinAnswerDef[] = [
  {
    id: 'straight', label: 'Tell them straight', icon: 'crew', skill: 'charm',
    blurb: 'Say what is going to happen and why, to their face, before it does.',
    good: 'They wear it. It costs them something, and they stay',
    bad: 'They hear you say it and that is the day they stop being yours',
  },
  {
    id: 'theirs', label: 'Let them handle it', icon: 'fist',
    blurb: 'It is their family. Give them the job and stay out of it.',
    good: 'It is done, quietly, and nothing leads to you at all',
    bad: 'They may not be able to. Then it is not done, and he knows',
  },
  {
    id: 'call_off', label: 'Call it off', icon: 'lock',
    blurb: 'The job does not happen. They will know exactly what you did for them.',
    good: 'The largest thing you can be owed by anybody',
    bad: 'He is still out there, and he was on that list for a reason',
  },
  {
    id: 'nothing', label: 'Say nothing', icon: 'watching',
    blurb: 'Let it go out as planned. They will find out the way everybody finds out.',
    good: 'Nothing changes today',
    bad: 'They find out. Whatever they were to you, they are not that afterwards',
  },
];

export const KIN = {
  /**
   * Loyalty at or above which somebody is close enough that this comes to your door at all.
   *
   * Below it they work for you and that is the extent of it — a job on a cousin they never see is
   * not a scene, it is a line in the log. The number is deliberately near the top of the range:
   * this should be rare and should land hard, not fire every time the web brushes a job.
   */
  loyal: 55,
  /** What telling them costs when it goes well, and when it does not. */
  straightOk: -14,
  straightFail: -42,
  /** Letting them do it: cheap in heat, expensive in the person. */
  theirsLoyalty: -30,
  /** …and the chance they cannot go through with it, before their own nerve is read. */
  theirsFlinch: 0.3,
  /** Calling it off. The biggest single loyalty move in the game, and it buys a real favour. */
  callOffLoyalty: 26,
  /** Saying nothing, once they find out. */
  silentLoyalty: -55,
  /** Heat the job leaves when somebody's own brother does it instead of your crew. */
  theirsHeat: 4,
} as const;
