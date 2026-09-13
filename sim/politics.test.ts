import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type World } from './index';
import { successionOrDeath, tickCrisis, CRISIS_DAYS } from './politics';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });

/** A faction with two living lieutenants, so losing the boss means a contest. */
function withLieutenants(w: World) {
  const f = Object.values(w.factions)[0];
  const pool = Object.values(w.npcs).filter(n => n.alive && n.role === 'patron' && !n.crew).slice(0, 2);
  for (const n of pool) { n.role = 'lieutenant'; n.faction = f.id; if (!f.lieutenantIds.includes(n.id)) f.lieutenantIds.push(n.id); }
  f.lieutenantIds = f.lieutenantIds.filter(id => w.npcs[id]?.alive);
  return { f, a: w.npcs[f.lieutenantIds[0]], b: w.npcs[f.lieutenantIds[1]] };
}

describe('succession crises', () => {
  it('two lieutenants means a contest the player can back, and the winner owes you', () => {
    let w = mk(); w.player.cash = 20000; w.day = 10;
    const { f, a } = withLieutenants(w);
    w.npcs[f.bossId].alive = false; successionOrDeath(w, f);
    expect(f.crisis).toBeDefined(); expect(f.crisis!.candidateIds.length).toBe(2);
    const ev = w.pendingEvents.find(e => e.kind === 'succession')!; expect(ev).toBeDefined();
    w = dispatch(w, { type: 'resolve_event', eventId: ev.id, optionId: 'a' });
    expect(w.factions[f.id].crisis!.backing).toBe(a.id);
    // stack more money behind them through the action
    expect(can(w, { type: 'back_candidate', factionId: f.id, npcId: a.id, amount: 6000 }).ok).toBe(true);
    w = dispatch(w, { type: 'back_candidate', factionId: f.id, npcId: a.id, amount: 6000 });
    expect(w.factions[f.id].crisis!.backedWith).toBe(7500);
    const standing = w.factions[f.id].standing[PLAYER];
    w.day = w.factions[f.id].crisis!.resolvesDay;
    // heavy backing should carry the day across seeds
    let wins = 0;
    for (let i = 0; i < 10; i++) { const t = structuredClone(w); tickCrisis(t, t.factions[f.id], new Rng(i)); if (t.factions[f.id].bossId === a.id) wins++; expect(t.factions[f.id].crisis).toBeUndefined(); }
    expect(wins).toBeGreaterThanOrEqual(8);
    const t = structuredClone(w); tickCrisis(t, t.factions[f.id], new Rng(0));
    if (t.factions[f.id].bossId === a.id) { expect(t.factions[f.id].owed).toBe(1); expect(t.factions[f.id].standing[PLAYER]).toBeGreaterThan(standing); }
    else { expect(t.factions[f.id].standing[PLAYER]).toBeLessThan(standing); }
    void CRISIS_DAYS;
  });
  it('a headless faction does not expand or attack while it chooses', () => {
    const w = mk(); const { f } = withLieutenants(w);
    f.stance[PLAYER] = 'war'; f.standing[PLAYER] = -90; f.cash = 50000;
    w.npcs[f.bossId].alive = false; successionOrDeath(w, f);
    for (const e of w.pendingEvents) e.resolved = 'out'; w.pendingEvents = [];
    const before = select.blocksOf(w, f.id).length; const log0 = w.log.length;
    const w2 = dispatch(w, { type: 'end_day' });
    expect(select.blocksOf(w2, f.id).length).toBeLessThanOrEqual(before);
    expect(w2.log.slice(log0).some(l => /hit your|firebombed|trashed|came for/.test(l.text) && l.refs?.factionId === f.id)).toBe(false);
  });
});

describe('frame op', () => {
  it('puts a lieutenant away and can trigger a crisis on a boss', () => {
    const w = mk(); w.player.cash = 20000; const { f } = withLieutenants(w);
    const me = Object.values(w.npcs).find(n => n.role === 'patron' && !n.faction && n.alive)!;
    me.crew = { loyalty: 70, cut: 60, status: 'idle', statusDays: 0, joinedDay: 1 }; me.role = 'crew'; me.skills.brains = 10; me.skills.tech = 10; w.player.crewIds.push(me.id);
    expect(can(w, { type: 'plan_op', kind: 'frame', crewIds: [me.id], targetNpcId: me.id }).ok).toBe(false); // not a faction boss/lt
    const boss = w.npcs[f.bossId];
    const w2 = dispatch(w, { type: 'plan_op', kind: 'frame', crewIds: [me.id], targetNpcId: boss.id });
    const op = Object.values(w2.ops).find(o => o.kind === 'frame')!; expect(op).toBeDefined();
    op.status = 'ready'; op.launched = true;
    let done = false;
    for (let i = 0; i < 10 && !done; i++) { const t = structuredClone(w2); resolveOp(t, t.ops[op.id], new Rng(i)); if (t.ops[op.id].status === 'done') { done = true; expect(t.npcs[boss.id].alive).toBe(false); expect(t.factions[f.id].crisis).toBeDefined(); } }
    expect(done).toBe(true);
  });
});

describe('brokering', () => {
  it('needs two factions at beef and ends it with a truce and a fee', () => {
    let w = mk(); w.player.cash = 20000; w.player.skills.charm = 10; w.player.respect = 80;
    const [a, b] = Object.values(w.factions); expect(b).toBeDefined();
    const voice = w.npcs[a.lieutenantIds[0] ?? a.bossId];
    expect(can(w, { type: 'broker', npcId: voice.id, otherFactionId: b.id, approach: 'split' }).ok).toBe(false); // not fighting
    a.stance[b.id] = b.stance[a.id] = 'war'; a.standing[b.id] = b.standing[a.id] = -80; a.standing[PLAYER] = b.standing[PLAYER] = 10; a.temperament = b.temperament = 'diplomatic';
    expect(can(w, { type: 'broker', npcId: voice.id, otherFactionId: b.id, approach: 'split' }).ok).toBe(true);
    let tries = 0;
    while (w.factions[a.id].stance[b.id] === 'war' && tries++ < 8) { w = dispatch(w, { type: 'broker', npcId: voice.id, otherFactionId: b.id, approach: 'split' }); w.player.ap = 8; w.player.cash = 20000; }
    expect(w.factions[a.id].stance[b.id]).toBe('tension');
    expect(w.factions[a.id].truceUntil[b.id]).toBeGreaterThan(w.day);
    expect(w.factions[a.id].standing[PLAYER]).toBeGreaterThan(10);
  });
});
