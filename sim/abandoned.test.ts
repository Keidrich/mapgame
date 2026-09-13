import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type Block, type World } from './index';
import { DISTRICT_DEFS } from '@content/businesses';
import { SAFEHOUSE_TIERS } from '@content/rackets';
import { abandonChance, claim, makeAbandoned, revealOne, unknownIn } from './abandoned';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed });

/** A derelict block wired into the world, with a neighbour so it is reachable. */
function derelict(w: World, opts: { known?: boolean; police?: number; population?: number } = {}): Block {
  const here = select.startBlock(w);
  const b: Block = {
    id: `ab${Object.keys(w.blocks).length}`, chunkKey: here.chunkKey, polygon: [], center: { lat: here.center.lat + 0.002, lng: here.center.lng },
    areaM2: 20000, neighborIds: [here.id], edgeKeys: [], streetNames: [], name: 'The Yards', districtId: here.districtId,
    wealth: 20, police: opts.police ?? 6, heat: 0, population: opts.population ?? 4,
    demand: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 }, influence: {}, businessIds: [], memory: [], tags: [],
    abandoned: { known: opts.known ?? true },
  };
  w.blocks[b.id] = b; here.neighborIds.push(b.id);
  w.districts[here.districtId].blockIds.push(b.id);
  return b;
}

describe('generating derelict blocks', () => {
  it('never empties a block that carries real map data, and lands in a usable range', () => {
    let blocks = 0, abandoned = 0, known = 0, withBusinesses = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'B', background: 'muscle', seed });
      for (const b of Object.values(w.blocks)) {
        blocks++;
        if (!b.abandoned) continue;
        abandoned++;
        if (b.abandoned.known) known++;
        if (b.businessIds.length) withBusinesses++;   // the OSM guard: this must never happen
      }
    }
    expect(withBusinesses).toBe(0);
    expect(abandoned).toBeGreaterThan(0);
    expect(abandoned / blocks).toBeLessThan(0.15);    // texture, not half the city
    expect(known).toBeLessThan(abandoned);            // most need finding
  });

  it('only ever fires where the map has nothing and the police are thin', () => {
    const industrial = DISTRICT_DEFS.find(d => d.kind === 'industrial')!;
    const downtown = DISTRICT_DEFS.find(d => d.kind === 'downtown')!;
    const quiet = { police: 12 } as Block;
    const watched = { police: 75 } as Block;
    expect(abandonChance('industrial', quiet, industrial)).toBeGreaterThan(0);
    expect(abandonChance('downtown', quiet, downtown)).toBe(0);     // never in the money part of town
    expect(abandonChance('downtown', watched, downtown)).toBe(0);
    expect(abandonChance('projects', watched, DISTRICT_DEFS.find(d => d.kind === 'projects')!)).toBe(0); // too many eyes
  });

  it('comes out with almost no police, nobody living there, and no demand', () => {
    const w = mk(); const b = select.startBlock(w);
    const before = { police: b.police, population: b.population };
    makeAbandoned(b, new Rng(1), { police: 20, population: 30 });
    expect(b.police).toBeLessThan(before.police);
    expect(b.population).toBeLessThan(before.population);
    expect(b.police).toBeLessThanOrEqual(13);
    expect(Object.values(b.demand).every(v => v === 0)).toBe(true);
  });

  it('has nobody who could ever be a witness, because it has nobody', () => {
    const w = mk(); const b = derelict(w);
    expect(b.businessIds.length).toBe(0);
    expect(select.businessesIn(w, b.id).length).toBe(0);
    // the witness pool is drawn from a block's businesses, so an empty block yields none
    const pool = b.businessIds.flatMap(id => { const z = w.businesses[id]; return z ? [z.ownerId, ...z.patronIds] : []; });
    expect(pool.length).toBe(0);
  });
});

describe('scouting', () => {
  it('reveals at most one unknown block, and can come back with nothing', () => {
    const w = mk();
    const a = derelict(w, { known: false }); const b = derelict(w, { known: false });
    const d = a.districtId;
    expect(unknownIn(w, d).length).toBe(2);
    const first = revealOne(w, d, new Rng(1));
    expect(first).toBeDefined();
    expect(first!.abandoned!.known).toBe(true);
    expect(unknownIn(w, d).length).toBe(1);
    revealOne(w, d, new Rng(2));
    expect(unknownIn(w, d).length).toBe(0);
    expect(revealOne(w, d, new Rng(3))).toBeUndefined();   // nothing left to find
    void b;
  });

  it('runs as an op that needs no crew and finds a block on success', () => {
    const w = mk(); const hidden = derelict(w, { known: false });
    expect(can(w, { type: 'plan_op', kind: 'scout_block', crewIds: [], targetDistrictId: hidden.districtId }).ok).toBe(true);
    const w2 = dispatch(w, { type: 'plan_op', kind: 'scout_block', crewIds: [], targetDistrictId: hidden.districtId });
    const op = Object.values(w2.ops).find(o => o.kind === 'scout_block')!;
    expect(op).toBeDefined();
    op.status = 'ready'; op.launched = true;
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const t = structuredClone(w2);
      resolveOp(t, t.ops[op.id], new Rng(i));
      if (t.ops[op.id].status === 'done') { found = t.blocks[hidden.id].abandoned!.known; expect(found).toBe(true); }
    }
    expect(found).toBe(true);
  });

  it('needs a district to walk', () => {
    const w = mk(); derelict(w, { known: false });
    const r = can(w, { type: 'plan_op', kind: 'scout_block', crewIds: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/district/i);
  });
});

describe('claiming', () => {
  const ready = (seed = 5) => {
    const w = mk(seed);
    // scout_block is the gate on claim_abandoned, so record one as done
    w.ops.o_prior = { id: 'o_prior', kind: 'scout_block', crewIds: [], planDays: 1, daysLeft: 0, status: 'done', createdDay: 1 };
    return w;
  };

  it('is only offered against a found, unclaimed derelict block', () => {
    const w = ready();
    const hidden = derelict(w, { known: false });
    const plain = select.startBlock(w);
    expect(can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: plain.id }).ok).toBe(false);
    const r = can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: hidden.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/Scout the edges/i);
    hidden.abandoned!.known = true;
    expect(can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: hidden.id }).ok).toBe(true);
    hidden.abandoned!.claimedBy = 'f1';
    expect(can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: hidden.id }).ok).toBe(false);
  });

  it('is locked until you have scouted at least once', () => {
    const w = mk(); const b = derelict(w);
    const r = can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: b.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/Scout the Edges/);
  });

  it('the inside approach needs a councillor who takes your calls', () => {
    const w = ready(); const b = derelict(w);
    const councillor = Object.values(w.npcs).find(n => n.official?.kind === 'councillor')!;
    councillor.rel.trust = 0;
    const r = can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: b.id, approach: 'inside' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/councillor/i);
    councillor.rel.trust = 45;
    expect(can(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: b.id, approach: 'inside' }).ok).toBe(true);
  });

  it('each approach ends with the block yours, by force, quietly or on paper', () => {
    for (const approach of ['loud', 'quiet', 'inside'] as const) {
      const w = ready(); const b = derelict(w);
      const councillor = Object.values(w.npcs).find(n => n.official?.kind === 'councillor')!; councillor.rel.trust = 60;
      const w2 = dispatch(w, { type: 'plan_op', kind: 'claim_abandoned', crewIds: [], targetBlockId: b.id, approach });
      const op = Object.values(w2.ops).find(o => o.kind === 'claim_abandoned')!;
      op.status = 'ready'; op.launched = true;
      let claimed = false;
      for (let i = 0; i < 15 && !claimed; i++) {
        const t = structuredClone(w2);
        resolveOp(t, t.ops[op.id], new Rng(i));
        if (t.ops[op.id].status === 'done') {
          claimed = true;
          expect(t.blocks[b.id].abandoned!.claimedBy).toBe(PLAYER);
          expect(t.blocks[b.id].influence[PLAYER]).toBeGreaterThan(0);
          if (approach === 'loud') expect(t.player.fear).toBeGreaterThan(w2.player.fear);
        }
      }
      expect(claimed).toBe(true);
    }
  });

  it('a claimed block is squatted, not leased: no price and no daily rent', () => {
    let w = ready(); const b = derelict(w);
    claim(w, b);
    w.player.currentBlockId = b.id;
    const cash0 = w.player.cash;
    const gate = can(w, { type: 'rent_safehouse', blockId: b.id });
    expect(gate.ok).toBe(true);
    expect(gate.ok === true && (gate.cost?.cash ?? 0)).toBe(0);
    w = dispatch(w, { type: 'rent_safehouse', blockId: b.id });
    const s = w.safehouses[w.player.safehouseIds[0]];
    expect(s.squatted).toBe(true);
    expect(w.player.cash).toBe(cash0);                       // nothing up front
    // and nothing on the nightly bill either
    const before = w.player.cash + w.player.dirty;
    w.player.crewIds = [];
    for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    expect(w.player.cash + w.player.dirty).toBeGreaterThanOrEqual(before);
    // a normal block still charges (clear the night's events first: they gate every action)
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const plain = select.startBlock(w);
    expect((can(w, { type: 'rent_safehouse', blockId: plain.id }) as { cost?: { cash?: number } }).cost?.cash).toBe(SAFEHOUSE_TIERS[0].rent);
  });
});
