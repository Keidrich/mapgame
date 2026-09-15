/**
 * An old save has no pockets on anybody, and must not notice.
 *
 * `Npc.items` / `Npc.equipped` were added after the fact, exactly like `Player.items` /
 * `Player.equipped` before them, and the house pattern for both is the same: **optional field,
 * every read defaults**. There is no migration step and there is deliberately not going to be one
 * — `WORLD_VERSION` is not bumped by this change, so every save in existence keeps loading, and the
 * cost of that is that nothing anywhere may assume the arrays exist.
 *
 * That is an easy promise to break by accident: one `n.equipped.length` instead of
 * `(n.equipped ?? []).length` in a path a test does not cover throws at End Day and takes the save
 * with it. This walks the whole kit surface against people who have never had either field, and
 * then runs a day.
 */
import { describe, expect, it } from 'vitest';
import { WORLD_VERSION, dispatch, generateWorld, select, type Confrontation, type Npc, type World } from './index';
import { equipSlotsLeft, equippedItems, jobKit, kitCover, ownedCount, ownedItems } from './items';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/**
 * A save from before any of this: not one person in the world has either field, and neither does
 * the player. `delete` rather than `= []`, because that is what JSON.parse of an old save gives
 * you — an absent key, not an empty array.
 */
function oldSave(seed = 12): World {
  const w = mk(seed);
  w.pendingEvents = [];
  delete w.player.items; delete w.player.equipped;
  for (const n of Object.values(w.npcs)) { delete n.items; delete n.equipped; }
  for (const n of Object.values(w.npcs).filter(x => x.role === 'patron').slice(0, 3)) {
    n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    n.role = 'crew'; w.player.crewIds.push(n.id);
  }
  return w;
}
const crewOf = (w: World): Npc[] => w.player.crewIds.map(id => w.npcs[id]);

describe('a save made before the crew had pockets', () => {
  it('still loads: the version is untouched, so nothing is dropped', () => {
    // If this ever has to change, the changelog entry says "drops every existing save" in bold.
    expect(oldSave().version).toBe(WORLD_VERSION);
  });

  it('reads empty everywhere, for a crew member exactly as for the player', () => {
    const w = oldSave();
    const [n] = crewOf(w);
    expect(n.items).toBeUndefined();
    expect(n.equipped).toBeUndefined();
    for (const who of [w.player, n]) {
      expect(ownedItems(w, who)).toEqual([]);
      expect(equippedItems(w, who)).toEqual([]);
      expect(ownedCount(w, 'sawnoff', who)).toBe(0);
      expect(kitCover(w, who)).toBe(0);
      expect(select.kitSkillBoost(w, who)).toEqual({});
      expect(select.kitHeatMult(w, who)).toBe(1);
      expect(select.kitApproachBias(w, 'loud', who)).toBe(0);
      // Nobody has spent a slot, so everybody has all of them. This is the assertion that catches
      // `EQUIP_MAX - n.equipped.length` on an absent array.
      expect(equipSlotsLeft(w, who)).toBe(select.EQUIP_MAX);
    }
  });

  it('prices a job on it without throwing, and gets the same answer as before kit existed', () => {
    const w = oldSave();
    const ids = crewOf(w).map(n => n.id);
    expect(jobKit(w, ids)).toEqual([]);
    expect(select.jobSkillBoost(w, ids)).toEqual({});
    expect(select.jobHeatMult(w, ids)).toBe(1);
    expect(select.jobApproachBias(w, ids, 'loud')).toBe(0);
    // A world with nothing in anybody's pockets prices a job exactly as it did when the kit maths
    // read one array that was also absent. No kit is no kit, however many people are holding it.
    expect(select.opHeat(w, 'ambush_soldiers', { approach: 'loud', crewIds: ids }))
      .toBe(select.opHeat(w, 'ambush_soldiers', { approach: 'loud' }));
    expect(() => select.opChance(w, 'ambush_soldiers', ids, 'loud')).not.toThrow();
  });

  it('survives a day, which is where an absent array actually bites', () => {
    const w = oldSave();
    expect(() => dispatch(w, { type: 'end_day' })).not.toThrow();
  });

  it('defaults on write too: the first thing anybody is given creates the array', () => {
    const w = oldSave();
    const [n] = crewOf(w);
    const after = dispatch(w, { type: 'equip', itemId: 'bat', on: true, npcId: n.id });
    // Refused, because they own nothing — and refused *cleanly*, not by throwing on the read.
    expect(after.npcs[n.id].equipped ?? []).toEqual([]);

    // Give them one the way a purchase does, and the pair comes into existence from nothing.
    const them = w.npcs[n.id];
    them.items = [...(them.items ?? []), 'bat'];
    const armed = dispatch(w, { type: 'equip', itemId: 'bat', on: true, npcId: n.id });
    expect(armed.npcs[n.id].equipped).toEqual(['bat']);
    expect(equipSlotsLeft(armed, armed.npcs[n.id])).toBe(select.EQUIP_MAX - 1);
  });

  it('prices a fight at your door, which pools kit off a different set of hands again', () => {
    const w = oldSave();
    // `sim/combat.ts` pools over the player plus whoever could turn up, rather than over an op's
    // crew — a second place the "read one array" assumption used to live, and one that is reached
    // by somebody arriving rather than by the player pressing anything.
    const c: Confrontation = {
      id: 'c1', day: w.day, factionId: Object.keys(w.factions)[0], kind: 'you', war: false,
      text: 'They are at the door.', blockId: w.player.currentBlockId,
    };
    w.confrontations = [c];
    for (const approach of ['fight', 'flee', 'backup'] as const) {
      const odds = select.confrontChance(w, c, approach);
      expect(Number.isFinite(odds), approach).toBe(true);
      expect(odds).toBeGreaterThanOrEqual(3);
    }
  });
});
