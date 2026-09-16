/**
 * The second bench: three roles, and the jobs that had a hole their shape.
 *
 * The first five specialists are hired for `tech`, `wheels` or `charm` — which meant a crew could
 * be staffed end to end without one person being brought in for **muscle** or for **brains**. Those
 * were the two gaps, and they are what the new roles fill; the roster is not longer for the sake of
 * being longer.
 *
 * The assertion that matters is not "three new entries exist in a table". It is that a job which
 * had no seat for a skill now has one, and that somebody can actually be put in it — the whole
 * chain, `rolesFor` → `candidatesFor` → `hireReason` → `can()` → the odds moving.
 */
import { describe, expect, it } from 'vitest';
import { JOB_ROLES, SPECIALISTS, type SpecialistRole } from '@content/specialists';
import { OP_DEFS } from '@content/rackets';
import { can, dispatch, generateWorld, select, type Npc, type OpKind, type World } from './index';
import { candidatesFor, hireReason, isSetPiece, rolesFor, specialistFee } from './specialists';

const NEW_ROLES: SpecialistRole[] = ['demolitions', 'forger', 'lookout'];

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 30; w.player.cash = 400_000;
  return w;
};
/** Enough hands that a heist is not sitting on `opChance`'s 3% floor. */
function staff(w: World, n: number): Npc[] {
  const out: Npc[] = [];
  for (const p of Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.official).slice(-n)) {
    p.crew = { loyalty: 80, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    p.role = 'crew'; p.skills = { muscle: 8, brains: 8, charm: 8, wheels: 8, tech: 8 };
    w.player.crewIds.push(p.id); out.push(p);
  }
  return out;
}

/** Somebody in the city who can plausibly do this part, made visible to the player. */
function ableAt(w: World, role: SpecialistRole): Npc {
  const skill = SPECIALISTS[role].skill;
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.known = true;
  n.skills = { ...n.skills, [skill]: 9 };
  n.rel = { ...n.rel, trust: 30 };
  return n;
}

describe('the bench', () => {
  it('covers every skill a job can be staffed for, which it did not before', () => {
    const skills = new Set(Object.values(SPECIALISTS).map(d => d.skill));
    // muscle and brains are the two that had nobody. The point of the pass, in one assertion.
    expect(skills).toContain('muscle');
    expect(skills).toContain('brains');
    expect(skills.size).toBe(5);
  });

  it('gives each new role a fee, a worth and its own failure line', () => {
    for (const role of NEW_ROLES) {
      const d = SPECIALISTS[role];
      expect(d.fee).toBeGreaterThan(0);
      expect(d.worth).toBeGreaterThan(0);
      expect(d.failLine.length).toBeGreaterThan(20);
      // Nobody on the bench does the same job for the same money as somebody else.
      const twins = Object.values(SPECIALISTS).filter(o => o.skill === d.skill && o.worth === d.worth && o.fee === d.fee);
      expect(twins, `${role} is a reskin`).toHaveLength(1);
    }
  });

  it('keeps the lookout as the one seat a player can afford early', () => {
    const fees = Object.values(SPECIALISTS).map(d => d.fee);
    expect(SPECIALISTS.lookout.fee).toBe(Math.min(...fees));
  });

  it('is slotted somewhere: a role no job has a seat for is a role nobody can hire', () => {
    for (const role of NEW_ROLES) {
      const jobs = Object.entries(JOB_ROLES).filter(([, roles]) => roles!.includes(role));
      expect(jobs.length, `${role} has no job`).toBeGreaterThan(0);
    }
  });
});

describe('jobs that had a hole this shape', () => {
  /** What skills a job could be staffed for, before these roles existed. */
  const OLD: Partial<Record<OpKind, SpecialistRole[]>> = {
    heist_jeweller: ['safecracker', 'alarms'],
    heist_gallery: ['alarms', 'inside_man'],
    heist_warehouse: [],
    manifest_swap: ['inside_man', 'fixer_face'],
  };
  const skillsOf = (roles: SpecialistRole[]) => new Set(roles.map(r => SPECIALISTS[r].skill));

  it('a jewel heist could only ever hire tech; it can hire brains now', () => {
    expect(skillsOf(OLD.heist_jeweller!)).toEqual(new Set(['tech']));
    expect(skillsOf(rolesFor('heist_jeweller'))).toContain('brains');
  });

  it('a gallery job had no answer to paperwork, which is what a gallery job is about', () => {
    expect(skillsOf(OLD.heist_gallery!).has('brains')).toBe(false);
    expect(rolesFor('heist_gallery')).toContain('forger');
  });

  it('a warehouse job had no parts at all — a set-piece in the tree and a staffing question in the code', () => {
    expect(OLD.heist_warehouse).toHaveLength(0);
    expect(isSetPiece('heist_warehouse')).toBe(true);
    expect(skillsOf(rolesFor('heist_warehouse'))).toContain('muscle');
  });

  it('and the two landmark jobs that had none either now do', () => {
    for (const kind of ['records_room', 'left_luggage'] as OpKind[]) expect(isSetPiece(kind), kind).toBe(true);
  });

  it('never gives a job the same role twice', () => {
    for (const [kind, roles] of Object.entries(JOB_ROLES)) expect(new Set(roles!).size, kind).toBe(roles!.length);
  });
});

describe('hiring one, end to end', () => {
  it.each(NEW_ROLES)('%s: shortlisted, priced, hired, and the odds move', role => {
    const w = mk();
    const kind = Object.keys(JOB_ROLES).find(k => JOB_ROLES[k as OpKind]!.includes(role)) as OpKind;
    const them = ableAt(w, role);

    // 1. the city offers them for this part
    expect(rolesFor(kind)).toContain(role);
    expect(candidatesFor(w, role).map(n => n.id)).toContain(them.id);
    // 2. they will take it
    expect(hireReason(w, role, them)).toBeUndefined();
    // 3. at a price that is a real number and scales with what the job pays
    const fee = specialistFee(w, kind, role, them);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeGreaterThan(SPECIALISTS[role].fee * 0.4);

    // 4. and the odds know about it before the night does — the planner's number is the number.
    //    With real crew on the job: `opChance` floors at 3%, and an unstaffed heist sits on that
    //    floor, where any bonus is invisible. Comparing two floors proves nothing.
    const hands = staff(w, 4).map(n => n.id);
    const bare = select.opChance(w, kind, hands, undefined, undefined, { kind });
    const withThem = select.opChance(w, kind, hands, undefined, undefined, { kind, specialists: [{ role, npcId: them.id }] });
    expect(bare, 'the job is still on the floor; the comparison would be meaningless').toBeGreaterThan(3);
    expect(withThem, `${role} is worth nothing on a ${OP_DEFS[kind].label}`).toBeGreaterThan(bare);
  });

  it('goes through the reducer, not just the helpers', () => {
    // The door as a player meets it: plan the job, then hire onto it.
    // The ops tree gates the set-pieces behind progression; `unlock` is the cheat the other
    // specialist tests use to get past it, and this one is about hiring rather than about unlocking.
    const w = dispatch(mk(), { type: 'cheat', what: 'unlock' });
    const them = ableAt(w, 'lookout');
    const hands = staff(w, 4).filter(n => n.id !== them.id).map(n => n.id);

    // Whichever job with a lookout's seat this particular city can actually host — not a hard-coded
    // one. A generated city does not always have a warehouse in it, and a test that assumes it does
    // is a test that fails on a map rather than on the game.
    // Only jobs that take days to plan: a `planDays: 0` op is ready the moment it is planned, and
    // you cannot add somebody to a job that has already gone out.
    const options = (Object.keys(JOB_ROLES) as OpKind[]).filter(k => JOB_ROLES[k]!.includes('lookout') && OP_DEFS[k].planDays > 0);
    const found = options
      .map(kind => ({ kind, target: select.opTargets(w, kind)[0] }))
      // …and with the number of hands the job will actually take: over `maxCrew` is a refusal, and
      // sending five people on a two-man job is not a subtle way to fail a test.
      .map(o => ({ ...o, plan: { type: 'plan_op' as const, kind: o.kind, crewIds: hands.slice(0, OP_DEFS[o.kind].maxCrew), targetBusinessId: o.target?.id } }))
      .find(o => can(w, o.plan).ok);
    expect(found, `this city could host none of: ${options.join(', ')}`).toBeTruthy();

    const before = new Set(Object.keys(w.ops));
    let next = dispatch(w, found!.plan);
    // The op this call created, not the first of its kind in the world: a city can already have
    // one of these on the board, and hiring onto a finished job is refused for good reason.
    const op = Object.values(next.ops).find(o => !before.has(o.id))!;
    expect(op, 'planning the job created nothing').toBeTruthy();
    expect(op.status).toBe('planning');
    const gate = can(next, { type: 'hire_specialist', opId: op.id, npcId: them.id, role: 'lookout' });
    expect(gate.ok, gate.ok ? '' : gate.reason).toBe(true);

    next = dispatch(next, { type: 'hire_specialist', opId: op.id, npcId: them.id, role: 'lookout' });
    expect(next.ops[op.id].specialists?.map(s => s.role)).toContain('lookout');
    // …and the hire is written down where the paper can read it back. See `sim/news-coverage.test.ts`.
    expect(next.log.slice(-1)[0].text).toContain(SPECIALISTS.lookout.label);
  });
});
