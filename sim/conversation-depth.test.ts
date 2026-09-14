/**
 * A conversation with more than one move in it.
 *
 * Two claims under test. First, that the menu is generated from world state — their agenda if you
 * know it, a name you both know, what is in your history with them — rather than authored per
 * person. Second, and the one that matters structurally: that a conversation in progress is an
 * entry on the *existing* confrontation queue, answered by the existing action, and not a second
 * pending-state mechanism living alongside it.
 */
import { describe, expect, it } from 'vitest';
import { TALK } from './conversation';
import { can, dispatch, generateWorld, select } from './index';
import { connect } from './connections';
import { remember, oweThem } from './ledger';
import { known } from './test-util';
import type { Npc, TalkMove, World } from './types';

const mk = (seed = 31) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });

function target(w: World): Npc {
  const b = select.businessesIn(w, select.startBlock(w).id).find(x => x.ownedBy === 'npc')!;
  const n = w.npcs[b.ownerId];
  w.player.currentBlockId = n.homeBlockId;
  known(w, n, { trust: 20 });
  return n;
}
const open = (w: World, n: Npc, scene: 'visit' | 'shakedown' = 'visit') => dispatch(w, { type: 'talk', scene, npcId: n.id });
const live = (w: World) => select.activeConfrontation(w)!;
const moves = (w: World) => (select.confrontOptions(w, live(w)) as unknown as { id: TalkMove; closes: boolean; chance: number }[]);
const ids = (w: World) => moves(w).map(m => m.id);

describe('a conversation rides the confrontation queue, not a second mechanism', () => {
  it('opening one queues a confrontation and nothing else', () => {
    let w = mk(); const n = target(w);
    expect(select.confrontations(w).length).toBe(0);
    w = open(w, n);
    expect(select.confrontations(w).length).toBe(1);
    const c = live(w);
    expect(c.kind).toBe('talk');
    expect(c.npcId).toBe(n.id);
    expect(c.talk?.scene).toBe('visit');
    // the world carries exactly one list of pending things, and this is on it
    expect(w.pendingEvents.length).toBe(0);
    expect(w.confrontations).toContain(c);
  });

  it('and it is answered by the same action a fight at your door is', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    const c = live(w);
    expect(can(w, { type: 'resolve_confrontation', id: c.id, approach: 'approach:listen' }).ok).toBe(true);
    w = dispatch(w, { type: 'resolve_confrontation', id: c.id, approach: 'approach:listen' });
    expect(select.confrontations(w).length).toBe(0);
  });

  it('while one is open, everything else says so by name', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    const r = can(w, { type: 'move', toBlockId: Object.keys(w.blocks).find(id => id !== w.player.currentBlockId)! });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain(n.name);
  });

  it('an unanswered conversation at End Day is somebody who got bored, not an attack landing', () => {
    let w = mk(); const n = target(w);
    const before = { fear: n.rel.fear, cash: w.player.cash };
    w = open(w, n);
    w = dispatch(w, { type: 'end_day' });
    expect(select.confrontations(w).length).toBe(0);
    expect(w.npcs[n.id].rel.fear).toBe(before.fear);
    expect(w.npcs[n.id].alive).toBe(true);
  });
});

describe('what is on the menu comes from the world, not from a table per person', () => {
  it('the scene\'s own approaches are always there, and they close the conversation', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    for (const id of ['approach:drinks', 'approach:business', 'approach:listen']) expect(ids(w)).toContain(id);
    expect(moves(w).filter(m => m.id.startsWith('approach:')).every(m => m.closes)).toBe(true);
    expect(ids(w)).toContain('leave');
  });

  it('a known agenda surfaces its move; an unknown one surfaces nothing', () => {
    let w = mk(); const n = target(w);
    n.agenda = { kind: 'debt', progress: 30, rate: 3 };
    n.known = false; n.ratted = undefined; n.tap = undefined;
    w = open(w, n);
    expect(ids(w).some(i => i.startsWith('agenda:'))).toBe(false);
    let w2 = mk(); const n2 = target(w2);
    n2.agenda = { kind: 'debt', progress: 30, rate: 3 }; n2.known = true;
    w2 = open(w2, n2);
    expect(ids(w2)).toContain('agenda:settle');
    expect(moves(w2).find(m => m.id === 'agenda:settle')!.closes).toBe(true);
  });

  it('a shared connection lets you invoke that person, and only somebody real', () => {
    let w = mk(); const n = target(w);
    const friend = Object.values(w.npcs).find(x => x.alive && x.id !== n.id && !x.crew)!;
    n.connections = []; friend.connections = [];
    w = open(w, n);
    expect(ids(w).some(i => i.startsWith('name:'))).toBe(false);

    let w2 = mk(); const n2 = target(w2);
    const mate = Object.values(w2.npcs).find(x => x.alive && x.id !== n2.id && !x.crew)!;
    n2.connections = []; mate.connections = [];
    connect(n2, mate, 'friend', 'old friend');
    mate.crew = { loyalty: 70, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 };
    w2.player.crewIds.push(mate.id);
    w2 = open(w2, n2);
    expect(ids(w2)).toContain(`name:${mate.id}`);
    // an opener: it does not end the conversation
    expect(moves(w2).find(m => m.id === `name:${mate.id}`)!.closes).toBe(false);
  });

  it('prior history with this specific person surfaces a move to bring it up', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    expect(ids(w).some(i => i.startsWith('recall:'))).toBe(false);
    w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: 'leave' });
    remember(w, w.npcs[n.id], 'favour', 'You covered their rent when the roof went in.');
    w = open(w, w.npcs[n.id]);
    expect(ids(w)).toContain('recall:favour');
  });

  it('and history changes the opening line, so the second conversation is not the first', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    const cold = live(w).text;
    w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: 'leave' });
    w.npcs[n.id].rel.favours = 1;
    w = open(w, w.npcs[n.id]);
    expect(live(w).text).not.toBe(cold);
    expect(live(w).text).toMatch(/straighten up/i);
  });
});

describe('openers buy odds on the move you close with', () => {
  it('a name that lands raises the closing odds; the same opener cannot be worked twice', () => {
    let w = mk(); const n = target(w);
    const mate = Object.values(w.npcs).find(x => x.alive && x.id !== n.id && !x.crew)!;
    n.connections = []; mate.connections = [];
    connect(n, mate, 'friend', 'old friend');
    mate.crew = { loyalty: 70, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 };
    w.player.crewIds.push(mate.id);
    w.player.skills = { ...w.player.skills, charm: 10 };
    w = open(w, n);
    const before = moves(w).find(m => m.id === 'approach:listen')!.chance;
    const nameMove = `name:${mate.id}` as TalkMove;
    w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: nameMove });
    // still in the conversation: an opener does not close it
    expect(select.confrontations(w).length).toBe(1);
    expect(live(w).talk!.used).toContain(nameMove);
    expect(ids(w)).not.toContain(nameMove);
    expect(live(w).talk!.reply).toBeTruthy();
    const after = moves(w).find(m => m.id === 'approach:listen')!.chance;
    expect(after).not.toBe(before);
    if (live(w).talk!.bonus > 0) expect(after).toBeGreaterThan(before);
  });

  it('there is a limit on how long you can warm somebody up before asking', () => {
    let w = mk(); const n = target(w);
    for (const k of ['favour', 'owed', 'deal', 'harm'] as const) remember(w, n, k, `something (${k})`);
    w = open(w, n);
    let guard = 0;
    while (ids(w).some(i => i.startsWith('recall:') || i.startsWith('name:')) && guard++ < 10) {
      const opener = moves(w).find(m => !m.closes)!;
      w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: opener.id });
    }
    expect(live(w).talk!.used.length).toBe(TALK.maxBeats);
    // and the conversation still has somewhere to go
    expect(ids(w).some(i => i.startsWith('approach:'))).toBe(true);
  });

  it('closing runs the real scene, and charges the real cost', () => {
    let w = mk(); const n = target(w);
    const ap = w.player.ap;
    w = open(w, n);
    expect(w.player.ap, 'opening a conversation is free').toBe(ap);
    const logLen = w.log.length;
    w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: 'approach:listen' });
    expect(w.player.ap, 'the AP goes on what you close with').toBe(ap - 1);
    expect(w.log.length).toBeGreaterThan(logLen);
    expect(select.confrontations(w).length).toBe(0);
  });

  it('a conversation is not a way round a scene\'s own gate', () => {
    let w = mk(); const n = target(w);
    w = open(w, n);
    w.player.cash = 0;
    const drinks = can(w, { type: 'resolve_confrontation', id: live(w).id, approach: 'approach:drinks' });
    expect(drinks.ok).toBe(false);
    expect(drinks.ok === false && drinks.reason).toMatch(/\$50/);
  });

  it('walking out costs nothing and leaves nothing queued', () => {
    let w = mk(); const n = target(w);
    const ap = w.player.ap;
    w = open(w, n);
    w = dispatch(w, { type: 'resolve_confrontation', id: live(w).id, approach: 'leave' });
    expect(w.player.ap).toBe(ap);
    expect(select.confrontations(w).length).toBe(0);
  });

  it('calling in what they are owed spends it', () => {
    let w = mk(); const n = target(w);
    oweThem(w, n, 'They told you something they did not have to.');
    expect(select.owedToThem(w.npcs[n.id])).toBe(1);
    w.player.skills = { ...w.player.skills, charm: 10 };
    w = open(w, w.npcs[n.id]);
    let spent = false;
    for (let i = 0; i < 25 && !spent; i++) {
      // vary the rng state, not just the clone: a structuredClone carries w.rng with it, so
      // twenty-five identical worlds roll the identical number twenty-five times
      const t0 = structuredClone(w); t0.rng = i * 977 + 13;
      const t = dispatch(t0, { type: 'resolve_confrontation', id: live(w).id, approach: 'recall:owed' });
      spent = select.owedToThem(t.npcs[n.id]) === 0;
    }
    expect(spent).toBe(true);
  });
});
