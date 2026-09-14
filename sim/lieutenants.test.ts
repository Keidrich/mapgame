import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type World } from './index';
import { mkRacket } from './reducer';
import { racketIncome } from './economy';
import { flipLieutenant, tickLieutenants } from './lieutenants';
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

describe('a lieutenant who is not a lieutenant any more', () => {
  /**
   * The "somebody is courting your lieutenant" card is drawn at End Day and answered the next
   * morning. Between those two moments the tick can jail them, a case can charge them, or they
   * can simply be reassigned — and resolving the card then read `.districtId` off an assignment
   * that was gone, which crashed the whole game. The soak bot's coverage sweep hit it first run.
   */
  const promoted = (seed = 5) => {
    const { w, npcId, districtId } = setup(seed);
    const n = w.npcs[npcId];
    n.crew!.assignment = { kind: 'lieutenant', districtId };
    n.crew!.status = 'assigned';
    const f = Object.values(w.factions).find(x => x.alive)!;
    return { w, n, f, districtId };
  };

  it('does not throw when the assignment has gone', () => {
    const { w, n, f } = promoted();
    n.crew!.assignment = undefined;          // jailed overnight, say
    expect(() => flipLieutenant(w, n, f)).not.toThrow();
    expect(w.player.crewIds).not.toContain(n.id);
    expect(n.faction).toBe(f.id);
  });

  it('does not throw when they are not crew at all any more', () => {
    const { w, n, f } = promoted();
    n.crew = undefined;
    expect(() => flipLieutenant(w, n, f)).not.toThrow();
  });

  it('does not throw when the district itself has gone', () => {
    const { w, n, f } = promoted();
    n.crew!.assignment = { kind: 'lieutenant', districtId: 'no_such_district' };
    expect(() => flipLieutenant(w, n, f)).not.toThrow();
  });

  it('still takes the district with them when the assignment is intact', () => {
    const { w, n, f, districtId } = promoted();
    const blockId = w.districts[districtId].blockIds[0];
    w.blocks[blockId].influence[PLAYER] = 50;
    flipLieutenant(w, n, f);
    expect(w.blocks[blockId].influence[PLAYER] ?? 0).toBeLessThan(50);
    expect(f.lieutenantIds).toContain(n.id);
  });
});
