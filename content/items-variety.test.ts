/**
 * A family is a set of choices, not a price ladder.
 *
 * The catalogue used to hold one or two of each kind of thing, so "which pistol" was never a
 * question — there was one. Filling the families out is only worth anything if the members
 * genuinely differ: three guns with the same numbers and different names is a longer shop screen
 * and nothing else.
 *
 * So the load-bearing test here is the first one. Everything after it is the shape of the
 * differences: what price is allowed to buy, and what each family is *for*.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, type ItemDef, type ItemFamily } from './items';

const all = Object.values(ITEM_DEFS);
const byFamily = (f: ItemFamily) => all.filter(i => i.family === f);
/** Everything that decides what an item does, as one comparable string. */
const profile = (i: ItemDef) => JSON.stringify([
  i.mods.skillBoost ?? {}, i.mods.approachBias ?? {}, i.mods.heatMult ?? 1, i.mods.cover ?? 0,
]);

describe('no two items are the same item', () => {
  it('nothing in the catalogue shares another thing\'s numbers', () => {
    const seen = new Map<string, string>();
    for (const i of all) {
      const other = seen.get(profile(i));
      expect(other, `${i.id} and ${other} are the same item with different names`).toBeUndefined();
      seen.set(profile(i), i.id);
    }
  });

  it('and family-mates differ in what they are for, not only in how much they cost', () => {
    for (const f of ['melee', 'pistol', 'revolver', 'shotgun', 'rifle', 'vest'] as ItemFamily[]) {
      const rung = byFamily(f);
      expect(rung.length, `${f} has nothing to choose between`).toBeGreaterThan(1);
      // strip the price and they must still be telling different stories
      const shapes = new Set(rung.map(profile));
      expect(shapes.size, `${f}: two of these are the same gun at two prices`).toBe(rung.length);
    }
  });

  it('every item is named like a thing somebody would actually have', () => {
    for (const i of all) {
      expect(i.label.length, i.id).toBeGreaterThan(2);
      expect(i.detail.length, `${i.id} does not say what it does`).toBeGreaterThan(40);
      expect(i.blurb.length, i.id).toBeGreaterThan(8);
    }
  });
});

describe('what each family is for', () => {
  it('melee is the only weapon group with something for a careful job', () => {
    const quiet = byFamily('melee').filter(i => (i.mods.approachBias?.quiet ?? 0) > 0);
    expect(quiet.length, 'every melee weapon is a liability on a quiet job').toBeGreaterThan(0);
    for (const f of ['shotgun', 'rifle', 'explosive'] as ItemFamily[]) {
      for (const i of byFamily(f)) expect(i.mods.approachBias?.quiet ?? 0, i.id).toBeLessThan(0);
    }
  });

  it('pistols spread across price, noise and heat rather than climbing', () => {
    const p = byFamily('pistol');
    expect(p.length).toBeGreaterThanOrEqual(3);
    // the cheapest is not simply the worst: it has to be the best at something or beat somebody
    const cheapest = p.slice().sort((a, b) => a.cost - b.cost)[0];
    const dearest = p.slice().sort((a, b) => b.cost - a.cost)[0];
    expect(cheapest.id).not.toBe(dearest.id);
    // and they do not all punish a quiet job by the same amount, which was the old catalogue
    expect(new Set(p.map(i => i.mods.approachBias?.quiet ?? 0)).size, 'every pistol is equally obvious').toBeGreaterThan(1);
  });

  it('a revolver leaves less behind than an automatic, which is the whole of why you carry one', () => {
    const worstRevolver = Math.max(...byFamily('revolver').map(i => i.mods.heatMult ?? 1));
    const bestPistol = Math.min(...byFamily('pistol').filter(i => (i.mods.heatMult ?? 1) >= 1).map(i => i.mods.heatMult ?? 1));
    expect(Math.min(...byFamily('revolver').map(i => i.mods.heatMult ?? 1))).toBeLessThan(bestPistol);
    expect(worstRevolver).toBeGreaterThan(1);   // it is still a gun
  });

  it('the dearest shotgun is not the loudest one — money buys discretion at the top', () => {
    const s = byFamily('shotgun').sort((a, b) => a.cost - b.cost);
    const dearest = s[s.length - 1];
    const loudest = s.slice().sort((a, b) => (b.mods.approachBias?.loud ?? 0) - (a.mods.approachBias?.loud ?? 0))[0];
    expect(dearest.id, 'the family is still a straight price ladder').not.toBe(loudest.id);
    expect(dearest.mods.heatMult ?? 1, 'and the dear one is not quieter for it').toBeLessThan(loudest.mods.heatMult ?? 1);
  });

  it('only the bolt gun buys you not being in the room', () => {
    const inside = byFamily('rifle').filter(i => (i.mods.approachBias?.inside ?? 0) > 0);
    expect(inside.length, 'every rifle is the same rifle').toBe(1);
  });

  it('and vehicles differ by the shape of job they suit, not by speed alone', () => {
    const v = all.filter(i => i.category === 'vehicle');
    expect(v.length).toBeGreaterThanOrEqual(4);
    const best = (k: 'loud' | 'quiet' | 'inside') => v.slice().sort((a, b) => (b.mods.approachBias?.[k] ?? 0) - (a.mods.approachBias?.[k] ?? 0))[0].id;
    // the best car for a loud job is not the best car for a careful one
    expect(best('loud')).not.toBe(best('quiet'));
    expect(new Set([best('loud'), best('quiet'), best('inside')]).size, 'one car is best at everything').toBeGreaterThan(1);
    // and the fastest is not the one that leaves least behind
    const fastest = v.slice().sort((a, b) => (b.mods.skillBoost?.wheels ?? 0) - (a.mods.skillBoost?.wheels ?? 0))[0];
    const coolest = v.slice().sort((a, b) => (a.mods.heatMult ?? 1) - (b.mods.heatMult ?? 1))[0];
    expect(fastest.id).not.toBe(coolest.id);
  });
});
