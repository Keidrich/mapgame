/**
 * The map having its own momentum.
 *
 * Faction-vs-faction standing drifted at random and never *concluded*: a stance flipped now and
 * then, two outfits at war traded a block edge for ever, and nothing on the map ever resolved
 * unless the player pushed on it. Three things fixed that, all written with the stance/standing
 * machinery that was already there — a grievance that starts a war for a reason, a sit-down that
 * ends one, and an absorption that consolidates the map.
 *
 * Every test here runs the tick with **no player action at all**, which is the whole claim.
 */
import { describe, expect, it } from 'vitest';
import { runFaction } from './factions';
import { PLAYER, dispatch, generateWorld, type Faction, type World } from './index';
import { Rng } from './rng';

function city(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 111 });
  w.pendingEvents = []; w.day = 40;
  return w;
}
/** Many days of the world running itself, and nothing else. */
function quietYears(w: World, days = 220): World {
  let cur = w;
  for (let i = 0; i < days && !cur.gameOver; i++) { cur.pendingEvents = []; cur = dispatch(cur, { type: 'end_day' }); }
  return cur;
}
const pair = (w: World): [Faction, Faction] => {
  const [a, b] = Object.values(w.factions).filter(f => f.alive);
  return [a, b];
};

describe('outfits fall out and make up without the player', () => {
  it('a stance between two of them changes over a long game', () => {
    const w = city();
    const [a, b] = pair(w);
    const before = a.stance[b.id];
    const after = quietYears(w);
    const moved = Object.values(after.factions).some(f =>
      Object.entries(f.stance).some(([k, v]) => k !== PLAYER && k !== f.id && v !== undefined && (f.id === a.id && k === b.id ? v !== before : true)));
    expect(moved).toBe(true);
    // and the player did nothing: no rackets, no blocks, no crew
    expect(after.player.racketIds.length).toBe(0);
    expect(after.player.crewIds.length).toBe(0);
  });

  it('a sit-down is a thing that happens, and it leaves a truce behind it', () => {
    const w = city();
    const [a, b] = pair(w);
    a.standing[b.id] = b.standing[a.id] = -80;
    a.stance[b.id] = b.stance[a.id] = 'war';
    a.temperament = 'diplomatic';
    let held = false;
    for (let i = 0; i < 400 && !held; i++) {
      runFaction(w, a, new Rng(i + 1));
      if ((a.truceUntil[b.id] ?? 0) > w.day) held = true;
      w.day++;
    }
    expect(held, 'four hundred days at war and nobody ever sat down').toBe(true);
  });

  it('and a grievance starts one, rather than standing simply drifting there', () => {
    const w = city();
    const [a, b] = pair(w);
    a.soldiers = 30; b.soldiers = 4;          // a clear stronger side, which is who starts things
    a.standing[b.id] = b.standing[a.id] = 20;
    let dropped = false;
    for (let i = 0; i < 400 && !dropped; i++) {
      const before = a.standing[b.id];
      runFaction(w, a, new Rng(i + 7));
      if (a.standing[b.id] < before - 20) dropped = true;   // a drift never moves this far in a day
      w.day++;
    }
    expect(dropped, 'standing only ever wandered; nobody ever took offence at anything').toBe(true);
  });
});

describe('and a war one side is losing ends in the map consolidating', () => {
  it('the weaker outfit is swallowed, ground, people and all', () => {
    const w = city();
    const [a, b] = pair(w);
    a.soldiers = 30; b.soldiers = 1;
    a.standing[b.id] = b.standing[a.id] = -100;
    a.stance[b.id] = b.stance[a.id] = 'war';
    const block = Object.values(w.blocks)[0];
    block.influence = { [b.id]: 70 };
    const biz = Object.values(w.businesses)[0];
    biz.protection = { factionId: b.id, rate: 0.2, since: 1 };
    const theirLt = b.lieutenantIds[0];

    let gone = false;
    for (let i = 0; i < 300 && !gone; i++) { runFaction(w, a, new Rng(i + 3)); if (!b.alive) gone = true; w.day++; }
    expect(gone, 'a war against one man never ended').toBe(true);

    expect(w.businesses[biz.id].protection?.factionId, 'their earner is still theirs').toBe(a.id);
    expect(block.influence[b.id], 'their corner still has their name on it').toBeUndefined();
    if (theirLt) expect(w.npcs[theirLt].faction, 'their people did not change hands').toBe(a.id);
    expect(a.soldiers).toBeGreaterThan(30);
    expect(b.defeatedBy).toBe(a.id);
  });

  it('nothing anywhere still points at the one that is gone', () => {
    const w = city();
    const [a, b] = pair(w);
    a.soldiers = 30; b.soldiers = 1;
    a.standing[b.id] = b.standing[a.id] = -100;
    a.stance[b.id] = b.stance[a.id] = 'war';
    for (let i = 0; i < 300 && b.alive; i++) { runFaction(w, a, new Rng(i + 5)); w.day++; }
    expect(b.alive).toBe(false);
    expect(Object.values(w.blocks).some(x => x.influence[b.id] !== undefined)).toBe(false);
    expect(Object.values(w.businesses).some(x => x.protection?.factionId === b.id)).toBe(false);
  });

  it('but a fair fight is not an absorption', () => {
    const w = city();
    const [a, b] = pair(w);
    a.soldiers = 12; b.soldiers = 11;
    a.standing[b.id] = b.standing[a.id] = -100;
    a.stance[b.id] = b.stance[a.id] = 'war';
    for (let i = 0; i < 60; i++) { runFaction(w, a, new Rng(i + 9)); w.day++; }
    expect(b.alive, 'an even war swallowed somebody').toBe(true);
  });
});

describe('the city is different after a long game nobody played', () => {
  it('something real happened while the player was doing nothing', () => {
    const before = city();
    const snapshot = Object.values(before.factions).map(f => `${f.id}:${f.soldiers}`).join('|');
    const after = quietYears(before, 200);
    const now = Object.values(after.factions).map(f => `${f.id}:${f.soldiers}`).join('|');
    expect(now, 'two hundred days and not one outfit changed size').not.toBe(snapshot);
  });
});
