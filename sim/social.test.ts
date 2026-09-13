/**
 * The Social tab's data: who is in the roster, how a tie is walked, and the player's own note.
 */
import { describe, expect, it } from 'vitest';
import { can, dispatch, generateWorld, select, type World } from './index';
import { connect } from './connections';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
/** Two people in the city who are tied to each other. */
function tiedPair(w: World) {
  for (const n of Object.values(w.npcs)) {
    const tie = n.connections[0];
    if (tie && w.npcs[tie.npcId]) return { a: n, b: w.npcs[tie.npcId], kind: tie.kind, label: tie.label };
  }
  throw new Error('no connected pair in this city');
}

describe('the roster', () => {
  it('holds exactly the people the player has met', () => {
    const w = mk();
    const roster = select.metNpcs(w);
    expect(roster.length).toBeGreaterThan(0);
    // the same test the person's own sheet uses, so the roster never knows more than the sheet
    for (const n of roster) expect(select.isKnown(n), n.name).toBe(true);
    for (const n of Object.values(w.npcs)) {
      if (!select.isKnown(n) || !n.alive) expect(roster.map(r => r.id)).not.toContain(n.id);
    }
    expect(roster.every(n => n.alive)).toBe(true);
  });

  it('grows when you get to know somebody, and only then', () => {
    const w = mk();
    const stranger = Object.values(w.npcs).find(n => n.alive && !select.isKnown(n))!;
    expect(select.metNpcs(w).map(n => n.id)).not.toContain(stranger.id);
    stranger.known = true;
    expect(select.metNpcs(w).map(n => n.id)).toContain(stranger.id);
    // trust alone is enough too: the same either-or the sheet uses
    const other = Object.values(w.npcs).find(n => n.alive && !select.isKnown(n))!;
    other.rel.trust = 20;
    expect(select.metNpcs(w).map(n => n.id)).toContain(other.id);
  });

  it('counts only the ties to people you have also met as "connected"', () => {
    const w = mk();
    const { a, b } = tiedPair(w);
    a.known = true; b.known = false; b.rel.trust = 0;
    expect(select.connectionsOf(w, a).map(c => c.npc.id)).toContain(b.id);   // the tie is still there
    expect(select.knownConnectionsOf(w, a).map(c => c.npc.id)).not.toContain(b.id); // but not in the roster's sense
    b.known = true;
    expect(select.knownConnectionsOf(w, a).map(c => c.npc.id)).toContain(b.id);
  });
});

describe('walking a tie', () => {
  it('links both directions of the same edge, with the same kind and words', () => {
    const w = mk();
    const { a, b, kind, label } = tiedPair(w);
    const back = b.connections.find(c => c.npcId === a.id);
    expect(back, `${b.name} → ${a.name}`).toBeDefined();
    expect(back!.kind).toBe(kind);
    expect(back!.label).toBe(label);
    // and walking out and back lands where it started
    const out = select.connectionsOf(w, a).find(c => c.npc.id === b.id)!;
    expect(select.connectionsOf(w, out.npc).map(c => c.npc.id)).toContain(a.id);
  });

  it('holds for every tie in the city, not just one', () => {
    const w = mk();
    for (const n of Object.values(w.npcs)) {
      for (const c of n.connections) {
        const other = w.npcs[c.npcId];
        expect(other, `${n.name} → ${c.npcId}`).toBeDefined();
        const mirror = other.connections.find(x => x.npcId === n.id);
        expect(mirror, `${other.name} → ${n.name}`).toBeDefined();
        expect(mirror!.kind).toBe(c.kind);
      }
    }
  });

  it('drops a tie from the walk when that person dies, without touching the record', () => {
    const w = mk();
    const { a, b } = tiedPair(w);
    b.alive = false;
    expect(select.connectionsOf(w, a).map(c => c.npc.id)).not.toContain(b.id);
    expect(a.connections.some(c => c.npcId === b.id)).toBe(true);
  });
});

describe("the player's own note", () => {
  it('saves, trims, and reads back', () => {
    let w = mk();
    const id = select.metNpcs(w)[0].id;
    w = dispatch(w, { type: 'set_note', npcId: id, text: '  owes me a favour  ' });
    expect(w.npcs[id].playerNote).toBe('owes me a favour');
  });

  it('never touches the flavour the sim writes, and is never touched by it', () => {
    let w = mk();
    const n0 = Object.values(w.npcs).find(n => n.notes.length > 0)!;
    const simNotes = [...n0.notes];
    w = dispatch(w, { type: 'set_note', npcId: n0.id, text: 'do not trust' });
    const n1 = w.npcs[n0.id];
    expect(n1.playerNote).toBe('do not trust');
    expect(n1.notes).toEqual(simNotes);                       // the sim's list is untouched
    expect(n1.notes).not.toContain('do not trust');           // and the two never merge
    // a day of simulation may add its own flavour; the player's words survive it
    w = dispatch(w, { type: 'end_day' });
    for (let d = 0; d < 5; d++) {
      for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
      w = dispatch(w, { type: 'end_day' });
    }
    expect(w.npcs[n0.id].playerNote).toBe('do not trust');
    expect(w.npcs[n0.id].notes).not.toContain('do not trust');
  });

  it('clears back to nothing rather than storing an empty string', () => {
    let w = mk();
    const id = select.metNpcs(w)[0].id;
    w = dispatch(w, { type: 'set_note', npcId: id, text: 'x' });
    w = dispatch(w, { type: 'set_note', npcId: id, text: '   ' });
    expect(w.npcs[id].playerNote).toBeUndefined();
  });

  it('refuses a note longer than the limit, and is free otherwise', () => {
    const w = mk();
    const id = select.metNpcs(w)[0].id;
    const tooLong = can(w, { type: 'set_note', npcId: id, text: 'x'.repeat(select.PLAYER_NOTE_MAX + 1) });
    expect(tooLong.ok).toBe(false);
    const ok = can(w, { type: 'set_note', npcId: id, text: 'x'.repeat(select.PLAYER_NOTE_MAX) });
    expect(ok.ok).toBe(true);
    expect(ok.ok === true && ok.cost).toBeUndefined();   // notes cost nothing: no AP, no cash
    expect(can(w, { type: 'set_note', npcId: 'nobody', text: 'hi' }).ok).toBe(false);
  });

  it('can be written while an event is waiting, because it is bookkeeping, not a move', () => {
    const w = mk();
    const id = select.metNpcs(w)[0].id;
    w.pendingEvents.push({ id: 'e_test', day: w.day, kind: 'test', title: 'Something', text: '...', options: [{ id: 'ok', label: 'OK' }], refs: {} });
    expect(can(w, { type: 'visit', npcId: id }).ok).toBe(false);        // a real move is blocked
    expect(can(w, { type: 'set_note', npcId: id, text: 'later' }).ok).toBe(true);
  });

  it('is kept per person, not shared', () => {
    let w = mk();
    const [a, b] = select.metNpcs(w);
    w = dispatch(w, { type: 'set_note', npcId: a.id, text: 'the money man' });
    expect(w.npcs[b.id].playerNote).toBeUndefined();
    // and a tie between them does not leak it either
    connect(w.npcs[a.id], w.npcs[b.id], 'friend', 'old friend');
    expect(w.npcs[b.id].playerNote).toBeUndefined();
  });
});
