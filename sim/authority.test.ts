/**
 * The law as its own entity.
 *
 * Three things this pins down, because all three are easy to undo by accident later:
 *  - the monitoring radius is a live field a real entity projects, not a number baked into
 *    blocks at generation, and every risk roll reads it;
 *  - the escalation ladder is its own thing, driven by heat and cyberHeat, with no connection
 *    whatsoever to the alliance/peace/tension/beef/war ladder the criminal factions use;
 *  - officials belong to a building.
 */
import { describe, expect, it } from 'vitest';
import { AUTHORITY_KINDS, POSTURES, POSTURE_ORDER } from '@content/authority';
import { PLAYER, generateWorld, type World } from './index';
import {
  addAuthority, attachOfficials, authorities, authorityOf, boughtRelief, effectivePolice,
  monitoringAt, monitoringField, officialsOf, postureFor, pressureOn, raidPressure,
  tickAuthorities, tickAuthority, topPosture, watchersOf,
} from './authority';
import { openCase } from './cases';
import { Rng } from './rng';

const mk = (seed = 4) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed });
const precinctOf = (w: World) => authorities(w).find(a => a.kind === 'precinct')!;
/** A block nobody is watching, for the "does this actually depend on the entity" comparisons. */
const unwatched = (w: World) => Object.values(w.blocks).find(b => monitoringAt(w, b.id) === 0)!;

describe('it is not a faction', () => {
  it('exists as its own type, with none of a faction\'s machinery', () => {
    const w = mk();
    const a = precinctOf(w);
    expect(a).toBeDefined();
    // the things every Faction has and this deliberately does not
    for (const k of ['soldiers', 'cash', 'standing', 'stance', 'tributeFrom', 'truceUntil', 'grudges', 'bossId']) {
      expect(a, k).not.toHaveProperty(k);
    }
    expect(w.factions[a.id]).toBeUndefined();          // never filed among the factions
    expect(Object.keys(w.factions)).not.toContain(a.id);
  });

  it('has a ladder of its own, sharing no rung name with the faction stance ladder', () => {
    const stances = ['alliance', 'peace', 'tension', 'beef', 'war'];
    for (const rung of POSTURE_ORDER) expect(stances).not.toContain(rung);
    // and no faction's stance toward the player can name a posture
    const w = mk();
    for (const f of Object.values(w.factions)) expect(POSTURE_ORDER).not.toContain(f.stance[PLAYER] as never);
  });
});

describe('the monitoring radius', () => {
  it('is projected live by the entity and reproduces the old generation bump at rest', () => {
    const w = mk();
    const a = precinctOf(w);
    expect(a.posture).toBe('routine');
    // reach 25 with falloff 0.4: +25 on its own block, +10 one street over — the numbers the
    // one-time `b.police += 25 / neighbours += 10` write used to bake in at generation
    expect(monitoringAt(w, a.blockId)).toBeCloseTo(AUTHORITY_KINDS.precinct.reach, 6);
    const nb = w.blocks[a.blockId].neighborIds.find(id => w.blocks[id])!;
    expect(monitoringAt(w, nb)).toBeCloseTo(AUTHORITY_KINDS.precinct.reach * AUTHORITY_KINDS.precinct.falloff, 6);
  });

  it('raises the effective police reading of nearby blocks above their own baseline', () => {
    const w = mk();
    const a = precinctOf(w);
    expect(effectivePolice(w, a.blockId)).toBeGreaterThan(w.blocks[a.blockId].police);
    const nb = w.blocks[a.blockId].neighborIds.find(id => w.blocks[id])!;
    expect(effectivePolice(w, nb)).toBeGreaterThan(w.blocks[nb].police);
  });

  it('leaves blocks outside every radius reading exactly their own baseline', () => {
    const w = mk();
    const far = unwatched(w);
    expect(effectivePolice(w, far.id)).toBe(w.blocks[far.id].police);
  });

  it('falls off with distance, so the radius has a shape rather than an edge', () => {
    const w = mk();
    const a = precinctOf(w);
    a.posture = 'task_force';   // radius 3, so there is something to measure at each hop
    const nb = w.blocks[a.blockId].neighborIds.find(id => w.blocks[id])!;
    const two = w.blocks[nb].neighborIds.find(id => id !== a.blockId && !w.blocks[a.blockId].neighborIds.includes(id) && w.blocks[id]);
    expect(monitoringAt(w, a.blockId)).toBeGreaterThan(monitoringAt(w, nb));
    if (two) expect(monitoringAt(w, nb)).toBeGreaterThan(monitoringAt(w, two));
  });

  it('grows with posture — the ladder is visible on the ground, not just in a label', () => {
    const w = mk();
    const a = precinctOf(w);
    const nb = w.blocks[a.blockId].neighborIds.find(id => w.blocks[id])!;
    const calm = { anchor: monitoringAt(w, a.blockId), near: monitoringAt(w, nb), covered: monitoringField(w).size };
    a.posture = 'crackdown';
    expect(monitoringAt(w, a.blockId)).toBeGreaterThan(calm.anchor);
    expect(monitoringAt(w, nb)).toBeGreaterThan(calm.near);
    expect(monitoringField(w).size).toBeGreaterThan(calm.covered);   // and it covers more ground
  });

  it('disappears entirely when the entity does — the number is not stored on the block', () => {
    const w = mk();
    const a = precinctOf(w);
    const before = effectivePolice(w, a.blockId);
    const base = w.blocks[a.blockId].police;
    delete w.authorities![a.id];
    expect(effectivePolice(w, a.blockId)).toBe(base);
    expect(effectivePolice(w, a.blockId)).toBeLessThan(before);
  });

  it('names who is watching a block, nearest first', () => {
    const w = mk();
    const a = precinctOf(w);
    const seen = watchersOf(w, a.blockId);
    expect(seen.map(x => x.authority.id)).toContain(a.id);
    expect(seen[0].hops).toBe(0);
    expect(watchersOf(w, unwatched(w).id)).toEqual([]);
  });
});

describe('the escalation ladder', () => {
  it('responds to street heat', () => {
    const w = mk();
    const a = precinctOf(w);
    const quiet = pressureOn(w, a);
    w.player.heat = 70;
    expect(pressureOn(w, a)).toBeGreaterThan(quiet);
  });

  it('responds to cyberHeat independently — wire trouble is its own input, not just more heat', () => {
    const street = mk(); const wire = mk();
    // the same total heat, made two different ways
    street.player.heat = 60; street.player.cyberHeat = 0;
    wire.player.heat = 60; wire.player.cyberHeat = 60;

    const hall = (x: World) => authorities(x).find(v => v.kind === 'city_hall')!;
    // city hall reads reports, and the wire is all report: it notices the same heat more
    expect(pressureOn(wire, hall(wire))).toBeGreaterThan(pressureOn(street, hall(street)));
    // the precinct is boots on the ground and notices it less
    expect(pressureOn(wire, precinctOf(wire))).toBeLessThan(pressureOn(street, precinctOf(street)));
  });

  it('escalates city hall on wire trouble alone, with no street heat to explain it', () => {
    const w = mk();
    const hall = authorities(w).find(v => v.kind === 'city_hall')!;
    w.player.heat = 0; w.player.cyberHeat = 0;
    expect(pressureOn(w, hall)).toBe(0);
    w.player.cyberHeat = 90;
    for (let d = 0; d < 30; d++) { w.day++; tickAuthority(w, hall); }
    expect(hall.posture).not.toBe('routine');
    expect(POSTURE_ORDER.indexOf(hall.posture)).toBeGreaterThanOrEqual(POSTURE_ORDER.indexOf('investigating'));
  });

  it('counts open cases as well as heat', () => {
    const w = mk(); w.pendingEvents = [];
    const a = precinctOf(w);
    w.player.heat = 20;
    const before = pressureOn(w, a);
    openCase(w, 'hit', 'A body on the Parade', {}, [], new Rng(3));
    expect(pressureOn(w, a)).toBeGreaterThan(before);
  });

  it('climbs with a lag and cools again, rather than snapping to the input', () => {
    const w = mk(); w.pendingEvents = [];
    const a = precinctOf(w);
    w.player.heat = 100; w.player.cyberHeat = 0;
    const target = pressureOn(w, a);
    w.day++; tickAuthority(w, a);
    expect(a.attention).toBeGreaterThan(0);
    expect(a.attention).toBeLessThan(target);      // one day is not the whole way

    for (let d = 0; d < 40; d++) { w.day++; tickAuthority(w, a); }
    const hot = a.attention;
    expect(hot).toBeGreaterThanOrEqual(target - 1);
    expect(a.posture).toBe('crackdown');

    w.player.heat = 0;                              // you go quiet
    for (let d = 0; d < 60; d++) { w.day++; tickAuthority(w, a); }
    expect(a.attention).toBeLessThan(hot);
    expect(a.posture).toBe('routine');
  });

  it('reads the rungs in order and never returns something off the ladder', () => {
    for (const rung of POSTURE_ORDER) expect(postureFor(POSTURES[rung].at)).toBe(rung);
    expect(postureFor(0)).toBe('routine');
    expect(postureFor(100)).toBe('crackdown');
    expect(postureFor(POSTURES.watching.at - 1)).toBe('routine');
  });

  it('is untouched by the criminal-faction stance system in either direction', () => {
    const w = mk(); w.pendingEvents = [];
    const a = precinctOf(w);
    w.player.heat = 50;
    const before = pressureOn(w, a);
    const postureBefore = a.posture;

    // every faction in the city goes to war with the player
    for (const f of Object.values(w.factions)) { f.stance[PLAYER] = 'war'; f.standing[PLAYER] = -100; f.truceUntil[PLAYER] = 0; }
    expect(pressureOn(w, a)).toBe(before);
    w.day++; tickAuthorities(w);
    expect(a.posture).toBe(postureBefore);

    // and the reverse: the law escalating does not move a single faction's stance
    const stances = Object.values(w.factions).map(f => f.stance[PLAYER]);
    w.player.heat = 100;
    for (let d = 0; d < 40; d++) { w.day++; tickAuthorities(w); }
    expect(topPosture(w)).toBe('crackdown');
    expect(Object.values(w.factions).map(f => f.stance[PLAYER])).toEqual(stances);
  });

  it('costs something: a harder rung raises the nightly raid chance', () => {
    const w = mk();
    expect(raidPressure(w)).toBe(POSTURES.routine.raidMult);
    precinctOf(w).posture = 'task_force';
    expect(raidPressure(w)).toBe(POSTURES.task_force.raidMult);
    expect(raidPressure(w)).toBeGreaterThan(POSTURES.routine.raidMult);
  });

  it('a bought official inside the building slows it down, but never to nothing', () => {
    const w = mk();
    const hall = authorities(w).find(v => v.kind === 'city_hall')!;
    w.player.heat = 80; w.player.cyberHeat = 40;
    const straight = pressureOn(w, hall);
    for (const n of officialsOf(w, hall)) n.official!.boughtBy = PLAYER;
    expect(boughtRelief(w, hall)).toBeGreaterThan(0);
    expect(boughtRelief(w, hall)).toBeLessThan(1);
    expect(pressureOn(w, hall)).toBeLessThan(straight);
    expect(pressureOn(w, hall)).toBeGreaterThan(0);
  });
});

describe('officials belong to a building', () => {
  it('every official is attached to one, and it knows them back', () => {
    const w = mk();
    const officials = Object.values(w.npcs).filter(n => n.official);
    expect(officials.length).toBeGreaterThan(0);
    for (const n of officials) {
      expect(n.official!.authorityId, n.name).toBeTruthy();
      const a = authorityOf(w, n);
      expect(a, n.name).toBeDefined();
      expect(a!.officialIds).toContain(n.id);
    }
  });

  it('a captain answers to a precinct; the councillor and the judge to city hall', () => {
    const w = mk();
    for (const n of Object.values(w.npcs).filter(x => x.official)) {
      const a = authorityOf(w, n)!;
      expect(a.kind, `${n.official!.kind} -> ${a.kind}`).toBe(n.official!.kind === 'captain' ? 'precinct' : 'city_hall');
    }
  });

  it('picks up an official created later, without duplicating anybody', () => {
    const w = mk();
    const hall = authorities(w).find(v => v.kind === 'city_hall')!;
    const before = hall.officialIds.length;
    const stranger = Object.values(w.npcs).find(n => !n.official && !n.crew)!;
    stranger.official = { kind: 'judge', corruption: 40 };
    attachOfficials(w);
    expect(stranger.official.authorityId).toBeTruthy();
    attachOfficials(w); attachOfficials(w);   // idempotent
    const all = authorities(w).flatMap(a => a.officialIds);
    expect(new Set(all).size).toBe(all.length);
    expect(authorityOf(w, stranger)!.officialIds.length).toBeGreaterThan(before - 1);
  });

  it('a new precinct anchors wherever it is put and starts watching from there', () => {
    const w = mk();
    const far = unwatched(w);
    expect(monitoringAt(w, far.id)).toBe(0);
    addAuthority(w, 'precinct', far.id, 'New Station', 'au_test');
    expect(monitoringAt(w, far.id)).toBeCloseTo(AUTHORITY_KINDS.precinct.reach, 6);
    expect(effectivePolice(w, far.id)).toBeGreaterThan(far.police);
  });
});
