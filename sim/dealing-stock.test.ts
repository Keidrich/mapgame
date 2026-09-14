/**
 * A dealing racket with nothing to sell.
 *
 * Reported from real play: "dealing as a racket requires product but it doesn't actually allow
 * me to put product into the racket inventory so it never really sells."
 *
 * There is no racket inventory — product rackets move what the *player* is carrying. That is a
 * coherent rule, but production puts everything into safehouses, so the obvious setup (a still
 * upstairs, a dealer on the corner below) sold nothing forever and nothing on screen said why.
 * A safehouse of yours on the same block now restocks the corner.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, type World } from './index';
import { mkRacket } from './reducer';
import { emptyStash } from './generate';
import { canHost } from './tiers';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; w.player.cash = 200000; return w; };

/** A dealing racket, and a safehouse holding product either on its block or elsewhere. */
function setUp(w: World, where: 'same block' | 'elsewhere') {
  const biz = Object.values(w.businesses).find(b => b.patronIds.length > 0 && canHost(b, 'dealing'))!;
  biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
  const r = mkRacket(w, 'dealing', biz);
  r.product = 'green';
  const blockId = where === 'same block'
    ? biz.blockId
    : Object.values(w.blocks).find(b => b.id !== biz.blockId)!.id;
  const s = { id: 'sh_t', blockId, name: 'The house', tier: 2, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: 200, hostageIds: [] };
  s.stash.green = 120;
  w.safehouses[s.id] = s; w.player.safehouseIds.push(s.id);
  w.blocks[blockId].safehouseId = s.id;
  w.player.stash.green = 0;
  return { r, s, biz };
}

describe('a dealer with an empty pocket', () => {
  it('sells nothing when there is no product anywhere — the rule itself is unchanged', () => {
    const w = mk();
    const biz = Object.values(w.businesses).find(b => b.patronIds.length > 0 && canHost(b, 'dealing'))!;
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    const r = mkRacket(w, 'dealing', biz); r.product = 'green';
    w.player.stash.green = 0;
    const next = dispatch(w, { type: 'end_day' });
    expect(next.rackets[r.id].lastIncome).toBe(0);
  });

  it('restocks itself from a safehouse of yours on the same block, and then sells', () => {
    const w = mk();
    const { r, s } = setUp(w, 'same block');
    expect(w.player.stash.green).toBe(0);

    const next = dispatch(w, { type: 'end_day' });
    expect(next.safehouses[s.id].stash.green, 'the house should have handed some down').toBeLessThan(120);
    expect(next.rackets[r.id].lastIncome, 'and the corner should have sold some of it').toBeGreaterThan(0);
  });

  it('keeps selling day after day while the house has stock', () => {
    let w = mk();
    const { r, s } = setUp(w, 'same block');
    let earned = 0;
    for (let d = 0; d < 3; d++) {
      w.pendingEvents = [];
      w = dispatch(w, { type: 'end_day' });
      earned += w.rackets[r.id].lastIncome;
    }
    expect(earned).toBeGreaterThan(0);
    expect(w.safehouses[s.id].stash.green).toBeLessThan(120);
  });

  it('does not reach across town: a safehouse on another block does not restock it', () => {
    const w = mk();
    const { r, s } = setUp(w, 'elsewhere');
    const next = dispatch(w, { type: 'end_day' });
    expect(next.safehouses[s.id].stash.green, 'stock somewhere else stays where it is').toBe(120);
    expect(next.rackets[r.id].lastIncome).toBe(0);
  });

  it('still sells straight out of your own pocket, which was always the rule', () => {
    const w = mk();
    const { r } = setUp(w, 'elsewhere');
    w.player.stash.green = 60;
    const next = dispatch(w, { type: 'end_day' });
    expect(next.rackets[r.id].lastIncome).toBeGreaterThan(0);
    expect(next.player.stash.green).toBeLessThan(60);
  });

  it('moving product to yourself by hand still works', () => {
    const w = mk();
    const { r, s } = setUp(w, 'elsewhere');
    const moved = dispatch(w, { type: 'move_stash', from: s.id, to: 'player', product: 'green', amount: 50 });
    expect(moved.player.stash.green).toBe(50);
    const next = dispatch(moved, { type: 'end_day' });
    expect(next.rackets[r.id].lastIncome).toBeGreaterThan(0);
  });
});
