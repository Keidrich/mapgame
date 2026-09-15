/**
 * A life, bought.
 *
 * The claim that has to hold is that these are not decoration: every rung is permanent respect or
 * fear, those two numbers are what the whole standing layer reads, and the city can see it — a
 * shopkeeper opens a conversation differently with a man who has a house on the hill.
 */
import { describe, expect, it } from 'vitest';
import { LIFESTYLE, SECURITY_GUARD } from '@content/fortune';
import { can, dispatch, generateWorld, select, type World } from './index';
import { lifestyleAt, securityCover, standingShow } from './fortune';
import { sceneFor } from './scenes';

function rich(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 31 });
  w.pendingEvents = []; w.day = 50; w.player.cash = 5_000_000;
  return w;
}
const buy = (w: World, k: 'home' | 'car' | 'security', n = 1) => {
  let cur = w;
  for (let i = 0; i < n; i++) cur = dispatch(cur, { type: 'buy_lifestyle', kind: k });
  return cur;
};

describe('every rung is a real, permanent change to how the city reads you', () => {
  it('a home is respect; a detail is fear', () => {
    const w = rich();
    const home = buy(w, 'home');
    expect(home.player.respect).toBeGreaterThan(w.player.respect);
    const guards = buy(rich(), 'security');
    expect(guards.player.fear).toBeGreaterThan(w.player.fear);
    // …and each ladder leans the way it is supposed to
    expect(LIFESTYLE.home[0].respect).toBeGreaterThan(LIFESTYLE.home[0].fear);
    expect(LIFESTYLE.security[0].fear).toBeGreaterThan(LIFESTYLE.security[0].respect);
  });

  it('it sticks: nothing decays it back', () => {
    let w = buy(rich(), 'home', 2);
    const respect = w.player.respect;
    for (let i = 0; i < 10; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    expect(lifestyleAt(w, 'home')).toBe(2);
    // respect drifts for other reasons; what must not happen is the purchase being undone
    expect(w.player.respect).toBeGreaterThan(respect * 0.6);
  });

  it('the ladders climb, and stop at the top', () => {
    let w = rich();
    for (const k of ['home', 'car', 'security'] as const) {
      w = buy(w, k, LIFESTYLE[k].length);
      expect(lifestyleAt(w, k)).toBe(LIFESTYLE[k].length);
      expect(can(w, { type: 'buy_lifestyle', kind: k }).ok, `${k} kept selling past the top`).toBe(false);
    }
  });

  it('each rung costs more than the one below it', () => {
    for (const k of ['home', 'car', 'security'] as const) {
      for (let i = 1; i < LIFESTYLE[k].length; i++) expect(LIFESTYLE[k][i].cost, `${k} ${i}`).toBeGreaterThan(LIFESTYLE[k][i - 1].cost);
    }
  });

  it('and money you do not have buys nothing', () => {
    const w = rich(); w.player.cash = 100;
    expect(can(w, { type: 'buy_lifestyle', kind: 'home' }).ok).toBe(false);
  });
});

describe('the city can see it', () => {
  it('somebody opens a conversation differently once you are visibly somebody', () => {
    const plain = rich();
    const target = Object.values(plain.npcs).find(n => n.alive && n.role === 'owner')!;
    plain.player.currentBlockId = target.homeBlockId;
    const before = sceneFor(plain, 'visit', target.id).line;

    let w = rich();
    w = buy(w, 'car', 2); w = buy(w, 'home', 2);
    const n = w.npcs[target.id]; w.player.currentBlockId = n.homeBlockId;
    const after = sceneFor(w, 'visit', n.id).line;
    expect(after, 'the life is invisible in a conversation').not.toBe(before);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('and it is the whole life on show, not one purchase', () => {
    // spread across three ladders reads the same as concentrated in one: `standingShow` counts
    // rungs, so a player who bought breadth is as visible as one who bought depth
    let spread = rich(); spread = buy(spread, 'home'); spread = buy(spread, 'car'); spread = buy(spread, 'security');
    let deep = rich(); deep = buy(deep, 'home', 3);
    expect(standingShow(spread)).toBeCloseTo(standingShow(deep), 5);
  });

  it('nothing is on show before you have bought anything', () => {
    const w = rich();
    expect(standingShow(w)).toBe(0);
    const n = Object.values(w.npcs).find(x => x.alive && x.role === 'owner')!;
    w.player.currentBlockId = n.homeBlockId;
    expect(sceneFor(w, 'visit', n.id).line).not.toMatch(/coat, the watch|men by the door|That yours out front/);
  });
});

describe('security is worth something on the night, not only on the sheet', () => {
  it('men who are paid to be awake are worth real cover', () => {
    const w = rich();
    expect(securityCover(w)).toBe(0);
    const one = buy(w, 'security');
    expect(securityCover(one)).toBe(SECURITY_GUARD);
    const all = buy(rich(), 'security', 3);
    expect(securityCover(all)).toBe(SECURITY_GUARD * 3);
  });

  it('and it feeds the number that decides whether somebody gets to you', () => {
    const bare = rich();
    const guarded = buy(rich(), 'security', 3);
    expect(select.personalCover(guarded)).toBeGreaterThan(select.personalCover(bare));
  });
});
