/**
 * Pulling their wires: the war lane that does not need muscle.
 *
 * Two things matter here. The gate is the *same* `requires.stance` the existing war ops use —
 * there is no second gating mechanism for cyber work — and the damage is real: the targeted
 * place's rackets stop earning for several days. It is deliberately not a strictly better
 * ambush: it pays less and hurts income rather than soldiers.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { PLAYER, can, dispatch, generateWorld, select, type Business, type Faction, type World } from './index';
import { racketIncome } from './economy';
import { resolveOp } from './ops';
import { endDay } from './tick';
import { Rng } from './rng';

const mk = (seed = 4) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

/** A rival with a racket of their own running somewhere, and a stance toward the player. */
function rival(w: World, stance: 'peace' | 'beef' | 'war'): { f: Faction; biz: Business } {
  const f = Object.values(w.factions)[0];
  f.stance[PLAYER] = stance;
  f.standing[PLAYER] = stance === 'war' ? -85 : stance === 'beef' ? -55 : 20;
  f.truceUntil[PLAYER] = 0;
  const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
  biz.protection = { factionId: f.id, since: 1, rate: 0.1 };
  const r = { id: 'r_rival', kind: 'numbers' as const, businessId: biz.id, owner: f.id, startedDay: 1, level: 2, lastIncome: 400, disrupted: 0 };
  w.rackets[r.id] = r; biz.racketIds.push(r.id);
  w.player.skills.tech = 9; w.player.skills.brains = 9;
  return { f, biz };
}

describe('the gate', () => {
  it('is the same stance requirement the muscle war ops use — one mechanism, not two', () => {
    expect(OP_DEFS.digital_strike.requires?.stance).toEqual(['beef', 'war']);
    expect(OP_DEFS.digital_strike.requires?.stance).toEqual(OP_DEFS.ambush_soldiers.requires?.stance);
  });

  it('is shut in peacetime and open once somebody wants you hurt', () => {
    const peace = mk(); rival(peace, 'peace');
    for (const f of Object.values(peace.factions)) { f.stance[PLAYER] = 'peace'; }
    expect(select.opLocked(peace, 'digital_strike')).toBeTruthy();
    expect(select.opLocked(peace, 'digital_strike')).toBe(select.opLocked(peace, 'ambush_soldiers'));

    const beef = mk(); rival(beef, 'beef');
    expect(select.opLocked(beef, 'digital_strike')).toBeUndefined();
    expect(select.opsAvailable(beef)).toContain('digital_strike');

    const war = mk(); rival(war, 'war');
    expect(select.opLocked(war, 'digital_strike')).toBeUndefined();
  });

  it('opens at beef, which is earlier than the strike that takes a lieutenant off the board', () => {
    const beef = mk(); rival(beef, 'beef');
    expect(select.opLocked(beef, 'digital_strike')).toBeUndefined();
    expect(select.opLocked(beef, 'war_strike')).toBeTruthy();   // that one needs an actual war
  });
});

describe('what it does', () => {
  it('kills the targeted place\'s rackets for several days', () => {
    const w = mk(); const { biz } = rival(w, 'war');
    expect(can(w, { type: 'plan_op', kind: 'digital_strike', crewIds: [], targetBusinessId: biz.id }).ok).toBe(true);
    const planned = dispatch(w, { type: 'plan_op', kind: 'digital_strike', crewIds: [], targetBusinessId: biz.id });
    const op = Object.values(planned.ops).find(o => o.kind === 'digital_strike')!;
    for (let i = 0; i < 40; i++) {
      const t = structuredClone(planned); t.pendingEvents = [];
      const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
      resolveOp(t, o, new Rng(i * 29 + 3));
      if (!o.result?.success) continue;
      expect(t.rackets.r_rival.disrupted).toBeGreaterThanOrEqual(3);
      expect(t.rackets.r_rival.disrupted).toBeLessThanOrEqual(6);
      expect(t.player.dirty).toBeGreaterThan(w.player.dirty);
      expect(t.player.cyberHeat ?? 0).toBeGreaterThan(0);
      return;
    }
    throw new Error('digital strike never succeeded across 40 seeds');
  });

  it('writes the same disruption field a police raid writes, and that field really does stop a racket earning', () => {
    // Factions do not keep a per-racket ledger the way the player does, so the damage is measured
    // where it is measurable: `disrupted` is one currency, shared by raids, muscle and the wire.
    // Here it is put on a racket of the player's, where the tick pays it, to prove it is not cosmetic.
    const w = mk(); rival(w, 'war');
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc' && b.id !== w.rackets.r_rival.businessId)!;
    const mine = { id: 'r_mine', kind: 'numbers' as const, businessId: biz.id, owner: PLAYER, startedDay: 1, level: 2, lastIncome: 0, disrupted: 0 };
    w.rackets[mine.id] = mine; w.player.racketIds.push(mine.id); biz.racketIds.push(mine.id);
    expect(racketIncome(w, mine)).toBeGreaterThan(0);

    let t = endDay(w);
    expect(t.rackets[mine.id].lastIncome).toBeGreaterThan(0);   // an ordinary day pays

    t.rackets[mine.id].disrupted = 4;
    for (let d = 0; d < 4; d++) {
      const left = t.rackets[mine.id].disrupted;
      t = endDay(t);
      expect(t.rackets[mine.id].lastIncome).toBe(0);            // nothing comes in while it is down
      expect(t.rackets[mine.id].disrupted).toBe(left - 1);      // and the days count off
    }
    // and then it comes back — unless the world has knocked it over again in the meantime, which
    // is a police raid's doing and not this op's, so the assertion is only made when it has not.
    t = endDay(t);
    if (!t.rackets[mine.id].disrupted) expect(t.rackets[mine.id].lastIncome).toBeGreaterThan(0);
  });

  it('is not a strictly better ambush: less money, and it leaves their soldiers standing', () => {
    expect(OP_DEFS.digital_strike.payout[1]).toBeLessThan(OP_DEFS.ambush_soldiers.payout[1]);

    const w = mk(); const { f, biz } = rival(w, 'war');
    const soldiers = f.soldiers;
    const planned = dispatch(w, { type: 'plan_op', kind: 'digital_strike', crewIds: [], targetBusinessId: biz.id });
    const op = Object.values(planned.ops).find(o => o.kind === 'digital_strike')!;
    for (let i = 0; i < 40; i++) {
      const t = structuredClone(planned); t.pendingEvents = [];
      const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
      resolveOp(t, o, new Rng(i * 29 + 3));
      if (!o.result?.success) continue;
      expect(t.factions[f.id].soldiers).toBe(soldiers);
      return;
    }
    throw new Error('digital strike never succeeded across 40 seeds');
  });
});
