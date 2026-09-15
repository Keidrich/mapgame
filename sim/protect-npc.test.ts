/**
 * Somebody outside all of it.
 *
 * The point of them is that they make "what would this cost me" answerable with something other
 * than territory and cash flow. What makes them a *real* target rather than an NPC with a label
 * is `isLoved`: it is the only thing in the game that answers true, and the only thing a rival's
 * kidnap path reads. Crew know what they signed up for; a rival leaning on your bookkeeper is
 * Tuesday.
 */
import { describe, expect, it } from 'vitest';
import { isLoved, lovedOne, lovedStatus } from './legacy';
import { queueConfrontation, resolveConfrontation } from './combat';
import { PLAYER, dispatch, generateWorld, select, type World } from './index';
import { connectionsOf } from './connections';
import { Rng } from './rng';

const mk = (seed = 88) => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = [];
  return w;
};

describe('they exist, and they are an ordinary person', () => {
  it('every new game has one, and the player knows them', () => {
    const w = mk();
    const n = lovedOne(w);
    expect(n, 'nobody to protect').toBeTruthy();
    expect(n!.known).toBe(true);
    expect(n!.rel.trust).toBeGreaterThan(70);
  });

  it('they are nothing to do with the business', () => {
    const w = mk();
    const n = lovedOne(w)!;
    expect(n.crew).toBeUndefined();
    expect(n.faction).toBeUndefined();
    expect(n.official).toBeUndefined();
    expect(w.player.crewIds).not.toContain(n.id);
  });

  it('and they belong to the ordinary world: they have neighbours', () => {
    // Somebody with no ties at all is an anomaly in this city, and the connections pass had
    // already run by the time they were created.
    const w = mk();
    expect(connectionsOf(w, lovedOne(w)!).length).toBeGreaterThan(0);
  });

  it('several seeds, so this is not one lucky world', () => {
    for (const seed of [2, 9, 14, 23, 40]) {
      const w = mk(seed);
      expect(lovedOne(w), `seed ${seed}`).toBeTruthy();
    }
  });
});

describe('and they are the only person who can be used against you', () => {
  it('`isLoved` is true for them and false for everybody else', () => {
    const w = mk();
    const n = lovedOne(w)!;
    expect(isLoved(w, n)).toBe(true);
    for (const other of Object.values(w.npcs).filter(x => x.id !== n.id).slice(0, 30)) {
      expect(isLoved(w, other), other.name).toBe(false);
    }
  });

  it('including your own crew, who knew what they were signing up for', () => {
    const w = mk();
    const crewman = Object.values(w.npcs).find(x => x.alive && x.role === 'patron' && x.id !== w.player.lovedId)!;
    crewman.role = 'crew'; crewman.crew = { loyalty: 80, cut: 90, status: 'idle', statusDays: 0, joinedDay: 4 };
    w.player.crewIds.push(crewman.id);
    expect(isLoved(w, crewman)).toBe(false);
  });
});

describe('taking them is a real thing that happens to them', () => {
  it('they are marked as taken, and the game says so', () => {
    const w = mk();
    const n = lovedOne(w)!;
    const f = Object.values(w.factions)[0];
    const c = queueConfrontation(w, { factionId: f.id, kind: 'loved', war: true, npcId: n.id, blockId: n.homeBlockId, text: 'Two men outside their door.' });
    resolveConfrontation(w, c, 'absent', new Rng(1));
    expect(w.npcs[n.id].taken).toBe(w.day);
    expect(lovedStatus(w)).toMatch(/Somebody has them/);
  });

  it('answering it can stop it', () => {
    const w = mk();
    const n = lovedOne(w)!;
    w.player.skills.muscle = 10;
    for (const x of Object.values(w.npcs).filter(y => y.alive && y.role === 'patron').slice(0, 4)) {
      x.role = 'crew'; x.crew = { loyalty: 80, cut: 90, status: 'idle', statusDays: 0, joinedDay: 4 };
      w.player.crewIds.push(x.id);
    }
    const f = Object.values(w.factions)[0]; f.soldiers = 1;
    const c = queueConfrontation(w, { factionId: f.id, kind: 'loved', war: true, npcId: n.id, blockId: n.homeBlockId, text: 'Two men outside their door.' });
    const won = resolveConfrontation(w, c, 'fight', new Rng(1));
    if (won) expect(w.npcs[n.id].taken, 'you won and they took them anyway').toBeFalsy();
  });

  it('and it goes on their page, like anything else that happens to somebody', () => {
    const w = mk();
    const n = lovedOne(w)!;
    const f = Object.values(w.factions)[0];
    queueConfrontation(w, { factionId: f.id, kind: 'loved', war: true, npcId: n.id, blockId: n.homeBlockId, text: 'Two men outside their door.' });
    expect((w.npcs[n.id].ledger ?? []).length, 'nothing was written down about it').toBeGreaterThan(0);
  });
});

describe('what the player is told about them', () => {
  it('quiet while you are quiet, and not once you are not', () => {
    const w = mk();
    w.player.heat = 5;
    expect(lovedStatus(w)).toMatch(/knows none of it/);
    w.player.heat = 85;
    expect(lovedStatus(w)).toMatch(/asking what you do/);
  });

  it('and nothing at all when there is nobody', () => {
    const w = mk();
    w.player.lovedId = undefined;
    expect(lovedOne(w)).toBeUndefined();
    expect(lovedStatus(w)).toBeUndefined();
    expect(isLoved(w, Object.values(w.npcs)[0])).toBe(false);
  });

  it('a save round trip does not lose them', () => {
    const w = mk();
    const reloaded = JSON.parse(JSON.stringify(dispatch(w, { type: 'end_day' }))) as World;
    expect(lovedOne(reloaded)?.id).toBe(w.player.lovedId);
    void PLAYER; void select;
  });
});
