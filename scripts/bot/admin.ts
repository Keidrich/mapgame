/**
 * The admin panel, as the bot drives it.
 *
 * Every entry here is an ordinary `cheat` action — the same ones behind the fold in the help
 * sheet — so there is no test-only code path through the sim. The bot gets at the late game the
 * way a person poking at the build would, and the world it produces is stamped `cheated` so a
 * boosted run can never be mistaken for an economy curve.
 *
 * Scenarios exist because the systems have prerequisites that take a real player many days to
 * assemble: tier-2 ops want a crew, a safehouse and a weapon; law work wants an Authority that
 * is actually looking at you and a file open; the wire wants cards in your pocket. Without this
 * the bot spends sixty days shaking down bars and reports that everything is fine.
 */
import { dispatch, type CheatKind, type World } from '@sim/index';

export type ScenarioName = 'honest' | 'solo' | 'ambitious' | 'boosted' | 'law' | 'wire' | 'war' | 'heists' | 'everything';

export interface Scenario {
  label: string;
  blurb: string;
  /** Applied once, before day 1. */
  setup: { what: CheatKind; amount?: number }[];
  /** Re-applied every N days, for things the world consumes (files close, cards die). */
  topUp?: { every: number; cheats: { what: CheatKind; amount?: number }[] };
  /** Ops planned per day. 0 keeps a scenario to the careful street play the old bot did. */
  opsPerDay: number;
  /** How many people the bot will recruit. Part of the honest scenario's shape, so it is fixed. */
  crewCap: number;
  /**
   * Cash the bot wants in hand before it builds a production line. The default is deliberately
   * cautious — a player with an empire does not spend their last $1,200 on a still — and it is a
   * knob rather than a constant because the honest scenario's numbers must not move: it never
   * reaches this much, so it has never built a line, and lowering it globally would have
   * rewritten the one curve that is comparable across passes.
   */
  stillAt?: number;
}

const CORE: { what: CheatKind; amount?: number }[] = [
  // A longer day, because the point of a boosted scenario is reach. Every pass since the standing
  // rework has added something the bot spends AP on — conversations, agendas, assets,
  // introductions — and against a fixed eight-AP day each one quietly cost op coverage: the
  // sixty-day sweep fell from 32 distinct op kinds to 27 over two passes. The honest scenario
  // does not get this and must never get it; its whole value is being comparable across passes.
  { what: 'ap', amount: 14 },
  { what: 'cash', amount: 250000 },
  { what: 'skills', amount: 9 },
  { what: 'crew', amount: 5 },
  { what: 'safehouse' },
  { what: 'own_block' },
  { what: 'turf' },
  { what: 'kit' },
  { what: 'rackets' },
  { what: 'unlock' },
  { what: 'reveal' },
];

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  /**
   * The original bot, unchanged: careful street play, no ops, no admin panel. This is the one
   * `npm run sim -- 60` runs and the only one whose economy numbers are comparable with earlier
   * passes, which is why its shape is frozen. Coverage comes from the scenarios below.
   */
  honest: {
    label: 'honest',
    blurb: 'No admin panel and no ops. The economy curve only means something in this mode.',
    setup: [], opsPerDay: 0, crewCap: 6,
  },
  /**
   * One person, alone, from nothing. No cheats, no crew, and the only things on the board are
   * the jobs that need nobody and what you can make and sell yourself.
   *
   * This is the scenario the solo pass exists for, and the reason it is a scenario rather than a
   * change to `honest`: the honest run never builds a line and never runs a job, so it could not
   * tell you whether any of this pass worked. Read `jobs run alone`, `lines built` and
   * `street sales` in its coverage table — if the first is near zero the solo tree is a lie, and
   * if the last two are zero a player with nobody has no way to make a living.
   */
  solo: {
    label: 'solo',
    blurb: 'One person, no crew, no cheats: solo jobs and a still. The opening, on its own.',
    setup: [], opsPerDay: 2, crewCap: 0, stillAt: 1800,
  },
  /** An honest player who takes risks: no cheats, but it plans and launches real jobs. */
  ambitious: {
    label: 'ambitious',
    blurb: 'No admin panel, but it runs ops — what a bold player reaches on their own.',
    setup: [], opsPerDay: 2, crewCap: 8,
  },
  boosted: {
    label: 'boosted', opsPerDay: 3, crewCap: 8,
    blurb: 'A mid-game empire on day one: money, crew, a place, kit and the tree open.',
    setup: CORE,
  },
  law: {
    label: 'law', opsPerDay: 3, crewCap: 8,
    blurb: 'Every precinct looking hard, somebody of yours in a cell, a file open.',
    setup: [...CORE, { what: 'attention', amount: 90 }, { what: 'jail_crew', amount: 30 }, { what: 'open_case', amount: 40 }],
    // files close and people get out, so keep putting them back
    topUp: { every: 8, cheats: [{ what: 'attention', amount: 85 }, { what: 'open_case', amount: 40 }, { what: 'jail_crew', amount: 25 }] },
  },
  wire: {
    label: 'wire', opsPerDay: 3, crewCap: 8,
    blurb: 'Cards in your pocket, somebody worth selling out, and wire heat to clean up.',
    setup: [...CORE, { what: 'cards', amount: 8 }, { what: 'ratted' }],
    // cards perish by design, so a long run needs more of them
    topUp: { every: 6, cheats: [{ what: 'cards', amount: 6 }] },
  },
  war: {
    label: 'war', opsPerDay: 3, crewCap: 8,
    blurb: 'Two factions want you dead, which is the only time the war ops exist.',
    setup: [...CORE, { what: 'war', amount: 2 }],
    topUp: { every: 10, cheats: [{ what: 'war', amount: 2 }] },
  },
  heists: {
    label: 'heists', opsPerDay: 3, crewCap: 8,
    blurb: 'Everything a tier 3–4 job needs, so complications actually get raised.',
    setup: [...CORE, { what: 'cash', amount: 500000 }],
  },
  everything: {
    label: 'everything', opsPerDay: 3, crewCap: 12,
    blurb: 'All of the above at once: the run that should reach every system.',
    setup: [
      ...CORE,
      { what: 'cash', amount: 500000 },
      { what: 'war', amount: 2 },
      { what: 'attention', amount: 90 },
      { what: 'jail_crew', amount: 30 },
      { what: 'open_case', amount: 40 },
      { what: 'cards', amount: 8 },
      { what: 'ratted' },
      { what: 'agendas' },
      { what: 'nemesis' },
      // plenty of generated cities have no street crew at all, and then nothing about corners,
      // payroll or staking one can be reached however long the run is
      { what: 'crews', amount: 2 },
      { what: 'stash' },
    ],
    topUp: {
      every: 7,
      cheats: [
        { what: 'cash', amount: 120000 }, { what: 'cards', amount: 6 }, { what: 'attention', amount: 85 },
        { what: 'open_case', amount: 40 }, { what: 'jail_crew', amount: 25 }, { what: 'war', amount: 2 },
        // ...and people to replace the ones the line above just put in a cell. Without this the
        // outfit is six-eighths jailed by day 14 and every op with a `minCrew` stops being
        // plannable, which reads in the coverage table as half the roster never running.
        { what: 'crew', amount: 8 },
      ],
    },
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];
export function isScenario(s: string): s is ScenarioName { return (SCENARIO_NAMES as string[]).includes(s); }

/** Push a list of cheats through the ordinary reducer. */
export function apply(w: World, cheats: { what: CheatKind; amount?: number }[]): World {
  let next = w;
  for (const c of cheats) next = dispatch(next, { type: 'cheat', what: c.what, amount: c.amount });
  return next;
}
export function setUp(w: World, s: Scenario): World { return apply(w, s.setup); }
export function topUp(w: World, s: Scenario, day: number): World {
  if (!s.topUp || day === 0 || day % s.topUp.every !== 0) return w;
  return apply(w, s.topUp.cheats);
}
