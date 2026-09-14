/**
 * Doing something about what somebody wants, and what that then unlocks.
 *
 * The load-bearing claim: every agenda resolution funnels into `doFavour()`, and a favour is what
 * the standing pass made concessions need. So this is really one test repeated five ways — settle
 * a person's problem and a door that `concessionReason` was holding shut opens.
 */
import { describe, expect, it } from 'vitest';
import { AGENDA_MOVES } from '@content/agendas';
import { CONCESSION, FAMILIARITY } from '@content/standing';
import { can, dispatch, generateWorld, select } from './index';
import { agendaChance, agendaCost, agendaKnown, agendaMoves, agendaReason, resolveAgenda } from './agendas';
import { concessionReason, favours } from './standing';
import { ledgerOf } from './ledger';
import { Rng } from './rng';
import { known } from './test-util';
import type { AgendaKind, Npc, World } from './types';

const mk = (seed = 21) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });

/** Somebody with a given agenda, sized up, standing in front of you, with nothing else going on. */
function mark(w: World, kind: AgendaKind): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  known(w, n, { trust: CONCESSION.ordinary });
  n.known = true;
  n.agenda = { kind, progress: 40, rate: 3, target: kind === 'family' ? (n.connections[0]?.npcId) : Object.keys(w.factions)[0] };
  if (kind === 'family' && !n.connections.length) {
    const kin = Object.values(w.npcs).find(x => x.alive && x.id !== n.id)!;
    n.connections = [{ npcId: kin.id, kind: 'family', label: 'sibling' }];
    kin.connections = [...kin.connections, { npcId: n.id, kind: 'family', label: 'sibling' }];
    n.agenda.target = kin.id;
  }
  w.player.currentBlockId = n.homeBlockId;
  w.player.cash = 500_000;
  w.player.skills = { ...w.player.skills, charm: 10, brains: 10, muscle: 10 };
  return n;
}

const KINDS: AgendaKind[] = ['debt', 'leave', 'revenge', 'ambition', 'family'];

describe('every agenda has something you can actually do about it', () => {
  it('each kind offers at least one move, and every move is reachable through the action', () => {
    for (const kind of KINDS) {
      expect(AGENDA_MOVES[kind].length, kind).toBeGreaterThan(0);
      const w = mk(); const n = mark(w, kind);
      expect(agendaMoves(w, n).map(m => m.mode)).toEqual(AGENDA_MOVES[kind].map(m => m.mode));
      for (const m of AGENDA_MOVES[kind]) {
        expect(can(w, { type: 'resolve_agenda', npcId: n.id, mode: m.mode }).ok, `${kind}:${m.mode}`).toBe(true);
      }
    }
  });

  it('you cannot settle a problem nobody told you about', () => {
    const w = mk(); const n = mark(w, 'debt');
    n.known = false; n.ratted = undefined; n.tap = undefined;
    expect(agendaKnown(w, n)).toBe(false);
    expect(agendaMoves(w, n)).toEqual([]);
    expect(agendaReason(w, n, 'settle')).toMatch(/do not know what/i);
    expect(can(w, { type: 'resolve_agenda', npcId: n.id, mode: 'settle' }).ok).toBe(false);
    // any one of the three ways in is enough
    n.ratted = w.day;
    expect(agendaKnown(w, n)).toBe(true);
  });

  it('a settled agenda calls doFavour — which is the entire hook into the concession system', () => {
    for (const kind of KINDS) {
      const w = mk(); const n = mark(w, kind);
      expect(favours(n)).toBe(0);
      // roll it until it lands; the claim is about what success does, not how often it happens
      let won = false;
      for (let i = 0; i < 40 && !won; i++) { const t = structuredClone(w); const m = t.npcs[n.id]; won = resolveAgenda(t, m, 'settle', new Rng(i)).won; if (won) { expect(favours(m), kind).toBe(1); expect(m.agenda!.done, kind).toBe(true); } }
      expect(won, kind).toBe(true);
    }
  });

  it('and that favour opens a concession that was shut a moment earlier', () => {
    const w = mk(); const n = mark(w, 'ambition');
    // nothing over them: no ground held, no books read, nobody of theirs held
    delete w.blocks[n.homeBlockId].influence.player;
    n.ratted = undefined; n.tap = undefined;
    expect(concessionReason(w, n, 'a place in your crew')).toBeDefined();
    let won = false;
    for (let i = 0; i < 40 && !won; i++) { won = resolveAgenda(w, n, 'settle', new Rng(i)).won; }
    expect(won).toBe(true);
    expect(concessionReason(w, n, 'a place in your crew')).toBeUndefined();
  });

  it('helping somebody leave and trapping them are both real, and they are not the same move', () => {
    const settle = mk(); const a = mark(settle, 'leave');
    const trapw = mk(); const b = mark(trapw, 'leave');
    expect(AGENDA_MOVES.leave.map(m => m.mode).sort()).toEqual(['settle', 'trap']);
    let helped = false;
    for (let i = 0; i < 40 && !helped; i++) { const t = structuredClone(settle); helped = resolveAgenda(t, t.npcs[a.id], 'settle', new Rng(i)).won; if (helped) expect(favours(t.npcs[a.id])).toBe(1); }
    expect(helped).toBe(true);
    let trapped = false;
    for (let i = 0; i < 40 && !trapped; i++) {
      const t = structuredClone(trapw); const m = t.npcs[b.id];
      trapped = resolveAgenda(t, m, 'trap', new Rng(i)).won;
      if (trapped) {
        expect(favours(m), 'the dark route must never count as a favour').toBe(0);
        expect(m.rel.fear).toBeGreaterThan(b.rel.fear);
        expect(m.agenda!.done).not.toBe(true);   // they still want out. They just cannot
      }
    }
    expect(trapped).toBe(true);
  });

  it('a debt left to rot costs more to clear, and the action charges what it quotes', () => {
    const w = mk(); const n = mark(w, 'debt');
    n.agenda!.progress = 10; const cheap = agendaCost(w, n, 'settle');
    n.agenda!.progress = 90; const dear = agendaCost(w, n, 'settle');
    expect(dear).toBeGreaterThan(cheap);
    const cash = w.player.cash;
    const after = dispatch(w, { type: 'resolve_agenda', npcId: n.id, mode: 'settle' });
    expect(after.player.cash).toBe(cash - dear);
    expect(after.player.ap).toBe(w.player.ap - 1);
  });

  it('it is refused when you cannot pay for it', () => {
    const w = mk(); const n = mark(w, 'debt');
    w.player.cash = 10;
    const r = can(w, { type: 'resolve_agenda', npcId: n.id, mode: 'settle' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/clean cash/i);
  });

  it('the outcome writes to the same places everything else does: ledger, log, and the graph', () => {
    const w = mk(); const n = mark(w, 'family');
    const kin = w.npcs[n.agenda!.target!];
    const before = kin.rel.respect;
    let won = false;
    for (let i = 0; i < 40 && !won; i++) won = resolveAgenda(w, n, 'settle', new Rng(i)).won;
    expect(won).toBe(true);
    expect(ledgerOf(n).some(e => e.kind === 'favour')).toBe(true);
    expect(w.log.some(l => l.refs?.npcId === n.id)).toBe(true);
    // reputation travels the connections graph, the way sim/standing.ts already does it
    expect(kin.rel.respect).toBeGreaterThan(before);
  });

  it('somebody already in your crew has no agenda for you to settle — it is your problem now', () => {
    const w = mk(); const n = mark(w, 'debt');
    n.crew = { loyalty: 50, cut: 0, status: 'idle', statusDays: 0, joinedDay: w.day };
    expect(agendaReason(w, n, 'settle')).toMatch(/work for you now/i);
  });

  it('the odds shown are the odds rolled, and they read the relationship', () => {
    const w = mk(); const n = mark(w, 'ambition');
    // off the 97 ceiling, or the comparison is between two clamps and proves nothing
    w.player.skills = { ...w.player.skills, charm: 1 };
    const warm = agendaChance(w, n, 'settle');
    n.rel.trust = FAMILIARITY.shallowTrust; const colder = agendaChance(w, n, 'settle');
    expect(warm).toBeLessThan(97);
    expect(colder).toBeLessThan(warm);
    expect(select.agendaChance(w, n, 'settle')).toBe(colder);
  });
});
