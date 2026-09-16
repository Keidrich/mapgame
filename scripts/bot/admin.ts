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

export type ScenarioName = 'honest' | 'solo' | 'ambitious' | 'boosted' | 'law' | 'wire' | 'war' | 'heists' | 'fortune' | 'straight' | 'legacy' | 'everything';

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
  /**
   * Cash in hand before the bot starts spending on the money sinks — an institution, a favour, a
   * lifestyle rung, respectability, a ceiling. Absent means never, which is what every scenario
   * that is not about a fortune gets, `honest` most of all: its curve is frozen and it has never
   * in sixty days held enough for the cheapest of these anyway.
   */
  sinksAt?: number;
  /** The run is aiming at the clean ending rather than at an empire. See `tryToGetOut`. */
  goingStraight?: boolean;
  /**
   * The run exists to find out what happens when somebody gets through, so the bot does not buy
   * anything whose only job is stopping them: no armour.
   *
   * This is not the bot being tuned to fail. `legacy`'s blurb has said "nothing bought to stand
   * between you and them" since it was written, and the note on its top-up already reasons about
   * `personalCover` — a plate carrier is thirty points of exactly that, and a bot wearing one
   * cannot reach the ending the scenario is named for. The flag makes a rule that was stated in
   * prose into one the code follows.
   */
  reckless?: boolean;
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
  /**
   * A fortune, and the things it is for.
   *
   * This exists because the money sinks are the one part of the game that cannot be reached by
   * playing well — they are reached by having *already* played well, and sixty days is not long
   * enough. Without a scenario the whole pass would have shipped with five ✗ rows and this file
   * would have been the third time that happened.
   *
   * It is also where the clock, the specialists and the stakes get exercised, because they are
   * all late-game shapes too: a set-piece with a hired safecracker needs the set-piece to be
   * plannable in the first place, and nobody comes for you personally until a lieutenant has had
   * enough meetings with you to be somebody.
   */
  fortune: {
    label: 'fortune', opsPerDay: 3, crewCap: 10, sinksAt: 400000,
    blurb: 'Money with nowhere to go, and everything that is meant to absorb it.',
    setup: [
      ...CORE,
      { what: 'cash', amount: 2_000_000 },
      { what: 'nemesis' },   // somebody who has met you often enough to come to your door
      { what: 'war', amount: 1 },
    ],
    // the sinks eat it by design — that is the whole point of them — so keep the pile topped up
    // or the run buys one casino on day 12 and tests nothing else for the next forty-eight days
    topUp: { every: 6, cheats: [{ what: 'cash', amount: 800_000 }, { what: 'crew', amount: 4 }, { what: 'nemesis' }] },
  },
  /**
   * The way out. Money, a person to go straight for, and nothing to do but keep it quiet.
   *
   * No ops and no crew on purpose: the four conditions in `GO_STRAIGHT` are mutually hostile to
   * an ordinary day, so a run that also tried to earn would reset `cleanSince` every morning and
   * report — truthfully — that the clean ending is unreachable. This is the scenario that says
   * whether it is reachable at all, which is a different question from whether it is easy.
   */
  straight: {
    label: 'straight', opsPerDay: 0, crewCap: 0, goingStraight: true,
    blurb: 'Enough money to stop, somebody to stop for, and a fortnight of keeping it quiet.',
    setup: [{ what: 'ap', amount: 10 }, { what: 'cash', amount: 1_500_000 }, { what: 'safehouse' }, { what: 'reveal' }],
    topUp: { every: 5, cheats: [{ what: 'cash', amount: 200_000 }] },
  },
  /**
   * The other ending: somebody gets to you, and the outfit goes to whoever is left standing.
   *
   * The opposite of `fortune` on purpose — no money sinks, so no house with a gate and no
   * standing detail, because `personalCover` is precisely what stops this happening and a bot
   * that had bought all of it survived nine attempts in a row. This is what the game looks like
   * to somebody who spent it all on the business.
   */
  legacy: {
    // Four, not two: the successor needs somebody left to lead, and with a crew of two the run
    // handed over once and then ended for good the next time somebody got through — which is the
    // right behaviour ('gone' is a real ending) but tells you nothing about what a successor's
    // game looks like afterwards.
    label: 'legacy', opsPerDay: 2, crewCap: 3, reckless: true,
    blurb: 'A nemesis, a war, and nothing bought to stand between you and them.',
    setup: [{ what: 'ap', amount: 10 }, { what: 'cash', amount: 60000 }, { what: 'skills', amount: 3 }, { what: 'crew', amount: 3 }, { what: 'safehouse' }, { what: 'own_block' }, { what: 'rackets' }, { what: 'unlock' }, { what: 'reveal' }, { what: 'nemesis' }, { what: 'war', amount: 2 }],
    // Deliberately no crew in the top-up: every extra body is three more points of
    // `personalCover`, and a run that kept replacing them survived sixty days of somebody coming
    // for it twelve times. Three is enough for an heir and not enough to hide behind.
    // Every three days, not five. The bot answers what comes to the door on best odds and often
    // wins, so "somebody came for you" is not the same as "somebody got through" — at five days
    // this run reached a succession on about half of its seeds, which is a coin toss standing in
    // for the one thing the scenario is named after. More knocks, same door.
    topUp: { every: 3, cheats: [{ what: 'nemesis' }, { what: 'war', amount: 2 }] },
  },
  everything: {
    label: 'everything', opsPerDay: 3, crewCap: 12, sinksAt: 300000,
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
      // A name the street gave you. Reputation is the one prerequisite with no other way in: the
      // opener needs `player.street`, which needs fear or respect past 55, and a sixteen-day run
      // only got there when a war happened to run its fear to 99. That made the row a coin toss on
      // the rng stream rather than a statement about the bot — it went dark the moment a territory
      // balance change reshuffled the stream without touching reputation at all.
      { what: 'street' },
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
