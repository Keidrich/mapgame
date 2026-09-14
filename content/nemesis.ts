/**
 * The lieutenant who keeps turning up.
 *
 * Factions had lieutenants from the start and they were furniture: a name on a sit-down, a name
 * in a succession crisis, a name the faction tick picked to lead an attack and then forgot. You
 * could beat the same person at your door six times and the seventh was identical to the first.
 *
 * A nemesis is not a new kind of person. It is what the ledger already does for everybody else —
 * `remember()`, the same logger a shopkeeper gets — plus one number: **notoriety**, which is what
 * a win against the player is worth to them. That number is scaled by `STAKES` exactly as fear
 * is, and for the same reason: somebody who put your crew in hospital is made by it, and somebody
 * who talked over you at a sit-down is not.
 *
 * Notoriety buys three things, in order, and each is paid out once.
 */
import type { Trait } from '@sim/types';

export const NEMESIS = {
  /** Notoriety a win is worth before the stake multiplier. A loss to the player takes some back. */
  perWin: 9,
  /**
   * What a loss takes back, as a *fraction of what they already have* rather than a flat amount.
   *
   * This was a flat 6, and it made the whole system dead for any player who was winning.
   * Notoriety floors at 0, so a lieutenant who comes at you and loses sits on the floor for ever
   * and no later win ever climbs off it: a sixty-day war run had Pablo "Tiny" Delgado at the
   * player's door **84 times** — W7 L77 — with a notoriety of **0.0**, and every scenario in the
   * sweep produced zero nemeses. The system was tuned to reward failure, which is backwards for a
   * game about starting from nothing.
   *
   * Proportional erosion keeps the design intent — "a nemesis who keeps losing stops being one" —
   * without the floor swallowing everything: a loss shaves what is there instead of deleting a
   * fixed slab of it, so somebody with a record keeps most of it and somebody with none loses
   * nothing they had. It is also self-limiting, which the flat number was not.
   */
  perLossFraction: 0.12,
  /**
   * What simply turning up is worth, before the stake multiplier, win or lose.
   *
   * The file is called "the lieutenant who keeps turning up" and nothing in it counted turning
   * up. Presence is the third thing a recurring antagonist is made of, alongside what they did to
   * you and what you did to them — the man at your door for the ninth time is somebody now even
   * if you have put him down all nine times.
   *
   * With `perLossFraction`, this sets where a lieutenant who *always* loses plateaus:
   * `perMeeting / perLossFraction` ≈ 10–18 depending on the stakes, which sits deliberately below
   * `known` (20). He is on your sheet with a record; he is not your nemesis. Winning even
   * occasionally is what carries somebody over that line.
   */
  perMeeting: 1.4,
  /** Below this they are just a name on a card; at or above it the sheet says what they are. */
  known: 20,
  /**
   * How much of their notoriety counts toward the chair when their boss goes down.
   *
   * 0.18 puts a maxed record at 18, against `weight()`'s muscle + charm + brains/2, which tops out
   * near 25 — so a lieutenant who has been beating the player in public genuinely competes with a
   * better-skilled rival without simply outranking them. It was 0.08, which capped the whole arc
   * at eight points and meant a nemesis never actually moved the shortlist; the test that asserts
   * they do is what caught it.
   */
  successionWeight: 0.18,
};

export interface Milestone {
  id: string;
  at: number;
  /** What it does to them. Exactly one of these, so a milestone is always one legible change. */
  trait?: Trait;
  skill?: { key: 'muscle' | 'brains' | 'charm' | 'wheels' | 'tech'; by: number };
  nickname?: string[];
  line: string;
}

/**
 * Ordered by `at`. The nicknames are the payoff: after enough of it the street stops using their
 * given name, and the game stops using it too — `nemesisName()` is what every log line goes
 * through from then on.
 */
export const MILESTONES: Milestone[] = [
  { id: 'hardened', at: 25, trait: 'hothead', line: 'has stopped being careful around you' },
  { id: 'muscle', at: 40, skill: { key: 'muscle', by: 2 }, line: 'is bringing more people, and worse ones' },
  { id: 'named', at: 55, nickname: ['the Nail', 'Stone', 'the Shovel', 'Iron', 'the Wire', 'Knuckles', 'the Rake', 'Gravel'], line: 'has a name on the street now, and it is not the one on their birth certificate' },
  { id: 'connected', at: 70, trait: 'connected', line: 'has people in places you did not know they had people' },
  { id: 'sharp', at: 85, skill: { key: 'brains', by: 2 }, line: 'has worked out how you do it' },
];

/** What a lieutenant of theirs walking over to you is worth — and what it costs the faction. */
export const DEFECT = {
  ap: 2,
  /** Standing the faction loses. Deliberately brutal: this is the worst thing you can do to them. */
  standing: 45,
  soldiers: 2,        // they do not come alone
  loyalty: 55,        // they arrive wary; a bought man knows he was bought
  cut: 240,           // and expensive, because they were somebody
  influence: 8,       // their district tilts a little toward you
};
