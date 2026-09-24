/**
 * Playing the Remake: the contracts the original learned the hard way, written in from the start.
 *   - `can()` answers for anything the UI can put on screen, and never throws (a throw is a blank screen).
 *   - The numbers a card shows are the numbers the purse moves by.
 *   - Nothing launders money you did not ask it to launder.
 *   - The same seed and the same choices give the same game.
 */
import { describe, expect, it } from 'vitest';
import { RACKETS, JOBS, LABS } from '@r/content/world';
import { ITEMS, SLOTS_ORDER, type ItemId } from '@r/content/kit';
import { can, dispatch, newWorld, select, PLAYER, type Action, type World } from '@r/sim/index';
import { apply, describe as describeEffects } from '@r/sim/effects';
import { Rng } from '@r/sim/rng';
import { TEMPLATES } from '@r/sim/events';
import { run } from '@r/scripts/bot';
import type { SceneKind } from '@r/sim/select';
import type { JobKind } from '@r/sim/types';

const mk = (seed = 7) => newWorld({ seed, size: 'small', name: 'T', background: 'grifter' });
const SCENES: SceneKind[] = ['chat', 'intimidate', 'protect', 'squeeze', 'recruit', 'bribe', 'settle', 'lean', 'buy', 'favour'];

/** Every action the UI can build for this world. */
function everyAction(w: World): Action[] {
  const out: Action[] = [{ type: 'end_day' }, { type: 'lay_low', days: 2 }, { type: 'retire' }, { type: 'lawyer', on: true }, { type: 'fixer_wash', amount: 1000 }];
  for (const b of Object.values(w.blocks)) out.push({ type: 'travel', blockId: b.id }, { type: 'rent_safehouse', blockId: b.id });
  for (const n of Object.values(w.npcs)) {
    for (const k of SCENES) out.push({ type: 'scene', kind: k, npcId: n.id });
    out.push({ type: 'assign', npcId: n.id, assignment: null }, { type: 'fire', npcId: n.id }, { type: 'drop_payroll', npcId: n.id });
    for (const k of Object.keys(JOBS) as JobKind[]) out.push({ type: 'case', kind: k, npcId: n.id });
  }
  for (const b of Object.values(w.businesses)) {
    for (const k of Object.keys(RACKETS)) out.push({ type: 'start_racket', businessId: b.id, kind: k as never });
    out.push({ type: 'set_rate', businessId: b.id, rate: 0.12 }, { type: 'drop_protection', businessId: b.id });
    for (const k of Object.keys(JOBS) as JobKind[]) out.push({ type: 'case', kind: k, businessId: b.id });
  }
  for (const r of Object.values(w.rackets)) out.push({ type: 'upgrade_racket', racketId: r.id }, { type: 'close_racket', racketId: r.id }, { type: 'toggle_wash', racketId: r.id });
  for (const j of Object.values(w.jobs)) for (const a of ['quiet', 'loud', 'clever'] as const) out.push({ type: 'take_job', jobId: j.id, crewIds: [] }, { type: 'launch_job', jobId: j.id, approach: a }, { type: 'drop_job', jobId: j.id }, { type: 'answer', jobId: j.id, optionId: 'x' });
  for (const f of Object.values(w.factions)) out.push({ type: 'tribute', factionId: f.id, amount: 500 }, { type: 'sit_down', factionId: f.id, offer: 'truce' }, { type: 'sit_down', factionId: f.id, offer: 'alliance' }, { type: 'sit_down', factionId: f.id, offer: 'split' }, { type: 'declare_war', factionId: f.id });
  for (const i of Object.keys(ITEMS) as ItemId[]) {
    out.push({ type: 'buy_item', item: i, at: 'fixer' }, { type: 'equip', item: i, to: PLAYER });
    for (const b of Object.values(w.businesses).slice(0, 40)) out.push({ type: 'buy_item', item: i, at: b.id });
    for (const id of w.player.crewIds) out.push({ type: 'equip', item: i, to: id });
  }
  for (const s of SLOTS_ORDER) { out.push({ type: 'unequip', from: PLAYER, slot: s }); for (const id of w.player.crewIds) out.push({ type: 'unequip', from: id, slot: s }); }
  for (const h of Object.values(w.hostages)) for (const c of ['ransom', 'release', 'trade', 'kill', 'pay'] as const) out.push({ type: 'hostage', id: h.id, choice: c });
  out.push({ type: 'hostage', id: 'nobody', choice: 'ransom' }, { type: 'commission_vote', vote: 'yes' });
  for (const f of Object.values(w.factions)) out.push({ type: 'lobby', factionId: f.id, side: 'yes' }, { type: 'lobby', factionId: f.id, side: 'no' });
  for (const b of Object.values(w.blocks)) out.push({ type: 'case', kind: 'setpiece', blockId: b.id });
  for (const j of Object.values(w.jobs)) for (const id of w.player.crewIds) out.push({ type: 'join_job', jobId: j.id, npcId: id });
  for (const s of Object.values(w.safehouses)) { out.push({ type: 'upgrade_safehouse', safehouseId: s.id }); for (const k of Object.keys(LABS)) out.push({ type: 'build_lab', safehouseId: s.id, kind: k as never }); }
  for (const p of ['booze', 'green', 'pills', 'goods'] as const) out.push({ type: 'sell_street', product: p, n: 5 });
  return out;
}

describe('can() never throws', () => {
  it('on a fresh city, for everything the UI can ask', () => {
    const w = mk();
    for (const a of everyAction(w)) expect(() => can(w, a)).not.toThrow();
  });
  it('on a city thirty days into a real game', () => {
    const w = run({ days: 30, seed: 3, size: 'small' }).w;
    let n = 0;
    for (const a of everyAction(w)) { expect(() => can(w, a)).not.toThrow(); n++; }
    expect(n).toBeGreaterThan(1000);
    // and every quote the person sheet shows renders without throwing either
    for (const npc of Object.values(w.npcs).slice(0, 200)) for (const k of SCENES) expect(() => select.quote(w, k, npc.id)).not.toThrow();
  }, 60000);
  it('refuses with a reason, never silently', () => {
    const w = mk();
    for (const a of everyAction(w).slice(0, 3000)) { const r = can(w, a); if (!r.ok) expect(r.why, JSON.stringify(a)).toBeTruthy(); }
  });
});

describe('the same seed and the same choices are the same game', () => {
  it('two bot runs on one seed end identically', () => {
    const a = run({ days: 15, seed: 5, size: 'small' }).w, b = run({ days: 15, seed: 5, size: 'small' }).w;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60000);
  it('a refused action changes nothing, not even the rng', () => {
    const w = mk();
    const after = dispatch(w, { type: 'upgrade_racket', racketId: 'nope' });
    expect(after).toBe(w);
  });
});

describe('money says what it does', () => {
  it('a finished job moved the purse by exactly what its result says', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let w = mk(seed);
      w.player.skills = { muscle: 9, brains: 9, charm: 9, wheels: 9, tech: 9 };
      const job = Object.values(w.jobs).find(j => j.status === 'offer' && j.crewMin === 0);
      if (!job) continue;
      w = dispatch(w, { type: 'take_job', jobId: job.id, crewIds: [] });
      while (w.jobs[job.id].status === 'planning') { w.events = []; w = dispatch(w, { type: 'end_day' }); }
      w.events = [];
      const before = { cash: w.player.cash, dirty: w.player.dirty, goods: w.player.stash.goods.n };
      w = dispatch(w, { type: 'launch_job', jobId: job.id, approach: JOBS[job.kind].approaches[0] });
      const j = w.jobs[job.id];
      if (j.status === 'paused') { w = dispatch(w, { type: 'answer', jobId: j.id, optionId: j.complication!.options[0].id }); }
      const r = w.jobs[job.id].result!;
      expect(r).toBeTruthy();
      expect(w.player.dirty - before.dirty).toBe(r.dirty);
      expect(w.player.cash - before.cash).toBe(r.clean);
      if (job.kind !== 'smuggle') expect(w.player.stash.goods.n - before.goods).toBe(r.goods);
    }
  });
  it('the odds on a scene are the odds rolled: a 100% scene always lands, a refused one never runs', () => {
    const w = mk();
    const here = select.peopleOn(w, w.player.blockId)[0];
    const q = select.quote(w, 'chat', here.id);
    expect(q.chance).toBe(100);
    const after = dispatch(w, { type: 'scene', kind: 'chat', npcId: here.id });
    expect(after.npcs[here.id].rel.trust).toBeGreaterThan(w.npcs[here.id].rel.trust);
  });
  it('every event option describes itself from the effects it runs', () => {
    const w = run({ days: 25, seed: 9, size: 'small' }).w;
    const rng = new Rng(4);
    let built = 0;
    for (const t of TEMPLATES) {
      if (t.weight(w) <= 0) continue;
      const e = t.build(w, rng, {});
      if (!e) continue;
      built++;
      for (const o of e.options) { expect(o.hint).toBe(describeEffects(w, o.effects)); expect(o.label.length).toBeGreaterThan(0); }
      // and applying any option never throws on a copy of the world
      for (const o of e.options) expect(() => apply(structuredClone(w), o.effects, new Rng(1))).not.toThrow();
    }
    expect(built).toBeGreaterThan(5);
  }, 60000);
});

describe('laundering only when you ask for it', () => {
  it('a laundry that is switched off washes nothing, and switched on it washes', () => {
    let w = mk();
    const biz = Object.values(w.businesses).find(b => b.tier < 3 && ['laundromat', 'diner', 'restaurant', 'motel', 'nightclub'].includes(b.type))!;
    biz.ownedBy = PLAYER; w.player.businessIds.push(biz.id);
    w.player.cash = 10000; w.player.dirty = 5000; w.player.blockId = biz.blockId;
    w = dispatch(w, { type: 'start_racket', businessId: biz.id, kind: 'laundering' });
    const r = Object.values(w.rackets).find(x => x.owner === PLAYER && x.kind === 'laundering')!;
    expect(r.on).toBe(true);
    w = dispatch(w, { type: 'toggle_wash', racketId: r.id });
    expect(w.rackets[r.id].on).toBe(false);
    const dirty = w.player.dirty;
    w.events = []; w = dispatch(w, { type: 'end_day' });
    expect(w.history[w.history.length - 1].washed).toBe(0);
    expect(w.player.dirty).toBeGreaterThanOrEqual(dirty - 1000);   // wages and rent may come out of it; washing may not
    w.events = []; w = dispatch(w, { type: 'toggle_wash', racketId: r.id });
    const cash = w.player.cash;
    w.events = []; w = dispatch(w, { type: 'end_day' });
    expect(w.player.cash).toBeGreaterThan(cash);
  });
  it('the fixer\'s window opens again every morning', () => {
    let w = mk();
    const fx = w.npcs[w.fixerId!]; fx.rel.met = 1;
    w.player.dirty = 20000;
    const cap = select.fixerCap(w);
    w = dispatch(w, { type: 'fixer_wash', amount: cap });
    expect(can(w, { type: 'fixer_wash', amount: 500 }).ok, 'the window is spent for today').toBe(false);
    w.events = []; w = dispatch(w, { type: 'end_day' });
    expect(w.history[w.history.length - 1].washed).toBe(cap);
    w.events = [];
    expect(can(w, { type: 'fixer_wash', amount: cap }).ok, 'and open again tomorrow').toBe(true);
  });
  it('without a laundry of your own, dirty money stays dirty overnight', () => {
    let w = mk();
    w.player.dirty = 8000; const cash = w.player.cash;
    w.events = []; w = dispatch(w, { type: 'end_day' });
    expect(w.player.cash).toBeLessThanOrEqual(cash);
    expect(w.player.dirty).toBeGreaterThan(7000);
  });
});

describe('ground', () => {
  it('bleed from a stronghold stops at the cap and never outbids an outfit that holds the block', () => {
    let w = mk();
    const b = w.blocks[w.player.blockId];
    const bizs = b.businessIds.map(id => w.businesses[id]);
    for (const x of bizs) { x.ownedBy = PLAYER; w.player.businessIds.push(x.id); }
    w.player.dirty = 50000; w.player.cash = 50000;
    for (const x of bizs) for (const k of (RACKETS && Object.keys(RACKETS)) as never[]) if (can(w, { type: 'start_racket', businessId: x.id, kind: k }).ok) { w = dispatch(w, { type: 'start_racket', businessId: x.id, kind: k }); w.player.ap = 8; }
    b.influence[PLAYER] = 90;
    const rival = Object.keys(w.factions)[0];
    const nb = b.neighborIds[0];
    w.blocks[nb].influence = { [rival]: 70 };
    for (let d = 0; d < 40; d++) { w.events = []; w.player.ap = 8; w = dispatch(w, { type: 'end_day' }); if (w.over) break; }
    for (const id of w.blocks[w.player.blockId].neighborIds) if (select.depth(w, id) === 0) expect(w.blocks[id].influence[PLAYER] ?? 0).toBeLessThanOrEqual(select.TERRITORY.spillCap + 0.01);
    expect(select.blockController(w, nb)).not.toBe(PLAYER);
  });
});

describe('the soak bot', () => {
  it.each([1, 2])('seed %i: plays forty days without breaking an invariant, and gets somewhere', seed => {
    const r = run({ days: 40, seed, size: 'medium' });
    expect(r.w.day).toBeGreaterThan(20);
    const first = r.w.history[0]?.worth ?? 0, last = r.w.history[r.w.history.length - 1]?.worth ?? 0;
    expect(last).toBeGreaterThan(first);
    expect(r.refused / Math.max(1, r.actions)).toBeLessThan(0.2);
  }, 90000);
});
