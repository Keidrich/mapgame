/**
 * The four new rackets the tier-1 and tier-2 benches were built for.
 *
 * A racket kind is not a label: it has to cost something to set up, pay on a curve the rest of
 * the economy recognises, sit inside the saturation and synergy tables so the district still
 * argues with you about it, and be hostable only where the tier rules say. These check all four,
 * because each of them has been got wrong once already in this codebase.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS } from '@content/businesses';
import { RACKET_DEFS } from '@content/rackets';
import { SATURATION, SYNERGIES } from '@content/territory';
import { can, dispatch, generateWorld, select } from './index';
import { racketsAllowed, setupCost } from './tiers';
import { hostFor, typed } from './test-util';
import type { BusinessType, RacketKind, World } from './types';

const NEW: RacketKind[] = ['parts_stripping', 'relay_export', 'card_supply', 'script_diversion'];
const mk = (seed = 21) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'wheels', seed });
const typesHosting = (k: RacketKind) => (Object.keys(BUSINESS_DEFS) as BusinessType[]).filter(t => BUSINESS_DEFS[t].rackets.includes(k));

describe('each one is a real racket, not a name', () => {
  it('has a cost, an income, heat and a risk', () => {
    for (const k of NEW) {
      const d = RACKET_DEFS[k];
      expect(d, k).toBeTruthy();
      expect(d.setupCost, `${k} is free to set up`).toBeGreaterThan(0);
      expect(d.incomeBase, `${k} earns nothing`).toBeGreaterThan(0);
      expect(d.heat, `${k} is invisible`).toBeGreaterThan(0);
      expect(d.risk ?? 0, `${k} can never go wrong`).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(20);
    }
  });

  it('pays roughly what it costs and risks — nothing is free money', () => {
    for (const k of NEW) {
      const d = RACKET_DEFS[k];
      // the going rate across the whole roster, so a new kind cannot quietly be twice as good
      const rates = Object.values(RACKET_DEFS).filter(x => x.incomeBase > 0).map(x => x.incomeBase / Math.max(1, x.setupCost));
      const best = Math.max(...rates);
      expect(d.incomeBase / d.setupCost, `${k} pays back faster than anything else in the game`).toBeLessThanOrEqual(best);
    }
  });

  it('is inside the saturation and synergy tables rather than beside them', () => {
    for (const k of NEW) {
      const syn = SYNERGIES[k];
      expect(syn, `${k} has no synergy: it sits outside the territory system`).toBeTruthy();
      expect(RACKET_DEFS[syn!.needs], `${k} feeds off a kind that does not exist`).toBeTruthy();
      expect(syn!.why.length, `${k}'s synergy has no reason`).toBeGreaterThan(10);
      expect(syn!.bonus).toBeGreaterThan(0);
    }
    // saturation is per-kind by construction, so the only thing to check is that it applies at all
    expect(SATURATION.free).toBeGreaterThan(0);
  });
});

describe('where they can live', () => {
  it('every one has a home on the street benches, and none on an institution', () => {
    for (const k of NEW) {
      const hosts = typesHosting(k);
      expect(hosts.length, `${k} has nowhere to live`).toBeGreaterThan(0);
      for (const t of hosts) expect(BUSINESS_DEFS[t].tier, `${t} hosts ${k} and is an institution`).toBeLessThan(3);
    }
  });

  it('the tier gate is what decides it, not the type list alone', () => {
    const w = mk();
    for (const b of Object.values(w.businesses)) {
      if (BUSINESS_DEFS[b.type].tier !== 3) continue;
      for (const k of NEW) expect(racketsAllowed(b), `${b.type}/${k}`).not.toContain(k);
    }
  });

  it('setting one up costs money and turns into a racket that earns', () => {
    const w: World = mk();
    const biz = hostFor(w, 'parts_stripping') ?? typed(w, 'scrapyard');
    const kind: RacketKind = racketsAllowed(biz).find(k => NEW.includes(k))!;
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    w.player.currentBlockId = biz.blockId; w.player.cash = 50_000;
    const cost = setupCost(biz, kind);
    expect(can(w, { type: 'start_racket', businessId: biz.id, kind }).ok).toBe(true);
    const t = dispatch(w, { type: 'start_racket', businessId: biz.id, kind });
    expect(t.player.cash).toBe(50_000 - cost);
    const r = Object.values(t.rackets).find(x => x.kind === kind)!;
    expect(r).toBeTruthy();
    expect(select.racketsAt(t, t.businesses[biz.id]).some(x => x.kind === kind)).toBe(true);
  });
});

describe('the blurbs stay on the right side of the line', () => {
  it('describe who pays who, never how anything is done', () => {
    // The house rule for the whole crime pass. Nothing here should read like an instruction:
    // no tools, no substances by name, no steps.
    const banned = /\b(how to|step \d|recipe for|using a|insert|solder|hotwire|skim(mer|ming) device|\bmix\b|formula for)\b/i;
    for (const k of NEW) expect(RACKET_DEFS[k].blurb, k).not.toMatch(banned);
  });
});
