/**
 * The other way out, and the only one you choose.
 *
 * Every condition has to hold **at once** and keep holding for a fortnight. That is the whole
 * distinction between this ending and a stat crossing a line: meeting all of it for one morning
 * is a good day's laundering, and meeting it for two weeks is a decision. So most of this file is
 * about the counter resetting.
 */
import { describe, expect, it } from 'vitest';
import { GO_STRAIGHT, goStraightReason, tickGoStraight } from './legacy';
import { dispatch, generateWorld, type World } from './index';

/** Everything in order: the state a player has to actually reach. */
function clean(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 99 });
  w.pendingEvents = []; w.day = 140;
  w.player.cash = GO_STRAIGHT.cash + 50_000;
  w.player.dirty = 0;
  w.player.heat = 2;
  w.player.legitimacy = GO_STRAIGHT.legitimacy + 5;
  return w;
}
const hold = (w: World, days: number) => { for (let i = 0; i < days; i++) tickGoStraight(w); return w; };

describe('it does not fire early', () => {
  it('not on day one of being clean', () => {
    const w = clean();
    tickGoStraight(w);
    expect(w.gameOver).toBeUndefined();
    expect(w.player.cleanSince).toBe(1);
  });

  it('not one day short of the fortnight', () => {
    const w = hold(clean(), GO_STRAIGHT.days - 1);
    expect(w.player.cleanSince).toBe(GO_STRAIGHT.days - 1);
    expect(w.gameOver, 'went straight a day early').toBeUndefined();
  });

  it('and on the day itself, it does', () => {
    const w = hold(clean(), GO_STRAIGHT.days);
    expect(w.gameOver?.reason).toBe('straight');
    expect(w.gameOver!.text.length).toBeGreaterThan(80);
  });
});

describe('every condition is load-bearing on its own', () => {
  const cases: [string, (w: World) => void, RegExp][] = [
    ['not enough clean money', w => { w.player.cash = GO_STRAIGHT.cash - 1; }, /clean/i],
    ['still holding dirty money', w => { w.player.dirty = GO_STRAIGHT.maxDirty + 1; }, /cannot explain/i],
    ['somebody still looking', w => { w.player.heat = GO_STRAIGHT.maxHeat + 1; }, /looking at you/i],
    ['does not look respectable', w => { w.player.legitimacy = GO_STRAIGHT.legitimacy - 1; }, /respectable/i],
    ['nobody to go straight for', w => { w.player.lovedId = undefined; }, /nobody to go straight for/i],
  ];
  for (const [label, break_, why] of cases) {
    it(label, () => {
      const w = clean();
      expect(goStraightReason(w), 'the clean state was not actually clean').toBeUndefined();
      break_(w);
      expect(goStraightReason(w)).toMatch(why);
      hold(w, GO_STRAIGHT.days * 2);
      expect(w.gameOver, `got out while ${label}`).toBeUndefined();
    });
  }
});

describe('the counter is a streak, not a total', () => {
  it('one bad day puts you back to nothing', () => {
    const w = clean();
    hold(w, GO_STRAIGHT.days - 2);
    expect(w.player.cleanSince).toBe(GO_STRAIGHT.days - 2);
    w.player.heat = 90;                       // one loud night
    tickGoStraight(w);
    expect(w.player.cleanSince, 'a bad night only paused it').toBe(0);
    w.player.heat = 1;
    hold(w, GO_STRAIGHT.days - 1);
    expect(w.gameOver, 'the streak carried over the bad night').toBeUndefined();
  });

  it('and it says something halfway, so it is visible before it lands', () => {
    const w = clean();
    const before = w.log.length;
    hold(w, Math.floor(GO_STRAIGHT.days / 2));
    expect(w.log.length, 'nothing at all was said on the way').toBeGreaterThan(before);
  });
});

describe('through the real tick, and nothing else touches it', () => {
  it('a played game ends this way on its own', () => {
    let w = clean();
    for (let i = 0; i < GO_STRAIGHT.days + 4 && !w.gameOver; i++) {
      w.pendingEvents = [];
      // keep the conditions true the way a player who had actually got there would
      w.player.cash = GO_STRAIGHT.cash + 50_000; w.player.dirty = 0; w.player.heat = 1;
      w.player.legitimacy = GO_STRAIGHT.legitimacy + 5;
      w = dispatch(w, { type: 'end_day' });
    }
    expect(w.gameOver?.reason).toBe('straight');
  });

  it('an ordinary player nowhere near it is never accidentally retired', () => {
    let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 3 });
    for (let i = 0; i < 40; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    expect(w.gameOver?.reason).not.toBe('straight');
    expect(w.player.cleanSince ?? 0).toBe(0);
  });
});
