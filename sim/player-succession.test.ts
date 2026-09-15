/**
 * What happens to the empire when you are not there.
 *
 * **The decision, which was made before any of this was written and is documented at the top of
 * `sim/legacy.ts` and in the commit: control genuinely passes.** Same save, same world, new
 * protagonist — not an epilogue. `w.player` is a plain data object holding a name, a background,
 * five skills and lists of ids; everything that makes the *city* lives outside it and does not
 * care who is holding the controls.
 *
 * So these tests are mostly about the two halves of that: what must persist (all of it) and what
 * must cost you something (their skills, not yours), because a succession that costs nothing is
 * a respawn with extra steps.
 */
import { describe, expect, it } from 'vitest';
import { SUCCESSION } from './legacy';
import { heirs, succeed } from './legacy';
import { mkRacket } from './reducer';
import { PLAYER, generateWorld, type Npc, type World } from './index';

function outfit(crew = 4): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'Vic Romano', background: 'muscle', seed: 66 });
  w.pendingEvents = []; w.day = 90;
  w.player.cash = 120_000; w.player.dirty = 40_000; w.player.respect = 80; w.player.fear = 70;
  w.player.street = 'the Hammer'; w.player.legitimacy = 30;
  const kinds = ['protection', 'numbers', 'bookmaking'] as const;
  Object.values(w.businesses).filter(b => b.ownedBy === 'npc').slice(0, 3).forEach((b, i) => {
    b.protection = { factionId: PLAYER, rate: 0.15, since: 5 };
    mkRacket(w, kinds[i], b);
  });
  Object.values(w.npcs).filter(n => n.alive && n.role === 'patron').slice(0, crew).forEach((n, i) => {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 55 + i * 10, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 + i };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  });
  return w;
}

describe('somebody steps up, and it is the one with the best case', () => {
  it('the shortlist is ranked, the way a faction\'s is', () => {
    const w = outfit();
    const list = heirs(w);
    expect(list.length).toBeGreaterThan(1);
    // the top of the list is not simply the first person who joined
    expect(list[0].crew!.loyalty).toBeGreaterThanOrEqual(list[list.length - 1].crew!.loyalty);
  });

  it('and nobody who is barely committed, dead or in a cell is on it', () => {
    const w = outfit();
    const all = w.player.crewIds.map(id => w.npcs[id]);
    all[0].crew!.loyalty = SUCCESSION.minLoyalty - 1;
    all[1].crew!.status = 'jailed';
    all[2].alive = false;
    const list = heirs(w).map(n => n.id);
    expect(list).not.toContain(all[0].id);
    expect(list).not.toContain(all[1].id);
    expect(list).not.toContain(all[2].id);
  });
});

describe('control genuinely passes: the world is the same world', () => {
  it('the city, the blocks, the businesses and the rackets are untouched', () => {
    const w = outfit();
    const blocks = Object.keys(w.blocks).length;
    const rackets = [...w.player.racketIds];
    const npcs = Object.keys(w.npcs).length;
    succeed(w, 'They got to you.');
    expect(Object.keys(w.blocks).length).toBe(blocks);
    expect(w.player.racketIds).toEqual(rackets);
    expect(Object.keys(w.npcs).length).toBeGreaterThanOrEqual(npcs);   // plus the ghost
    expect(w.gameOver, 'the game ended instead of continuing').toBeUndefined();
  });

  it('the estate stays: money, places, people', () => {
    const w = outfit();
    const cash = w.player.cash, dirty = w.player.dirty;
    const crewBefore = w.player.crewIds.length;
    succeed(w, 'They got to you.');
    expect(w.player.cash).toBe(cash);
    expect(w.player.dirty).toBe(dirty);
    expect(w.player.crewIds.length, 'the successor is still also on the payroll').toBe(crewBefore - 1);
  });

  it('you are playing them now: their name, their skills', () => {
    const w = outfit();
    const heir = heirs(w)[0];
    const mySkills = { ...w.player.skills };
    succeed(w, 'They got to you.');
    expect(w.player.name).toBe(heir.name);
    expect(w.player.skills).toEqual(heir.skills);
    expect(w.player.skills, 'you kept your own spread, which is a respawn').not.toEqual(mySkills);
  });

  it('and the old you is an ordinary dead person in the world, remembered', () => {
    const w = outfit();
    const wasCalled = 'Vic "the Hammer"';
    succeed(w, 'They got to you.');
    const ghost = Object.values(w.npcs).find(n => n.name === wasCalled);
    expect(ghost, 'the previous player simply vanished').toBeTruthy();
    expect(ghost!.alive).toBe(false);
    expect(w.player.succeededFrom).toContain(wasCalled);
  });
});

describe('and it costs something, or it is a respawn', () => {
  it('the name carries; the person does not', () => {
    const w = outfit();
    const respect = w.player.respect, fear = w.player.fear;
    succeed(w, 'They got to you.');
    expect(w.player.respect).toBeLessThan(respect);
    expect(w.player.fear).toBeLessThan(fear);
    expect(w.player.respect).toBeCloseTo(Math.round(respect * SUCCESSION.inherits), 0);
  });

  it('the street name and your reputation for being respectable were yours alone', () => {
    const w = outfit();
    succeed(w, 'They got to you.');
    expect(w.player.street, 'they inherited a name they did not earn').toBeUndefined();
    expect(w.player.legitimacy).toBe(0);
  });

  it('and it can happen again, so the line is a line', () => {
    const w = outfit(4);
    succeed(w, 'The first time.');
    succeed(w, 'The second time.');
    expect(w.player.succeededFrom!.length).toBe(2);
    expect(w.gameOver).toBeUndefined();
  });
});

describe('and when there is nobody, it is simply over', () => {
  it('no crew means no successor and no game', () => {
    const w = outfit(0);
    expect(heirs(w)).toEqual([]);
    const heir: Npc | undefined = succeed(w, 'They got to you.');
    expect(heir).toBeUndefined();
    expect(w.gameOver?.reason).toBe('gone');
  });

  it('nor does somebody who would not have stepped up count as one', () => {
    const w = outfit(2);
    for (const id of w.player.crewIds) w.npcs[id].crew!.loyalty = SUCCESSION.minLoyalty - 5;
    expect(succeed(w, 'They got to you.')).toBeUndefined();
    expect(w.gameOver).toBeTruthy();
  });
});
