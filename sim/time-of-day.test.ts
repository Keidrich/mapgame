/**
 * When a job runs.
 *
 * The trade has to cut both ways or it is not a decision: night buys odds and costs the take,
 * daylight is the reverse, and the law is not uniform across the clock either. A flat "night is
 * better" would just be a button everybody presses once and forgets.
 */
import { describe, expect, it } from 'vitest';
import { DAYPARTS, DEFAULT_HOUR, HOURS, daypartAt, type Daypart } from '@content/timeofday';
import { can, dispatch, generateWorld, select, type World } from './index';
import { effectivePolice } from './authority';
import { addHeat } from './util';

const mk = (hour?: number): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 200 });
  w.pendingEvents = []; w.day = 30; w.player.cash = 200_000;
  if (hour !== undefined) w.hour = hour;
  return w;
};
const PARTS = Object.keys(DAYPARTS) as Daypart[];

describe('the clock reads the way a clock reads', () => {
  it('every hour lands in exactly one part of the day', () => {
    for (let h = 0; h < 24; h++) expect(PARTS).toContain(daypartAt(h));
  });

  it('and it wraps, so nothing off the end of the dial explodes', () => {
    expect(daypartAt(24)).toBe(daypartAt(0));
    expect(daypartAt(-1)).toBe(daypartAt(23));
  });

  it('a save with no clock reads as the default rather than as midnight', () => {
    const w = mk();
    expect(w.hour).toBeUndefined();
    expect(select.daypart(w)).toBe(daypartAt(DEFAULT_HOUR));
  });
});

describe('the trade cuts both ways', () => {
  it('night is the best odds and the worst take', () => {
    const best = PARTS.reduce((a, b) => (DAYPARTS[a].chance >= DAYPARTS[b].chance ? a : b));
    const worst = PARTS.reduce((a, b) => (DAYPARTS[a].payout <= DAYPARTS[b].payout ? a : b));
    expect(best).toBe('night');
    expect(worst).toBe('night');
  });

  it('and the busiest hours are the reverse of that', () => {
    expect(DAYPARTS.afternoon.chance).toBeLessThan(DAYPARTS.night.chance);
    expect(DAYPARTS.afternoon.payout).toBeGreaterThan(DAYPARTS.night.payout);
  });

  it('nothing is strictly better than everything else', () => {
    // the real test of a trade: for every part of the day, something else beats it somewhere
    for (const a of PARTS) {
      const beatenSomewhere = PARTS.some(b => b !== a && (DAYPARTS[b].chance > DAYPARTS[a].chance || DAYPARTS[b].payout > DAYPARTS[a].payout));
      expect(beatenSomewhere, `${a} is strictly dominant`).toBe(true);
    }
  });
});

describe('it actually moves the numbers it claims to', () => {
  it('the same job is better odds at night than in the afternoon', () => {
    const night = select.opChance(mk(2), 'robbery', []);
    const noon = select.opChance(mk(14), 'robbery', []);
    expect(night).toBeGreaterThan(noon);
  });

  it('heat is quieter at night, and that is on top of everything else heat reads', () => {
    const night = mk(2), noon = mk(14);
    const delta = (w: World) => { const b = w.player.heat; addHeat(w, 20); return w.player.heat - b; };
    expect(delta(night)).toBeLessThan(delta(noon));
    expect(delta(mk(2)) / delta(mk(14))).toBeCloseTo(DAYPARTS.night.heat / DAYPARTS.afternoon.heat, 4);
  });

  it('but a patrol at four in the morning has nothing else to look at', () => {
    const w = mk(2), day = mk(14);
    const block = Object.keys(w.blocks)[0];
    expect(effectivePolice(w, block)).toBeGreaterThan(effectivePolice(day, block));
  });
});

describe('setting it is a real decision the player makes', () => {
  it('the hours on offer are the hours the reducer will take', () => {
    const w = mk();
    for (const h of HOURS) expect(can(w, { type: 'set_hour', hour: h.hour }).ok, h.label).toBe(true);
    expect(can(w, { type: 'set_hour', hour: 11 }).ok, 'took an hour nobody offered').toBe(false);
  });

  it('and it sticks', () => {
    const w = dispatch(mk(), { type: 'set_hour', hour: 2 });
    expect(w.hour).toBe(2);
    expect(select.daypart(w)).toBe('night');
  });

  it('the clock at launch is the clock that counts', () => {
    // changing your mind afterwards must not retroactively move a job already planned
    let w = mk(2);
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
    w.player.currentBlockId = biz.blockId;
    w = dispatch(w, { type: 'plan_op', kind: 'robbery', crewIds: [], targetBusinessId: biz.id });
    const o = Object.values(w.ops)[0];
    expect(o.hour).toBe(2);
    w = dispatch(w, { type: 'set_hour', hour: 14 });
    expect(w.ops[o.id].hour, 'the job moved to the afternoon after it was planned').toBe(2);
  });
});
