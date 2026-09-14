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
 *  - the `everything` scenario must touch every system. When it stops doing so, either the bot
 *    needs teaching or a system has become unreachable — and both are worth failing over.
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
  it('every scenario runs without throwing', () => {
    for (const name of SCENARIO_NAMES) {
      expect(() => canon(name), name).not.toThrow();
    }
  }, SLOW);

  it('boosted worlds are stamped, so their numbers can never pass as an economy curve', () => {
    for (const name of SCENARIO_NAMES) {
      const r = canon(name);
      expect(!!r.w.cheated, name).toBe(name !== 'honest' && name !== 'ambitious');
    }
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

describe('coverage', () => {
  it('the everything scenario touches every system', () => {
    const r = canon('everything');
    expect(missing(r.cov), `never exercised: ${missing(r.cov).join(', ')}`).toEqual([]);
    expect(fullyCovered(r.cov)).toBe(true);
  }, SLOW);

  it('and gets through a serious slice of the op roster', () => {
    const r = canon('everything');
    const distinct = Object.keys(r.cov.opKinds).length;
    const total = Object.keys(OP_DEFS).length;
    // Measured 17–20 of 40 across six seeds in sixteen days. The floor is set below the worst of
    // those rather than at the best, because a threshold only one seed clears is a flaky test
    // pretending to be a standard. Raising this number means teaching the bot, not re-rolling.
    expect(distinct, `only ${distinct} of ${total} op kinds ever ran`).toBeGreaterThanOrEqual(Math.floor(total * 0.4));
  }, SLOW);

  it('reports nothing as covered when nothing was run', () => {
    const r = soak('honest', 1, 5);
    expect(missing(r.cov).length).toBeGreaterThan(0);   // one honest day covers almost nothing
    expect(fullyCovered(r.cov)).toBe(false);
  }, SLOW);

  it('every system in the table is reachable by some scenario', () => {
    // a system nobody can reach is a bug in the table or in the game, not a bot problem
    const r = canon('everything');
    for (const s of SYSTEMS) {
      expect(s.needs.some(n => count(r.cov, n) > 0), `${s.label} was never reached`).toBe(true);
    }
  }, SLOW);
});

describe('the invariants a soak exists to catch', () => {
  it('no NaN anywhere, across every scenario', () => {
    for (const name of SCENARIO_NAMES) {
      const r = canon(name);
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
