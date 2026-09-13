import { describe, expect, it } from 'vitest';
import { BACKGROUND_DEFS, CUSTOM_BUDGET, CUSTOM_SKILL_MAX, SKILL_ORDER, TECH_START_RECIPES, WHEELS_BONUS_LEGWORK, spent } from '@content/backgrounds';
import { RECIPES } from '@content/rackets';
import { CUSTOM_SKILL_MIN, START_TRAITS, legalCustomSkills } from '@content/backgrounds';
import { generateWorld, startingSkills } from './generate';
import { PLAYER } from './types';
import { legworkFor } from './travel';
import type { Player, Skills, StartTraitId } from './types';

const mk = (background: Player['background'], seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background, seed });
const mkCustom = (custom: { skills: Partial<Skills>; trait: StartTraitId }, seed = 5) =>
  generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'custom', custom, seed });

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

describe('building your own', () => {
  const even = { muscle: 4, brains: 4, charm: 4, wheels: 4, tech: 3 };

  it('takes a legal spread exactly as given', () => {
    expect(spent(even)).toBe(CUSTOM_BUDGET);
    expect(legalCustomSkills(even)).toEqual(even);
    expect(mkCustom({ skills: even, trait: 'earner' }).player.skills).toEqual(even);
  });

  it('cannot out-total or out-spike a preset, however the UI is cheated', () => {
    const cheat = legalCustomSkills({ muscle: 99, brains: 99, charm: 99, wheels: 99, tech: 99 });
    expect(spent(cheat)).toBeLessThanOrEqual(CUSTOM_BUDGET);
    for (const k of SKILL_ORDER) { expect(cheat[k]).toBeLessThanOrEqual(CUSTOM_SKILL_MAX); expect(cheat[k]).toBeGreaterThanOrEqual(CUSTOM_SKILL_MIN); }
    const w = mkCustom({ skills: { muscle: 40, brains: 40, charm: 40, wheels: 40, tech: 40 }, trait: 'earner' });
    expect(spent(w.player.skills)).toBeLessThanOrEqual(CUSTOM_BUDGET);
    expect(Math.max(...SKILL_ORDER.map(k => w.player.skills[k]))).toBeLessThan(8);
    // and it is worse on points than every preset, which is what pays for the trait
    for (const b of BACKGROUND_DEFS) expect(spent(w.player.skills)).toBeLessThan(spent(b.skills));
  });

  it('fills a short or empty spread up to the floor rather than breaking', () => {
    const thin = legalCustomSkills({ muscle: 2 });
    for (const k of SKILL_ORDER) expect(thin[k]).toBeGreaterThanOrEqual(CUSTOM_SKILL_MIN);
    expect(spent(thin)).toBeLessThanOrEqual(CUSTOM_BUDGET);
    expect(spent(startingSkills('custom', undefined))).toBeLessThanOrEqual(CUSTOM_BUDGET);
  });

  it('gives legwork from the wheels they bought, without the wheels perk', () => {
    const w = mkCustom({ skills: { ...even, wheels: 7, tech: 1, charm: 3 }, trait: 'earner' });
    expect(w.player.legworkMax).toBe(legworkFor(w.player.skills.wheels));
  });

  it('applies each starting trait, and only that trait', () => {
    const plain = mkCustom({ skills: even, trait: 'earner' });
    expect(plain.player.startTrait).toBe('earner');
    expect(plain.player.cash).toBe(2500 + 2500);

    const local = mkCustom({ skills: even, trait: 'local' });
    expect(local.blocks[local.player.homeBlockId].influence[PLAYER]).toBeGreaterThan(plain.blocks[plain.player.homeBlockId].influence[PLAYER]);
    expect(local.player.respect).toBeGreaterThan(plain.player.respect);
    expect(local.player.cash).toBe(2500);

    const feared = mkCustom({ skills: even, trait: 'feared' });
    expect(feared.player.fear).toBeGreaterThan(plain.player.fear);
    const ownersFear = (w: typeof feared) => w.blocks[w.player.homeBlockId].businessIds.reduce((t, id) => t + w.npcs[w.businesses[id].ownerId].rel.fear, 0);
    expect(ownersFear(feared)).toBeGreaterThan(ownersFear(plain));

    const connected = mkCustom({ skills: even, trait: 'connected' });
    const warm = (w: typeof connected) => w.blocks[w.player.homeBlockId].businessIds.flatMap(id => w.businesses[id].patronIds).filter(id => w.npcs[id].rel.trust >= 45).length;
    expect(warm(connected)).toBeGreaterThan(warm(plain));
  });

  it('offers a small, described list of traits', () => {
    expect(START_TRAITS.length).toBeGreaterThanOrEqual(3);
    expect(START_TRAITS.length).toBeLessThanOrEqual(6);
    expect(new Set(START_TRAITS.map(t => t.id)).size).toBe(START_TRAITS.length);
    for (const t of START_TRAITS) expect(t.detail.length, t.id).toBeGreaterThan(60);
  });

  it('leaves a preset player with no starting trait', () => {
    expect(mk('muscle').player.startTrait).toBeUndefined();
  });
});
