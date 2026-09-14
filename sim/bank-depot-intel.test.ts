/**
 * The two buildings that did nothing.
 *
 * `bank` and `armored_depot` ship with `income: [0,0]`, `valueMult: 0`, `rackets: []` — pure
 * heist targets, inert on every other day. Nobody extorts a bank teller for protection money, so
 * the answer is not a racket bolted onto them: it is the wire. Get inside somebody who works
 * there and what they know is the thing worth having — a standing skim out of a bank, a route
 * and a rota out of a depot.
 *
 * It reuses the per-target unlock the wire already had (`Npc.ratted`), not a new mechanism.
 */
import { describe, expect, it } from 'vitest';
import { INTEL, ROUTE, SKIM } from '@content/intel';
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_DEFS } from '@content/rackets';
import { dispatch, generateWorld, select, type Business, type Npc, type World } from './index';
import { endIntel, intelSourceFor, openIntel, routeDiscount, skimRisk, skimTake, tickIntel } from './intel';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed }); w.pendingEvents = []; return w; };

/** Somebody who works at a building of the given type, making one if the city lacks it. */
function employee(w: World, type: 'bank' | 'armored_depot'): { n: Npc; biz: Business } {
  let biz = Object.values(w.businesses).find(b => b.type === type);
  if (!biz) { biz = Object.values(w.businesses)[0]; biz.type = type; }
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.intel)!;
  n.favouriteBusinessIds = [biz.id];
  return { n, biz };
}

describe('the buildings themselves are still inert by design', () => {
  it('neither has income, value or a racket — the fix is not a racket', () => {
    for (const type of ['bank', 'armored_depot'] as const) {
      const def = BUSINESS_DEFS[type];
      expect(def.income).toEqual([0, 0]);
      expect(def.valueMult).toBe(0);
      expect(def.rackets).toEqual([]);
    }
  });
});

describe('getting inside somebody who works there', () => {
  it('a bank employee yields a skim, a depot employee a route', () => {
    for (const [type, kind] of [['bank', 'skim'], ['armored_depot', 'route']] as const) {
      const w = mk();
      const { n, biz } = employee(w, type);
      expect(intelSourceFor(w, n)?.kind).toBe(kind);
      expect(openIntel(w, n, new Rng(1))).toBe(kind);
      expect(n.intel?.kind).toBe(kind);
      expect(n.intel?.businessId).toBe(biz.id);
    }
  });

  it('somebody who works nowhere interesting yields nothing', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.favouriteBusinessIds.every(id => !['bank', 'armored_depot'].includes(w.businesses[id]?.type)))!;
    expect(intelSourceFor(w, n)).toBeUndefined();
    expect(openIntel(w, n, new Rng(1))).toBeUndefined();
  });

  it('opens off a real rat, through the per-target unlock the wire already had', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    n.known = true;
    w.player.skills.tech = 10; w.player.skills.brains = 10;
    const planned = dispatch(w, { type: 'plan_op', kind: 'rat', crewIds: [], mode: 'read', targetNpcId: n.id });
    const op = Object.values(planned.ops).find(o => o.kind === 'rat')!;
    for (let i = 0; i < 40; i++) {
      const t = structuredClone(planned);
      const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
      resolveOp(t, o, new Rng(i * 31 + 3));
      if (!o.result?.success) continue;
      expect(t.npcs[n.id].intel?.kind).toBe('skim');
      expect(t.npcs[n.id].ratted).toBeTruthy();
      return;
    }
    throw new Error('the rat never landed across 40 seeds');
  });

  it('only opens once per person', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    expect(openIntel(w, n, new Rng(1))).toBe('skim');
    expect(openIntel(w, n, new Rng(1))).toBeUndefined();
  });
});

describe('the bank: a small drip, not a one-off', () => {
  it('pays dirty cash every day it runs, and makes wire heat doing it', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    openIntel(w, n, new Rng(1));
    const before = { dirty: w.player.dirty, cash: w.player.cash, cyber: w.player.cyberHeat ?? 0 };
    tickIntel(w, new Rng(5));
    expect(w.player.dirty).toBeGreaterThan(before.dirty);
    expect(w.player.cash, 'a skim is not clean money').toBe(before.cash);
    expect(w.player.cyberHeat ?? 0).toBeGreaterThan(before.cyber);
  });

  it('is deliberately small next to what wire fraud takes once', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    openIntel(w, n, new Rng(1));
    const perDay = skimTake(w, n);
    expect(perDay).toBeGreaterThan(0);
    expect(perDay * 10, 'ten days of skimming should still be under one wire fraud').toBeLessThan(OP_DEFS.wire_fraud.payout[0]);
  });

  it('grows with your tech, because it is a systems job', () => {
    const dull = mk(); const dn = employee(dull, 'bank'); dull.player.skills.tech = 0; openIntel(dull, dn.n, new Rng(1));
    const sharp = mk(); const sn = employee(sharp, 'bank'); sharp.player.skills.tech = 10; openIntel(sharp, sn.n, new Rng(1));
    expect(skimTake(sharp, sn.n)).toBeGreaterThan(skimTake(dull, dn.n));
  });

  it('the risk of being found compounds the longer it runs', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    openIntel(w, n, new Rng(1));
    const day0 = skimRisk(w, n);
    w.day += 30;
    expect(skimRisk(w, n)).toBeGreaterThan(day0);
  });

  it('being found ends it and costs the relationship', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    openIntel(w, n, new Rng(1));
    n.rel.trust = 50;
    endIntel(w, n, true);
    expect(n.intel).toBeUndefined();
    expect(n.rel.trust).toBeLessThanOrEqual(50 + SKIM.trustHit);
  });

  it('and it goes stale on its own eventually — rotas change', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    openIntel(w, n, new Rng(1));
    w.day += INTEL.skim.lifetime + 1;
    tickIntel(w, new Rng(2));
    expect(n.intel).toBeUndefined();
  });
});

describe('the depot: a route, not an income', () => {
  it('pays nothing at all by itself', () => {
    const w = mk();
    const { n } = employee(w, 'armored_depot');
    openIntel(w, n, new Rng(1));
    const before = w.player.dirty;
    tickIntel(w, new Rng(5));
    expect(w.player.dirty).toBe(before);
    expect(skimTake(w, n)).toBe(0);
  });

  it('measurably improves the odds on the next armoured car job', () => {
    const w = mk();
    const { n, biz } = employee(w, 'armored_depot');
    for (const x of Object.values(w.npcs).filter(v => v.alive && !v.crew && v.role === 'patron').slice(0, 3)) {
      x.role = 'crew'; x.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
      x.skills.muscle = 7; x.skills.wheels = 6; w.player.crewIds.push(x.id); w.player.crewEver++;
    }
    const crew = w.player.crewIds.slice(0, 3);
    const before = select.opChance(w, 'heist_armored', crew, 'loud', biz.id);

    openIntel(w, n, new Rng(1));
    const after = select.opChance(w, 'heist_armored', crew, 'loud', biz.id);

    expect(routeDiscount(w, biz.id)).toBe(ROUTE.difficulty);
    expect(after, 'the route made no difference to the job it is for').toBeGreaterThan(before);
  });

  it('does not improve anything else', () => {
    const w = mk();
    const { n } = employee(w, 'armored_depot');
    const before = select.opChance(w, 'heist_bank', [], 'loud');
    openIntel(w, n, new Rng(1));
    expect(select.opChance(w, 'heist_bank', [], 'loud')).toBe(before);
  });

  it('expires faster than a skim, because a rota is a perishable thing', () => {
    expect(INTEL.route.lifetime).toBeLessThan(INTEL.skim.lifetime);
    const w = mk();
    const { n } = employee(w, 'armored_depot');
    openIntel(w, n, new Rng(1));
    w.day += INTEL.route.lifetime + 1;
    tickIntel(w, new Rng(2));
    expect(n.intel).toBeUndefined();
  });
});

describe('it surfaces as an opportunity, not only when you go looking', () => {
  it('somebody you have been inside of who works there becomes a candidate', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    expect(select.intelCandidates(w).map(c => c.npc.id)).not.toContain(n.id);
    n.ratted = w.day;
    expect(select.intelCandidates(w).map(c => c.npc.id)).toContain(n.id);
  });

  it('and stops being one once it is running', () => {
    const w = mk();
    const { n } = employee(w, 'bank');
    n.ratted = w.day;
    openIntel(w, n, new Rng(1));
    expect(select.intelCandidates(w).map(c => c.npc.id)).not.toContain(n.id);
  });
});
