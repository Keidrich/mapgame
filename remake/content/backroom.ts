/**
 * The back rooms: poker, street dice and the numbers, played for real. Data, read by
 * `sim/backroom.ts`.
 *
 * The night encounter used to settle a card game in one line ("sit in and play it straight"). Now
 * the chair is a real seat: five-card draw against the regulars, a read on them if you have the head
 * for it, and the bottom of the deck if you have the hands. The numbers are the neighbourhood's
 * daily lottery; dice are what happens in the alley behind the bar.
 */
import type { BusinessType } from '@r/sim/types';

/** Where a game can be found after dark. A place with a gambling den behind it, whoever runs it, too. */
export const TABLES: BusinessType[] = ['bar', 'nightclub', 'casino', 'restaurant'];

export const POKER = {
  /** The ante a hand, by table. A raise is twice the ante. */
  stakes: [100, 300, 1000],
  /** Sitting down costs an hour of the night; the hands after that are free, up to `maxHands`. */
  ap: 1, maxHands: 8,
  /** You need this many antes on you to sit. */
  bankroll: 4,
  /** The house takes this of every pot, unless the house is yours. */
  rake: 0.05,
  /** Two others at the table. */
  seats: 2,
  /** A read on a player: this chance, plus per point of brains and charm, up to `readMax`. */
  read: 0.2, readBrains: 0.05, readCharm: 0.03, readMax: 0.8,
  /**
   * Dealing from the bottom: your discards come back better (at least a pair). Caught at this chance,
   * less per point of tech and brains, never under `cheatFloor`. Caught means the pot is gone, you are
   * thrown out, and the table remembers.
   */
  cheat: 0.35, cheatTech: 0.03, cheatBrains: 0.02, cheatFloor: 0.05,
  caught: { heat: 2, respect: -2, trust: -15, fear: 5 },
  /** Caught: this many days before that back room will have you again. */
  banDays: 14,
  /** Playing straight with regulars: they like you a little more for the sitting. */
  trust: 4,
};

/** Street dice (craps without the casino's felt): 7 or 11 wins, 2, 3 or 12 loses, anything else is the point. */
export const DICE = { bets: [50, 200, 500], maxRolls: 30, perNight: 10 };

/**
 * The numbers: three digits, played by day wherever a numbers game runs, drawn overnight. It pays
 * 600 to 1 against true odds of 999 to 1; the difference is why the numbers is a racket.
 */
export const NUMBERS = { pays: 600, bets: [10, 50, 100], perDay: 3 };
