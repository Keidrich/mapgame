/**
 * The people you bring in for one job.
 *
 * Three things separate a specialist from a recruit, and each is tested here because each could
 * quietly stop being true: they cost cash rather than a wage, they are **not reliable**, and they
 * are hired through the ordinary doors (trust, leverage, money) rather than a parallel system.
 *
 * The subtle one is the planner's number. It shows what the hired help is worth *on average*;
 * the night rolls each of them separately. A version where the planner quoted the rolled value
 * would be lying, and one where the night used the average would make reliability decorative.
 */
import { describe, expect, it } from 'vitest';
import { JOB_ROLES, SPECIALISTS, type SpecialistRole } from '@content/specialists';
import { can, dispatch, generateWorld, select, type Npc, type Op, type World } from './index';
import { hireReason, reliability, rolesFor, specialistFee, specialistWorth, isSetPiece, rollSpecialists } from './specialists';
import { Rng } from './rng';

function heistWorld(): { w: World; op: Op } {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 250 });
  w.pendingEvents = []; w.day = 70; w.player.cash = 3_000_000;
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  const target = Object.values(w.businesses).find(b => b.type === 'jeweller') ?? Object.values(w.businesses)[0];
  const op: Op = { id: 'o1', kind: 'heist_jeweller', status: 'planning', crewIds: [], planDays: 3, daysLeft: 3, createdDay: w.day, targetBusinessId: target.id } as Op;
  w.ops[op.id] = op;
  return { w, op };
}
/** Somebody good enough to do the work and willing to talk to you. */
function pro(w: World, role: SpecialistRole): Npc {
  const def = SPECIALISTS[role];
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.known = true; n.rel.trust = 40; n.rel.metDay = 1;
  n.skills = { ...n.skills, [def.skill]: 9 };
  return n;
}

describe('only some jobs have parts, and only those take specialists', () => {
  it('a stick-up has no safecracker-shaped hole in it', () => {
    expect(isSetPiece('robbery')).toBe(false);
    expect(rolesFor('robbery')).toEqual([]);
  });

  it('the set-pieces do, and every part names a role that exists', () => {
    const jobs = Object.keys(JOB_ROLES) as (keyof typeof JOB_ROLES)[];
    expect(jobs.length).toBeGreaterThanOrEqual(8);
    for (const k of jobs) {
      expect(isSetPiece(k)).toBe(true);
      for (const role of rolesFor(k)) expect(SPECIALISTS[role], `${k}/${role}`).toBeTruthy();
    }
  });

  it('and the reducer refuses a part the job does not have', () => {
    const { w, op } = heistWorld();
    const n = pro(w, 'wheelman');
    expect(can(w, { type: 'hire_specialist', opId: op.id, role: 'wheelman', npcId: n.id }).ok,
      'jewel heists do not have a wheelman part in the table').toBe(rolesFor('heist_jeweller').includes('wheelman'));
    expect(can(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: pro(w, 'safecracker').id }).ok).toBe(true);
  });
});

describe('they cost cash, once, and it is gone', () => {
  it('hiring takes the fee', () => {
    const { w, op } = heistWorld();
    const n = pro(w, 'safecracker');
    const fee = specialistFee(w, op.kind, 'safecracker', n);
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: n.id });
    expect(w.player.cash - after.player.cash).toBe(fee);
    expect(fee).toBeGreaterThan(1000);
  });

  it('a bigger job pays a bigger fee for the same person', () => {
    const { w } = heistWorld();
    const n = pro(w, 'safecracker');
    expect(specialistFee(w, 'heist_bank', 'safecracker', n)).toBeGreaterThan(specialistFee(w, 'heist_jeweller', 'safecracker', n));
  });

  it('and they are not on the payroll afterwards: no wage, not crew', () => {
    const { w, op } = heistWorld();
    const n = pro(w, 'safecracker');
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: n.id });
    expect(after.npcs[n.id].crew).toBeUndefined();
    expect(after.player.crewIds).not.toContain(n.id);
  });

  it('one person per part', () => {
    const { w, op } = heistWorld();
    const a = pro(w, 'safecracker');
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: a.id });
    expect(can(after, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: a.id }).ok).toBe(false);
  });
});

describe('the ordinary doors, not a parallel system', () => {
  it('somebody who does not do that work will not be hired to do it', () => {
    const { w } = heistWorld();
    const duffer = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    duffer.skills = { ...duffer.skills, tech: 1 };
    expect(hireReason(w, 'safecracker', duffer)).toMatch(/does not do that/i);
  });

  it('somebody who despises you will not get in a car with you', () => {
    const { w } = heistWorld();
    const n = pro(w, 'safecracker');
    n.rel.trust = -60;
    expect(hireReason(w, 'safecracker', n)).toMatch(/would not get in a car/i);
  });

  it('but something over them changes their mind, and their price', () => {
    const { w, op } = heistWorld();
    const plain = pro(w, 'safecracker');
    const full = specialistFee(w, op.kind, 'safecracker', plain);
    // leverage is the same door every other big ask in the game goes through
    plain.rel.owedToThem = 0; plain.rel.favours = 0;
    plain.ratted = w.day;  // you have been through their books — the 'dirt' door in leverageOver
    const held = specialistFee(w, op.kind, 'safecracker', plain);
    expect(held).toBeLessThanOrEqual(full);
  });

  it('and your own crew are not for hire, because they already work for you', () => {
    const { w } = heistWorld();
    const n = pro(w, 'safecracker');
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 };
    expect(hireReason(w, 'safecracker', n)).toMatch(/already work/i);
  });
});

describe('reliability is the whole point, and it is not decorative', () => {
  it('a better person is more reliable, and nobody is certain', () => {
    const { w } = heistWorld();
    const good = pro(w, 'wheelman'); good.skills = { ...good.skills, wheels: 10 }; good.rel.trust = 90;
    const ok = Object.values(w.npcs).find(x => x.alive && !x.crew && x.id !== good.id)!;
    ok.skills = { ...ok.skills, wheels: 5 }; ok.rel.trust = 0;
    expect(reliability('wheelman', good)).toBeGreaterThan(reliability('wheelman', ok));
    expect(reliability('wheelman', good)).toBeLessThan(1);
  });

  it('the planner quotes the average and the night rolls each of them', () => {
    const { w, op } = heistWorld();
    const n = pro(w, 'safecracker');
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: n.id });
    const o = after.ops[op.id];
    const quoted = specialistWorth(after, o);
    expect(quoted).toBeCloseTo(SPECIALISTS.safecracker.worth * reliability('safecracker', after.npcs[n.id]), 5);
    expect(quoted, 'the quote is the full value, which is a promise the night cannot keep').toBeLessThan(SPECIALISTS.safecracker.worth);

    // and rolled, they either come through in full or not at all
    const outcomes = new Set<number>();
    for (let i = 0; i < 40; i++) outcomes.add(rollSpecialists(after, o, new Rng(i + 1)).bonus);
    expect(outcomes.has(0), 'they never once let you down').toBe(true);
    expect(outcomes.has(SPECIALISTS.safecracker.worth), 'they never once came through').toBe(true);
  });

  it('and when they do not, the log says which part went', () => {
    const { w, op } = heistWorld();
    const role = rolesFor('heist_jeweller')[0];
    const n = pro(w, role);
    n.skills = { ...n.skills, [SPECIALISTS[role].skill]: 5 }; n.rel.trust = 0;   // a coin toss, deliberately
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role, npcId: n.id });
    const o = after.ops[op.id];
    let sawFailure = false;
    for (let i = 0; i < 60 && !sawFailure; i++) {
      const r = rollSpecialists(after, o, new Rng(i + 100));
      if (r.bonus === 0 && r.lines.length) sawFailure = true;
    }
    expect(sawFailure, 'a coin-toss specialist never once failed').toBe(true);
  });

  it('hired help makes the job better on average, which is why you pay', () => {
    const { w, op } = heistWorld();
    // Off the 3% floor first, or nothing can be shown to move anything. A jewel heist has a
    // `minCrew` of 2, so the player's own skills do not count toward it — it wants hands.
    const hands = Object.values(w.npcs).filter(n => n.alive && !n.crew).slice(0, 2);
    for (const n of hands) {
      n.role = 'crew'; n.skills = { muscle: 9, brains: 9, charm: 9, wheels: 9, tech: 9 };
      n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 };
      w.player.crewIds.push(n.id);
    }
    const crewIds = hands.map(n => n.id);
    op.crewIds = crewIds;
    const bare = select.opChance(w, op.kind, crewIds, undefined, undefined, op);
    expect(bare, 'sitting on the floor, so this would prove nothing').toBeGreaterThan(5);
    const n = pro(w, 'safecracker');
    const after = dispatch(w, { type: 'hire_specialist', opId: op.id, role: 'safecracker', npcId: n.id });
    expect(select.opChance(after, op.kind, crewIds, undefined, undefined, after.ops[op.id])).toBeGreaterThan(bare);
  });
});
