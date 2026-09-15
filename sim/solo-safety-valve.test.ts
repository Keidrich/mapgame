/**
 * The hole in the wall.
 *
 * A bust seizes 80% of dirty cash in one night. An outfit absorbs that — people carry, rackets
 * keep paying, somebody else is holding a float. One person has one pocket, watched all of it go,
 * and had no way to have hedged: solo play took the same hit with none of the shock absorbers.
 *
 * So this is deliberately a *solo* mitigation and not a general one. Capacity falls with every
 * body who could be followed to it and is gone by the fourth, which is the honest version of why
 * a lone operator can hide money and an outfit cannot — and it keeps a bust's stakes intact for
 * everybody the mechanic was not written for.
 */
import { describe, expect, it } from 'vitest';
import { CACHE } from '@content/events';
import { can, dispatch, generateWorld, select, type World } from './index';

function player(crew = 0): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 8 });
  w.pendingEvents = []; w.day = 25; w.player.dirty = 20_000; w.player.cash = 5_000;
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, crew)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  return w;
}
const bustNow = (w: World): World => { w.pendingEvents = []; w.player.heat = 100; return dispatch(w, { type: 'end_day' }); };

describe('the wall is a solo thing, by construction', () => {
  it('a lone operator has the whole of it', () => {
    expect(select.cacheCap(player(0))).toBe(CACHE.base);
  });

  it('and it shrinks with every pair of eyes, to nothing', () => {
    const caps = [0, 1, 2, 3, 4].map(n => select.cacheCap(player(n)));
    expect(caps[0]).toBeGreaterThan(caps[1]);
    expect(caps[1]).toBeGreaterThan(caps[2]);
    expect(caps[4], 'an outfit still has a hole in the wall').toBe(0);
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThanOrEqual(caps[i - 1]);
  });

  it('an outfit is told why, in words, rather than just refused', () => {
    const w = player(4);
    expect(select.cacheReason(w)).toMatch(/one person/i);
    const r = can(w, { type: 'cache', amount: 500 });
    expect(r.ok).toBe(false);
  });

  it('people in a cell do not count — a bust widens it, which is when it matters most', () => {
    const w = player(3);
    const narrow = select.cacheCap(w);
    for (const id of w.player.crewIds) { const n = w.npcs[id]; n.crew!.status = 'jailed'; n.crew!.statusDays = 10; }
    expect(select.cacheCap(w), 'an outfit that is all inside is still an outfit for this').toBeGreaterThan(narrow);
  });
});

describe('putting money away and getting it back', () => {
  it('moves dirty cash out of reach and back again', () => {
    let w = player(0);
    w = dispatch(w, { type: 'cache', amount: 3000 });
    expect(w.player.cache).toBe(3000);
    expect(w.player.dirty).toBe(17_000);
    w = dispatch(w, { type: 'cache', amount: 1000, take: true });
    expect(w.player.cache).toBe(2000);
    expect(w.player.dirty).toBe(18_000);
  });

  it('will not take more than fits, or more than you have', () => {
    const w = player(0);
    expect(can(w, { type: 'cache', amount: CACHE.base + 1 }).ok).toBe(false);
    const broke = player(0); broke.player.dirty = 100;
    expect(can(broke, { type: 'cache', amount: 500 }).ok).toBe(false);
    expect(can(w, { type: 'cache', amount: 900, take: true }).ok, 'took money out of an empty wall').toBe(false);
  });
});

describe('what a bust can and cannot reach', () => {
  it('it usually survives — which is the entire point of it', () => {
    let kept = 0;
    for (let i = 0; i < 40; i++) {
      let w = player(0); w.rng = 900 + i * 6151;
      w = dispatch(w, { type: 'cache', amount: 4000 });
      w = bustNow(w);
      expect(w.player.busts, 'heat 100 did not bust, so this checked nothing').toBeGreaterThan(0);
      if ((w.player.cache ?? 0) > 0) kept++;
    }
    expect(kept / 40, 'the wall almost never survives, so it is not a hedge').toBeGreaterThan(0.5);
  });

  it('but they do find it sometimes: this is a hedge, not immunity', () => {
    let lost = 0;
    for (let i = 0; i < 60; i++) {
      let w = player(0); w.rng = 4000 + i * 7919;
      w = dispatch(w, { type: 'cache', amount: 4000 });
      w = bustNow(w);
      if ((w.player.cache ?? 0) === 0) lost++;
    }
    expect(lost, 'the wall is never found, which removes the stakes').toBeGreaterThan(0);
  });

  it('and the money on you still goes, so a bust still hurts', () => {
    let w = player(0);
    w = dispatch(w, { type: 'cache', amount: 4000 });
    const onHand = w.player.dirty;
    w = bustNow(w);
    expect(w.player.dirty, 'the cash in your pocket survived a bust').toBeLessThan(onHand * 0.5);
  });

  it('sized so it matters and does not undo the mechanic', () => {
    // A full wall has to be worth having and worth less than a bust costs, or it is either
    // pointless or a get-out-of-jail card.
    const w = player(0); w.player.dirty = 20_000;
    const seized = Math.round(w.player.dirty * 0.8);
    expect(CACHE.base).toBeGreaterThan(2000);
    expect(CACHE.base).toBeLessThan(seized);
  });
});
