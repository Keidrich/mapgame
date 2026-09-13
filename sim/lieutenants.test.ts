import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type World } from './index';
import { mkRacket } from './reducer';
import { racketIncome } from './economy';
import { tickLieutenants } from './lieutenants';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/** A world with one crew member who qualifies for promotion and one numbers racket in the start district. */
function setup(seed = 5): { w: World; npcId: string; districtId: string; racketId: string } {
  const w = mk(seed); w.player.cash = 50000; w.day = 20;
  const start = select.startBlock(w);
  const biz = select.businessesIn(w, start.id).find(b => b.type === 'bar' || b.type === 'diner' || b.type === 'corner_store') ?? select.businessesIn(w, start.id)[0];
  const r = mkRacket(w, 'numbers', biz);
  const n = Object.values(w.npcs).find(x => x.role === 'patron' && x.alive)!;
  n.skills = { muscle: 4, brains: 4, charm: 4, wheels: 2, tech: 1 }; n.traits = [];
  n.crew = { loyalty: 70, cut: 60, status: 'idle', statusDays: 0, joinedDay: 5 }; n.role = 'crew'; w.player.crewIds.push(n.id);
  return { w, npcId: n.id, districtId: start.districtId, racketId: r.id };
}

describe('lieutenants', () => {
  it('promotion has requirements and covers unmanned rackets', () => {
    const { w, npcId, districtId, racketId } = setup();
    const before = racketIncome(w, w.rackets[racketId]);
    const n = w.npcs[npcId];
    n.crew!.loyalty = 30;
    expect(can(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId } }).ok).toBe(false);
    n.crew!.loyalty = 70;
    const other = Object.values(w.districts).find(d => d.id !== districtId)!;
    expect(can(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId: other.id } }).ok).toBe(false); // nothing there to run
    const w2 = dispatch(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId } });
    expect(select.lieutenantOf(w2, districtId)?.id).toBe(npcId);
    expect(w2.npcs[npcId].crew!.cut).toBe(90);
    expect(racketIncome(w2, w2.rackets[racketId])).toBeGreaterThan(before);
    // demotion restores the wage
    const w3 = dispatch(w2, { type: 'assign', npcId });
    expect(w3.npcs[npcId].crew!.cut).toBe(60);
    expect(select.lieutenantOf(w3, districtId)).toBeUndefined();
  });
  it('a greedy, unhappy lieutenant skims and an audit finds it', () => {
    let { w, npcId, districtId } = setup();
    w = dispatch(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId } });
    const n = w.npcs[npcId]; n.traits = ['greedy']; n.crew!.loyalty = 40; w.player.dirty = 100000; w.player.skills.brains = 8;
    const rng = new Rng(1);
    for (let i = 0; i < 40; i++) tickLieutenants(w, rng, { [districtId]: 1000 });
    expect(n.crew!.skim ?? 0).toBeGreaterThan(0);
    expect(w.player.dirty).toBeLessThan(100000);
    const dirty = w.player.dirty; w.player.ap = 8;
    let w2 = w; let tries = 0;
    while ((w2.npcs[npcId].crew!.skim ?? 0) > 0 && tries++ < 6) { w2 = dispatch(w2, { type: 'audit', npcId }); w2.player.ap = 8; }
    expect(w2.npcs[npcId].crew!.skim ?? 0).toBe(0);
    expect(w2.player.dirty).toBeGreaterThan(dirty);
  });
  it('a hostile faction with a foothold flips a disloyal lieutenant', () => {
    let { w, npcId, districtId } = setup();
    w = dispatch(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId } });
    const n = w.npcs[npcId]; n.traits = ['ambitious', 'greedy']; n.crew!.loyalty = 20;
    const f = Object.values(w.factions)[0]; f.stance[PLAYER] = 'war'; f.standing[PLAYER] = -80;
    const d = w.districts[districtId]; for (const bid of d.blockIds) w.blocks[bid].influence[f.id] = 30;
    const rng = new Rng(3);
    for (let i = 0; i < 60 && n.crew; i++) tickLieutenants(w, rng, { [districtId]: 500 });
    expect(n.crew).toBeUndefined();
    expect(n.faction).toBe(f.id);
    expect(f.lieutenantIds).toContain(n.id);
    expect(w.player.crewIds).not.toContain(n.id);
  });
  it('a loyal lieutenant brings the offer to you instead', () => {
    let { w, npcId, districtId } = setup();
    w = dispatch(w, { type: 'assign', npcId, assignment: { kind: 'lieutenant', districtId } });
    const n = w.npcs[npcId]; n.traits = ['loyal']; n.crew!.loyalty = 80;
    const f = Object.values(w.factions)[0]; f.stance[PLAYER] = 'beef';
    const d = w.districts[districtId]; for (const bid of d.blockIds) w.blocks[bid].influence[f.id] = 30;
    const rng = new Rng(3);
    for (let i = 0; i < 80 && !w.pendingEvents.some(e => e.kind === 'lt_offer'); i++) tickLieutenants(w, rng, { [districtId]: 500 });
    const e = w.pendingEvents.find(e => e.kind === 'lt_offer')!;
    expect(e).toBeDefined();
    expect(n.crew).toBeDefined();
    const w2 = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: 'raise' });
    expect(w2.npcs[npcId].crew!.loyalty).toBeGreaterThan(80);
    expect(w2.npcs[npcId].crew!.cut).toBeGreaterThan(90);
  });
});
