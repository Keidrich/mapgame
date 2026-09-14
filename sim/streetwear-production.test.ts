/**
 * The fifth production line: a cut house making counterfeit streetwear, and the rail at the
 * front of a boutique that sells it.
 *
 * The four lines before it were a still, a grow, a lab and a print shop, and every one of them
 * ends in a product the game already knew how to price, carry and sell. A fifth is only real if
 * it goes the whole way: something is made, it lands in a stash, a racket draws on that stash,
 * and the money that comes out is the money the tables say it should be.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS, RECIPES, recipesOfKind } from '@content/rackets';
import { PLAYER, dispatch, generateWorld, type Production, type Safehouse, type World } from './index';
import { emptyStash } from './generate';
import { mkRacket } from './reducer';
import { addProduct } from './production';
import { canHost } from './tiers';
import { typed } from './test-util';

const mk = (seed = 33) => { const w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'charm', seed }); w.pendingEvents = []; w.player.cash = 200_000; return w; };

function house(w: World): Safehouse {
  const s: Safehouse = { id: 'sh_x', blockId: w.player.currentBlockId, name: 'The unit', tier: 2, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: 300, hostageIds: [] };
  w.safehouses[s.id] = s; w.player.safehouseIds.push(s.id); w.blocks[s.blockId].safehouseId = s.id;
  return s;
}

describe('the cut house is a production line like any other', () => {
  it('is defined, makes streetwear, and costs real money to open', () => {
    const d = PRODUCTION_DEFS.cut_house;
    expect(d.product).toBe('streetwear');
    expect(d.setupCost).toBeGreaterThan(0);
    expect(d.ingredientCost).toBeGreaterThan(0);
    expect(d.outputBase).toBeGreaterThan(0);
  });

  it('has a menu of things to make, all of them cloth rather than settings', () => {
    const ids = recipesOfKind('cut_house');
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) {
      expect(RECIPES[id].kind).toBe('cut_house');
      expect(RECIPES[id].blurb.length).toBeGreaterThan(20);
    }
  });

  it('streetwear is priced and carried like every other product', () => {
    expect(PRODUCT_INFO.streetwear.price).toBeGreaterThan(0);
    expect(PRODUCT_INFO.streetwear.heat).toBeGreaterThan(0);
    expect(emptyStash().streetwear).toBe(0);
  });

  it('runs a day and puts units on the shelf', () => {
    const w = mk(); const s = house(w);
    const pr: Production = { id: 'pr_x', kind: 'cut_house', safehouseId: s.id, level: 1, stock: 10, lastOutput: 0, disrupted: 0 };
    w.productions[pr.id] = pr; s.productionIds.push(pr.id);
    const t = dispatch(w, { type: 'end_day' });
    expect(t.safehouses[s.id].stash.streetwear, 'nothing came off the line').toBeGreaterThan(0);
    expect(t.productions[pr.id].stock).toBeLessThan(10);
  });
});

describe('the rail at the front', () => {
  it('knockoffs is a stash racket: no stock, no money', () => {
    const d = RACKET_DEFS.knockoffs;
    expect(d.scale).toBe('stash');
    expect(d.needsProduct).toBe(true);
    expect(d.incomeBase).toBe(0);     // it earns off what you carry, not off a formula
  });

  it('only lives somewhere that sells clothes', () => {
    const w = mk();
    const hosts = Object.values(w.businesses).filter(b => canHost(b, 'knockoffs'));
    for (const b of hosts) expect(['boutique'], b.type).toContain(b.type);
  });

  it('turns a stash of streetwear into money, and stops when the rail is empty', () => {
    const w = mk();
    const biz = typed(w, 'boutique');
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    const r = mkRacket(w, 'knockoffs', biz);
    addProduct(w.player, 'streetwear', 60, 55);
    let best = 0; let t = w;
    for (let d = 0; d < 3; d++) { t.pendingEvents = []; t = dispatch(t, { type: 'end_day' }); best = Math.max(best, t.rackets[r.id].lastIncome); }
    expect(best, 'a full rail sold nothing').toBeGreaterThan(0);
    expect(t.player.stash.streetwear).toBeLessThan(60);

    const empty = structuredClone(t);
    empty.player.stash.streetwear = 0; empty.pendingEvents = [];
    const after = dispatch(empty, { type: 'end_day' });
    expect(after.rackets[r.id].lastIncome, 'an empty rail still earned').toBe(0);
  });
});

describe('what it is and is not about', () => {
  it('the recipes name a thing being sold, never a method', () => {
    const banned = /\b(how to|step \d|solvent|solder|press at \d|temperature|acetone|degrees)\b/i;
    for (const id of recipesOfKind('cut_house')) {
      expect(RECIPES[id].blurb, id).not.toMatch(banned);
      expect(RECIPES[id].label, `${id} reads like a quality slider`).not.toMatch(/^(high|low|fast|slow) /i);
    }
  });
});
