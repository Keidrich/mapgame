/**
 * The third kit shop.
 *
 * A pawn shop takes anything and shows what it is allowed to; a back room carries everything,
 * including what nobody with a sign over the door will touch. A computer store is the specialist
 * between them: tech only, all of it legal, and a deeper shelf in that one kind because the man
 * behind the counter actually knows the trade.
 *
 * The contract worth holding is that the three shelves are **one table** (`SHELVES` in
 * `sim/items.ts`) rather than three branches — so these tests are mostly about the rule rather
 * than about the shop, and a fourth shop would be a row and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS } from '@content/businesses';
import { ITEM_DEFS } from '@content/items';
import { BUSINESS_NAME_PARTS } from '@content/names';
import { generateWorld, select, type Business, type World } from './index';

const mk = (seed = 9): World => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'brains', seed });
const shop = (type: Business['type']): Business => ({ id: `b_${type}_1`, type, blockId: 'k1', ownerId: 'n1', patronIds: [], racketIds: [], ownedBy: 'npc' } as unknown as Business);

describe('the shop itself', () => {
  it('is a real business type with everything a business type needs', () => {
    const d = BUSINESS_DEFS.computer_store;
    expect(d).toBeDefined();
    expect(d.tier).toBe(1);
    expect(d.icon.length).toBeGreaterThan(0);
    expect(BUSINESS_NAME_PARTS.computer_store[0].length).toBeGreaterThan(2);
    expect(BUSINESS_NAME_PARTS.computer_store[1].length).toBeGreaterThan(2);
  });

  it('trades in kit, like the other two', () => {
    expect(select.isMarket(shop('computer_store'))).toBe(true);
    expect(select.isMarket(shop('pawn'))).toBe(true);
    expect(select.isMarket(shop('black_market'))).toBe(true);
    expect(select.isMarket(shop('bar'))).toBe(false);
  });

  it('and turns up in a generated city', () => {
    // across a handful of seeds, because any one city may not roll one
    const found = [3, 9, 14, 21, 33].some(s => Object.values(mk(s).businesses).some(b => b.type === 'computer_store'));
    expect(found, 'five cities and not one computer store').toBe(true);
  });
});

describe('what is on its shelf', () => {
  const stock = select.marketStock(shop('computer_store'));

  it('is tech, and only tech', () => {
    expect(stock.length).toBeGreaterThan(0);
    for (const it of stock) expect(it.category, it.label).toBe('tech');
  });

  it('is all of it legal — the illegal tech stays in the back rooms', () => {
    for (const it of stock) expect(it.underCounter, it.label).toBeFalsy();
    // and there is genuinely something being withheld, or the rule is decorative
    expect(Object.values(ITEM_DEFS).some(it => it.category === 'tech' && it.underCounter)).toBe(true);
  });

  it('is deeper in its one kind than a pawn shop is in everything', () => {
    expect(stock.length).toBeGreaterThan(select.marketStock(shop('pawn')).length);
  });

  it('is the same shelf every time you walk in', () => {
    const again = select.marketStock(shop('computer_store'));
    expect(again.map(i => i.id)).toEqual(stock.map(i => i.id));
  });

  it('and two of them down the road are not the same shop', () => {
    const a = select.marketStock({ ...shop('computer_store'), id: 'b_cs_a' });
    const b = select.marketStock({ ...shop('computer_store'), id: 'b_cs_b' });
    expect(a.map(i => i.id)).not.toEqual(b.map(i => i.id));
  });

  it('never lists the same thing twice', () => {
    for (const id of ['b_cs_1', 'b_cs_2', 'b_cs_3', 'b_cs_4', 'b_cs_5']) {
      const s = select.marketStock({ ...shop('computer_store'), id }).map(i => i.id);
      expect(new Set(s).size, id).toBe(s.length);
    }
  });
});

describe('the back room keeps its edge', () => {
  it('carries tech a shop with a sign over the door will not', () => {
    const open = new Set(Object.values(ITEM_DEFS).filter(i => i.underCounter).map(i => i.id));
    expect([...open].some(id => ITEM_DEFS[id].category === 'tech')).toBe(true);
    for (const it of select.marketStock(shop('pawn'))) expect(open.has(it.id)).toBe(false);
  });
});

describe('the new tech, as tradeoffs rather than upgrades', () => {
  const NEW = ['signal_fob', 'hotspot', 'tower', 'skimmer'];

  it('each exists, is tech, and costs real money', () => {
    for (const id of NEW) {
      const it = ITEM_DEFS[id];
      expect(it, id).toBeDefined();
      expect(it.category, id).toBe('tech');
      expect(it.cost, id).toBeGreaterThan(0);
      expect(it.detail.length, id).toBeGreaterThan(40);
    }
  });

  it('every one of them gives something up somewhere', () => {
    // the house rule for this file: nothing is a flat upgrade. Either it hurts an approach or it
    // raises heat — an item that only ever helps is a balance bug, not a piece of kit.
    for (const id of NEW) {
      const m = ITEM_DEFS[id].mods;
      const downside = Object.values(m.approachBias ?? {}).some(v => v < 0) || (m.heatMult ?? 1) > 1;
      expect(downside, `${id} is a flat upgrade`).toBe(true);
    }
  });

  it('the tower is the most tech you can carry, and the worst thing to walk a job with', () => {
    const tech = (id: string) => ITEM_DEFS[id].mods.skillBoost?.tech ?? 0;
    const best = Object.keys(ITEM_DEFS).reduce((a, b) => tech(b) > tech(a) ? b : a);
    expect(best).toBe('tower');
    // and it pays for it: the biggest approach penalty of any piece of tech
    const loud = ITEM_DEFS.tower.mods.approachBias?.loud ?? 0;
    expect(loud).toBeLessThan(0);
    for (const id of Object.keys(ITEM_DEFS)) {
      if (ITEM_DEFS[id].category !== 'tech') continue;
      expect(ITEM_DEFS[id].mods.approachBias?.loud ?? 0, id).toBeGreaterThanOrEqual(loud);
    }
  });

  it('the skimmer is the one piece of tech that makes the law worse, which is why it is under the counter', () => {
    expect(ITEM_DEFS.skimmer.underCounter).toBe(true);
    expect(ITEM_DEFS.skimmer.mods.heatMult ?? 1).toBeGreaterThan(1);
    for (const id of Object.keys(ITEM_DEFS)) {
      const it = ITEM_DEFS[id];
      if (it.category !== 'tech' || it.underCounter) continue;
      expect(it.mods.heatMult ?? 1, `${id} raises heat but sits on an open shelf`).toBeLessThanOrEqual(1);
    }
  });

  it('and the kit actually reaches the odds, rather than being a number on a page', () => {
    const w = mk();
    w.player.items = ['tower']; w.player.equipped = [];
    const bare = select.kitSkillBoost(w).tech ?? 0;
    w.player.equipped = ['tower'];
    expect((select.kitSkillBoost(w).tech ?? 0) - bare).toBe(ITEM_DEFS.tower.mods.skillBoost!.tech);
  });
});
