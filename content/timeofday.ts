/**
 * When a job runs, and why that is a decision.
 *
 * The game has always had days and never had a time of day, so every job happened at the same
 * abstract noon. One number — `w.hour` — turns "when" into a choice with a real trade in it, and
 * it deliberately buys and costs *different* things rather than being a flat bonus:
 *
 *  - **Night** is the obvious one: quiet work goes better because nobody is looking, and there is
 *    less to steal because the tills are empty and the streets are dead.
 *  - **Day** is the opposite and the more interesting half: a loud job in daylight is worse odds
 *    and a bigger take, because that is when the money is in the building.
 *  - And the **law** is not uniform: a patrol notices more at four in the morning, when there is
 *    nothing else to look at, than it does at noon.
 *
 * Everything below multiplies a number that already exists. Nothing here adds a stat.
 */
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';

export interface DaypartDef {
  label: string;
  blurb: string;
  /** Added to `opChance`. Positive is easier. */
  chance: number;
  /** Multiplies an op's take. */
  payout: number;
  /** Multiplies heat from anything done then. Below 1 is quieter. */
  heat: number;
  /** How hard the law is looking. Multiplies `effectivePolice`. */
  police: number;
}

/** Hour the game starts on, and what an old save with no clock reads as. */
export const DEFAULT_HOUR = 9;

export const DAYPARTS: Record<Daypart, DaypartDef> = {
  morning:   { label: 'Morning',   blurb: 'Shutters up, deliveries in, and everybody watching the street.', chance: -3, payout: 1.0,  heat: 1.1,  police: 1.0 },
  afternoon: { label: 'Afternoon', blurb: 'The busiest the tills will be, and the busiest the pavement will be.', chance: -6, payout: 1.25, heat: 1.2,  police: 1.05 },
  evening:   { label: 'Evening',   blurb: 'Crowds to disappear into, and the money has not been banked yet.', chance: 2,  payout: 1.15, heat: 1.0,  police: 0.95 },
  night:     { label: 'Night',     blurb: 'Nobody about. Nothing in the tills either, and a patrol with nothing else to look at.', chance: 9, payout: 0.8, heat: 0.7, police: 1.25 },
};

/** Which part of the day an hour falls in. The one place the boundaries live. */
export function daypartAt(hour: number): Daypart {
  const h = ((hour % 24) + 24) % 24;
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

/** The hours a player can move the clock to, and what each is called. */
export const HOURS: { hour: number; label: string }[] = [
  { hour: 9, label: '09:00' }, { hour: 14, label: '14:00' }, { hour: 19, label: '19:00' }, { hour: 2, label: '02:00' },
];
