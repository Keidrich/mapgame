/**
 * The soak bot itself.
 *
 * This exists because three feature passes in a row shipped with the bot silently unable to
 * reach what had just been built — the economy curve looked fine and meant nothing. Coverage is
 * a number now, so "the bot cannot see this" is a test failure rather than something a person
 * has to notice.
 *
 * Two contracts:
 *  - the `honest` scenario is frozen. It is the only run whose economy numbers are comparable
 *    with earlier passes, so its behaviour must not drift. If a change here moves its curve, it
 *    is a bot change wearing a balance change's clothes.
 *  - **the sweep** must touch every system. This used to say "the `everything` scenario", and it
 *    stopped being possible to say that once the game grew endings: a run that goes straight has
 *    by definition stopped earning, and a run where somebody gets to you has by definition not
 *    spent its money on a house with a gate. So the contract is the union across scenarios —
 *    which is what `npm run sim -- 60 7 all` prints anyway — and `everything` keeps a weaker
 *    contract of its own below: it must still reach everything that is not an ending.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { SCENARIOS, SCENARIO_NAMES } from './bot/admin';
import { count, fullyCovered, missing, SYSTEMS } from './bot/coverage';
import { run } from './bot/run';

/**
 * A soak run is seconds of work, and several of these assertions want the same one. Cache by
 * (scenario, days, seed) so the file stays a few seconds rather than a minute and a half.
 */
const cache = new Map<string, ReturnType<typeof run>>();
const soak = (scenario: Parameters<typeof run>[0]['scenario'], days: number, seed: number) => {
  const key = `${scenario}:${days}:${seed}`;
  let r = cache.get(key);
  if (!r) { r = run({ days, seed, scenario }); cache.set(key, r); }
  return r;
};
/** Runs are slow by nature; the default 5s is for unit tests, not for playing thirty days. */
const SLOW = 90_000;
/**
 * One canonical run per scenario, shared by every assertion below. Each is a few seconds, and
 * this file would otherwise add a minute to a twelve-second gate — at which point people stop
 * running the gate, which is worse than any of these tests.
 */
const DAYS = 16, SEED = 5;
const canon = (scenario: Parameters<typeof run>[0]['scenario']) => soak(scenario, DAYS, SEED);

/**
 * Hand the event loop back for a tick.
 *
 * A soak is tens of seconds of straight synchronous work, and a vitest worker that never returns
 * to the loop cannot answer the runner's `onTaskUpdate` — which times out and fails the whole run
 * with **every test passing**, an exit code 1 that says nothing about the game. It has bitten this
 * file twice now. Awaiting between scenarios costs nothing and lets the worker report in.
 */
const breathe = () => new Promise(r => setTimeout(r, 0));

describe('the honest scenario is frozen', () => {
  it('uses no admin panel at all and is never stamped as cheated', () => {
    const r = soak('honest', DAYS, 7);
    expect(SCENARIOS.honest.setup).toEqual([]);
    expect(SCENARIOS.honest.topUp).toBeUndefined();
    expect(r.w.cheated).toBeUndefined();
  }, SLOW);

  it('plans no ops, which is what keeps its curve comparable with earlier passes', () => {
    expect(SCENARIOS.honest.opsPerDay).toBe(0);
    const r = soak('honest', DAYS, 7);
    expect(count(r.cov, 'ops_planned')).toBe(0);
  }, SLOW);

  it('still does the ordinary business of a day', () => {
    const r = soak('honest', DAYS, 7);
    expect(count(r.cov, 'days')).toBe(DAYS);
    expect(count(r.cov, 'rackets_started') + count(r.cov, 'crew_hired')).toBeGreaterThan(0);
    expect(r.w.player.racketIds.length).toBeGreaterThan(0);
  }, SLOW);

  it('is deterministic: the same seed gives the same world', () => {
    const a = soak('honest', 15, 3);
    const b = soak('honest', 15, 3);
    expect(b.w.player.dirty).toBe(a.w.player.dirty);
    expect(b.w.player.heat).toBe(a.w.player.heat);
    expect(b.w.day).toBe(a.w.day);
  }, SLOW);
});

describe('the boosted scenarios reach what honest play cannot', () => {
  it('every scenario runs without throwing', async () => {
    for (const name of SCENARIO_NAMES) {
      expect(() => canon(name), name).not.toThrow();
      await breathe();
    }
  }, SLOW);

  it('boosted worlds are stamped, so their numbers can never pass as an economy curve', async () => {
    // Read off the scenario rather than a list of names: a scenario that uses no admin panel is
    // honest play by definition, and adding one should not mean remembering to edit this line.
    for (const name of SCENARIO_NAMES) {
      const r = canon(name);
      await breathe();
      expect(!!r.w.cheated, name).toBe(SCENARIOS[name].setup.length > 0);
    }
  }, SLOW);

  it('the solo scenario really is one person on their own', () => {
    // The whole claim of the scenario. If it ever recruits, its numbers stop being about a
    // player with nobody and the coverage table starts flattering the solo tree.
    expect(SCENARIOS.solo.setup).toEqual([]);
    expect(SCENARIOS.solo.crewCap).toBe(0);
    const r = canon('solo');
    expect(r.w.player.crewIds.length, 'the solo bot hired somebody').toBe(0);
    expect(count(r.cov, 'solo_ops'), 'the solo bot never finished a job with nobody on it').toBeGreaterThan(0);
    expect(count(r.cov, 'lines_built'), 'the solo bot never built anything to sell').toBeGreaterThan(0);
    expect(count(r.cov, 'street_sales'), 'the solo bot never sold anything by hand').toBeGreaterThan(0);
  }, SLOW);

  it('law work actually runs in the law scenario', () => {
    const r = canon('law');
    expect(count(r.cov, 'law_ops')).toBeGreaterThan(0);
  }, SLOW);

  it('the wire actually runs in the wire scenario', () => {
    const r = canon('wire');
    expect(count(r.cov, 'cards_run') + count(r.cov, 'cards_dumped')).toBeGreaterThan(0);
  }, SLOW);

  it('war brings somebody to the door', () => {
    const r = canon('war');
    expect(count(r.cov, 'confrontations')).toBeGreaterThan(0);
  }, SLOW);

  it('big jobs raise complications, and the bot answers them', () => {
    const r = canon('heists');
    expect(count(r.cov, 'tier2_ops')).toBeGreaterThan(0);
    expect(count(r.cov, 'complications')).toBeGreaterThan(0);
    expect(count(r.cov, 'complications_answered')).toBeGreaterThan(0);
  }, SLOW);
});

/**
 * Rows `everything` is not expected to reach in sixteen days, and why. Nothing is excused here
 * for being flaky — each one is excluded for a stated structural reason, and the union test
 * below still holds every one of them to account across the sweep.
 *
 *  - the five sinks and the two endings only happen in a run built around them: `everything` is
 *    a run about *having* an empire, and none of this happens to somebody busy having one;
 *  - faction-vs-faction war is genuinely slow. Standing between two outfits is a random walk
 *    with a grievance on top, and sixteen days is not long enough for it to conclude — it turns
 *    up reliably in a sixty-day `ambitious` run and in the full sweep, which is where it belongs.
 */
const SLOW_OR_TERMINAL = new Set([
  'the fourth tier', 'buying a favour', 'lifestyle', 'buying legitimacy', 'raising a ceiling',
  'getting out', 'succession', 'factions on their own',
  // The upstart is spawned on day 12 by design, so a sixteen-day run watches it for four of them
  // and whether it has pushed anywhere by then is a coin toss. It grows reliably over sixty.
  'a rival who grows',
  // Somebody has to become a nemesis before they can open their mouth as one, and that means
  // `NEMESIS.known` — twenty notoriety, which is several meetings. Sixteen days does not have
  // them. This is a property of the arc, not of the bot: loosening the throttle on the bot's
  // nemesis conversations from one day in five to one in three changed nothing here, which is
  // how it was established that run length rather than eagerness is the limit.
  'a nemesis opener',
]);

describe('coverage', () => {
  it('the everything scenario touches every system that is not slow or terminal', () => {
    const r = canon('everything');
    const gaps = missing(r.cov).filter(l => !SLOW_OR_TERMINAL.has(l));
    expect(gaps, `never exercised: ${gaps.join(', ')}`).toEqual([]);
  }, SLOW);

  it('and gets through a serious slice of the op roster', () => {
    const r = canon('everything');
    const distinct = Object.keys(r.cov.opKinds).length;
    const total = Object.keys(OP_DEFS).length;
    // Measured 22–29 of 63 across seeds 1,3,5,7,9,11 in sixteen days.
    //
    // This briefly went down to 32% and came back. Every pass since the standing rework added
    // something the bot spends AP on — conversations, agendas, assets, introductions — and against
    // a fixed eight-AP day each one quietly cost op coverage; the floor was cut to accommodate
    // that, which was treating the symptom. The real fix was giving the boosted scenarios a longer
    // day (`{ what: 'ap', amount: 14 }` in `admin.ts` CORE), and with it the sixty-day sweep went
    // from 27 distinct op kinds back to 33 — better than before the squeeze started.
    //
    // The crime pass put 22 more ops on the board — a roster 54% bigger in one pass — and the
    // fraction fell to 20 of 63. Teaching came first, per the rule below, and it found a real
    // blindness rather than a shortfall: `runTheEmpire` assigned every last idle body to an
    // unmanned racket, so `idleCrew` was empty for ever and the bot had *never once* been able to
    // plan an op with a `minCrew` — on some seeds every single job it ran all month was one that
    // needs nobody. Holding people back for work (`Ctx.reserve`), restaffing the outfit the law
    // scenario keeps jailing, making `reveal` produce derelict ground where a generated city has
    // none, and ranking untried ops by how few people they tie up rather than by how big they are
    // took it from 20 back to 22–29, against 16–20 before the roster grew. The sixty-day sweep
    // went 33 → 47 distinct kinds on the same changes. Lengthening the run buys nothing now:
    // thirty days measures what sixteen does.
    //
    // So the fraction moved because the denominator did, and this is the one place it is honest
    // to cut it: absolute reach went **up** by six kinds in the same pass that cut the percentage.
    // 33% of 63 is 20, which sits below the worst of the six seeds — the floor has to be below
    // the worst rather than at the best, because a threshold only one seed clears is a flaky test
    // pretending to be a standard. **If a future pass makes this fail, teach the bot or lengthen
    // its day before you touch this number**: cutting the bar to fit a bot that got worse hides
    // exactly the thing this exists to show. Cutting it because 22 new ops landed at once, with
    // the measurement to prove reach rose, is a different thing, and it should not happen twice.
    expect(distinct, `only ${distinct} of ${total} op kinds ever ran`).toBeGreaterThanOrEqual(Math.floor(total * 0.33));
  }, SLOW);

  it('reports nothing as covered when nothing was run', () => {
    const r = soak('honest', 1, 5);
    expect(missing(r.cov).length).toBeGreaterThan(0);   // one honest day covers almost nothing
    expect(fullyCovered(r.cov)).toBe(false);
  }, SLOW);

  it('every system in the table is reachable by some scenario', async () => {
    // A system nobody can reach is a bug in the table or in the game, not a bot problem. Taken
    // across the whole sweep, because that is the claim: somewhere in the scenarios, every row in
    // that table is a thing that actually happens.
    //
    // Sixteen days for the sweep, because twelve scenarios at sixty would put a minute on the
    // gate. One row genuinely needs longer — standing between two outfits is a random walk with a
    // grievance on top, and it does not *conclude* inside a fortnight — so it gets one sixty-day
    // `ambitious` run of its own rather than a weaker assertion. If that ever fails, faction
    // independence has actually broken; do not add rows to this list to make it green.
    const SLOW_ROWS: Record<string, { scenario: Parameters<typeof run>[0]['scenario']; days: number; seed?: number }> = {
      'factions on their own': { scenario: 'ambitious', days: 60 },
      // Each of these is reachable and measured on this seed; sixteen days is simply not long
      // enough for any of them. An institution has to be afforded before it can be bought, the
      // upstart does not exist until day 12, and somebody has to get through you to inherit.
      //
      // The day counts are the shortest that actually reach them, not a round number: `fortune`
      // buys its first institution on day 38 and `legacy` loses its player well before day 32.
      // Runs are cached by (scenario, days, seed), so the two `fortune` rows share one run and
      // this whole fallback costs two soaks rather than four.
      // The fourth tier is gated on *standing*, not money — `standingFloor` 55 against
      // `respect + fear / 2` — so whether a run reaches it depends on how the city treated that
      // particular bot, not on how long it ran. At seed 5 `fortune` ends on $259,000 having never
      // become somebody the room would deal with, which is the gate working rather than failing;
      // at seed 7, the seed `npm run sim -- 60 7 all` uses and where the full sweep reads 42/42,
      // it buys one. Checked there. **Do not answer a future failure here by raising the days** —
      // it was 80 days at seed 5 and still zero. Check the standing.
      'the fourth tier': { scenario: 'fortune', days: 60, seed: 7 },
      // Same run as the row above, deliberately: runs are cached by (scenario, days, seed), so
      // sharing one costs nothing and this file is long enough already — it had grown slow enough
      // to trip vitest's worker RPC timeout, which failed the gate with every test passing.
      'a rival who grows': { scenario: 'fortune', days: 60, seed: 7 },
      'succession': { scenario: 'legacy', days: 32 },
      // Also this run, deliberately, for the same cached-soak reason as the two rows above: a
      // nemesis has to reach `NEMESIS.known` before there is one to talk to, and `fortune` at
      // seed 7 has made one by day 60. If this ever fails, check whether anybody is becoming a
      // nemesis at all before touching the days — a zero here and a zero on `a nemesis` together
      // mean the arc broke, not the dialogue.
      'a nemesis opener': { scenario: 'fortune', days: 60, seed: 7 },
    };
    const reached = new Set<string>();
    for (const name of SCENARIO_NAMES) {
      const r = canon(name);
      await breathe();
      for (const s of SYSTEMS) if (s.needs.some(n => count(r.cov, n) > 0)) reached.add(s.label);
    }
    for (const [label, how] of Object.entries(SLOW_ROWS)) {
      if (reached.has(label)) continue;
      const s = SYSTEMS.find(x => x.label === label)!;
      const r = soak(how.scenario, how.days, how.seed ?? SEED);
      await breathe();
      if (s.needs.some(n => count(r.cov, n) > 0)) reached.add(label);
    }
    const gaps = SYSTEMS.map(s => s.label).filter(l => !reached.has(l));
    expect(gaps, `no scenario reaches: ${gaps.join(', ')}`).toEqual([]);
  }, SLOW);
});

describe('the invariants a soak exists to catch', () => {
  it('no NaN anywhere, across every scenario', async () => {
    for (const name of SCENARIO_NAMES) {
      const r = canon(name);
      await breathe();
      const p = r.w.player;
      for (const [k, v] of Object.entries({ cash: p.cash, dirty: p.dirty, heat: p.heat, cyberHeat: p.cyberHeat ?? 0 })) {
        expect(Number.isFinite(v), `${name}: ${k}`).toBe(true);
      }
    }
  }, SLOW);

  it('does not leave jobs hanging or confrontations piling up', () => {
    const r = canon('everything');
    expect(r.cov.warnings.filter(x => /did not drain|survived being answered|without resolving/.test(x))).toEqual([]);
  }, SLOW);

  it('never ends a run unable to answer what is in front of it', () => {
    const r = canon('war');
    expect(r.cov.warnings.filter(x => /could not answer/.test(x)), r.cov.warnings.join(' | ')).toEqual([]);
  }, SLOW);
});
