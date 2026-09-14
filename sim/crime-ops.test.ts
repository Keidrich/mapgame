/**
 * The twenty-two jobs the crime pass put on the board.
 *
 * Three things have to hold for every one of them, and each has been wrong in this file's
 * history at least once: the tree has to gate them (an op with no requirements at tier 3 is a
 * free payday), resolution has to actually *do* something (an op kind with no `case` in
 * `resolveOp` silently resolves to an empty string and no money), and none of them may ever
 * describe how a thing is done.
 *
 * The bust-out gets its own section because it is the only job in the game that spends something
 * you cannot buy back.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { PLAYER, generateWorld, select, type Id, type Op, type World } from './index';
import { resolveOp } from './ops';
import { Rng } from './rng';
import type { OpKind } from './types';

const CRIME: OpKind[] = [
  'porch_piracy', 'bike_ring', 'vape_bootleg', 'copper_strip', 'squatter_scheme', 'sim_swap',
  'straw_purchase', 'resort_fraud', 'match_fixing', 'stream_piracy', 'betting_app', 'synth_identity',
  'illegal_dumping', 'arson_hire', 'bust_out', 'boiler_room', 'bid_rigging', 'campaign_wash',
  'prison_supply', 'corporate_extortion', 'crypto_wash', 'vote_buying',
];
const mk = (seed = 55) => { const w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; return w; };

/** A launched op of this kind, with whatever target it wants, ready to resolve. */
function launch(w: World, kind: OpKind, extra: Partial<Op> = {}): Op {
  const def = OP_DEFS[kind];
  const o: Op = {
    id: `o_${kind}`, kind, crewIds: [], planDays: def.planDays, daysLeft: 0,
    status: 'ready', createdDay: w.day, launched: true, ...extra,
  };
  w.ops[o.id] = o; w.player.opIds.push(o.id);
  return o;
}
/** Force the roll: `opChance` is clamped to 3..97, so a seeded Rng of 1 always succeeds. */
const win = () => new Rng(1);

describe('every one of them is gated, and by something', () => {
  it('nothing above street tier is simply on the table from day one', () => {
    for (const k of CRIME) {
      const d = OP_DEFS[k];
      if ((d.tier ?? 0) < 2) continue;
      expect(d.requires, `${k} is tier ${d.tier} and asks for nothing`).toBeTruthy();
      expect(Object.keys(d.requires!).length).toBeGreaterThan(0);
    }
  });

  it('every requirement names something that exists', () => {
    for (const k of CRIME) {
      const req = OP_DEFS[k].requires; if (!req) continue;
      for (const prior of req.priorOps ?? []) expect(OP_DEFS[prior], `${k} needs ${prior}, which is not an op`).toBeTruthy();
      for (const kind of req.racketKinds ?? []) expect(typeof kind, `${k} has a non-racket in racketKinds`).toBe('string');
    }
  });

  it('a fresh player is refused, with a reason they can act on', () => {
    const w = mk();
    for (const k of CRIME) {
      const d = OP_DEFS[k];
      if (!d.requires) continue;
      const why = select.opLocked(w, k);
      if (!why) continue;                       // some are open from the start by design
      expect(why.length, `${k} refuses with nothing to read`).toBeGreaterThan(10);
    }
  });

  it('costs and payouts are sane: nothing is a free payday', () => {
    for (const k of CRIME) {
      const d = OP_DEFS[k];
      const [lo, hi] = d.payout;
      expect(hi, `${k} pays backwards`).toBeGreaterThanOrEqual(lo);
      if (hi > 0) expect(d.difficulty, `${k} pays ${hi} and is trivial`).toBeGreaterThan(15);
      // the three that pay nothing buy something else, and each of them costs money to run
      if (hi === 0) expect((d.cost ?? 0) > 0 || k === 'crypto_wash', `${k} pays nothing and costs nothing`).toBe(true);
    }
  });
});

describe('resolution actually happens', () => {
  it('every kind leaves a result and a line — no silent no-ops', () => {
    for (const k of CRIME) {
      const w = mk();
      w.player.skills = { muscle: 12, brains: 12, charm: 12, wheels: 12, tech: 12 };
      w.player.cash = 100_000; w.player.dirty = 60_000;
      const def = OP_DEFS[k];
      const extra: Partial<Op> = {};
      if (def.target === 'business') {
        const b = def.ownBusiness
          ? (() => { const z = Object.values(w.businesses).find(x => x.ownedBy === 'npc')!; z.ownedBy = 'player'; w.player.businessIds.push(z.id); return z; })()
          : Object.values(w.businesses).find(x => x.ownedBy === 'npc')!;
        extra.targetBusinessId = b.id;
      }
      if (def.target === 'npc') {
        const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
        if (def.requires?.jailedTarget) { n.crew = { loyalty: 60, cut: 0, status: 'jailed', statusDays: 10, joinedDay: 1 }; n.role = 'crew'; w.player.crewIds.push(n.id); }
        extra.targetNpcId = n.id;
      }
      if (def.target === 'block') extra.targetBlockId = Object.values(w.blocks)[1].id;
      if (def.target === 'district') extra.targetDistrictId = Object.values(w.districts)[0].id;
      const o = launch(w, k, extra);
      resolveOp(w, o, win());
      expect(['done', 'failed'], k).toContain(o.status);
      expect(o.result?.text.length, `${k} resolved with nothing to show for it`).toBeGreaterThan(10);
    }
  });

  it('a payout op that succeeds leaves you better off in cash or in goods', () => {
    const paying = CRIME.filter(k => OP_DEFS[k].payout[1] > 0);
    let moved = 0;
    for (const k of paying) {
      const w = mk();
      w.player.skills = { muscle: 14, brains: 14, charm: 14, wheels: 14, tech: 14 };
      const def = OP_DEFS[k];
      const extra: Partial<Op> = {};
      if (def.target === 'business') { const z = Object.values(w.businesses).find(x => x.ownedBy === 'npc')!; if (def.ownBusiness) { z.ownedBy = 'player'; w.player.businessIds.push(z.id); } extra.targetBusinessId = z.id; }
      if (def.target === 'npc') { const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!; if (def.requires?.jailedTarget) { n.crew = { loyalty: 60, cut: 0, status: 'jailed', statusDays: 10, joinedDay: 1 }; n.role = 'crew'; w.player.crewIds.push(n.id); } extra.targetNpcId = n.id; }
      if (def.target === 'block') extra.targetBlockId = Object.values(w.blocks)[1].id;
      if (def.target === 'district') extra.targetDistrictId = Object.values(w.districts)[0].id;
      const before = w.player.cash + w.player.dirty + Object.values(w.player.stash).reduce((a, b) => a + b, 0);
      const o = launch(w, k, extra);
      resolveOp(w, o, win());
      if (o.status !== 'done') continue;
      const after = w.player.cash + w.player.dirty + Object.values(w.player.stash).reduce((a, b) => a + b, 0);
      expect(after, `${k} succeeded and paid nothing`).toBeGreaterThan(before);
      moved++;
    }
    expect(moved, 'none of the paying jobs ever succeeded, so this checked nothing').toBeGreaterThan(5);
  });

  it('the ones that pay nothing buy something instead', () => {
    // campaign_wash buys a person; vote_buying buys a ward; crypto_wash turns dirty into clean
    const w = mk();
    const councillor = select.officials(w).find(o => o.official!.kind === 'councillor');
    if (councillor) {
      const before = councillor.rel.trust;
      const o = launch(w, 'campaign_wash', { targetNpcId: councillor.id });
      resolveOp(w, o, win());
      if (o.status === 'done') expect(councillor.rel.trust, 'the money bought nothing').toBeGreaterThan(before);
    }
    const t = mk();
    const d = Object.values(t.districts)[0];
    const held = d.blockIds.map(id => t.blocks[id].influence[PLAYER] ?? 0).reduce((a, b) => a + b, 0);
    const vb = launch(t, 'vote_buying', { targetDistrictId: d.id });
    resolveOp(t, vb, win());
    if (vb.status === 'done') {
      const after = d.blockIds.map(id => t.blocks[id].influence[PLAYER] ?? 0).reduce((a, b) => a + b, 0);
      expect(after, 'a bought ward moved nothing on the map').toBeGreaterThan(held);
    }
    const c = mk();
    c.player.dirty = 40_000; c.player.cash = 0;
    const cw = launch(c, 'crypto_wash');
    resolveOp(c, cw, win());
    if (cw.status === 'done') {
      expect(c.player.dirty, 'nothing went in').toBeLessThan(40_000);
      expect(c.player.cash, 'nothing came out').toBeGreaterThan(0);
      expect(c.player.cash, 'it washed at par').toBeLessThan(40_000 - c.player.dirty);
    }
  });
});

describe('the bust-out costs you the business, for good', () => {
  function bust(seed = 55) {
    const w = mk(seed);
    w.player.skills = { muscle: 14, brains: 14, charm: 14, wheels: 14, tech: 14 };
    const b = Object.values(w.businesses).find(x => x.ownedBy === 'npc' && x.value > 0)!;
    b.ownedBy = 'player'; w.player.businessIds.push(b.id);
    const o = launch(w, 'bust_out', { targetBusinessId: b.id });
    resolveOp(w, o, win());
    return { w, b, o, id: b.id as Id };
  }

  it('pays out, and the place stops being a business', () => {
    const { w, b, o } = bust();
    expect(o.status, 'the job itself failed, so none of this was checked').toBe('done');
    expect(o.result!.cash).toBeGreaterThan(0);
    expect(b.shut, 'the doors are still open').toBeTruthy();
    expect(b.baseIncome).toBe(0);
    expect(b.value).toBe(0);
    expect(w.player.businessIds, 'still on your books').not.toContain(b.id);
  });

  it('comes off its block and out of every list of places you can walk into', () => {
    const { w, b, o } = bust();
    expect(o.status, 'the job itself failed, so none of this was checked').toBe('done');
    expect(w.blocks[b.blockId].businessIds).not.toContain(b.id);
    expect(select.businessesIn(w, b.blockId).map(x => x.id)).not.toContain(b.id);
    expect(select.opTargets(w, 'robbery').map(x => x.id)).not.toContain(b.id);
  });

  it('but the record survives, so old log lines and ledgers still resolve', () => {
    const { w, id, o } = bust();
    expect(o.status, 'the job itself failed, so none of this was checked').toBe('done');
    expect(w.businesses[id], 'the row was deleted and every reference to it dangles').toBeTruthy();
    expect(w.businesses[id].name.length).toBeGreaterThan(0);
  });

  it('and somebody opens a file on it', () => {
    const { w, o } = bust();
    expect(o.status, 'the job itself failed, so none of this was checked').toBe('done');
    expect((w.cases ?? []).some(c => c.kind === 'fraud'), 'nobody came looking for the money').toBe(true);
  });
});

describe('nothing here teaches anybody anything', () => {
  it('no blurb reads like an instruction', () => {
    const banned = /\b(how to|step \d|you will need|instructions|tutorial|routing number|account number|cvv|pin code|skimmer|encode|clone the (card|strip)|accelerant|detonat|thermite|recipe)\b/i;
    for (const k of CRIME) {
      expect(OP_DEFS[k].blurb, k).not.toMatch(banned);
      expect(OP_DEFS[k].blurb.length, `${k} has no description`).toBeGreaterThan(20);
    }
  });

  it('the fraud and wire jobs in particular say who pays, not what is typed', () => {
    for (const k of ['synth_identity', 'sim_swap', 'crypto_wash', 'straw_purchase', 'bust_out'] as OpKind[]) {
      const b = OP_DEFS[k].blurb;
      expect(b, k).not.toMatch(/\d{3,}/);                         // no numbers that look like data
      expect(b, k).not.toMatch(/\b(app|site|service|provider|bank name)\b/i);
    }
  });

  it('straw purchasing is consumer stock only, and says so', () => {
    expect(OP_DEFS.straw_purchase.blurb).toMatch(/consumer/i);
    expect(OP_DEFS.straw_purchase.blurb).not.toMatch(/\b(gun|rifle|pistol|firearm|ammunition)\b/i);
  });
});
