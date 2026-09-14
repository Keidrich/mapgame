/**
 * Getting inside somebody's business, two ways: one good look, or a tap left running.
 *
 * The point of the pair is that they are not the same purchase. A read is a one-off with a
 * secret at the end of it; a tap keeps paying and compounds a discovery risk every day it runs.
 * That risk is deliberately about the *person* — how closely they read their own affairs, who
 * checks things for them — and not about the ground they are standing on. These tests hold that
 * line, because it is the thing most likely to be "simplified" back into a block lookup later.
 */
import { describe, expect, it } from 'vitest';
import { TAP } from '@content/cyber';
import { OP_DEFS } from '@content/rackets';
import { can, dispatch, generateWorld, type Npc, type World } from './index';
import { daysTapped, endTap, secretsAbout, startTap, tapRisk, tapped, tickTaps } from './cyber';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

/** Somebody worth getting inside of: an owner with something going on. */
function mark(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.role === 'owner' && x.agenda && !x.agenda.done)
    ?? Object.values(w.npcs).find(x => x.alive && !x.crew && x.role === 'owner')!;
  n.known = true;
  return n;
}

/** Plan and resolve one `rat` in the given mode, retrying seeds until it lands. */
function ratted(w: World, n: Npc, mode: 'read' | 'tap'): World {
  const planned = dispatch(w, { type: 'plan_op', kind: 'rat', crewIds: [], mode, targetNpcId: n.id });
  const op = Object.values(planned.ops).find(o => o.kind === 'rat')!;
  for (let i = 0; i < 40; i++) {
    const t = structuredClone(planned);
    const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
    resolveOp(t, o, new Rng(i * 31 + 1));
    if (o.result?.success) return t;
  }
  throw new Error('rat never succeeded across 40 seeds');
}

describe('the op', () => {
  it('offers exactly the two modes, and the planner remembers which was chosen', () => {
    expect(OP_DEFS.rat.modes?.map(m => m.id)).toEqual(['read', 'tap']);
    const w = mk(); const n = mark(w);
    const t = dispatch(w, { type: 'plan_op', kind: 'rat', crewIds: [], mode: 'tap', targetNpcId: n.id });
    expect(Object.values(t.ops).find(o => o.kind === 'rat')!.mode).toBe('tap');
  });

  it('defaults to the first mode when the UI sends none, rather than silently doing nothing', () => {
    const w = mk(); const n = mark(w);
    const t = dispatch(w, { type: 'plan_op', kind: 'rat', crewIds: [], targetNpcId: n.id });
    expect(Object.values(t.ops).find(o => o.kind === 'rat')!.mode).toBe('read');
  });
});

describe('quick read vs. persistent tap', () => {
  it('a read leaves no tap running and can hand back something sellable', () => {
    const w = mk(); const n = mark(w);
    const t = ratted(w, n, 'read');
    expect(t.npcs[n.id].tap).toBeUndefined();
    expect(tapped(t).length).toBe(0);
    expect(t.npcs[n.id].ratted).toBe(t.day);
    // an owner with an agenda always has something worth knowing
    expect(secretsAbout(t, n.id).length).toBeGreaterThan(0);
  });

  it('a tap leaves something running and does not hand back a secret up front', () => {
    const w = mk(); const n = mark(w);
    const t = ratted(w, n, 'tap');
    expect(t.npcs[n.id].tap).toBeDefined();
    expect(tapped(t).map(x => x.id)).toContain(n.id);
    expect(secretsAbout(t, n.id).length).toBe(0);
  });

  it('both count as having been inside — that is what wire fraud reads', () => {
    const w = mk(); const n = mark(w);
    expect(ratted(w, n, 'read').npcs[n.id].ratted).toBeTruthy();
    expect(ratted(w, n, 'tap').npcs[n.id].ratted).toBeTruthy();
  });
});

describe('discovery risk', () => {
  it('compounds with every day the tap has been running', () => {
    const w = mk(); const n = mark(w);
    startTap(w, n);
    const day0 = tapRisk(w, n);
    w.day += 10;
    expect(daysTapped(w, n)).toBe(10);
    expect(tapRisk(w, n)).toBeGreaterThan(day0);
    expect(tapRisk(w, n)).toBeCloseTo(day0 * (1 + 10 * TAP.dayRisk), 5);
  });

  it('is about the person: a target who watches their own affairs is harder to listen to', () => {
    const w = mk();
    const a = mark(w);
    const b = Object.values(w.npcs).find(x => x.alive && !x.crew && x.id !== a.id && x.role === 'owner')!;
    a.skills.tech = 0; b.skills.tech = 8;
    a.traits = a.traits.filter(t => t !== 'connected' && t !== 'quiet');
    b.traits = b.traits.filter(t => t !== 'connected' && t !== 'quiet');
    startTap(w, a); startTap(w, b);
    expect(tapRisk(w, b)).toBeGreaterThan(tapRisk(w, a));
  });

  it('is about the person: somebody who has people checking for them is harder again', () => {
    const w = mk();
    const a = mark(w);
    const b = Object.values(w.npcs).find(x => x.alive && !x.crew && x.id !== a.id && x.role === 'owner')!;
    a.skills.tech = 0; b.skills.tech = 0;
    a.traits = a.traits.filter(t => t !== 'connected' && t !== 'quiet');
    b.traits = [...b.traits.filter(t => t !== 'connected' && t !== 'quiet'), 'connected'];
    startTap(w, a); startTap(w, b);
    expect(tapRisk(w, b)).toBeCloseTo(tapRisk(w, a) * TAP.connected, 6);
  });

  it('does not read anything off the block the target is standing on', () => {
    const w = mk(); const n = mark(w);
    startTap(w, n);
    const before = tapRisk(w, n);
    const block = w.blocks[n.homeBlockId];
    block.police = 100; block.heat = 100;
    expect(tapRisk(w, n)).toBe(before);
  });

  it('the source has no block lookup in it at all — a tap is not a stakeout', async () => {
    const src = await import('node:fs/promises').then(fs => fs.readFile('sim/cyber.ts', 'utf8'));
    const fn = src.slice(src.indexOf('export function tapRisk'), src.indexOf('/** Start listening'));
    expect(fn).not.toMatch(/w\.blocks|police|homeBlockId/);
  });
});

describe('being found out', () => {
  it('ends the tap and costs the relationship, not just the feed', () => {
    const w = mk(); const n = mark(w); w.pendingEvents = [];
    n.rel.trust = 60;
    startTap(w, n);
    endTap(w, n, true, new Rng(2));
    expect(n.tap).toBeUndefined();
    expect(n.rel.trust).toBeLessThanOrEqual(60 + TAP.trustHit);
    expect(n.notes.some(x => x.includes('listening'))).toBe(true);
  });

  it('the player can take it off through an action, and it costs nothing to do so', () => {
    const w = mk(); const n = mark(w); w.pendingEvents = [];
    n.rel.trust = 60;
    startTap(w, n);
    const ap = w.player.ap;

    expect(can(w, { type: 'pull_tap', npcId: n.id }).ok).toBe(true);
    const t = dispatch(w, { type: 'pull_tap', npcId: n.id });

    expect(t.npcs[n.id].tap).toBeUndefined();
    expect(t.npcs[n.id].rel.trust).toBe(60);   // pulled in time: no consequence
    expect(t.player.ap).toBe(ap);              // getting out is never the part you think twice about
    expect(can(t, { type: 'pull_tap', npcId: n.id }).ok).toBe(false);
  });

  it('pulling it yourself costs nothing', () => {
    const w = mk(); const n = mark(w); w.pendingEvents = [];
    n.rel.trust = 60;
    startTap(w, n);
    endTap(w, n, false, new Rng(2));
    expect(n.tap).toBeUndefined();
    expect(n.rel.trust).toBe(60);
  });

  it('a tap left running long enough is found: the day risk is real, not decorative', () => {
    const w = mk(); const n = mark(w); w.pendingEvents = [];
    n.skills.tech = 6;
    startTap(w, n);
    let found = false;
    for (let d = 0; d < 40 && !found; d++) { w.day += 1; tickTaps(w, new Rng(d * 17 + 5)); found = !n.tap; }
    expect(found).toBe(true);
  });
});
