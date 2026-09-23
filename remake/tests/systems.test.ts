/** The second pass: street crews, lieutenants skimming and audits, specialists, save migration. */
import { describe, expect, it } from 'vitest';
import { can, dispatch, migrate, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { generateStreetCrews, CREW } from '@r/sim/streetcrews';
import { skimmer } from '@r/sim/tick';
import { Rng } from '@r/sim/rng';

const mk = (seed = 7, size: 'small' | 'medium' | 'large' = 'medium') => newWorld({ seed, size, name: 'T', background: 'grifter' });
const endDay = (w: World) => { w.events = []; return dispatch(w, { type: 'end_day' }); };

describe('street crews', () => {
  it.each(['small', 'medium', 'large'] as const)('a %s city has crews on corners nobody holds', size => {
    const w = mk(3, size);
    const crews = Object.values(w.crews);
    expect(crews.length).toBeGreaterThanOrEqual(2);
    for (const c of crews) { expect(w.npcs[c.bossId].alive).toBe(true); expect(select.blockController(w, c.blockId)).toBeUndefined(); }
  });
  it('a save from before crews existed gains exactly the crews a new game with that seed has', () => {
    const fresh = mk(11);
    const old = mk(11) as World & { crews?: World['crews'] };
    // what the first release saved: everything but the crews and the people they brought with them
    for (const c of Object.values(old.crews)) delete old.npcs[c.bossId];
    delete (old as { crews?: unknown }).crews;
    old.nextId -= Object.keys(fresh.crews).length * 2;
    migrate(old);
    expect(Object.values(old.crews).map(c => [c.name, c.blockId, c.members])).toEqual(Object.values(fresh.crews).map(c => [c.name, c.blockId, c.members]));
  });
  it('adding crews changed nothing else about a seed\'s city', () => {
    const w = mk(11);
    const without = structuredClone(w);
    for (const c of Object.values(without.crews)) delete without.npcs[c.bossId];
    without.crews = {};
    generateStreetCrews(without);
    expect(JSON.stringify(without.blocks)).toBe(JSON.stringify(w.blocks));
  });
  it('an ignored crew grows into an outfit', () => {
    let w = mk(5);
    const c = Object.values(w.crews)[0];
    c.members = CREW.outfitAt - 1;
    const outfits = Object.keys(w.factions).length;
    for (let d = 0; d < 60 && w.crews[c.id]; d++) { w.crews[c.id] && (w.crews[c.id].members = Math.max(w.crews[c.id].members, CREW.outfitAt - 1)); w = endDay(w); }
    expect(w.crews[c.id]).toBeUndefined();
    expect(Object.keys(w.factions).length).toBe(outfits + 1);
    const f = Object.values(w.factions).find(x => x.bossId === c.bossId)!;
    expect(select.factionBlocks(w, f.id).map(b => b.id)).toContain(c.blockId);
  });
  it('skims a quarter of your protection on its block until you deal with it', () => {
    let w = mk(5);
    const c = Object.values(w.crews)[0];
    const biz = w.businesses[w.blocks[c.blockId].businessIds[0]];
    biz.protection = { by: PLAYER, rate: 0.12, since: 1 };
    const full = select.protectionTake(biz);
    const before = w.player.dirty;
    w = endDay(w);
    const got = w.player.dirty - before;
    expect(got).toBe(Math.round(full * (1 - CREW.skim)));
    w.crews[c.id].terms = 'paid'; w.crews[c.id].wage = 0; w.player.cash = 5000;
    const b2 = w.player.dirty;
    w = endDay(w);
    expect(w.player.dirty - b2).toBe(select.protectionTake(w.businesses[biz.id]));
  });
  it('the boss answers to the scenes, and nobody can recruit them out from under their crew', () => {
    const w = mk(5);
    const c = Object.values(w.crews)[0];
    w.player.blockId = c.blockId;
    expect(select.quote(w, 'crew_pay', c.bossId).disabled).toBeUndefined();
    expect(select.quote(w, 'crew_run', c.bossId).chance).toBeGreaterThan(0);
    expect(select.quote(w, 'recruit', c.bossId).disabled).toMatch(/crew of their own/);
  });
});

describe('a lieutenant with a hand in the till', () => {
  function withLieutenant(greedy: boolean) {
    let w = mk(9);
    const b = w.blocks[w.player.blockId];
    const biz = w.businesses[b.businessIds[0]];
    biz.ownedBy = PLAYER; w.player.businessIds.push(biz.id); w.player.cash = 50000;
    const kind = ['numbers', 'bookmaking', 'chop_shop', 'smuggling', 'card_skimming', 'fencing'].find(k => can(w, { type: 'start_racket', businessId: biz.id, kind: k as never }).ok)!;
    w = dispatch(w, { type: 'start_racket', businessId: biz.id, kind: kind as never });
    const n = Object.values(w.npcs).find(x => x.role === 'patron' && x.alive)!;
    n.crew = { loyalty: 60, cut: 0, joined: 1, status: 'ready', statusDays: 0, xp: 0, level: 2, assignment: { kind: 'district', districtId: b.districtId } };
    n.traits = greedy ? ['greedy', 'quiet'] : ['loyal', 'quiet']; n.faction = PLAYER; w.player.crewIds.push(n.id);
    return { w, n, districtId: b.districtId };
  }
  it('a greedy one skims from the first day; a loyal one does not', () => {
    const g = withLieutenant(true), l = withLieutenant(false);
    expect(skimmer(g.w, g.districtId)?.id).toBe(g.n.id);
    expect(skimmer(l.w, l.districtId)).toBeUndefined();
    let w = g.w; for (let d = 0; d < 5; d++) w = endDay(w);
    expect(w.npcs[g.n.id].crew!.skimmed ?? 0).toBeGreaterThan(0);
  });
  it('an audit that catches them gets most of it back and stills their hands for three weeks', () => {
    let { w, n, districtId } = withLieutenant(true);
    for (let d = 0; d < 5; d++) w = endDay(w);
    w.player.skills.brains = 10; w.npcs[n.id].skills.brains = 1;
    const skimmed = w.npcs[n.id].crew!.skimmed!;
    const dirty = w.player.dirty;
    // a 95% audit still misses one time in twenty; start the roll somewhere it lands
    let s = 1; while (new Rng(s).float() > 0.5) s++; w.rng = s;
    w.events = []; w = dispatch(w, { type: 'audit', npcId: n.id });
    expect(w.player.dirty - dirty).toBe(Math.round(skimmed * 0.7));
    expect(skimmer(w, districtId)).toBeUndefined();
    expect(can(w, { type: 'audit', npcId: n.id }).ok, 'not the same books every morning').toBe(false);
  });
});

describe('specialists', () => {
  it('a specialist lifts the odds and costs what the button said', () => {
    let w = mk(4);
    w.player.cash = 100000; w.npcs[w.fixerId!].rel.met = 1;
    const j = Object.values(w.jobs).find(x => x.status === 'offer' && x.crewMin === 0)!;
    w = dispatch(w, { type: 'take_job', jobId: j.id, crewIds: [] });
    const lean = w.jobs[j.id].leans[0];
    const kind = ({ brains: 'safecracker', tech: 'hacker', wheels: 'driver', muscle: 'gunman', charm: 'face' } as const)[lean];
    const approach = (['quiet', 'loud', 'clever'] as const).find(a => select.leansFor(w.jobs[j.id], a)[0] === lean) ?? 'quiet';
    const before = select.jobOdds(w, w.jobs[j.id], [], approach).chance;
    const fee = select.specialistFee(w.jobs[j.id], kind);
    const cash = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'hire_specialist', jobId: j.id, kind });
    expect(w.player.cash + w.player.dirty).toBe(cash - fee);
    expect(select.jobOdds(w, w.jobs[j.id], [], approach).chance).toBeGreaterThan(before);
  });
  it('comes only through a fixer you have met', () => {
    let w = mk(4);
    const j = Object.values(w.jobs).find(x => x.status === 'offer' && x.crewMin === 0)!;
    w = dispatch(w, { type: 'take_job', jobId: j.id, crewIds: [] });
    expect(can(w, { type: 'hire_specialist', jobId: j.id, kind: 'driver' }).why).toMatch(/fixer/);
  });
});
