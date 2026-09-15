/**
 * Something to actually do when the heat ladder fires.
 *
 * The heat-60 warning has told the player to "lay low" since the game had a heat meter, and there
 * has never been such a thing. The only answers to a rising ladder were paying somebody — which
 * wants an official who takes your calls and money you may not have — or scrubbing, which only
 * touches the wire. Everything else was waiting and hoping.
 *
 * The cost is deliberately **turns, not a multiplier**: you are not there, so you do nothing.
 * That is what stops it being a button you press whenever the number goes up.
 */
import { describe, expect, it } from 'vitest';
import { LAY_LOW } from '@content/events';
import { can, dispatch, generateWorld, select, type World } from './index';

function hot(heat = 85): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 4 });
  w.pendingEvents = []; w.player.heat = heat; w.player.cash = 20_000; w.day = 20;
  return w;
}
const sleep = (w: World) => { w.pendingEvents = []; return dispatch(w, { type: 'end_day' }); };

describe('going to ground costs days and money, and takes real heat off', () => {
  it('a week under puts a serious distance between you and the task force', () => {
    let w = hot(90);
    const before = w.player.heat;
    w = dispatch(w, { type: 'lay_low', days: 7 });
    for (let i = 0; i < 7; i++) w = sleep(w);
    // the ordinary decay would have moved it too; what matters is that this moved it far more
    let plain = hot(90);
    for (let i = 0; i < 7; i++) plain = sleep(plain);
    expect(w.player.heat, 'laying low did nothing the calendar would not have done').toBeLessThan(plain.player.heat - 20);
    expect(before - w.player.heat).toBeGreaterThan(40);
  });

  it('and it is paid for in your own turns: no AP and no legwork while you are gone', () => {
    let w = hot();
    w = dispatch(w, { type: 'lay_low', days: 3 });
    for (let i = 0; i < 3; i++) {
      w = sleep(w);
      if (select.layingLow(w)) {
        expect(w.player.ap, 'a day under still handed the player a full day').toBe(0);
        expect(w.player.legwork).toBe(0);
      }
    }
    expect(select.layingLow(w), 'still under after the days ran out').toBe(false);
    expect(w.player.ap, 'the day you surface is not a real day').toBe(w.player.apMax);
  });

  it('and in cash, and in what the street thinks of somebody who is nowhere', () => {
    let w = hot();
    const cash = w.player.cash, respect = w.player.respect;
    w = dispatch(w, { type: 'lay_low', days: 4 });
    expect(cash - w.player.cash).toBe(4 * LAY_LOW.costPerDay);
    for (let i = 0; i < 4; i++) w = sleep(w);
    expect(w.player.respect, 'being nowhere was free').toBeLessThan(respect);
  });
});

describe('what it refuses', () => {
  it('nobody is looking for you', () => {
    const w = hot(5);
    const r = can(w, { type: 'lay_low', days: 3 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Nobody is looking/);
  });

  it('a length nobody would call laying low', () => {
    const w = hot();
    expect(can(w, { type: 'lay_low', days: 1 }).ok).toBe(false);
    expect(can(w, { type: 'lay_low', days: LAY_LOW.maxDays + 1 }).ok).toBe(false);
    expect(can(w, { type: 'lay_low', days: LAY_LOW.minDays }).ok).toBe(true);
  });

  it('money you do not have', () => {
    const w = hot(); w.player.cash = 10;
    expect(can(w, { type: 'lay_low', days: 7 }).ok).toBe(false);
  });

  it('and doing it twice over', () => {
    let w = hot();
    w = dispatch(w, { type: 'lay_low', days: 5 });
    expect(can(w, { type: 'lay_low', days: 5 }).ok, 'you can go to ground while you are already there').toBe(false);
  });
});

describe('it is its own thing, not a second bribe', () => {
  it('it needs nobody: no official, no relationship, no wire', () => {
    // The whole point. A bribe wants a captain who takes your calls; this wants a week.
    const w = hot();
    for (const o of select.officials(w)) o.rel.trust = -100;
    expect(can(w, { type: 'lay_low', days: 3 }).ok).toBe(true);
  });

  it('the world keeps turning while you are under — this is absence, not a pause', () => {
    let w = hot();
    const day = w.day;
    w = dispatch(w, { type: 'lay_low', days: 3 });
    for (let i = 0; i < 3; i++) w = sleep(w);
    expect(w.day, 'the days did not actually pass').toBe(day + 3);
  });
});
