/**
 * Recipes as identity, not a quality slider.
 *
 * Before this there were two recipes per production kind, and both moved the same two numbers in
 * opposite directions — quality up, output down, or the reverse. There was one decision and it
 * was the same decision every time. Now every kind has five, each of them a thing you are
 * actually making, and a third axis: how loud the method is. A slow quiet method is a real
 * choice when the police are already looking at you.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTION_DEFS, RECIPES, recipesOfKind, qualityMult } from '@content/rackets';
import type { ProductionKind } from '@sim/types';

const KINDS: ProductionKind[] = ['still', 'grow_op', 'lab', 'print_shop', 'cut_house'];

describe('every production kind has a real menu', () => {
  it('at least four recipes each, all naming a distinct thing', () => {
    for (const kind of KINDS) {
      const ids = recipesOfKind(kind);
      expect(ids.length, `${kind} has only ${ids.length}`).toBeGreaterThanOrEqual(4);
      const labels = ids.map(id => RECIPES[id].label);
      expect(new Set(labels).size, `${kind} has duplicate names`).toBe(labels.length);
      for (const id of ids) {
        expect(RECIPES[id].blurb.length, `${id} has no description`).toBeGreaterThan(20);
        expect(RECIPES[id].label, `${id} reads like a setting, not a thing`).not.toMatch(/^(high|low|fast|slow) /i);
      }
    }
  });

  it('every recipe belongs to exactly one kind, and every kind is covered', () => {
    const covered = new Set(Object.values(RECIPES).map(r => r.kind));
    for (const kind of KINDS) expect(covered.has(kind), `nothing to make in a ${kind}`).toBe(true);
    for (const [id, r] of Object.entries(RECIPES)) expect(KINDS, id).toContain(r.kind);
  });

  it('names the product the kind actually makes, so identity can reach the stash', () => {
    for (const kind of KINDS) {
      expect(PRODUCTION_DEFS[kind].product, `${kind} makes nothing`).toBeTruthy();
      expect(recipesOfKind(kind).length).toBeGreaterThan(0);
    }
  });
});

describe('the quality / output axis still works', () => {
  it('each kind offers both a premium and a volume option', () => {
    for (const kind of KINDS) {
      const rs = recipesOfKind(kind).map(id => RECIPES[id]);
      expect(rs.some(r => r.quality >= 15 && r.output <= 1), `${kind} has nothing premium`).toBe(true);
      expect(rs.some(r => r.output >= 1.3), `${kind} has nothing high-volume`).toBe(true);
    }
  });

  it('and they genuinely trade off — nothing is better at everything', () => {
    for (const kind of KINDS) {
      const rs = recipesOfKind(kind).map(id => ({ id, ...RECIPES[id] }));
      for (const a of rs) {
        const dominated = rs.some(b => b.id !== a.id
          && b.quality >= a.quality && b.output >= a.output && b.heat <= a.heat && b.risk <= a.risk
          && (b.quality > a.quality || b.output > a.output || b.heat < a.heat || b.risk < a.risk));
        expect(dominated, `${a.id} is strictly worse than another recipe — nobody would ever pick it`).toBe(false);
      }
    }
  });
});

describe('the new heat / risk axis', () => {
  it('every kind has a genuinely quiet method and a genuinely loud one', () => {
    for (const kind of KINDS) {
      const rs = recipesOfKind(kind).map(id => RECIPES[id]);
      expect(rs.some(r => r.heat < 0.85 && r.risk < 0.9), `${kind} has no quiet way to work`).toBe(true);
      expect(rs.some(r => r.heat > 1.3 || r.risk > 1.3), `${kind} has no dangerous way to work`).toBe(true);
    }
  });

  it('the quiet ones cost something for it, or they would just be better', () => {
    for (const kind of KINDS) {
      const rs = recipesOfKind(kind).map(id => ({ id, ...RECIPES[id] }));
      const quiet = rs.filter(r => r.heat < 0.85);
      for (const q of quiet) {
        const loudest = rs.reduce((a, b) => (b.output > a.output ? b : a));
        expect(q.output, `${q.id} is quiet and also the highest volume`).toBeLessThan(loudest.output);
      }
    }
  });

  it('heat and risk are multipliers around 1, so an unset recipe is the neutral case', () => {
    for (const r of Object.values(RECIPES)) {
      expect(r.heat).toBeGreaterThan(0);
      expect(r.risk).toBeGreaterThan(0);
      expect(r.heat).toBeLessThan(2.5);
      expect(r.risk).toBeLessThan(2.5);
      expect(r.output).toBeGreaterThan(0.5);
    }
  });
});

describe('the axes are independent', () => {
  it('quality does not simply predict how quiet it is', () => {
    // if every high-quality recipe were also the quiet one there would still be only one
    // decision, just wearing three numbers
    const rs = Object.values(RECIPES);
    const premiumLoud = rs.some(r => r.quality >= 15 && r.heat >= 1);
    const cheapQuiet = rs.some(r => r.quality <= 5 && r.heat <= 0.95);
    expect(premiumLoud || cheapQuiet, 'quality and noise move together everywhere').toBe(true);
  });

  it('a unit of the best is worth meaningfully more than a unit of the worst', () => {
    const best = Math.max(...Object.values(RECIPES).map(r => r.quality));
    const worst = Math.min(...Object.values(RECIPES).map(r => r.quality));
    expect(qualityMult(50 + best)).toBeGreaterThan(qualityMult(50 + worst) * 1.2);
  });
});
