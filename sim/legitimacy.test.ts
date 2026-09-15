/**
 * Spending crime money to look less like a criminal.
 *
 * Two things have to be true at once and they pull against each other: the discount has to be
 * real and universal (it goes through `addHeat`, which is the only door heat comes through), and
 * it must not combine with the other multipliers into a police off-switch — which is the mistake
 * `LONE_WOLF.heat` made at 0.55 and the reason `heatFloor` exists.
 */
import { describe, expect, it } from 'vitest';
import { LEGITIMACY } from '@content/fortune';
import { LONE_WOLF } from '@content/backgrounds';
import { DAYPARTS } from '@content/timeofday';
import { can, dispatch, generateWorld, type World } from './index';
import { legitimacy, legitimacyGain, legitimacyHeatMult } from './fortune';
import { addHeat } from './util';

function rich(crew = 2): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 44 });
  w.pendingEvents = []; w.day = 60; w.player.cash = 5_000_000; w.player.heat = 0;
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, crew)) {
    n.role = 'crew'; n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  return w;
}
/** Heat actually added by one call, which is the only thing that matters here. */
const delta = (w: World, n = 20) => { const before = w.player.heat; addHeat(w, n); return w.player.heat - before; };

describe('the discount is real and it is universal', () => {
  it('buying it moves the multiplier', () => {
    const w = rich();
    expect(legitimacyHeatMult(w)).toBe(1);
    const after = dispatch(w, { type: 'buy_legitimacy', amount: 60_000 });
    expect(legitimacy(after)).toBeGreaterThan(0);
    expect(legitimacyHeatMult(after)).toBeLessThan(1);
  });

  it('and it applies to heat from anywhere, because there is only one door', () => {
    const plain = rich();
    const clean = dispatch(rich(), { type: 'buy_legitimacy', amount: 60_000 });
    expect(delta(clean)).toBeLessThan(delta(plain));
  });

  it('at the cap it is worth what the table says', () => {
    let w = rich();
    w = dispatch(w, { type: 'buy_legitimacy', amount: LEGITIMACY.cap / LEGITIMACY.perDollar });
    expect(legitimacy(w)).toBeCloseTo(LEGITIMACY.cap, 5);
    expect(legitimacyHeatMult(w)).toBeCloseTo(LEGITIMACY.heatAtCap, 5);
  });

  it('and no amount of money gets past the cap', () => {
    let w = rich();
    w = dispatch(w, { type: 'buy_legitimacy', amount: 4_000_000 });
    expect(legitimacy(w)).toBeLessThanOrEqual(LEGITIMACY.cap);
    expect(legitimacyGain(w, 1_000_000)).toBe(0);
    expect(can(w, { type: 'buy_legitimacy', amount: 50_000 }).ok, 'kept selling at the cap').toBe(false);
  });
});

describe('it is a sink, which means it does not stay bought', () => {
  it('a day passes and a little of it is gone', () => {
    let w = dispatch(rich(), { type: 'buy_legitimacy', amount: 60_000 });
    const at = legitimacy(w);
    w.pendingEvents = []; w = dispatch(w, { type: 'end_day' });
    expect(legitimacy(w)).toBeCloseTo(at - LEGITIMACY.decayPerDay, 5);
  });

  it('left alone for long enough it is all gone', () => {
    let w = dispatch(rich(), { type: 'buy_legitimacy', amount: 20_000 });
    for (let i = 0; i < 40; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    expect(legitimacy(w)).toBe(0);
    expect(legitimacyHeatMult(w)).toBe(1);
  });

  it('and a token gesture is refused outright', () => {
    const w = rich();
    expect(can(w, { type: 'buy_legitimacy', amount: LEGITIMACY.minSpend - 1 }).ok).toBe(false);
    expect(can(w, { type: 'buy_legitimacy', amount: LEGITIMACY.minSpend }).ok).toBe(true);
  });
});

describe('how it stacks with everything else heat goes through', () => {
  it('it multiplies with the lone-wolf discount rather than replacing it', () => {
    const crewed = dispatch(rich(2), { type: 'buy_legitimacy', amount: 60_000 });
    const alone = dispatch(rich(0), { type: 'buy_legitimacy', amount: 60_000 });
    expect(delta(alone), 'working alone stopped mattering once you looked respectable').toBeLessThan(delta(crewed));
  });

  it('but the whole stack together never switches the police off', () => {
    // The floor catches the *stack*, not any one pairing — alone and respectable is 0.41 of
    // normal, which is a large discount for maxing two long investments and is meant to be. What
    // it must not do is compound with the time of day into invisibility.
    expect(LONE_WOLF.heat * LEGITIMACY.heatAtCap, 'the two alone should not need the floor').toBeGreaterThan(LEGITIMACY.heatFloor);
    expect(LONE_WOLF.heat * LEGITIMACY.heatAtCap * DAYPARTS.night.heat, 'nothing reaches the floor, so it guards nothing').toBeLessThan(LEGITIMACY.heatFloor);

    let w = rich(0);
    w = dispatch(w, { type: 'buy_legitimacy', amount: 4_000_000 });
    w.hour = 2;                         // alone, respectable, and working at two in the morning
    expect(delta(w, 20)).toBeGreaterThanOrEqual(20 * LEGITIMACY.heatFloor - 0.001);
  });

  it('heat still climbs: a respectable man who keeps at it still gets there', () => {
    let w = rich(0);
    w = dispatch(w, { type: 'buy_legitimacy', amount: 4_000_000 });
    for (let i = 0; i < 20; i++) addHeat(w, 20);
    expect(w.player.heat, 'twenty loud jobs left no mark at all').toBeGreaterThan(60);
  });
});
