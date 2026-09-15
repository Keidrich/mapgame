/**
 * Ids that stop resolving, and the three crashes they have caused this session.
 *
 * `FactionId` is one type over three populations: `PLAYER`, a real faction in `w.factions`, and a
 * **street crew** in `w.crews`. Factions never vanish — they are marked `alive = false` and left
 * where they are — but crews are genuinely `delete`d when their block goes or they are folded in.
 * So `w.factions[someFactionId]` is `undefined` for an id that every type signature says is fine,
 * and nothing in the compiler will tell you.
 *
 * That is the shape behind all three: `buy_business` reading `.standing` off a crew id, `patronTip`
 * reading `.name` off a dead lieutenant, and `offer_sale:buy` reading `.standing` off a *deleted*
 * crew — reproducible on seed 33 by day 60 and the reason this file exists.
 *
 * Two lines of defence, and both are tested here, because either alone is a half-fix:
 *
 *  1. **Nothing may still point at a dead outfit.** `releaseGround` — a stale reference that does
 *     not exist cannot be read.
 *  2. **A read that finds nothing must not throw.** `outfit`/`bumpStanding` — because the first
 *     line will be missed again one day, and the second one is what stops that being a crash.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, select, type World } from './index';
import { outfit, bumpStanding, releaseGround } from './util';
import { resolveEventOption } from './events';
import { Rng } from './rng';

const mk = (seed = 33) => {
  const w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'V', background: 'muscle', seed });
  w.pendingEvents = [];
  return w;
};

describe('an id that no longer resolves is answered, not thrown at', () => {
  it('a faction id that was never there', () => {
    const w = mk();
    expect(outfit(w, 'f-does-not-exist')).toBeUndefined();
    expect(() => bumpStanding(w, 'f-does-not-exist', -8)).not.toThrow();
  });

  it('a street crew id, which is a FactionId that lives somewhere else entirely', () => {
    const w = mk();
    w.crews['c1'] = { id: 'c1', name: 'Kellys', blockId: Object.keys(w.blocks)[0], bossId: '', soldierIds: [], strength: 5, mood: 0, formedDay: 1 } as never;
    expect(outfit(w, 'c1'), 'a crew is not a faction and must not be read as one').toBeUndefined();
    expect(() => bumpStanding(w, 'c1', -8)).not.toThrow();
  });

  it('the player, who has no standing with themselves', () => {
    const w = mk();
    expect(outfit(w, PLAYER)).toBeUndefined();
    expect(() => bumpStanding(w, PLAYER, -8)).not.toThrow();
  });

  it('but a real outfit still moves', () => {
    const w = mk();
    const f = Object.values(w.factions)[0];
    const before = f.standing[PLAYER];
    bumpStanding(w, f.id, -8);
    expect(f.standing[PLAYER]).toBe(before - 8);
    bumpStanding(w, f.id, 1000);
    expect(f.standing[PLAYER], 'standing left its own scale').toBeLessThanOrEqual(100);
  });
});

describe('the reported crash: buying a place a dead outfit was collecting from', () => {
  /** The exact state seed 33 reached: a business still naming a protector that is gone. */
  function staleProtection(w: World) {
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
    biz.protection = { factionId: 'c-deleted', rate: 0.15, since: 1 };
    return biz;
  }

  it('offer_sale:buy does not throw on a protector that no longer exists', () => {
    const w = mk();
    const biz = staleProtection(w);
    const n = w.npcs[biz.ownerId];
    const e = { id: 'e1', kind: 'offer_sale', title: '', text: '', options: [], refs: { npcId: n.id, businessId: biz.id } } as never;
    expect(() => resolveEventOption(w, e, 'buy', new Rng(1))).not.toThrow();
    expect(w.businesses[biz.id].ownedBy).toBe('player');
    expect(w.businesses[biz.id].protection, 'the stale protection survived the sale').toBeUndefined();
  });

  it('and neither does it on a live one — it still costs you standing', () => {
    const w = mk();
    const f = Object.values(w.factions)[0];
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
    biz.protection = { factionId: f.id, rate: 0.15, since: 1 };
    const before = f.standing[PLAYER];
    const n = w.npcs[biz.ownerId];
    const e = { id: 'e1', kind: 'offer_sale', title: '', text: '', options: [], refs: { npcId: n.id, businessId: biz.id } } as never;
    resolveEventOption(w, e, 'buy', new Rng(1));
    expect(f.standing[PLAYER], 'taking their earner cost nothing').toBeLessThan(before);
  });
});

describe('the other instance the sweep turned up: a takeover against a dead protector', () => {
  it('select.stanceWithPlayer answers for an id that is not a faction at all', () => {
    const w = mk();
    expect(select.stanceWithPlayer(w, 'c-deleted')).toBe('peace');
    expect(select.stanceWithPlayer(w, PLAYER)).toBe('peace');
  });
});

describe('and nothing points at a dead outfit in the first place', () => {
  it('releaseGround takes their id off every block and every business', () => {
    const w = mk();
    const f = Object.values(w.factions)[0];
    const blocks = Object.values(w.blocks).filter(b => (b.influence[f.id] ?? 0) > 0);
    const guarded = Object.values(w.businesses).filter(b => b.protection?.factionId === f.id);
    expect(blocks.length + guarded.length, 'this seed gave them nothing, so this proves nothing').toBeGreaterThan(0);
    releaseGround(w, f.id);
    expect(Object.values(w.blocks).some(b => b.influence[f.id] !== undefined)).toBe(false);
    expect(Object.values(w.businesses).some(b => b.protection?.factionId === f.id)).toBe(false);
  });

  it('a street crew that gets dissolved leaves nothing behind it', () => {
    // The actual source of the seed-33 crash: crews take protection like anybody else and,
    // unlike factions, are really deleted.
    let w = mk(5);
    w = dispatch(w, { type: 'cheat', what: 'crews', amount: 2 });
    const crew = Object.values(w.crews)[0];
    expect(crew, 'no crew was generated, so this proves nothing').toBeTruthy();
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
    biz.protection = { factionId: crew.id, rate: 0.15, since: 1 };
    const block = Object.values(w.blocks)[0]; block.influence[crew.id] = 30;
    releaseGround(w, crew.id);
    delete w.crews[crew.id];
    expect(Object.values(w.businesses).some(b => b.protection?.factionId === crew.id)).toBe(false);
    expect(block.influence[crew.id]).toBeUndefined();
  });
});

describe('the seed that crashed, played out', () => {
  it('sixty days of the run that used to die by day 60', () => {
    // The regression, end to end and through the real reducer, because a unit test of a guard
    // would have passed against the old code too if it had guarded the wrong line.
    let w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'V', background: 'muscle', seed: 33 });
    expect(() => {
      for (let i = 0; i < 60; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    }).not.toThrow();
    expect(w.day).toBeGreaterThan(60);
  });
});
