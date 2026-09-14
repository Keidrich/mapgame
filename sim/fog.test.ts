/**
 * Fog over unmapped ground.
 *
 * The behaviour this replaces: tapping empty map space populated a whole chunk on the spot.
 * The rule now is that ground opens when somebody of yours has actually got near it, so these
 * tests are mostly about *what does not* reveal — panning, tapping, and idle crew sitting in a
 * safehouse are all deliberately worth nothing.
 */
import { describe, expect, it } from 'vitest';
import { chunkBounds, chunkKeyAt } from '@geo/chunks';
import { generateWorld, type Id, type World } from './index';
import { REVEAL_M, distanceToChunk, isFogged, nearestFoggedDistance, presenceBlocks, revealable, withinReach } from './fog';

const mk = (seed = 4) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'wheels', seed });

/** A chunk key well outside the mapped city, and one the player is standing in. */
const farKey = (w: World) => chunkKeyAt({ lat: w.origin.lat + 0.25, lng: w.origin.lng + 0.25 });
const hereKey = (w: World) => chunkKeyAt(w.blocks[w.player.currentBlockId].center);

function hire(w: World): { id: Id } {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.role === 'patron')!;
  n.role = 'crew';
  n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
  w.player.crewIds.push(n.id);
  return n;
}

describe('what counts as being there', () => {
  it('the player always does', () => {
    const w = mk();
    expect(presenceBlocks(w)).toContain(w.player.currentBlockId);
  });

  it('idle crew do not — sitting in a safehouse reveals nothing', () => {
    const w = mk();
    const n = hire(w);
    expect(presenceBlocks(w)).not.toContain(w.npcs[n.id].homeBlockId);
  });

  it('a crew member posted to guard a block does', () => {
    const w = mk();
    const n = hire(w);
    const somewhere = Object.values(w.blocks).find(b => b.id !== w.player.currentBlockId)!;
    w.npcs[n.id].crew!.assignment = { kind: 'guard', blockId: somewhere.id };
    w.npcs[n.id].crew!.status = 'assigned';
    expect(presenceBlocks(w)).toContain(somewhere.id);
  });

  it('a jailed or dead crew member does not, wherever they were posted', () => {
    const w = mk();
    const n = hire(w);
    const somewhere = Object.values(w.blocks).find(b => b.id !== w.player.currentBlockId)!;
    w.npcs[n.id].crew!.assignment = { kind: 'guard', blockId: somewhere.id };
    for (const status of ['jailed', 'dead'] as const) {
      w.npcs[n.id].crew!.status = status;
      expect(presenceBlocks(w), status).not.toContain(somewhere.id);
    }
  });
});

describe('distance to unmapped ground', () => {
  it('is zero inside a chunk and grows outside it', () => {
    const w = mk();
    const key = hereKey(w);
    const b = chunkBounds(key);
    expect(distanceToChunk(b.center, key)).toBe(0);
    const outside = { lat: b.north + 0.2, lng: b.center.lng };
    expect(distanceToChunk(outside, key)).toBeGreaterThan(REVEAL_M);
  });
});

describe('what lifts the cloud', () => {
  it('ground far from anybody stays under it', () => {
    const w = mk();
    const key = farKey(w);
    expect(w.chunks[key]).toBeUndefined();
    expect(withinReach(w, key)).toBe(false);
    expect(isFogged(w, key)).toBe(true);
    expect(revealable(w, [key])).toEqual([]);
  });

  it('ground somebody is standing next to is revealable', () => {
    const w = mk();
    // the chunk the player is in is already populated; its own bounds are the reachable case
    const key = hereKey(w);
    expect(withinReach(w, key)).toBe(true);
    expect(isFogged(w, key)).toBe(false);   // already mapped, so not fog either way
  });

  it('a crew member posted out there opens it without the player making the walk', () => {
    const w = mk();
    const key = farKey(w);
    expect(withinReach(w, key)).toBe(false);

    // put a block of the city inside that far chunk, and post somebody on it
    const b = Object.values(w.blocks)[0];
    const moved = { ...b, id: 'b_far', center: chunkBounds(key).center, neighborIds: [] as Id[] };
    w.blocks[moved.id] = moved;
    const n = hire(w);
    w.npcs[n.id].crew!.assignment = { kind: 'guard', blockId: moved.id };
    w.npcs[n.id].crew!.status = 'assigned';

    expect(withinReach(w, key)).toBe(true);
    expect(revealable(w, [key])).toEqual([key]);
  });

  it('never re-offers a chunk that is already populated', () => {
    const w = mk();
    const key = hereKey(w);
    expect(w.chunks[key]).toBeDefined();
    expect(revealable(w, [key])).toEqual([]);
    expect(isFogged(w, key)).toBe(false);
  });

  it('is decided by where people are and by nothing else — no camera, no taps', () => {
    const w = mk();
    const key = farKey(w);
    const before = revealable(w, [key]);
    // everything a player can do that is not travelling
    w.day += 50;
    w.player.cash += 999999;
    w.player.heat = 90;
    expect(revealable(w, [key])).toEqual(before);
    expect(before).toEqual([]);
  });

  it('reports how far the nearest cloud is, for the edge-of-the-map hint', () => {
    const w = mk();
    expect(nearestFoggedDistance(w, [hereKey(w)])).toBeUndefined();   // that one is mapped
    const far = nearestFoggedDistance(w, [farKey(w)]);
    expect(far).toBeGreaterThan(REVEAL_M);
  });
});
