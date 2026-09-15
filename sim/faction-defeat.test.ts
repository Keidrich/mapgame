/**
 * The moment you actually win, and what happens to what they were holding.
 *
 * A faction crushed to zero soldiers and zero blocks used to simply sit there — still nominally
 * at war, still listed, still "alive", with its old protection arrangements still nominally in
 * force and nothing anywhere marking that the player had beaten it. The only death in the game
 * was bleeding out (`soldiers <= 0 && cash < 0`), so an outfit broken in the street while its
 * bank balance was healthy became a permanent husk you could neither fight nor finish.
 *
 * Defeat is the street condition *plus* the one thing that can undo it: nobody to send, nothing
 * to send them to, and not enough left to put anybody back out there. That last clause came out
 * of writing these tests — the first version asserted that a healthy bank balance should not keep
 * an outfit alive, and the sim disagreed, correctly: the faction tick hires a soldier whenever it
 * can afford one, so an outfit with money and nobody is between hires, not beaten.
 *
 * Which named the real gap. The old death needed `cash < 0`; rebuilding needs `cash > 6000`. An
 * outfit sitting between those two with nobody on the street could neither die nor recover, and
 * stood there at war for ever. That is the husk this closes.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, type Faction, type World } from './index';
import { mkRacket } from './reducer';
import { runFaction } from './factions';
import { Rng } from './rng';

function world(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 6 });
  w.pendingEvents = []; w.day = 45;
  return w;
}
/** Broken in the street: nobody to send, nothing held, and not enough left to hire anybody. */
function broken(w: World): Faction {
  const f = Object.values(w.factions)[0];
  f.soldiers = 0; f.cash = 900; f.lieutenantIds = []; f.alive = true;
  f.stance[PLAYER] = 'war'; f.standing[PLAYER] = -100;
  for (const b of Object.values(w.blocks)) delete b.influence[f.id];
  return f;
}
const tick = (w: World, f: Faction) => runFaction(w, f, new Rng(1));

describe('a faction with nobody and nothing is finished', () => {
  it('and is marked as finished, once, on the day it happens', () => {
    const w = world(); const f = broken(w);
    tick(w, f);
    expect(f.defeatedDay).toBe(w.day);
    expect(f.alive).toBe(false);
  });

  it('money above zero no longer keeps a husk alive — that was the whole gap', () => {
    const w = world(); const f = broken(w);
    expect(f.cash).toBeGreaterThan(0);   // the old death condition needed this to be negative
    tick(w, f);
    expect(f.defeatedDay, 'still a husk because the books were not in the red').toBeTruthy();
  });

  it('but somebody who can still afford to put a man out there is not finished', () => {
    const w = world(); const f = broken(w);
    f.cash = 40_000;
    tick(w, f);
    expect(f.defeatedDay, 'declared finished while they could still buy their way back').toBeUndefined();
  });

  it('but somebody with people still in the field is not', () => {
    const w = world(); const f = broken(w);
    f.soldiers = 4;
    tick(w, f);
    expect(f.defeatedDay).toBeUndefined();
  });

  it('nor is somebody who still holds a corner', () => {
    const w = world(); const f = broken(w);
    const b = Object.values(w.blocks)[0];
    b.influence = { [f.id]: 80 };
    tick(w, f);
    expect(f.defeatedDay).toBeUndefined();
  });

  it('nor is somebody whose lieutenants are still walking around', () => {
    const w = world(); const f = broken(w);
    const lt = Object.values(w.npcs).find(n => n.alive)!;
    f.lieutenantIds = [lt.id];
    tick(w, f);
    expect(f.defeatedDay, 'finished while their lieutenant is still out there').toBeUndefined();
  });
});

describe('it resolves exactly once', () => {
  it('ticking them again changes nothing and says nothing', () => {
    const w = world(); const f = broken(w);
    tick(w, f);
    const day = f.defeatedDay, lines = w.log.length;
    w.day += 5;
    tick(w, f); tick(w, f);
    expect(f.defeatedDay, 'defeated a second time on a later day').toBe(day);
    expect(w.log.length, 'the same victory was announced twice').toBe(lines);
  });

  it('and it is announced in a way the player will see', () => {
    const w = world(); const f = broken(w);
    const before = w.log.length;
    tick(w, f);
    const said = w.log.slice(before).map(l => l.text).join(' ');
    expect(said).toContain(f.name);
    expect(said).toMatch(/finished/i);
  });
});

describe('what they were holding goes somewhere real', () => {
  it('places on your ground come to you; the rest simply open up', () => {
    const w = world(); const f = broken(w);
    const all = Object.values(w.businesses);
    const mine = all[0];
    // a different block, or the second `influence` assignment below overwrites the first
    const theirs = all.find(b => b.blockId !== mine.blockId)!;
    // one on a block you run, one out in the city. Residual influence only: an outfit that
    // still *controls* a block is not finished, so what is being inherited here is the trace
    // they leave on ground somebody else already took off them.
    const rival = Object.values(w.factions)[1].id;
    w.blocks[mine.blockId].influence = { [PLAYER]: 90, [f.id]: 5 };
    w.blocks[theirs.blockId].influence = { [rival]: 70, [f.id]: 5 };
    mine.protection = { factionId: f.id, rate: 0.2, since: 1 };
    theirs.protection = { factionId: f.id, rate: 0.2, since: 1 };
    tick(w, f);
    expect(mine.protection, 'they are still collecting from a place on your ground').toBeUndefined();
    expect(theirs.protection).toBeUndefined();
    expect(w.blocks[mine.blockId].influence[PLAYER]).toBeGreaterThan(90);
  });

  it('nothing anywhere still points at them afterwards', () => {
    const w = world(); const f = broken(w);
    const b = Object.values(w.blocks)[0];
    b.influence = { [PLAYER]: 60, [f.id]: 20 };
    const biz = Object.values(w.businesses)[0];
    biz.protection = { factionId: f.id, rate: 0.2, since: 1 };
    tick(w, f);
    expect(Object.values(w.blocks).some(x => x.influence[f.id] !== undefined)).toBe(false);
    expect(Object.values(w.businesses).some(x => x.protection?.factionId === f.id)).toBe(false);
  });

  it('their hold on ground you were already contesting comes to you', () => {
    const w = world(); const f = broken(w);
    const b = Object.values(w.blocks)[0];
    b.influence = { [PLAYER]: 55, [f.id]: 20 };
    tick(w, f);
    expect(b.influence[PLAYER], 'you gained nothing where you were already pushing').toBeGreaterThan(55);
  });

  it('and they are not still nominally at war with anybody', () => {
    const w = world(); const f = broken(w);
    tick(w, f);
    expect(f.stance[PLAYER]).toBe('peace');
    expect(f.crisis).toBeUndefined();
  });
});

describe('when it was you', () => {
  it('breaking somebody is worth something on the street', () => {
    const w = world(); const f = broken(w);
    const respect = w.player.respect, fear = w.player.fear;
    tick(w, f);
    expect(f.defeatedBy).toBe(PLAYER);
    expect(w.player.respect).toBeGreaterThan(respect);
    expect(w.player.fear).toBeGreaterThan(fear);
  });

  it('and somebody who simply fell apart is not credited to you', () => {
    const w = world(); const f = broken(w);
    f.stance[PLAYER] = 'peace'; f.standing[PLAYER] = 20;
    const respect = w.player.respect;
    tick(w, f);
    expect(f.defeatedBy).not.toBe(PLAYER);
    expect(w.player.respect).toBe(respect);
  });
});

describe('through the real tick, not just the faction function', () => {
  it('end_day finishes them and hands their ground on', () => {
    let w = world(); const f = broken(w);
    const biz = Object.values(w.businesses)[0];
    biz.protection = { factionId: f.id, rate: 0.2, since: 1 };
    mkRacket(w, 'protection', biz);
    w = dispatch(w, { type: 'end_day' });
    expect(w.factions[f.id].defeatedDay).toBeTruthy();
    expect(w.businesses[biz.id].protection).toBeUndefined();
  });
});
