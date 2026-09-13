/**
 * Casing a place: an hour inside, a coarse read on everybody in it, and a few days of knowing
 * the layout — which is worth real odds on the next job there.
 */
import { describe, expect, it } from 'vitest';
import { CASE_JOINT } from '@content/rackets';
import { can, dispatch, generateWorld, select, type World } from './index';

const mk = (seed = 12) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed }); w.pendingEvents = []; return w; };
/** A place with people in it, with the player standing in the doorway. */
function standingIn(w: World) {
  const biz = Object.values(w.businesses).filter(b => b.patronIds.length >= 2 && b.ownedBy === 'npc')[0];
  w.player.currentBlockId = biz.blockId;
  return biz;
}

describe('casing a joint', () => {
  it('costs exactly the two action points it says, and nothing else', () => {
    const w = mk();
    const biz = standingIn(w);
    const gate = can(w, { type: 'case_joint', businessId: biz.id });
    expect(gate.ok).toBe(true);
    expect(gate.ok === true && gate.cost).toEqual({ ap: CASE_JOINT.ap });
    expect(CASE_JOINT.ap).toBe(2);
    const before = { ap: w.player.ap, cash: w.player.cash, dirty: w.player.dirty, heat: w.player.heat };
    const next = dispatch(w, { type: 'case_joint', businessId: biz.id });
    expect(next.player.ap).toBe(before.ap - 2);
    expect(next.player.cash).toBe(before.cash);
    expect(next.player.dirty).toBe(before.dirty);
    expect(next.player.heat).toBe(before.heat);
  });

  it('has to be done in person, and not twice', () => {
    const w = mk();
    const biz = standingIn(w);
    const away = Object.keys(w.blocks).find(id => id !== biz.blockId)!;
    w.player.currentBlockId = away;
    const far = can(w, { type: 'case_joint', businessId: biz.id });
    expect(far.ok).toBe(false);
    expect(far.ok === false && far.reason).toMatch(/Walk over first/);
    w.player.currentBlockId = biz.blockId;
    const next = dispatch(w, { type: 'case_joint', businessId: biz.id });
    const again = can(next, { type: 'case_joint', businessId: biz.id });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toMatch(/already walked/i);
  });

  it('reads the room: a coarse line on everybody, not a file on anybody', () => {
    const w = mk();
    const biz = standingIn(w);
    const ids = [biz.ownerId, ...biz.patronIds];
    for (const id of ids) { w.npcs[id].known = false; w.npcs[id].rel.trust = 0; w.npcs[id].hint = undefined; }
    const next = dispatch(w, { type: 'case_joint', businessId: biz.id });
    for (const id of ids) {
      const n = next.npcs[id];
      expect(n.hint, n.name).toBeTruthy();
      expect(select.isKnown(n), 'casing is not a size-up').toBe(false);   // traits and nerve stay hidden
      // and the hint never names a trait or a number
      for (const t of n.traits) expect(n.hint!.toLowerCase()).not.toContain(t);
      expect(n.hint!).not.toMatch(/\d/);
    }
    // and a proper size-up is still there to be done: casing neither replaces nor blocks it
    expect(can({ ...next, player: { ...next.player, ap: 8 } }, { type: 'read', npcId: ids[0] }).ok).toBe(true);
  });

  it('leaves people you already know alone', () => {
    const w = mk();
    const biz = standingIn(w);
    const known = w.npcs[biz.ownerId];
    known.known = true;
    const next = dispatch(w, { type: 'case_joint', businessId: biz.id });
    expect(next.npcs[known.id].hint).toBeUndefined();   // you have their number already
  });

  it('makes the next job there meaningfully easier, for a few days', () => {
    const w = mk();
    const biz = standingIn(w);
    w.player.crewIds = Object.values(w.npcs).filter(n => n.role === 'patron').slice(0, 2).map(n => {
      n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 }; n.role = 'crew'; return n.id;
    });
    const before = select.opChance(w, 'robbery', w.player.crewIds, 'quiet', biz.id);
    const next = dispatch(w, { type: 'case_joint', businessId: biz.id });
    expect(next.businesses[biz.id].casedUntil).toBe(next.day + CASE_JOINT.days);
    const after = select.opChance(next, 'robbery', next.player.crewIds, 'quiet', biz.id);
    expect(after).toBeGreaterThan(before);
    // it is the place you cased, not every place
    const other = Object.values(next.businesses).find(b => b.id !== biz.id && b.blockId === biz.blockId)!;
    expect(select.opChance(next, 'robbery', next.player.crewIds, 'quiet', other.id)).toBe(before);
    // and it goes stale
    const stale = { ...next, day: next.day + CASE_JOINT.days + 1 };
    expect(select.opChance(stale, 'robbery', stale.player.crewIds, 'quiet', biz.id)).toBe(before);
  });
});
