/**
 * Working alone as a build, rather than as a shortage.
 *
 * The solo pass made one-person play *viable* — the op tree stopped asking one person for a
 * crew's worth of skill. That left it correct and characterless: everything a crew player does,
 * minus the parts that need a crew. This is the other half, and the line it has to hold is the
 * one this file is mostly about:
 *
 * **`alone` is not `minCrew: 0`.** A `minCrew: 0` job is one you *can* do by yourself. An `alone`
 * job is one that stops existing the moment somebody else is involved — there is no version of
 * "nobody can describe you afterwards" with a second person standing there. If the lone-wolf lane
 * were only a relaxation of crew-gated content it would be a discount, not a build, and an outfit
 * could buy its way into it by benching everybody for a day.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { LONE_WOLF } from '@content/backgrounds';
import { CACHE } from '@content/events';
import { can, dispatch, generateWorld, select, type OpKind, type World } from './index';
import { addHeat } from './util';

const ALONE = (Object.keys(OP_DEFS) as OpKind[]).filter(k => OP_DEFS[k].requires?.alone);

function solo(crew = 0): World {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 11 });
  w.pendingEvents = []; w.day = 30; w.player.cash = 40_000; w.player.heat = 20;
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, crew)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return w;
}

describe('the lane is real content, not a relaxation of crew-gated content', () => {
  it('there is a lane at all', () => {
    expect(ALONE.length, 'nothing actually requires being alone').toBeGreaterThanOrEqual(2);
  });

  it('and an outfit cannot run any of it, at any size', () => {
    // Everything else these ops ask for is satisfied first, so the only thing left standing
    // between the player and the job is the crew — otherwise a safehouse gate would pass this
    // test while the lane itself was wide open.
    let w = solo(2);
    w = dispatch(w, { type: 'rent_safehouse', blockId: select.startBlock(w).id });
    w = dispatch(w, { type: 'upgrade_safehouse', safehouseId: w.player.safehouseIds[0] });
    for (const k of ALONE) {
      const why = select.opLocked(w, k);
      expect(why, `${k} is open to somebody with a crew`).toBeTruthy();
      if (!/prior|Needs a/i.test(why!)) expect(why, k).toMatch(/one person|somebody else/i);
    }
    // and at least one of them is blocked *by the crew and nothing else*
    expect(select.opLocked(w, 'ghost_job')).toMatch(/one person|somebody else/i);
  });

  it('which is the difference from every other solo-capable op: those stay open with a crew', () => {
    // The line the whole lane rests on. `rat` and `long_con` are minCrew 0 — doable alone, and
    // still perfectly doable with people. These are not.
    const w = solo(2);
    for (const k of ['rat', 'long_con'] as OpKind[]) {
      expect(select.opLocked(w, k) ?? '', `${k} closed itself to somebody with a crew`).not.toMatch(/one person|somebody else/i);
      expect(OP_DEFS[k].minCrew, k).toBe(0);
      expect(OP_DEFS[k].requires?.alone, `${k} has quietly been pulled into the alone lane`).toBeFalsy();
    }
    expect(ALONE.every(k => OP_DEFS[k].minCrew === 0), 'an alone op that also demands crew is unplannable').toBe(true);
    expect(ALONE.every(k => OP_DEFS[k].maxCrew === 0), 'an alone op that accepts crew is a contradiction').toBe(true);
  });

  it('every one of them resolves to something — an op with no case pays nothing, silently', () => {
    // The trap the crime pass shipped once: `resolveOp`'s switch has no default.
    for (const k of ALONE) expect(OP_DEFS[k].payout[1], `${k} pays nothing at all`).toBeGreaterThan(0);
  });
});

describe('and it is reachable: a lone player can actually get to it', () => {
  it('the entry job opens for somebody with nobody and a back room', () => {
    let w = solo(0);
    const home = select.startBlock(w);
    w = dispatch(w, { type: 'rent_safehouse', blockId: home.id });
    expect(select.opLocked(w, 'ghost_job'), 'the lane is shut to the player it was written for').toBeUndefined();
  });

  it('and it is a real chance for the right background, not a formality', () => {
    let w = solo(0);
    w = dispatch(w, { type: 'rent_safehouse', blockId: select.startBlock(w).id });
    const best = Math.max(...([undefined, 'loud', 'quiet'] as const).map(a => select.opChance(w, 'ghost_job', [], a)));
    expect(best).toBeGreaterThanOrEqual(40);
    expect(best).toBeLessThan(90);
  });

  it('the second one is gated behind the first, so the lane is a lane', () => {
    expect(OP_DEFS.no_loose_ends.requires?.priorOps).toContain('ghost_job');
  });
});

describe('the payoffs are things an outfit genuinely cannot have', () => {
  it('half the heat, and it stops the day somebody joins', () => {
    const lone = solo(0), crewed = solo(1);
    addHeat(lone, 20); addHeat(crewed, 20);
    expect(lone.player.heat).toBeLessThan(crewed.player.heat);
    // the ratio, not the figure: `addHeat` also multiplies by the time of day and by how
    // respectable you look, and this claim is about the crew term alone
    const before = solo(0).player.heat;
    expect((lone.player.heat - before) / (crewed.player.heat - before)).toBeCloseTo(LONE_WOLF.heat, 5);
  });

  it('better odds on a job you are genuinely running alone', () => {
    const lone = solo(0), crewed = solo(1);
    const a = select.opChance(lone, 'robbery', []);
    const b = select.opChance(crewed, 'robbery', []);
    expect(a, 'running a job by yourself is worth nothing extra').toBeGreaterThan(b);
  });

  it('...but not for an outfit that benched everybody for the afternoon', () => {
    // The bonus reads `isLoneWolf`, not "how many are on this job", so a crew player cannot
    // pick it up by simply not bringing anybody.
    const crewed = solo(3);
    const before = select.opChance(crewed, 'robbery', []);
    for (const id of crewed.player.crewIds) crewed.npcs[id].crew!.status = 'jailed';
    // now they really are alone — people in a cell are not people you have
    expect(select.opChance(crewed, 'robbery', []), 'an outfit in a cell is still an outfit').toBeGreaterThan(before);
  });

  it('and the biggest wall, which is the other half of the same idea', () => {
    expect(select.cacheCap(solo(0))).toBe(CACHE.base);
    expect(select.cacheCap(solo(2))).toBeLessThan(CACHE.base);
  });
});

describe('it is a way of working, not a vow', () => {
  it('having once had a crew does not shut the lane', () => {
    let w = solo(1);
    w = dispatch(w, { type: 'rent_safehouse', blockId: select.startBlock(w).id });
    expect(select.opLocked(w, 'ghost_job')).toBeTruthy();
    for (const id of w.player.crewIds) { const n = w.npcs[id]; n.crew!.status = 'dead'; }
    expect(w.player.crewEver, 'this player never had anybody, so this proves nothing').toBeGreaterThan(0);
    expect(select.isLoneWolf(w)).toBe(true);
    expect(select.opLocked(w, 'ghost_job'), 'an outfit that was taken apart cannot work alone again').toBeUndefined();
  });

  it('and planning one with somebody on it is refused outright', () => {
    let w = solo(1);
    w = dispatch(w, { type: 'rent_safehouse', blockId: select.startBlock(w).id });
    const biz = Object.values(w.businesses).find(b => b.ownedBy === 'npc')!;
    const r = can(w, { type: 'plan_op', kind: 'ghost_job', crewIds: [w.player.crewIds[0]], targetBusinessId: biz.id });
    expect(r.ok).toBe(false);
  });
});
