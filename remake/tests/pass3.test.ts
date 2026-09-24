/**
 * The third pass: kit carried by people, hostages, the Commission, landmark set-pieces, and the
 * bot's temperaments. Each block pins the contract the UI promises — the price on the button is the
 * price paid, the lean on the table is the vote — rather than the balance numbers, which move.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ITEMS, type ItemId } from '@r/content/kit';
import { SETPIECES, SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { can, dispatch, migrate, newWorld, select, PLAYER, type Action, type World } from '@r/sim/index';
import { holdHostage, snatchCrew, HOSTAGE } from '@r/sim/hostages';
import { COMMISSION, LOBBY_PULL, leanOf, lobbyCost, tally } from '@r/sim/commission';
import { hire } from '@r/sim/people';
import { buildJob } from '@r/sim/jobs';
import { Rng } from '@r/sim/rng';
import { missing, run, STYLES, STYLE_IDS } from '@r/scripts/bot';

// vitest runs a file's tests back to back without giving the event loop a turn, so its worker
// cannot answer the runner while this file's long bot runs go on, and after sixty seconds the run
// fails on an RPC timeout with every assertion green. One macrotask between tests lets it answer.
afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (seed = 7, size: 'small' | 'medium' | 'large' = 'medium') => newWorld({ seed, size, name: 'T', background: 'grifter' });
const endDay = (w: World) => { w.events = []; return dispatch(w, { type: 'end_day' }); };
/** Somebody on the street, made crew for the test. */
function recruit(w: World, n = 1): string[] {
  const out: string[] = [];
  for (const x of Object.values(w.npcs)) {
    if (out.length >= n) break;
    if (!x.alive || x.crew || x.faction || x.official || x.id === w.fixerId) continue;
    hire(w, x, 100); out.push(x.id);
  }
  return out;
}
const shopFor = (w: World, item: ItemId) => Object.values(w.businesses).find(b => ITEMS[item].sold.includes(b.type) && b.closed <= 0);
/** Try an action on fresh copies of the world, one rng state after another, until `ok` says it went the way the test needs. */
function until(w: World, a: (x: World) => World, ok: (x: World) => boolean, tries = 60): World {
  for (let k = 0; k < tries; k++) { const x = structuredClone(w); x.rng = 1000 + k * 7919; const y = a(x); if (ok(y)) return y; }
  throw new Error('never happened');
}

// ---------------------------------------------------------------------------------------- kit
describe('kit', () => {
  it('counts on the person carrying it and nobody else', () => {
    const w = mk();
    const [a, b] = recruit(w, 2);
    const before = [select.skillOf(w, a, 'muscle'), select.skillOf(w, b, 'muscle')];
    w.player.armoury.push('pistol');
    const x = dispatch(w, { type: 'equip', item: 'pistol', to: a });
    expect(select.skillOf(x, a, 'muscle')).toBe(before[0] + ITEMS.pistol.bonus);
    expect(select.skillOf(x, b, 'muscle')).toBe(before[1]);
    expect(x.player.armoury).not.toContain('pistol');
  });
  it('a shop sells only while you stand on its block, at the price on the button, and it goes on you first', () => {
    let w = mk();
    w.player.cash = 50000;
    const shop = shopFor(w, 'bat') ?? shopFor(w, 'crowbar')!;
    const item = (select.shopItems(w, shop.id))[0];
    if (w.player.blockId === shop.blockId) w.player.blockId = w.blocks[shop.blockId].neighborIds[0];
    expect(can(w, { type: 'buy_item', item, at: shop.id }).why).toMatch(/be there/);
    w.player.blockId = shop.blockId;
    const q = can(w, { type: 'buy_item', item, at: shop.id });
    expect(q.cash).toBe(ITEMS[item].price);
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'buy_item', item, at: shop.id });
    expect(w.player.cash + w.player.dirty).toBe(cash - ITEMS[item].price);
    expect(w.player.kit[ITEMS[item].slot]).toBe(item);
    // the second of the same kind goes to the armoury, because the slot is full
    w = dispatch(w, { type: 'buy_item', item, at: shop.id });
    expect(w.player.armoury).toContain(item);
    // and nothing a shop does not stock can be bought there
    const not = (Object.keys(ITEMS) as ItemId[]).find(i => !select.shopItems(w, shop.id).includes(i))!;
    expect(can(w, { type: 'buy_item', item: not, at: shop.id }).ok).toBe(false);
  });
  it('the fixer sells the serious things, once met', () => {
    const w = mk(); w.player.cash = 50000;
    expect(can(w, { type: 'buy_item', item: 'kevlar', at: 'fixer' }).why).toMatch(/fixer/i);
    w.npcs[w.fixerId!].rel.met = 1;
    expect(can(w, { type: 'buy_item', item: 'kevlar', at: 'fixer' }).ok).toBe(true);
  });
  it('whatever was in the slot goes back to the armoury, and unequipping puts it there too', () => {
    let w = mk();
    w.player.kit = { weapon: 'bat' }; w.player.armoury = ['pistol'];
    w = dispatch(w, { type: 'equip', item: 'pistol', to: PLAYER });
    expect(w.player.kit.weapon).toBe('pistol'); expect(w.player.armoury).toEqual(['bat']);
    w = dispatch(w, { type: 'unequip', from: PLAYER, slot: 'weapon' });
    expect(w.player.kit.weapon).toBeUndefined(); expect(w.player.armoury.sort()).toEqual(['bat', 'pistol']);
  });
  it('somebody you let go hands their kit back', () => {
    let w = mk();
    const [a] = recruit(w);
    w.player.armoury = ['kevlar'];
    w = dispatch(w, { type: 'equip', item: 'kevlar', to: a });
    w = dispatch(w, { type: 'fire', npcId: a });
    expect(w.player.armoury).toContain('kevlar');
  });
  it('armour stacks the way layers do and never reaches 1', () => {
    const one = select.armourOf({ armour: 'plates' });
    const two = select.armourOf({ armour: 'plates', car: 'armoured_van' });
    expect(one).toBeCloseTo(ITEMS.plates.armour!);
    expect(two).toBeCloseTo(1 - (1 - ITEMS.plates.armour!) * (1 - ITEMS.armoured_van.armour!));
    expect(two).toBeLessThan(1);
  });
  it('a save from the gear days carries the same gear, as things the boss holds', () => {
    const w = mk() as World & { player: World['player'] & { gear?: Record<string, number> } };
    delete (w.player as { kit?: unknown }).kit; delete (w.player as { armoury?: unknown }).armoury;
    w.player.gear = { weapons: 2, tools: 0, wheels: 3, tech: 1 };
    migrate(w);
    expect(w.player.gear).toBeUndefined();
    expect(w.player.kit).toEqual({ weapon: 'pistol', car: 'armoured_van', tech: 'scanner' });
    expect(w.player.armoury).toEqual([]);
  });
  it('every item has a price, a slot, somewhere to buy it, and does something', () => {
    for (const [id, d] of Object.entries(ITEMS)) {
      expect(d.price, id).toBeGreaterThan(0);
      expect(d.sold.length, id).toBeGreaterThan(0);
      expect((d.skill ? d.bonus : 0) + (d.armour ?? 0), id).toBeGreaterThan(0);
    }
  });
});

// ----------------------------------------------------------------------------------- hostages
describe('hostages', () => {
  const withRoom = (w: World) => { w.player.cash = 50000; w = dispatch(w, { type: 'rent_safehouse', blockId: w.player.blockId }); return w; };
  const victim = (w: World) => Object.values(w.npcs).find(n => n.alive && !n.crew && !n.faction && !n.official && n.wealth >= 50 && n.id !== w.fixerId)!;
  it('a successful snatch with a back room holds them instead of paying on the spot', () => {
    let w = withRoom(mk());
    const v = victim(w);
    const j = buildJob(w, new Rng(3), { kind: 'kidnap', blockId: v.homeBlockId, npcId: v.id })!;
    j.status = 'ready'; j.difficulty = 5; j.crewMin = 0;
    const dirty = w.player.dirty;
    w = until(w, x => { let y = dispatch(x, { type: 'launch_job', jobId: j.id, approach: 'quiet' }); for (let k = 0; k < 3 && select.pendingJob(y); k++) { const pj = select.pendingJob(y)!; y = dispatch(y, { type: 'answer', jobId: pj.id, optionId: pj.complication!.options.find(o => o.payout > 0)!.id }); } return y; }, y => !!y.jobs[j.id].result?.success);
    const h = Object.values(w.hostages).find(x => x.npcId === v.id)!;
    expect(h).toBeTruthy();
    expect(h.holder).toBe(PLAYER);
    expect(w.player.dirty).toBe(dirty);
    expect(w.cases[h.caseId!]?.crime).toBe('kidnap');
  });
  it('the offer climbs every day to its ceiling, the file thickens, and the button pays what it says', () => {
    let w = withRoom(mk());
    const v = victim(w);
    const sid = w.player.safehouseIds[0];
    const h = holdHostage(w, v.id, 4000, sid);
    // somebody on the door, so this test is about money and not about escapes
    const [g] = recruit(w); w.npcs[g].crew!.assignment = { kind: 'guard', blockId: w.safehouses[sid].blockId };
    const ev = w.cases[h.caseId!].evidence;
    let last = h.ransom;
    for (let d = 0; d < 8 && w.hostages[h.id]; d++) { w = endDay(w); const now = w.hostages[h.id]; if (!now) break; expect(now.ransom).toBeGreaterThanOrEqual(last); last = now.ransom; }
    if (w.hostages[h.id]) {
      expect(last).toBeLessThanOrEqual(Math.round(4000 * HOSTAGE.ceiling / 50) * 50);
      expect(w.cases[h.caseId!].evidence).toBeGreaterThan(ev);
      const dirty = w.player.dirty;
      w = dispatch(w, { type: 'hostage', id: h.id, choice: 'ransom' });
      expect(w.player.dirty).toBe(dirty + last);
      expect(w.hostages[h.id]).toBeUndefined();
    }
  });
  it('somebody held is off the street: no scenes, no casing', () => {
    const w = withRoom(mk());
    const v = victim(w);
    holdHostage(w, v.id, 3000, w.player.safehouseIds[0]);
    expect(can(w, { type: 'scene', kind: 'chat', npcId: v.id }).ok).toBe(false);
    expect(can(w, { type: 'case', kind: 'con', npcId: v.id }).ok).toBe(false);
  });
  it('killing them ends it, and the kidnap file becomes a murder file', () => {
    let w = withRoom(mk());
    const v = victim(w);
    const h = holdHostage(w, v.id, 3000, w.player.safehouseIds[0]);
    w = dispatch(w, { type: 'hostage', id: h.id, choice: 'kill' });
    expect(w.npcs[v.id].alive).toBe(false);
    expect(w.cases[h.caseId!].crime).toBe('murder');
    expect(Object.keys(w.hostages)).toHaveLength(0);
  });
  it('one of yours taken by an outfit: pay and they come home; do not, and on day five they do not', () => {
    const base = mk();
    const [a] = recruit(base);
    const f = Object.values(base.factions)[0];
    snatchCrew(base, f.id, a, new Rng(1));
    const h = Object.values(base.hostages)[0];
    expect(base.npcs[a].crew!.status).toBe('held');
    let paid = structuredClone(base); paid.player.cash = h.ransom;
    paid = dispatch(paid, { type: 'hostage', id: h.id, choice: 'pay' });
    expect(paid.player.cash + paid.player.dirty).toBe(0);
    expect(paid.npcs[a].crew!.status).not.toBe('held');
    let left = structuredClone(base);
    for (let d = 0; d < 6; d++) left = endDay(left);
    expect(left.npcs[a].alive).toBe(false);
    expect(left.hostages[h.id]).toBeUndefined();
  });
  it('nobody holds the dead', () => {
    const w = withRoom(mk());
    const v = victim(w);
    holdHostage(w, v.id, 3000, w.player.safehouseIds[0]);
    w.npcs[v.id].alive = false;
    const x = endDay(w);
    expect(Object.values(x.hostages).some(h => h.npcId === v.id)).toBe(false);
  });
});

// --------------------------------------------------------------------------------- commission
describe('the Commission', () => {
  const toMeeting = (w: World) => { while (!w.commission.proposal && w.day < 60) w = endDay(w); return w; };
  it('says what is on the table three days before it meets, and meets on the day', () => {
    let w = mk();
    w = toMeeting(w);
    expect(w.commission.proposal).toBeTruthy();
    expect(w.commission.nextDay - w.day).toBeLessThanOrEqual(COMMISSION.announceDays);
    const day = w.commission.nextDay;
    while (w.day <= day) w = endDay(w);
    expect(w.commission.history[0]?.day).toBe(day);
    expect(w.commission.proposal).toBeUndefined();
  });
  it('every vote is the sign of the lean the table shows', () => {
    const w = toMeeting(mk(3));
    const p = w.commission.proposal!;
    const t = tally(w, p);
    for (const v of t.votes) expect(v.yes).toBe(leanOf(w, w.factions[v.id], p) > 0);
  });
  it('an envelope costs what the button says and moves the lean by exactly the pull, once', () => {
    let w = toMeeting(mk());
    w.player.cash = 100000;
    const f = Object.values(w.factions).find(x => x.alive && (w.npcs[x.bossId]?.rel.owes ?? 0) === 0)!;
    const p = w.commission.proposal!;
    const before = leanOf(w, f, p), cost = lobbyCost(f), cash = w.player.cash + w.player.dirty;
    expect(can(w, { type: 'lobby', factionId: f.id, side: 'yes' }).cash).toBe(cost);
    w = dispatch(w, { type: 'lobby', factionId: f.id, side: 'yes' });
    expect(leanOf(w, w.factions[f.id], p)).toBe(before + LOBBY_PULL);
    expect(w.player.cash + w.player.dirty).toBe(cash - cost);
    expect(can(w, { type: 'lobby', factionId: f.id, side: 'no' }).ok).toBe(false);
  });
  it('a boss who owes you votes your way for the favour, not the money', () => {
    let w = toMeeting(mk());
    const f = Object.values(w.factions).find(x => x.alive)!;
    w.npcs[f.bossId].rel.owes = 1;
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'lobby', factionId: f.id, side: 'no' });
    expect(w.player.cash + w.player.dirty).toBe(cash);
    expect(w.npcs[f.bossId].rel.owes).toBe(0);
  });
  it('without three outfits standing, the table does not sit', () => {
    let w = mk();
    const fs = Object.values(w.factions);
    for (const f of fs.slice(2)) f.alive = false;
    for (let d = 0; d < 30; d++) w = endDay(w);
    expect(w.commission.history).toHaveLength(0);
  });
  it('only a seated boss votes', () => {
    const w = toMeeting(mk());
    expect(can(w, { type: 'commission_vote', vote: 'yes' }).ok).toBe(false);
    w.commission.seated = true;
    expect(can(w, { type: 'commission_vote', vote: 'yes' }).ok).toBe(true);
  });
});

// --------------------------------------------------------------------------------- set-pieces
describe('landmark set-pieces', () => {
  it('every city has landmarks worth one, and a park is never one', () => {
    for (const seed of [1, 2, 3, 7]) {
      const w = mk(seed);
      const marks = Object.values(w.blocks).filter(b => setpieceFor(b.landmark));
      expect(marks.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      for (const b of Object.values(w.blocks)) if (select.isParkBlock(b)) expect(setpieceFor(b.landmark)).toBeUndefined();
    }
  });
  it('comes only to somebody the street takes seriously', () => {
    const w = mk();
    const court = Object.values(w.blocks).find(b => b.landmark === 'the courthouse')!;
    const a: Action = { type: 'case', kind: 'setpiece', blockId: court.id };
    expect(can(w, a).why).toMatch(String(SETPIECE_RANK));
    w.player.fear = 40; w.player.respect = 40;
    expect(can(w, a).ok).toBe(true);
    const x = dispatch(w, a);
    const j = Object.values(x.jobs).find(y => y.kind === 'setpiece')!;
    expect(j.setpiece!.id).toBe('locker');
    expect(can(x, a).ok).toBe(false);     // one at a time
  });
  it('stops at every stage and finishes after the last', () => {
    let w = mk();
    w.player.fear = 40; w.player.respect = 40;
    const b = Object.values(w.blocks).find(x => setpieceFor(x.landmark))!;
    w = dispatch(w, { type: 'case', kind: 'setpiece', blockId: b.id });
    const j = Object.values(w.jobs).find(y => y.kind === 'setpiece')!;
    w.jobs[j.id].status = 'ready'; w.jobs[j.id].crewMin = 0; w.player.ap = 9;
    w = dispatch(w, { type: 'launch_job', jobId: j.id, approach: 'clever' });
    let stages = 0;
    while (select.pendingJob(w)) {
      const pj = select.pendingJob(w)!;
      stages++;
      expect(pj.complication!.title).toMatch(`Stage ${stages} of ${pj.setpiece!.stages}`);
      w.jobs[pj.id].rolled = true;
      w = dispatch(w, { type: 'answer', jobId: pj.id, optionId: pj.complication!.options.filter(o => o.payout > 0).sort((a, c) => Number(!!c.safe) - Number(!!a.safe))[0].id });
      expect(stages).toBeLessThanOrEqual(3);
    }
    expect(w.jobs[j.id].result).toBeTruthy();
    expect(stages).toBeGreaterThanOrEqual(1);
  });
  it('the evidence locker burns the files on you and yours', () => {
    let w = mk();
    w.player.fear = 40; w.player.respect = 40; w.player.ap = 9;
    const court = Object.values(w.blocks).find(b => b.landmark === 'the courthouse')!;
    w.cases.c1 = { id: 'c1', crime: 'fraud', suspectId: PLAYER, witnessIds: [], evidence: 90, status: 'open', opened: 1, summary: 'test' } as World['cases'][string];
    w = dispatch(w, { type: 'case', kind: 'setpiece', blockId: court.id });
    const j = Object.values(w.jobs).find(y => y.kind === 'setpiece')!;
    w.jobs[j.id].status = 'ready'; w.jobs[j.id].crewMin = 0; w.jobs[j.id].difficulty = 5;
    w = until(w, x => {
      let y = dispatch(x, { type: 'launch_job', jobId: j.id, approach: 'clever' });
      while (select.pendingJob(y)) { const pj = select.pendingJob(y)!; y.jobs[pj.id].rolled = true; y = dispatch(y, { type: 'answer', jobId: pj.id, optionId: pj.complication!.options.filter(o => o.payout > 0)[0].id }); }
      return y;
    }, y => !!y.jobs[j.id].result?.success);
    expect(w.cases.c1.evidence).toBeLessThan(90);
  });
  it('every set-piece is a real job: stages, a take or an effect, and heat', () => {
    for (const s of SETPIECES) {
      expect(s.stages).toBeGreaterThanOrEqual(2);
      expect(s.payout.dirty[1] + s.payout.clean[1] + s.payout.goods[1] > 0 || s.effect !== 'none', s.id).toBe(true);
      expect(s.heat).toBeGreaterThan(0);
    }
  });
});

// -------------------------------------------------------------------------------- temperaments
describe('the bots, from timid to maniac', () => {
  it.each(STYLE_IDS)('%s plays thirty days without breaking an invariant', style => {
    const r = run({ days: 30, seed: 2, size: 'small', style });
    expect(r.w.day).toBeGreaterThan(Math.min(20, r.w.over?.day ?? 20));
    expect(r.refused / Math.max(1, r.actions)).toBeLessThan(0.2);
  }, 60000);
  it('ferocity shows: the maniac starts wars and the timid boss never does', () => {
    const timid = run({ days: 30, seed: 2, size: 'small', style: 'timid' });
    const maniac = run({ days: 30, seed: 2, size: 'small', style: 'maniac' });
    expect(timid.counts.declared ?? 0).toBe(0);
    expect(maniac.counts.declared ?? 0).toBeGreaterThan(0);
    expect(STYLES.maniac.takeAt).toBeLessThan(STYLES.timid.takeAt);
  }, 60000);
  // one run per test: a single sixty-second synchronous test starves vitest's worker RPC and the
  // run fails on a timeout even though every assertion passed
  const union: Record<string, number> = {};
  it.each(STYLE_IDS)('sixty days on seed 7, played %s', style => {
    for (const [k, v] of Object.entries(run({ days: 60, seed: 7, size: 'medium', style }).counts)) union[k] = (union[k] ?? 0) + (v ?? 0);
  }, 60000);
  it('between them, those runs reach every system — set-pieces, hostages and the Commission included', () => {
    expect(missing(union)).toEqual([]);
  });
});
