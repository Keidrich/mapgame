/**
 * Word travels along people, not across a map.
 *
 * The old `spreadRep` painted every face within a geographic radius, so a reputation made in one
 * part of the city quietly worked in another the player had never touched. The rule under test:
 * strength falls off with degrees of separation from whoever was actually there, and somebody
 * with no path back to the scene hears nothing at all.
 */
import { describe, expect, it } from 'vitest';
import { REPUTATION } from '@content/standing';
import { generateWorld, select } from './index';
import { propagation, witnessesAt } from './standing';
import { connect, connectionsOf } from './connections';
import { spreadFrom, spreadRep } from './util';
import type { Npc, World } from './types';

const mk = (seed = 11) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });

/** A chain a → b → c → d, with nobody else attached, so degrees are unambiguous. */
function chain(w: World): { a: Npc; b: Npc; c: Npc; d: Npc; outsider: Npc } {
  const pool = Object.values(w.npcs).filter(n => n.alive && !n.crew).slice(0, 5);
  const [a, b, c, d, outsider] = pool;
  for (const n of pool) n.connections = [];
  connect(a, b, 'friend', 'old friend');
  connect(b, c, 'friend', 'old friend');
  connect(c, d, 'friend', 'old friend');
  for (const n of pool) n.rel = { trust: 0, fear: 0, respect: 0 };
  return { a, b, c, d, outsider };
}

describe('reputation walks the connection graph', () => {
  it('falls off with each degree of separation and stops dead after two', () => {
    const w = mk(); const { a, b, c, d, outsider } = chain(w);
    const got = new Map(propagation(w, [a]).map(x => [x.npc.id, x.weight]));
    expect(got.get(a.id)).toBe(REPUTATION.degrees[0]);
    expect(got.get(b.id)).toBe(REPUTATION.degrees[1]);
    expect(got.get(c.id)).toBe(REPUTATION.degrees[2]);
    expect(got.has(d.id)).toBe(false);        // three degrees out: never heard of you
    expect(got.has(outsider.id)).toBe(false); // no path at all
    expect(REPUTATION.degrees[0]).toBeGreaterThan(REPUTATION.degrees[1]);
    expect(REPUTATION.degrees[1]).toBeGreaterThan(REPUTATION.degrees[2]);
  });

  it('the applied effect is scaled by that weight, in the same order', () => {
    const w = mk(); const { a, b, c, d } = chain(w);
    spreadFrom(w, [a], { respect: 20 }, 2);
    expect(a.rel.respect).toBeGreaterThan(b.rel.respect);
    expect(b.rel.respect).toBeGreaterThan(c.rel.respect);
    expect(c.rel.respect).toBeGreaterThan(0);
    expect(d.rel.respect).toBe(0);
  });

  it('how far word carries is per-event: a killing reaches further than a raised voice', () => {
    const w = mk(); const { a, c } = chain(w);
    spreadFrom(w, [a], { respect: 20 }, 1);
    expect(c.rel.respect).toBe(0);
    spreadFrom(w, [a], { respect: 20 }, 2);
    expect(c.rel.respect).toBeGreaterThan(0);
  });

  it('somebody across town with no connection into the scene never hears about it', () => {
    const w = mk();
    const start = select.startBlock(w);
    const far = Object.values(w.blocks)
      .filter(b => select.distanceFromStart(w, b.id) >= 3 && b.businessIds.length)
      .sort((x, y) => select.distanceFromStart(w, y.id) - select.distanceFromStart(w, x.id))[0];
    expect(far).toBeDefined();
    const here = new Set(witnessesAt(w, start.id).map(n => n.id));
    // somebody over there with no path back to anyone who was at the scene
    const reached = new Set(propagation(w, witnessesAt(w, start.id)).map(x => x.npc.id));
    const strangers = witnessesAt(w, far.id).filter(n => !here.has(n.id) && !reached.has(n.id));
    expect(strangers.length).toBeGreaterThan(0);
    const before = strangers.map(n => n.rel.fear);
    spreadRep(w, start.id, { fear: 30 }, 2, 'violence');
    expect(strangers.map(n => n.rel.fear)).toEqual(before);
  });

  it('the people who were there are the seed, and they take the full weight', () => {
    const w = mk();
    const start = select.startBlock(w);
    const wit = witnessesAt(w, start.id);
    expect(wit.length).toBeGreaterThan(0);
    for (const n of wit) n.rel.fear = 0;
    spreadRep(w, start.id, { fear: 10 }, 0, 'violence');
    for (const n of wit) expect(n.rel.fear).toBeGreaterThan(0);
  });

  it('hearing about you is not the same as meeting you: second-hand word never makes you familiar', () => {
    const w = mk(); const { a, b } = chain(w);
    spreadFrom(w, [a], { respect: 20 }, 2);
    expect(a.rel.metDay).toBeUndefined();
    expect(b.rel.metDay).toBeUndefined();
    expect(b.rel.contacts ?? 0).toBe(0);
  });

  it('nobody is the hub of the whole city: word reaches their closest people, not all of them', () => {
    const w = mk();
    const hub = Object.values(w.npcs).find(n => n.alive && connectionsOf(w, n).length > REPUTATION.fanout);
    if (!hub) return;   // a sparse seed; the cap is still enforced by propagation
    const reached = propagation(w, [hub], 1).filter(x => x.weight === REPUTATION.degrees[1]);
    expect(reached.length).toBeLessThanOrEqual(REPUTATION.fanout);
  });
});
