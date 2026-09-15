/**
 * Who the ops planner will let you point a job at.
 *
 * The bug this pins: a crew member who betrayed you, snitched and walked could not be touched.
 * Every route out of your outfit — the betrayal event, being fired, walking out on low loyalty, a
 * skim confrontation gone wrong — lands somebody on `role: 'patron'`, and the planner's own target
 * list was `boss | lieutenant | owner | official | soldier`. So the one person a player most wants
 * to reach became the one person they could not see, while 173 strangers stayed on the list. The
 * reducer had no such rule and would happily have planned the hit.
 *
 * The rule now: **the people who matter in the city, plus anybody you have actually dealt with.**
 * History is the ledger and the grudge — both things the game already writes for its own reasons.
 */
import { describe, expect, it } from 'vitest';
import { can, generateWorld, select, type Npc, type World } from './index';

const mk = (seed = 4): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
  w.pendingEvents = [];
  return w;
};

/** Exactly what `betrayal:cut` leaves behind: out of the crew, a grudge, and a history with you. */
function exCrew(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && x.role === 'patron')!;
  n.faction = undefined; n.known = true;
  n.rel = { ...n.rel, trust: -60, metDay: 1, contacts: 9 };
  n.grudge = { since: 2, reason: 'you cut them loose', spread: 0 };
  n.ledger = [{ day: 2, kind: 'deal', text: 'They came to work for you at $120/day.' }];
  return n;
}

/** Everything a hit needs, so the only question left is whether the target is reachable. */
function ready(w: World, except: Npc): void {
  w.player.crewIds = Object.values(w.npcs).filter(x => x.alive && x.id !== except.id).slice(0, 2)
    .map(x => { x.crew = { loyalty: 60, cut: 100, status: 'idle', statusDays: 0, joinedDay: 1 }; x.role = 'crew'; return x.id; });
  w.player.crewEver = 4;
  w.player.racketIds = ['r1'];
  w.rackets.r1 = { id: 'r1', kind: 'protection', businessId: Object.values(w.businesses)[0].id, owner: 'player', startedDay: 1, level: 1, lastIncome: 50, disrupted: 0 } as never;
  w.player.skills = { muscle: 10, brains: 8, charm: 8, wheels: 8, tech: 8 };
  w.player.currentBlockId = except.homeBlockId;
}

describe('somebody who used to work for you', () => {
  it('is on the list, which is the whole of this bug', () => {
    const w = mk();
    const n = exCrew(w);
    expect(select.opNpcTargets(w, 'hit').map(x => x.id)).toContain(n.id);
  });

  it('and the planner and the reducer agree about them', () => {
    const w = mk();
    const n = exCrew(w);
    ready(w, n);
    const offered = select.opNpcTargets(w, 'hit').some(x => x.id === n.id);
    const allowed = can(w, { type: 'plan_op', kind: 'hit', crewIds: w.player.crewIds, targetNpcId: n.id }).ok;
    expect(allowed, 'the reducer refused, so the premise has changed').toBe(true);
    expect(offered, 'the reducer allows it and the planner does not offer it').toBe(allowed);
  });

  it('is reachable through a grudge alone, for somebody the ledger never caught', () => {
    const w = mk();
    const n = exCrew(w);
    n.ledger = undefined;
    expect(select.opNpcTargets(w, 'hit').map(x => x.id)).toContain(n.id);
  });

  it('and through the ledger alone, for somebody who left without hard feelings', () => {
    const w = mk();
    const n = exCrew(w);
    n.grudge = undefined;
    expect(select.opNpcTargets(w, 'hit').map(x => x.id)).toContain(n.id);
  });
});

describe('the list is still a list rather than the phone book', () => {
  it('leaves out the strangers', () => {
    const w = mk();
    const all = Object.values(w.npcs).filter(n => n.alive);
    const offered = select.opNpcTargets(w, 'hit');
    expect(offered.length).toBeLessThan(all.length);
    for (const n of offered) {
      const matters = ['boss', 'lieutenant', 'owner', 'official', 'soldier'].includes(n.role);
      const history = !!(n.ledger?.length || n.grudge);
      expect(matters || history, `${n.name} (${n.role}) is on the list for no reason`).toBe(true);
    }
  });

  it('still keeps everybody who matters in the city', () => {
    const w = mk();
    const offered = new Set(select.opNpcTargets(w, 'hit').map(n => n.id));
    for (const n of Object.values(w.npcs)) {
      if (!n.alive || n.crew) continue;
      if (['boss', 'lieutenant', 'owner', 'official', 'soldier'].includes(n.role)) expect(offered.has(n.id), n.name).toBe(true);
    }
  });

  it('never offers your own people, or the dead', () => {
    const w = mk();
    const n = exCrew(w);
    ready(w, n);
    const offered = select.opNpcTargets(w, 'hit');
    for (const x of offered) { expect(x.crew, x.name).toBeFalsy(); expect(x.alive, x.name).toBe(true); }
  });

  it('puts the people you have history with first, so they survive the cut to forty', () => {
    const w = mk();
    const n = exCrew(w);
    const offered = select.opNpcTargets(w, 'hit');
    expect(offered.slice(0, 40).map(x => x.id), 'buried past the visible end of the list').toContain(n.id);
  });
});

describe('the per-op filters still narrow it', () => {
  it('a job that wants somebody you have been through the books of asks for exactly that', () => {
    const w = mk();
    const n = exCrew(w);
    expect(select.opNpcTargets(w, 'no_loose_ends').map(x => x.id)).not.toContain(n.id);
    n.ratted = w.day;
    expect(select.opNpcTargets(w, 'no_loose_ends').map(x => x.id)).toContain(n.id);
  });

  it('and a job that wants one of yours in a cell offers the cell, not the street', () => {
    const w = mk();
    const jailed = Object.values(w.npcs).find(x => x.alive)!;
    jailed.crew = { loyalty: 50, cut: 100, status: 'jailed', statusDays: 10, joinedDay: 1 } as never;
    w.player.crewIds = [jailed.id];
    const offered = select.opNpcTargets(w, 'spring_crew');
    expect(offered.map(x => x.id)).toEqual([jailed.id]);
  });
});
