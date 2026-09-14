/**
 * Losing everybody, and getting them back.
 *
 * A soak run finished with 8 of 8 crew jailed, dead or injured at once, after two busts back to
 * back — with both rival factions already crushed to zero soldiers. A player who has won against
 * every criminal rival in the city could still be taken apart by the law alone.
 *
 * The balance half of that is arguable. The half that is not arguable is the **dead end**: the
 * one op whose entire purpose is getting your people out of a cell required an *idle crew
 * member*, which is exactly the resource its own failure mode removes. Lose everybody and you
 * could not go and get anybody. That is not a hard night, it is a state with no exit, and these
 * tests are about the exit existing.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { PLAYER, can, dispatch, generateWorld, select, type Npc, type World } from './index';

function outfit(crew = 8): World {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 8 });
  w.pendingEvents = [];
  w.day = 40; w.player.cash = 60_000; w.player.lawyer = true;
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, crew)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return w;
}
const standing = (w: World) => w.player.crewIds.map(id => w.npcs[id]).filter(n => n.crew && (n.crew.status === 'idle' || n.crew.status === 'assigned'));
const jail = (who: Npc[]) => { for (const n of who) { n.crew!.status = 'jailed'; n.crew!.statusDays = 12; n.crew!.assignment = undefined; } };

/** Push heat to the top and sleep: the real path to a bust, not a test-only hook. */
function busted(w: World): World {
  w.pendingEvents = []; w.player.heat = 100; w.player.dirty = 20_000;
  const next = dispatch(w, { type: 'end_day' });
  expect(next.player.busts, 'heat 100 did not produce a bust, so this checked nothing').toBeGreaterThan(w.player.busts);
  return next;
}

describe('a bust never takes the last body standing', () => {
  it('somebody is always out that night, however the rolls fall', () => {
    // Many rolls, because the failure is a tail: eight independent coins all landing the same way
    // is rare enough to miss by hand and common enough to ship. Re-seeding the world's own RNG
    // walks the whole distribution without paying for a world per case.
    const base = outfit();
    for (let i = 0; i < 40; i++) {
      const w = JSON.parse(JSON.stringify(base)) as World;
      w.rng = 1000 + i * 7919;
      expect(standing(busted(w)).length, `rng ${w.rng}: the bust left nobody on their feet`).toBeGreaterThan(0);
    }
  });

  it('it is still a bust: the money goes and it counts against you', () => {
    const w = busted(outfit());
    expect(w.player.dirty).toBeLessThan(20_000 * 0.5);
    expect(w.player.busts).toBe(1);
  });

  it('and two in a row still cannot empty the outfit', () => {
    const w = busted(busted(outfit()));
    expect(w.player.busts).toBe(2);
    expect(standing(w).length, 'two busts back to back wiped the outfit out').toBeGreaterThan(0);
  });
});

describe('there is a way back from everybody being inside', () => {
  it('springing somebody needs nobody, because the whole point is you have nobody', () => {
    expect(OP_DEFS.spring_crew.minCrew, 'the recovery op requires the resource it recovers').toBe(0);
  });

  it('with the entire crew in a cell, the player can still plan the op that gets them out', () => {
    const w = outfit(4);
    const all = w.player.crewIds.map(id => w.npcs[id]);
    jail(all);
    expect(select.idleCrew(w).length, 'somebody is still free, so this proves nothing').toBe(0);
    const target = all[0];
    const r = can(w, { type: 'plan_op', kind: 'spring_crew', crewIds: [], targetNpcId: target.id });
    expect(r.ok, `no way out: ${!r.ok && r.reason}`).toBe(true);
  });

  it('and it is a real chance for the right player, not a formality', () => {
    const w = outfit(4);
    jail(w.player.crewIds.map(id => w.npcs[id]));
    const best = Math.max(...([undefined, 'loud', 'quiet'] as const).map(a => select.opChance(w, 'spring_crew', [], a)));
    expect(best, 'a brains player alone cannot realistically spring anybody').toBeGreaterThanOrEqual(40);
    expect(best, 'springing somebody is a free action').toBeLessThan(85);
  });

  it('the exit does not depend on having rivals left to lean on', () => {
    // The reported run had both factions at zero soldiers: every other recovery route in the
    // game goes through somebody, and there was nobody left to go through.
    const w = outfit(4);
    for (const f of Object.values(w.factions)) { f.soldiers = 0; f.standing[PLAYER] = -100; }
    jail(w.player.crewIds.map(id => w.npcs[id]));
    expect(can(w, { type: 'plan_op', kind: 'spring_crew', crewIds: [], targetNpcId: w.player.crewIds[0] }).ok).toBe(true);
  });
});
