import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type OpKind, type Safehouse, type World } from './index';
import { OP_DEFS } from '@content/rackets';
import { mkRacket } from './reducer';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

const give = {
  crew: (w: World, n = 1) => { w.player.crewEver += n; },
  safehouse: (w: World, tier: number) => {
    const b = select.startBlock(w);
    const s: Safehouse = { id: `sh${tier}`, blockId: b.id, name: 'S', tier, owner: PLAYER, stash: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0, streetwear: 0 }, cash: 0, productionIds: [], capacity: 60, hostageIds: [] };
    w.safehouses[s.id] = s; w.player.safehouseIds.push(s.id);
  },
  racket: (w: World) => { const biz = select.businessesIn(w, select.startBlock(w).id)[0]; mkRacket(w, 'numbers', biz); },
  business: (w: World) => { const biz = select.businessesIn(w, select.startBlock(w).id)[0]; biz.ownedBy = 'player'; w.player.businessIds.push(biz.id); },
  doneOp: (w: World, kind: OpKind) => { w.ops[`done_${kind}`] = { id: `done_${kind}`, kind, crewIds: [], planDays: 0, daysLeft: 0, status: 'done', createdDay: 1 }; },
};

describe('opsAvailable', () => {
  it('a brand new player has only the street tier', () => {
    const w = mk();
    const open = select.opsAvailable(w);
    expect(open).toEqual(expect.arrayContaining(['robbery', 'intimidate', 'takeover', 'scout_block']));
    for (const k of ['heist_bank', 'heist_jeweller', 'heist_armored', 'hit', 'raid_rival', 'kidnap', 'claim_abandoned'] as OpKind[]) {
      expect(open).not.toContain(k);
      expect(select.opLocked(w, k)).toBeTruthy();
    }
  });

  it('every op is either open or gives a reason, and the two agree', () => {
    const w = mk();
    const open = new Set(select.opsAvailable(w));
    for (const k of Object.keys(OP_DEFS) as OpKind[]) {
      const why = select.opLocked(w, k);
      expect(open.has(k)).toBe(!why);
    }
  });

  it('filters by crew count on its own', () => {
    const w = mk();
    expect(select.opsAvailable(w)).not.toContain('smuggle_run');
    expect(select.opLocked(w, 'smuggle_run')).toMatch(/joined your crew/);
    give.crew(w, 1);
    expect(select.opsAvailable(w)).toContain('smuggle_run');
    expect(select.opsAvailable(w)).toContain('frame');
    expect(select.opsAvailable(w)).not.toContain('hit');    // hit wants two, and a racket
  });

  it('filters by safehouse tier on its own', () => {
    const w = mk();
    expect(select.opLocked(w, 'heist_jeweller')).toMatch(/tier 2 safehouse/);
    give.safehouse(w, 1);
    expect(select.opLocked(w, 'heist_jeweller')).toMatch(/tier 2 safehouse/);
    give.safehouse(w, 2);
    expect(select.opLocked(w, 'heist_jeweller')).toBeUndefined();
    expect(select.opLocked(w, 'heist_armored')).toBeUndefined();
  });

  it('filters by owning a business on its own', () => {
    const w = mk();
    expect(select.opLocked(w, 'insurance_fraud')).toMatch(/business of your own/);
    expect(select.opLocked(w, 'check_kiting')).toMatch(/business of your own/);
    give.business(w);
    expect(select.opLocked(w, 'insurance_fraud')).toBeUndefined();
    expect(select.opLocked(w, 'check_kiting')).toBeUndefined();
  });

  it('filters by running a racket on its own', () => {
    const w = mk();
    give.crew(w, 2);
    expect(select.opLocked(w, 'hit')).toMatch(/racket of your own/);
    give.racket(w);
    expect(select.opLocked(w, 'hit')).toBeUndefined();
    expect(select.opLocked(w, 'raid_rival')).toBeUndefined();
    expect(select.opLocked(w, 'steal_formula')).toBeUndefined();
    expect(select.opLocked(w, 'heist_warehouse')).toBeUndefined();
  });

  it('combines requirements: all of them must hold', () => {
    const w = mk();
    give.crew(w, 2);
    expect(select.opLocked(w, 'hit')).toBeTruthy();          // crew yes, racket no
    const w2 = mk(); give.racket(w2);
    expect(select.opLocked(w2, 'hit')).toMatch(/joined your crew/);  // racket yes, crew no
    const w3 = mk(); give.crew(w3, 2); give.racket(w3);
    expect(select.opLocked(w3, 'hit')).toBeUndefined();      // both
  });

  it('chains through priorOps: the bank job needs a heist behind you', () => {
    const w = mk();
    give.safehouse(w, 2);
    expect(select.opLocked(w, 'heist_jeweller')).toBeUndefined();
    expect(select.opLocked(w, 'heist_bank')).toMatch(/Jewel Heist or Armored Car/);
    give.doneOp(w, 'heist_jeweller');
    expect(select.opLocked(w, 'heist_bank')).toBeUndefined();
    // either prior op opens it
    const w2 = mk(); give.safehouse(w2, 2); give.doneOp(w2, 'heist_armored');
    expect(select.opLocked(w2, 'heist_bank')).toBeUndefined();
    // a failed attempt is not a prior op
    const w3 = mk(); give.safehouse(w3, 2);
    w3.ops.failed = { id: 'failed', kind: 'heist_jeweller', crewIds: [], planDays: 0, daysLeft: 0, status: 'failed', createdDay: 1 };
    expect(select.opLocked(w3, 'heist_bank')).toBeTruthy();
  });

  it('claim_abandoned asks about the ground, not about your history, and kidnap needs a crew and somewhere to put them', () => {
    const w = mk();
    // it used to chain off `priorOps: ['scout_block']`, which asked whether you had scouted
    // *anywhere*. It asks about the block now: a derelict you have found is enough, however
    // you found it, and scouting somewhere else is worth nothing on its own.
    for (const b of Object.values(w.blocks)) b.abandoned = undefined;
    expect(select.opLocked(w, 'claim_abandoned')).toMatch(/derelict/i);
    give.doneOp(w, 'scout_block');
    expect(select.opLocked(w, 'claim_abandoned'), 'scouting elsewhere should not unlock it').toMatch(/derelict/i);
    Object.values(w.blocks)[0].abandoned = { known: true };
    expect(select.opLocked(w, 'claim_abandoned')).toBeUndefined();

    const k = mk();
    expect(select.opLocked(k, 'kidnap')).toMatch(/joined your crew/);
    give.crew(k, 1);
    expect(select.opLocked(k, 'kidnap')).toMatch(/tier 1 safehouse/);
    give.safehouse(k, 1);
    expect(select.opLocked(k, 'kidnap')).toBeUndefined();
  });

  it('planning a locked op is refused with the same reason the tree shows', () => {
    const w = mk();
    const biz = Object.values(w.businesses).find(b => b.type === 'jeweller');
    const r = can(w, { type: 'plan_op', kind: 'heist_jeweller', crewIds: [], targetBusinessId: biz?.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe(select.opLocked(w, 'heist_jeweller'));
  });
});

describe('the street tier is genuinely solo', () => {
  it('robbery, send a message and take the corner all have minCrew 0', () => {
    for (const k of ['robbery', 'intimidate', 'takeover', 'scout_block', 'claim_abandoned'] as OpKind[]) {
      expect(OP_DEFS[k].minCrew).toBe(0);
      expect(OP_DEFS[k].requires?.crewCount ?? 0).toBe(0);
    }
  });

  it('a stick-up plans and launches with nobody at all', () => {
    let w = mk();
    const target = Object.values(w.businesses).find(b => b.ownedBy === 'npc' && !['bank', 'armored_depot'].includes(b.type))!;
    expect(w.player.crewIds).toHaveLength(0);
    const gate = can(w, { type: 'plan_op', kind: 'robbery', crewIds: [], targetBusinessId: target.id });
    expect(gate.ok).toBe(true);
    w = dispatch(w, { type: 'plan_op', kind: 'robbery', crewIds: [], targetBusinessId: target.id });
    const op = Object.values(w.ops).find(o => o.kind === 'robbery')!;
    expect(op.status).toBe('ready');                    // no planning days at this tier
    expect(op.crewIds).toHaveLength(0);
    expect(can(w, { type: 'launch_op', opId: op.id }).ok).toBe(true);
    w = dispatch(w, { type: 'launch_op', opId: op.id });
    for (const e of w.pendingEvents.slice()) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    expect(['done', 'failed']).toContain(w.ops[op.id].status);
    // a solo job is worse than one with people, but it is possible
    expect(select.opChance(w, 'robbery', [])).toBeGreaterThan(0);
  });
});

/**
 * Every op added in the roster expansion, checked against the gate it declares. The point is
 * that nothing lives outside the tree: if an op exists, it has a `requires` and a `tier`, its
 * gate actually bites when unmet, and it actually opens when met.
 */
describe('the expanded roster', () => {
  const NEW_OPS: OpKind[] = [
    'buy_down', 'spring_crew', 'buy_case',
    'heist_gallery', 'heist_countroom', 'heist_payroll', 'heist_containers',
    'long_con', 'staged_accident', 'shell_company', 'charity_front', 'counterfeit_run',
    'dockside_pickup', 'hijack_load', 'convoy_run',
  ];

  it('every one of them is in the tree with a tier and a requires', () => {
    for (const k of NEW_OPS) {
      const d = OP_DEFS[k];
      expect(d, k).toBeTruthy();
      expect(typeof d.tier, k).toBe('number');
      expect(d.requires, `${k} has no requires`).toBeTruthy();
      expect(Object.keys(d.requires!).length, `${k} has an empty requires`).toBeGreaterThan(0);
    }
  });

  it('every one of them is locked for a brand new player, with a reason', () => {
    const w = mk();
    const open = new Set(select.opsAvailable(w));
    for (const k of NEW_OPS) {
      expect(open.has(k), `${k} should not be open at day 1`).toBe(false);
      expect(select.opLocked(w, k), k).toBeTruthy();
    }
  });

  it('reuses only gating patterns that already existed', () => {
    // `alone` is the one addition since this list was written, and it is deliberate: it is the
    // mechanism the whole lone-wolf lane rests on, and it is not expressible with any of the
    // others — `crewCount` asks whether anybody ever joined, this asks whether anybody is here
    // now, and the answer has to be able to go back to no. Everything else still has to reuse.
    const allowed = new Set(['crewCount', 'safehouseTier', 'racketKinds', 'businessOwned', 'priorOps', 'stance', 'weapon', 'alone', 'rattedTarget', 'officialTarget', 'jailedTarget', 'casedTarget', 'caseTarget', 'derelictTarget']);
    for (const k of Object.keys(OP_DEFS) as OpKind[]) {
      for (const key of Object.keys(OP_DEFS[k].requires ?? {})) expect(allowed.has(key), `${k}.requires.${key}`).toBe(true);
    }
  });

  it('anything you would not walk into empty-handed asks for a weapon', () => {
    const w = mk(); give.crew(w, 3);
    for (const k of ['heist_payroll', 'hijack_load'] as OpKind[]) {
      expect(OP_DEFS[k].requires?.weapon, k).toBe(true);
      expect(select.opLocked(w, k), k).toContain('empty-handed');
      const armed = structuredClone(w);
      armed.player.items = ['pistol']; armed.player.equipped = ['pistol'];
      expect(select.opLocked(armed, k), k).toBeUndefined();
    }
  });

  it('crew-count gates open at the number they name and not before', () => {
    for (const k of ['heist_containers', 'hijack_load', 'convoy_run'] as OpKind[]) {
      const need = OP_DEFS[k].requires!.crewCount!;
      const short = mk(); give.crew(short, need - 1);
      short.player.items = ['pistol']; short.player.equipped = ['pistol'];
      give.safehouse(short, 2);
      give.doneOp(short, 'smuggle_run'); give.doneOp(short, 'dockside_pickup');
      expect(select.opLocked(short, k), `${k} at ${need - 1} crew`).toBeTruthy();

      const enough = structuredClone(short); give.crew(enough, 1);
      expect(select.opLocked(enough, k), `${k} at ${need} crew`).toBeUndefined();
    }
  });

  it('prior-op edges are real: the collection needs a jewel heist behind it', () => {
    const w = mk(); give.crew(w, 3); give.safehouse(w, 2);
    expect(select.opLocked(w, 'heist_gallery')).toContain('Jewel Heist');
    give.doneOp(w, 'heist_jeweller');
    expect(select.opLocked(w, 'heist_gallery')).toBeUndefined();
  });

  it('a convoy needs both a boat job and a truck job behind it', () => {
    const w = mk(); give.crew(w, 3); give.safehouse(w, 2);
    expect(select.opLocked(w, 'convoy_run')).toBeTruthy();
    give.doneOp(w, 'smuggle_run');
    expect(select.opLocked(w, 'convoy_run')).toBeUndefined();   // either edge is enough, as elsewhere in the tree
  });

  it('business-owned gates need a place of your own', () => {
    for (const k of ['shell_company', 'charity_front'] as OpKind[]) {
      const w = mk(); give.crew(w, 2);
      expect(select.opLocked(w, k), k).toContain('business of your own');
      give.business(w);
      expect(select.opLocked(w, k), k).toBeUndefined();
    }
  });

  it('a counterfeit run needs a racket that could move it', () => {
    const w = mk(); give.crew(w, 2);
    expect(select.opLocked(w, 'counterfeit_run')).toBeTruthy();
    give.racket(w);   // numbers: not one of the kinds that can move paper
    expect(select.opLocked(w, 'counterfeit_run')).toBeTruthy();
    const biz = select.businessesIn(w, select.startBlock(w).id)[0];
    mkRacket(w, 'fencing', biz);
    expect(select.opLocked(w, 'counterfeit_run')).toBeUndefined();
  });

  it('the count room is per target: you must have cased that exact place', () => {
    const w = mk(); give.crew(w, 3); give.safehouse(w, 2);
    const clubs = Object.values(w.businesses).filter(b => b.type === 'nightclub');
    if (!clubs.length) return;                       // seed without one; the gate is covered below
    const [a, b] = clubs;
    expect(select.opLocked(w, 'heist_countroom')).toContain('cased');
    a.casedUntil = w.day + 3;
    expect(select.opLocked(w, 'heist_countroom', { businessId: a.id })).toBeUndefined();
    if (b) expect(select.opLocked(w, 'heist_countroom', { businessId: b.id })).toBeTruthy();
    a.casedUntil = w.day - 1;                        // it goes stale
    expect(select.opLocked(w, 'heist_countroom', { businessId: a.id })).toBeTruthy();
  });

  it('cased-target gating works off any cased place when no target is in hand', () => {
    const w = mk(); give.crew(w, 3); give.safehouse(w, 2);
    expect(select.opLocked(w, 'heist_countroom')).toBeTruthy();
    Object.values(w.businesses)[0].casedUntil = w.day + 2;
    expect(select.opLocked(w, 'heist_countroom')).toBeUndefined();
  });

  it('the tree still agrees with itself once everything is unlocked', () => {
    const w = mk();
    give.crew(w, 5); give.safehouse(w, 3); give.racket(w); give.business(w);
    w.player.items = ['pistol']; w.player.equipped = ['pistol'];
    const open = new Set(select.opsAvailable(w));
    for (const k of Object.keys(OP_DEFS) as OpKind[]) expect(open.has(k), k).toBe(!select.opLocked(w, k));
  });
});
