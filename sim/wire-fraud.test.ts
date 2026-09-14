/**
 * Wire fraud's requirement is the only per-target one in the game, and that is the whole point of
 * it: it asks about the mark, not about the player. Getting inside one person's business unlocks
 * wire fraud against *that person* and nobody else — no global flag, no "you have done a rat once,
 * the tier is open now". These tests exist so a future pass does not flatten it into a priorOps
 * edge, which would be the obvious and wrong simplification.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { can, dispatch, generateWorld, select, type Npc, type World } from './index';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 9) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

/** Two different marks, neither of them read yet. */
function twoMarks(w: World): [Npc, Npc] {
  const owners = Object.values(w.npcs).filter(n => n.alive && !n.crew && n.role === 'owner');
  const [a, b] = owners;
  expect(a && b && a.id !== b.id).toBe(true);
  return [a, b];
}

/** Whatever else the op wants, so only the ratted gate is ever the thing under test. */
function qualified(w: World) {
  w.player.skills.tech = 9; w.player.skills.brains = 9;
  return w;
}

describe('the gate itself', () => {
  it('is declared through the shared requires system, not a special case beside it', () => {
    expect(OP_DEFS.wire_fraud.requires?.rattedTarget).toBe(true);
    expect(OP_DEFS.wire_fraud.requires?.priorOps).toBeUndefined();
    expect(OP_DEFS.wire_fraud.target).toBe('npc');
  });

  it('with nobody read at all, the op reads locked in the tree', () => {
    const w = qualified(mk());
    expect(select.rattedNpcs(w).length).toBe(0);
    expect(select.opLocked(w, 'wire_fraud')).toBeTruthy();
    expect(select.opsAvailable(w)).not.toContain('wire_fraud');
  });
});

describe('per target, not per player', () => {
  it('reading A unlocks wire fraud against A and leaves B exactly as locked as before', () => {
    const w = qualified(mk());
    const [a, b] = twoMarks(w);

    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: a.id }).ok).toBe(false);
    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: b.id }).ok).toBe(false);

    a.ratted = w.day;   // been inside A's business, by a read or a tap: same thing to this gate

    expect(select.opLocked(w, 'wire_fraud', { npcId: a.id })).toBeUndefined();
    expect(select.opLocked(w, 'wire_fraud', { npcId: b.id })).toBeTruthy();
    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: a.id }).ok).toBe(true);
    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: b.id }).ok).toBe(false);
  });

  it('reading somebody in B\'s own family does nothing for B', () => {
    const w = qualified(mk());
    const [, b] = twoMarks(w);
    const tie = b.connections?.[0];
    if (!tie) return;                 // seed without a tie on this mark; the point is covered above
    w.npcs[tie.npcId].ratted = w.day;
    expect(select.opLocked(w, 'wire_fraud', { npcId: b.id })).toBeTruthy();
  });

  it('the refusal names the person, so the player knows which door is shut', () => {
    const w = qualified(mk());
    const [, b] = twoMarks(w);
    twoMarks(w)[0].ratted = w.day;
    expect(select.opLocked(w, 'wire_fraud', { npcId: b.id })).toContain(b.name);
  });

  it('doing the whole thing for real: rat A, then only A can be defrauded', () => {
    let w = qualified(mk());
    const [a, b] = twoMarks(w);
    a.known = true;

    const planned = dispatch(w, { type: 'plan_op', kind: 'rat', crewIds: [], mode: 'read', targetNpcId: a.id });
    const ratOp = Object.values(planned.ops).find(o => o.kind === 'rat')!;
    let done: World | undefined;
    for (let i = 0; i < 40 && !done; i++) {
      const t = structuredClone(planned);
      const o = t.ops[ratOp.id]; o.status = 'ready'; o.launched = true;
      resolveOp(t, o, new Rng(i * 41 + 7));
      if (o.result?.success) done = t;
    }
    expect(done).toBeDefined();
    w = qualified(done!);

    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: a.id }).ok).toBe(true);
    expect(can(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: b.id }).ok).toBe(false);
  });
});

describe('once it runs', () => {
  it('pays dirty out of the mark\'s arrangements and leaves wire heat behind', () => {
    const w = qualified(mk());
    const [a] = twoMarks(w);
    a.ratted = w.day; a.known = true;
    const planned = dispatch(w, { type: 'plan_op', kind: 'wire_fraud', crewIds: [], targetNpcId: a.id });
    const op = Object.values(planned.ops).find(o => o.kind === 'wire_fraud')!;
    for (let i = 0; i < 40; i++) {
      const t = structuredClone(planned); t.pendingEvents = [];
      const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
      const before = { dirty: t.player.dirty, cash: t.player.cash, cyber: t.player.cyberHeat ?? 0 };
      resolveOp(t, o, new Rng(i * 13 + 2));
      if (!o.result?.success) continue;
      expect(t.player.dirty).toBeGreaterThan(before.dirty);
      expect(t.player.cash).toBe(before.cash);
      expect(t.player.cyberHeat ?? 0).toBeGreaterThan(before.cyber);
      return;
    }
    throw new Error('wire fraud never succeeded across 40 seeds');
  });
});
