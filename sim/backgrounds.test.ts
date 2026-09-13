import { describe, expect, it } from 'vitest';
import { BACKGROUND_DEFS, CUSTOM_BUDGET, CUSTOM_SKILL_MAX, SKILL_ORDER, TECH_START_RECIPES, WHEELS_BONUS_LEGWORK, spent } from '@content/backgrounds';
import { RECIPES } from '@content/rackets';
import { generateWorld, startingSkills } from './generate';
import { legworkFor } from './travel';
import type { Player } from './types';

const mk = (background: Player['background'], seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background, seed });

describe('the five backgrounds', () => {
  it('covers all five skills, one each', () => {
    expect(BACKGROUND_DEFS.map(b => b.id)).toEqual(['muscle', 'brains', 'charm', 'wheels', 'tech']);
    for (const b of BACKGROUND_DEFS) {
      expect(b.skills[b.id as keyof typeof b.skills], b.id).toBe(8);
      expect(b.detail.length, b.id).toBeGreaterThan(80); // every one says what it actually does
      expect(b.blurb.length, b.id).toBeGreaterThan(10);
    }
  });

  it('keeps the presets within a point of each other, so none is simply better', () => {
    const totals = BACKGROUND_DEFS.map(b => spent(b.skills));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(2);
    expect(Math.min(...totals)).toBeGreaterThan(CUSTOM_BUDGET); // and every one beats point-buy on raw points
  });

  it('hands the player the right skills', () => {
    for (const b of BACKGROUND_DEFS) expect(startingSkills(b.id)).toEqual(b.skills);
    expect(mk('wheels').player.skills.wheels).toBe(8);
    expect(mk('tech').player.skills.tech).toBe(8);
  });

  it('gives wheels extra legwork on top of the skill', () => {
    const w = mk('wheels');
    expect(w.player.legworkMax).toBe(legworkFor(8) + WHEELS_BONUS_LEGWORK);
    expect(w.player.legwork).toBe(w.player.legworkMax);
    expect(mk('muscle').player.legworkMax).toBe(legworkFor(3)); // nobody else gets it
  });

  it('gives tech a recipe it can actually use on day one', () => {
    for (const seed of [1, 2, 3, 7]) {
      const w = mk('tech', seed);
      expect(w.player.recipes?.length).toBe(1);
      const id = w.player.recipes![0];
      expect(TECH_START_RECIPES).toContain(id);
      expect(['still', 'grow_op']).toContain(RECIPES[id].kind);
      expect(w.log.some(l => l.text.includes(RECIPES[id].label))).toBe(true);
    }
    expect(mk('muscle').player.recipes ?? []).toEqual([]);
  });

  it('leaves the old three exactly as they were', () => {
    expect(startingSkills('muscle')).toEqual({ muscle: 8, brains: 4, charm: 4, wheels: 3, tech: 2 });
    expect(startingSkills('brains')).toEqual({ muscle: 4, brains: 8, charm: 4, wheels: 3, tech: 4 });
    expect(startingSkills('charm')).toEqual({ muscle: 4, brains: 4, charm: 8, wheels: 3, tech: 2 });
  });

  it('never spikes point-buy as high as a preset', () => {
    expect(CUSTOM_SKILL_MAX).toBeLessThan(8);
    expect(SKILL_ORDER.length).toBe(5);
  });
});
