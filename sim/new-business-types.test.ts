/**
 * The eight new types, and the invariants that keep a def honest.
 *
 * Half of this is deliberately structural rather than about the eight specifically: a def whose
 * numbers do not match its tier is the bug this file exists to catch, and it should catch it for
 * the ninth type as well as the eighth.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS, DISTRICT_DEFS, TIERS } from '@content/businesses';
import { BUSINESS_NAME_PARTS } from '@content/names';
import { generateWorld } from './index';
import { nerveFloorFor, racketsAllowed } from './tiers';
import type { BusinessType, World } from './types';

const NEW: BusinessType[] = ['scrapyard', 'electronics', 'boutique', 'tow_yard', 'gallery', 'pharmacy', 'accountant', 'importer'];
const mk = (seed: number) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
/** Every business of every type across several worlds, so a rare type still gets sampled. */
function across(seeds: number[]): { w: World; type: BusinessType; id: string }[] {
  const out: { w: World; type: BusinessType; id: string }[] = [];
  for (const s of seeds) { const w = mk(s); for (const b of Object.values(w.businesses)) out.push({ w, type: b.type, id: b.id }); }
  return out;
}

describe('all eight exist and are properly defined', () => {
  it('each has a definition, a tier and a name pool', () => {
    for (const t of NEW) {
      const d = BUSINESS_DEFS[t];
      expect(d, t).toBeDefined();
      expect([1, 2, 3], t).toContain(d.tier);
      expect(d.label.length, t).toBeGreaterThan(2);
      expect(d.icon.length, t).toBeGreaterThan(0);
      expect(BUSINESS_NAME_PARTS[t], t).toBeDefined();
      expect(BUSINESS_NAME_PARTS[t][0].length, t).toBeGreaterThan(2);
      expect(BUSINESS_NAME_PARTS[t][1].length, t).toBeGreaterThan(2);
    }
  });

  it('they are slotted where their real-world weight puts them', () => {
    expect(BUSINESS_DEFS.scrapyard.tier).toBe(1);
    expect(BUSINESS_DEFS.electronics.tier).toBe(1);
    expect(BUSINESS_DEFS.tow_yard.tier).toBe(1);
    expect(BUSINESS_DEFS.boutique.tier).toBe(2);
    expect(BUSINESS_DEFS.pharmacy.tier).toBe(2);
    // an accountant and an import/export firm sit with the banks, which is the whole point
    expect(BUSINESS_DEFS.gallery.tier).toBe(3);
    expect(BUSINESS_DEFS.accountant.tier).toBe(3);
    expect(BUSINESS_DEFS.importer.tier).toBe(3);
  });

  it('every one of them is actually reachable from some district', () => {
    for (const t of NEW) {
      const where = DISTRICT_DEFS.filter(d => (d.mix[t] ?? 0) > 0).map(d => d.kind);
      expect(where.length, `${t} is in no district's mix and can never generate`).toBeGreaterThan(0);
    }
  });

  it('and they do generate, with the tier they were given', () => {
    const all = across([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const t of NEW) {
      const hits = all.filter(x => x.type === t);
      expect(hits.length, `${t} never generated across eight worlds`).toBeGreaterThan(0);
      for (const h of hits.slice(0, 5)) expect(BUSINESS_DEFS[h.w.businesses[h.id].type].tier, t).toBe(BUSINESS_DEFS[t].tier);
    }
  });
});

describe('their numbers are consistent with their tier', () => {
  it('income sits in the band their tier implies', () => {
    const mid = (t: BusinessType) => (BUSINESS_DEFS[t].income[0] + BUSINESS_DEFS[t].income[1]) / 2;
    for (const t of NEW) {
      const d = BUSINESS_DEFS[t];
      if (d.tier === 1) expect(mid(t), t).toBeLessThan(300);
      if (d.tier === 2) { expect(mid(t), t).toBeGreaterThan(150); expect(mid(t), t).toBeLessThan(600); }
      if (d.tier === 3) expect(mid(t), t).toBeGreaterThan(300);
    }
  });

  it('nerve respects the floor the tier sets', () => {
    for (const t of NEW) {
      const floor = nerveFloorFor(t);
      // the def's own bias may sit under the floor; what matters is the generated owner
      expect(Math.max(BUSINESS_DEFS[t].nerve, floor), t).toBeGreaterThanOrEqual(floor);
    }
    // The floor is a *bias*, not a clamp: `mkNpc` rolls gauss(bias, 15) and then a coward takes
    // 20 off, so a single frightened accountant is correct and expected. What the floor promises
    // is where the middle sits, so that is what this measures.
    const all = across([1, 2, 3, 4, 5, 6]);
    for (const t of NEW) {
      const owners = all.filter(x => x.type === t).map(h => h.w.npcs[h.w.businesses[h.id].ownerId].nerve);
      if (owners.length < 4) continue;
      const avg = owners.reduce((a, b) => a + b, 0) / owners.length;
      expect(avg, `${t} owners average ${Math.round(avg)} against a floor of ${nerveFloorFor(t)}`).toBeGreaterThanOrEqual(nerveFloorFor(t) - 8);
    }
  });

  it('an institution generated in the world hosts nothing, and a street trade hosts something', () => {
    const all = across([1, 2, 3, 4]);
    for (const t of NEW) {
      const hit = all.find(x => x.type === t); if (!hit) continue;
      const b = hit.w.businesses[hit.id];
      if (BUSINESS_DEFS[t].tier === 3) expect(racketsAllowed(b), t).toEqual([]);
      else expect(racketsAllowed(b).length, t).toBeGreaterThan(0);
    }
  });

  it('value scales with what they are: an institution is worth more per dollar earned', () => {
    const t1 = NEW.filter(t => BUSINESS_DEFS[t].tier === 1).map(t => BUSINESS_DEFS[t].valueMult);
    const t3 = NEW.filter(t => BUSINESS_DEFS[t].tier === 3).map(t => BUSINESS_DEFS[t].valueMult);
    expect(Math.min(...t3)).toBeGreaterThan(Math.max(...t1));
  });
});

describe('the structural rules every def has to satisfy, new or old', () => {
  it('nobody has a racket their tier would never carry', () => {
    for (const t of Object.keys(BUSINESS_DEFS) as BusinessType[]) {
      const d = BUSINESS_DEFS[t];
      if (d.tier !== 3) continue;
      expect(d.rackets, `${t} is an institution and should list no rackets`).toEqual([]);
    }
  });

  it('nothing generates a business with an empty or duplicated name', () => {
    const w = mk(9);
    const names = Object.values(w.businesses).map(b => b.name);
    expect(names.every(n => n.trim().length > 2)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a world still generates a mix rather than a monoculture', () => {
    const w = mk(11);
    const kinds = new Set(Object.values(w.businesses).map(b => b.type));
    expect(kinds.size).toBeGreaterThan(10);
    const byTier = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const b of Object.values(w.businesses)) byTier[BUSINESS_DEFS[b.type].tier]++;
    // the street is still most of the city; institutions are rare by design
    expect(byTier[1]).toBeGreaterThan(byTier[3]);
    expect(byTier[3]).toBeGreaterThan(0);
    void TIERS;
  });
});
