/**
 * Seasons: things that happen to the whole city for a week at a time — an election, a police
 * crackdown, a festival, a strike at the docks. Data, read by `sim/seasons.ts` and by the few
 * formulas each one bends (heat, police attention, takings, street prices, supplies).
 *
 * A season is announced in the papers a few days ahead, so there is time to get ready, and opens
 * with a card: the choice of what to do about it. Which season comes, and when, is drawn from the
 * seed and the day, not the world's rng, so a season never shifts every roll that follows it.
 */
export type SeasonKind = 'election' | 'crackdown' | 'festival' | 'strike';

export interface SeasonDef {
  label: string;
  /** What the papers say a few days ahead, and while it lasts. */
  headline: string;
  blurb: string;
  days: number;
  /** Multipliers on the city while it lasts (1 is no change); `attention` is added to every precinct's. */
  heat: number; attention: number; income: number; price: number; supplies: number;
}

export const SEASONS: Record<SeasonKind, SeasonDef> = {
  election: { label: 'Election', headline: 'CITY GOES TO THE POLLS', blurb: 'The machine against the reformers. Whoever wins decides what an official costs, and how hard the precincts look.', days: 8, heat: 1, attention: 0, income: 1, price: 1, supplies: 1 },
  crackdown: { label: 'Crackdown', headline: 'COMMISSIONER PROMISES CLEAN STREETS', blurb: 'Every precinct on overtime. Heat sticks, the police look harder, and a raid is never far away.', days: 7, heat: 1.3, attention: 25, income: 1, price: 1, supplies: 1 },
  festival: { label: 'Festival', headline: 'THE FEAST COMES TO TOWN', blurb: 'Lights on every street and crowds with money in their pockets: the takings are up and the corners are busy.', days: 5, heat: 0.9, attention: 0, income: 1.3, price: 1.2, supplies: 1 },
  strike: { label: 'Dock strike', headline: 'DOCKERS WALK OUT', blurb: 'Nothing comes off the ships: product is scarce and dear, and supplies for the labs cost half as much again.', days: 6, heat: 1, attention: 0, income: 1, price: 1.4, supplies: 1.5 },
};

export const SEASON = {
  /** The first season arrives on this day; the next `gap` days (± `jitter`) after one ends. At 14 the
   *  cycle was about twenty days and sixty days saw only three of the four. */
  first: 10, gap: 8, jitter: 2,
  /** The papers have it this many days ahead. */
  notice: 3,
};

/** The election: backing a side, and what each side's win does for twenty days. */
export const ELECTION = {
  back: 3000,
  /** The machine's chance: this, plus per $1,000 of backing either way, plus per councillor on your payroll. */
  base: 0.5, perThousand: 0.05, perCouncillor: 0.08,
  after: 20,
  /** The machine wins: officials cost less. Reform wins: every precinct looks harder. */
  machineBribe: 0.7, reformAttention: 15,
};

/** What the opening cards cost and do. */
export const RESPONSES = {
  crackdown: { buy: 4000 },
  strike: { pay: 3000, scabsHeat: 8 },
  festival: { sponsor: 1500, sponsorRespect: 4, crowd: 1200, crowdHeat: 3 },
};
