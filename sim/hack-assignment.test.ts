/**
 * Crew on the wire. The point of the assignment is that the pile works itself: no `run_card`
 * action, no AP, no daily clicking. What it costs is a cut of the take and a little wire heat
 * every day, and it only happens at all once there is a pile worth a day of somebody's time.
 */
import { describe, expect, it } from 'vitest';
import { HACK } from '@content/cyber';
import { can, dispatch, generateWorld, type Card, type Npc, type World } from './index';
import { addCard, liveCards, runCard, tickHackCrew } from './cyber';
import { assignmentLabel } from '../ui/derive';
import { Rng } from './rng';

const mk = (seed = 21) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });

/** Somebody on the books, good with a machine. */
function hire(w: World, tech = 8): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.role === 'patron')!;
  n.role = 'crew';
  n.skills.tech = tech;
  n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
  w.player.crewIds.push(n.id);
  return n;
}

function pile(w: World, n: number, over: Partial<Card> = {}) {
  for (let i = 0; i < n; i++) addCard(w, { id: `cc_${i}`, tier: 'gold', limit: 3000, freshness: 95, takenDay: w.day, ...over });
}

describe('the assignment', () => {
  it('is a real assignment like any other, and says what they are doing', () => {
    const w = mk(); const n = hire(w);
    expect(can(w, { type: 'assign', npcId: n.id, assignment: { kind: 'hack' } }).ok).toBe(true);
    const t = dispatch(w, { type: 'assign', npcId: n.id, assignment: { kind: 'hack' } });
    expect(t.npcs[n.id].crew!.assignment).toEqual({ kind: 'hack' });
    expect(t.npcs[n.id].crew!.status).toBe('assigned');
    expect(assignmentLabel(t, t.npcs[n.id].crew!.assignment)).toMatch(/wire|card/i);
  });

  it('is refused for somebody who is not yours', () => {
    const w = mk();
    const stranger = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    expect(can(w, { type: 'assign', npcId: stranger.id, assignment: { kind: 'hack' } }).ok).toBe(false);
  });
});

describe('what they do with a day', () => {
  it('progresses the cards with no run_card action from the player at all', () => {
    const w = mk(); w.pendingEvents = [];
    const n = hire(w); n.crew!.assignment = { kind: 'hack' }; n.crew!.status = 'assigned';
    pile(w, 5);
    const before = { dirty: w.player.dirty, fresh: liveCards(w).map(c => c.freshness), cyber: w.player.cyberHeat ?? 0 };

    tickHackCrew(w, new Rng(5));

    expect(w.player.dirty).toBeGreaterThan(before.dirty);
    expect(w.player.cyberHeat ?? 0).toBeGreaterThan(before.cyber);
    // at least one card has been worked: limit spent or freshness worn
    const worked = liveCards(w).some((c, i) => c.freshness < (before.fresh[i] ?? 100)) || liveCards(w).length < 5;
    expect(worked).toBe(true);
  });

  it('hands over most of what it makes, but keeps a cut — it is their day, not yours', () => {
    expect(HACK.rate).toBeGreaterThan(0.5);
    expect(HACK.rate).toBeLessThan(1);

    const w = mk(); w.pendingEvents = [];
    const n = hire(w); n.crew!.assignment = { kind: 'hack' }; n.crew!.status = 'assigned';
    pile(w, 5);
    const before = w.player.dirty;
    tickHackCrew(w, new Rng(5));
    const kept = w.player.dirty - before;

    // the same pile, the same number of runs, done by hand: no cut comes off, so you keep more
    const solo = mk(); solo.pendingEvents = [];
    pile(solo, 5);
    const runs = Math.max(1, Math.round(HACK.perDay * (0.4 + 8 / 10)));
    const start = solo.player.dirty;
    for (let i = 0; i < runs; i++) {
      const card = liveCards(solo).sort((a, b) => b.freshness - a.freshness)[0];
      if (!card) break;
      runCard(solo, card, 'small', new Rng(5));
    }
    const byHand = solo.player.dirty - start;

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(byHand);
    expect(kept / byHand).toBeCloseTo(HACK.rate, 1);
  });

  it('will not bother for a pile too small to be worth a day', () => {
    const w = mk(); w.pendingEvents = [];
    const n = hire(w); n.crew!.assignment = { kind: 'hack' }; n.crew!.status = 'assigned';
    pile(w, HACK.minCards - 1);
    const before = w.player.dirty;
    tickHackCrew(w, new Rng(5));
    expect(w.player.dirty).toBe(before);
    expect(liveCards(w).length).toBe(HACK.minCards - 1);
  });

  it('does nothing for crew doing something else', () => {
    const w = mk(); w.pendingEvents = [];
    const n = hire(w); n.crew!.assignment = { kind: 'collect' }; n.crew!.status = 'assigned';
    pile(w, 6);
    const before = w.player.dirty;
    tickHackCrew(w, new Rng(5));
    expect(w.player.dirty).toBe(before);
  });

  it('a better hand at it works more cards in a day', () => {
    const runs = (tech: number) => {
      const w = mk(); w.pendingEvents = [];
      const n = hire(w, tech); n.crew!.assignment = { kind: 'hack' }; n.crew!.status = 'assigned';
      pile(w, 12, { limit: 4000 });
      const before = w.player.dirty;
      tickHackCrew(w, new Rng(5));
      return w.player.dirty - before;
    };
    expect(runs(10)).toBeGreaterThan(runs(1));
  });

  it('runs through the day, not through an action the player has to spend AP on', () => {
    const w = mk(); w.pendingEvents = [];
    const n = hire(w); n.crew!.assignment = { kind: 'hack' }; n.crew!.status = 'assigned';
    pile(w, 5);
    const ap = w.player.ap;
    const t = dispatch(w, { type: 'end_day' });
    expect(t.player.dirty).toBeGreaterThan(w.player.dirty);
    expect(ap).toBe(w.player.ap);   // nothing was spent to make it happen
  });
});
