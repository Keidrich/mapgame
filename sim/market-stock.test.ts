/**
 * A shop's shelf, against a catalogue that just tripled.
 *
 * `marketStock` derives its stock from the business id — a stable slice, so a shop's shelf is its
 * own, never changes under the player, and costs nothing in the save. That arithmetic had never
 * been asked to deal with more than fifteen items, and the interesting failure is silent: a stride
 * that lands on the same index twice gives a shop a two-line shelf and nobody notices, because a
 * short shelf looks like a small shop.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '@content/items';
import { isMarket, marketStock } from './items';
import type { Business } from './types';

const SHOPS = ['pawn', 'computer_store', 'black_market'] as const;
const shop = (type: Business['type'], id: string): Business =>
  ({ id, type, blockId: 'k1', ownerId: 'n1', patronIds: [], racketIds: [], ownedBy: 'npc' } as unknown as Business);
/** Enough ids to stand in for a city's worth of shops. */
const ids = Array.from({ length: 60 }, (_, i) => `b_shop_${i}`);

describe('the catalogue got much bigger and the shelves still work', () => {
  it('there is genuinely more to stock than there was', () => {
    expect(Object.keys(ITEM_DEFS).length, 'the expansion did not happen').toBeGreaterThan(25);
  });

  it('every shop of every kind gets a full shelf, never a short one', () => {
    for (const type of SHOPS) {
      for (const id of ids) {
        const stock = marketStock(shop(type, id));
        expect(stock.length, `${type} ${id} has an empty shelf`).toBeGreaterThan(0);
        // the slice asks for a fixed number of lines; a collision would silently return fewer
        const first = marketStock(shop(type, ids[0])).length;
        expect(stock.length, `${type} ${id} came up short`).toBe(first);
      }
    }
  });

  it('and never lists the same thing twice on one shelf', () => {
    for (const type of SHOPS) {
      for (const id of ids) {
        const stock = marketStock(shop(type, id)).map(i => i.id);
        expect(new Set(stock).size, `${type} ${id}`).toBe(stock.length);
      }
    }
  });

  it('a shelf is the same shelf every time you walk in', () => {
    for (const type of SHOPS) {
      const once = marketStock(shop(type, 'b_steady')).map(i => i.id);
      const twice = marketStock(shop(type, 'b_steady')).map(i => i.id);
      expect(twice).toEqual(once);
    }
  });

  it('and two shops of a kind are not the same shop', () => {
    for (const type of SHOPS) {
      const shelves = new Set(ids.map(id => marketStock(shop(type, id)).map(i => i.id).join(',')));
      expect(shelves.size, `every ${type} in the city stocks the same thing`).toBeGreaterThan(3);
    }
  });
});

describe('the bigger pool did not break what each shop is', () => {
  it('a computer store is still tech only, and still all of it legal', () => {
    for (const id of ids.slice(0, 20)) {
      for (const i of marketStock(shop('computer_store', id))) {
        expect(i.category, i.label).toBe('tech');
        expect(i.underCounter, i.label).toBeFalsy();
      }
    }
  });

  it('a pawn shop shows nothing from under the counter, armour and cars included', () => {
    for (const id of ids.slice(0, 20)) {
      for (const i of marketStock(shop('pawn', id))) expect(i.underCounter, i.label).toBeFalsy();
    }
  });

  it('and a back room reaches things no shop with a sign will touch', () => {
    const reached = new Set(ids.flatMap(id => marketStock(shop('black_market', id)).map(i => i.id)));
    const hidden = Object.values(ITEM_DEFS).filter(i => i.underCounter).map(i => i.id);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.some(id => reached.has(id)), 'the back rooms never stock the illegal half').toBe(true);
  });

  it('between them the shops of a city reach most of the catalogue', () => {
    // A range this size is no use if half of it is unreachable: with sixty shops of three kinds,
    // most of what is written down should be buyable somewhere.
    const reached = new Set(SHOPS.flatMap(type => ids.flatMap(id => marketStock(shop(type, id)).map(i => i.id))));
    expect(reached.size / Object.keys(ITEM_DEFS).length).toBeGreaterThan(0.8);
  });

  it('and only a market has a shelf at all', () => {
    expect(isMarket(shop('bar', 'b1'))).toBe(false);
    expect(marketStock(shop('bar', 'b1'))).toEqual([]);
  });
});
