/**
 * What a fortune is actually for.
 *
 * The economy had one shape for a long time: money bought capacity, capacity made more money, and
 * past a certain point the number on the HUD stopped meaning anything because there was nothing
 * left to spend it on. Everything in this file is a **sink** — a place for late money to go that
 * buys something the game already models, rather than a new subsystem to track.
 *
 * The rule each of these follows: **spend into an existing number.** Leverage buys a `favour`,
 * which `personalPull` already reads. A lifestyle buys respect and fear, which every scene
 * already reads. Legitimacy buys a multiplier on `addHeat`, which is already the single door all
 * heat goes through. A ceiling buys headroom on a cap that already exists. None of them invents a
 * stat, and that is deliberate: a sink that needs its own machinery is a second game.
 */
import type { Skills } from '@sim/types';

// ---------------------------------------------------------------- 2. buying a favour
/**
 * Paying somebody important to owe you one.
 *
 * `personalPull` already turns favours into votes at the Commission; this is the cash door into
 * the same number, next to the one you earn through `doFavour`. It buys the *input*, never the
 * outcome: the pull still has to clear `PERSONAL.flip` to move a vote, and every other term
 * (grudge, notoriety, leverage, whether you are strangers) is untouched. Money gets you a marker,
 * not a majority.
 *
 * Priced off what they are and how little they need you. The escalator matters most: the second
 * marker costs several times the first, because `PERSONAL.favourCap` only counts two anyway, and
 * a sink that got cheaper with use would be an exploit rather than a sink.
 */
export const FAVOUR_PRICE = {
  /** A councillor, a captain, a judge: expensive, and the cheapest of the three doors. */
  official: 22_000,
  /** A seated boss. What it costs to have one of the five owe you something. */
  boss: 55_000,
  /** Anybody else worth paying at all. */
  other: 9_000,
  /** Multiplier per marker they already owe you. Steeply up: two is the most that ever counts. */
  escalator: 3.2,
  /** Discount per point of trust above 40 — somebody who likes you asks for less. */
  trustDiscount: 0.006,
  /** …and a floor on that, so being liked never makes a fortune-sized sink cheap. */
  minShare: 0.55,
  /** They will not take money from somebody they have never dealt with. */
  minTrust: 15,
} as const;

// ---------------------------------------------------------------- 3. a lifestyle
export type LifestyleKind = 'home' | 'car' | 'security';
export interface LifestyleStep { label: string; blurb: string; cost: number; respect: number; fear: number }

/**
 * What being visibly successful is worth, and what it costs.
 *
 * Three ladders, each three rungs. They are not decoration: every step adds to `respect` or
 * `fear` permanently, and those two numbers are what the whole standing layer reads — so a good
 * address changes how a shopkeeper opens a conversation for the same reason a broken window does.
 *
 * The split across the three is the design. A **home** is respect: it says you are somebody who
 * is staying. A **car** is both, less of each: it is seen, and it gets you there. **Security** is
 * fear, because men standing near you are a statement about what happens to people who try.
 */
export const LIFESTYLE: Record<LifestyleKind, LifestyleStep[]> = {
  home: [
    { label: 'A decent apartment', blurb: 'An address you can give people without watching their face.', cost: 30_000, respect: 5, fear: 0 },
    { label: 'A house on the hill', blurb: 'Lawn, gate, and neighbours who looked you up.', cost: 140_000, respect: 11, fear: 2 },
    { label: 'The old Ferraro place', blurb: 'The house everybody in the city can point at. It came with the name on the gates.', cost: 520_000, respect: 20, fear: 5 },
  ],
  car: [
    { label: 'Something with a trunk', blurb: 'Nothing anybody looks at twice, and it starts every time.', cost: 18_000, respect: 3, fear: 1 },
    { label: 'A car people recognise', blurb: 'Parked outside, it tells the room who is inside.', cost: 95_000, respect: 8, fear: 4 },
    { label: 'Armoured, and known', blurb: 'Glass nobody is getting through, and everybody on the street knows whose it is.', cost: 340_000, respect: 12, fear: 10 },
  ],
  security: [
    { label: 'A man on the door', blurb: 'Somebody who is paid to be awake.', cost: 25_000, respect: 1, fear: 6 },
    { label: 'A detail', blurb: 'Two of them, and they change the route.', cost: 120_000, respect: 3, fear: 13 },
    { label: 'A standing detail', blurb: 'They are there before you get anywhere, and they were there yesterday.', cost: 430_000, respect: 5, fear: 22 },
  ],
};

/**
 * What a visibly successful player's security is worth when somebody comes for them personally.
 *
 * Read by `sim/player-risk.ts`: paying for men who are awake should actually matter the night
 * somebody tries, or the ladder is a respect vending machine. Per security rung.
 */
export const SECURITY_GUARD = 14;

// ---------------------------------------------------------------- 4. buying legitimacy
/**
 * Spending crime money to look less like a criminal.
 *
 * The most interesting sink here because it is the only one in real tension with the rest of the
 * game: every dollar is dirty, laundering it costs a third, and what it buys is the appearance of
 * never having needed to. It is also the only one that touches `addHeat`, which is the single
 * door every point of heat in the game goes through — so the discount is exactly as universal as
 * heat itself, with no per-source special cases.
 *
 * It **decays**. A reputation for being respectable is not bought once; a wing with your name on
 * it is old news in a month. `decayPerDay` is what makes this a sink rather than a purchase, and
 * it is why the numbers are per-tier rather than cumulative: you are buying a level and then
 * paying to stay at it.
 */
export const LEGITIMACY = {
  /** Standing bought per dollar, before decay. $10k buys 10 points. */
  perDollar: 0.001,
  /** Most you can ever look, however much you spend. Nobody is spotless. */
  cap: 60,
  /** Points lost a day. At the cap that is a bit under $2,000 a day to stand still. */
  decayPerDay: 0.9,
  /**
   * Heat multiplier at the cap. 0.55 at 60 points, scaling linearly from 1.0 at zero.
   *
   * Deliberately similar in size to `LONE_WOLF.heat` and deliberately *stacking* with it, because
   * a respectable lone operator is genuinely the hardest person in the city to look at — but the
   * floor below stops the two together switching the police off, which is the mistake the
   * lone-wolf number made first time round.
   */
  heatAtCap: 0.55,
  /** Whatever else is true, heat never falls below this share of itself. */
  heatFloor: 0.4,
  /** Minimum buy-in, so it is a decision rather than a slider. */
  minSpend: 5_000,
} as const;

// ---------------------------------------------------------------- 5. buying headroom
export type CeilingKind = 'crew' | 'safehouse';
/**
 * Permanent expansion of caps that already exist, rather than new caps.
 *
 * Both of these are hard walls the player hits and then stops thinking about: beds decide how
 * many people you can have, and the safehouse limit decides how many production lines and how
 * much stash. Buying headroom is the late-game version of renting your first back room.
 *
 * Priced with a steep escalator for the same reason the favour is: an uncapped sink that gets
 * cheaper per unit is a money printer pointed the wrong way.
 */
export const CEILING: Record<CeilingKind, { label: string; blurb: string; base: number; escalator: number; max: number; per: number }> = {
  crew: {
    label: 'Room for more people', blurb: 'Another floor, another set of keys, and somebody to keep the beds made.',
    base: 60_000, escalator: 2.1, max: 6, per: 2,
  },
  safehouse: {
    label: 'Another place of your own', blurb: 'Paper on a building nobody can connect to you, ready before you need it.',
    base: 90_000, escalator: 2.4, max: 4, per: 1,
  },
};
/** Safehouses a player may hold before any of this. The cap that did not exist as a number. */
export const SAFEHOUSE_BASE_LIMIT = 3;

/** Skills are fixed for life, so nothing in this file touches them. Kept honest by the type. */
export type NoSkillChange = Readonly<Partial<Record<keyof Skills, never>>>;
