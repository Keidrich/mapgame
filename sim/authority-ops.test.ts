/**
 * Pushing back on the law.
 *
 * Before these three existed an Authority only ever escalated: `bribe_official` moves an
 * official's trust and buries paper, and never touches `Authority.attention`, which is the
 * number the building actually decides its posture from. So a crackdown was weather. These
 * tests pin that each of the three reaches the thing it claims to reach, and that all three
 * read the target building's posture the way every other op reads its target's state.
 */
import { describe, expect, it } from 'vitest';
import { POSTURES, POSTURE_ORDER } from '@content/authority';
import { OP_DEFS } from '@content/rackets';
import { PLAYER, can, dispatch, generateWorld, select, type Id, type World } from './index';
import { authorities, authorityOf, officialsOf } from './authority';
import { buyDownCost, buyCaseCost, jailedCrew, rungOf, springFrom, targetAuthority } from './authority-ops';
import { openCase, openCases, tickCases } from './cases';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 4) => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = [];
  // buy_down and buy_case both sit behind the ordinary "somebody has joined you" gate, so every
  // world here starts past it; the gates themselves are covered in sim/ops-progression.test.ts
  w.player.crewEver = Math.max(w.player.crewEver ?? 0, 2);
  return w;
};
const officialOf = (w: World) => Object.values(w.npcs).find(n => n.official?.authorityId)!;

/** Push one building to a rung without waiting 40 days for it. */
function setPosture(w: World, posture: (typeof POSTURE_ORDER)[number]) {
  for (const a of authorities(w)) { a.attention = POSTURES[posture].at; a.posture = posture; }
}
function hire(w: World, n = 1): Id[] {
  const out: Id[] = [];
  for (const x of Object.values(w.npcs).filter(v => v.alive && !v.crew && v.role === 'patron').slice(0, n)) {
    x.role = 'crew'; x.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    w.player.crewIds.push(x.id); w.player.crewEver = (w.player.crewEver ?? 0) + 1; out.push(x.id);
  }
  return out;
}
/** Run one op to a successful resolution, retrying seeds. */
function succeed(w: World, kind: keyof typeof OP_DEFS, plan: Record<string, unknown>, crewIds: Id[] = []): World {
  const gate = can(w, { type: 'plan_op', kind, crewIds, ...plan } as never);
  if (!gate.ok) throw new Error(`${kind} could not be planned: ${gate.reason}`);
  const planned = dispatch(w, { type: 'plan_op', kind, crewIds, ...plan } as never);
  const op = Object.values(planned.ops).find(o => o.kind === kind)!;
  for (let i = 0; i < 60; i++) {
    const t = structuredClone(planned);
    const o = t.ops[op.id]; o.status = 'ready'; o.launched = true;
    o.complication = { kind: 'not_alone', answered: 'fight', won: true };   // never under test here
    resolveOp(t, o, new Rng(i * 37 + 5));
    if (o.result?.success) return t;
  }
  throw new Error(`${kind} never succeeded across 60 seeds`);
}

describe('all three are ordinary ops in the tree', () => {
  it('carry a requires and a tier like everything else', () => {
    for (const k of ['buy_down', 'spring_crew', 'buy_case'] as const) {
      expect(OP_DEFS[k].requires, k).toBeTruthy();
      expect(OP_DEFS[k].tier, k).toBeGreaterThanOrEqual(2);
    }
  });

  it('read the target building\'s posture as difficulty', () => {
    const calm = mk(); setPosture(calm, 'routine');
    const hard = mk(); setPosture(hard, 'crackdown');
    const o = (w: World) => officialOf(w).id;
    for (const w of [calm, hard]) { w.player.skills.charm = 10; w.player.skills.brains = 10; }
    expect(select.opChance(hard, 'buy_down', [], undefined, { npcId: o(hard) }))
      .toBeLessThan(select.opChance(calm, 'buy_down', [], undefined, { npcId: o(calm) }));
  });
});

describe('buying down attention', () => {
  it('actually reduces Authority.attention, which no existing action could touch', () => {
    const w = mk();
    setPosture(w, 'investigating');
    const n = officialOf(w);
    const a = authorityOf(w, n)!;
    const before = a.attention;
    w.player.cash = 5_000_000; w.player.skills.charm = 12; w.player.skills.brains = 10;

    const t = succeed(w, 'buy_down', { targetNpcId: n.id });
    const after = t.authorities![a.id];
    expect(after.attention).toBeLessThan(before);
    expect(before - after.attention).toBeGreaterThanOrEqual(10);
  });

  it('drops the posture with it, rather than waiting for the next tick', () => {
    const w = mk();
    setPosture(w, 'watching');
    const n = officialOf(w);
    const a = authorityOf(w, n)!;
    a.attention = POSTURES.watching.at + 1;
    w.player.cash = 5_000_000; w.player.skills.charm = 12; w.player.skills.brains = 10;
    const t = succeed(w, 'buy_down', { targetNpcId: n.id });
    expect(t.authorities![a.id].posture).toBe('routine');
  });

  it('costs more the harder they are already looking — brutally so at the top', () => {
    const costs = POSTURE_ORDER.map(rung => { const w = mk(); setPosture(w, rung); return buyDownCost(w, officialOf(w).id); });
    for (let i = 1; i < costs.length; i++) expect(costs[i], POSTURE_ORDER[i]).toBeGreaterThan(costs[i - 1]);
    expect(costs[costs.length - 1]).toBeGreaterThan(costs[0] * 8);
  });

  it('the quote and the charge are the same number', () => {
    const w = mk(); setPosture(w, 'investigating');
    const n = officialOf(w);
    const quoted = select.opCost(w, 'buy_down', { npcId: n.id });
    expect(quoted).toBe(select.lawJobPrice(w, 'buy_down', { npcId: n.id }).cost);

    w.player.cash = quoted + 10; w.player.skills.charm = 12; w.player.skills.brains = 10;
    expect(can(w, { type: 'plan_op', kind: 'buy_down', crewIds: [], targetNpcId: n.id }).ok).toBe(true);
    const t = dispatch(w, { type: 'plan_op', kind: 'buy_down', crewIds: [], targetNpcId: n.id });
    expect(t.player.cash).toBe(10);
  });

  it('cannot afford it means cannot plan it', () => {
    const w = mk(); setPosture(w, 'crackdown');
    const n = officialOf(w);
    w.player.cash = 100;
    expect(can(w, { type: 'plan_op', kind: 'buy_down', crewIds: [], targetNpcId: n.id }).ok).toBe(false);
  });

  it('is per target: it only runs against somebody who answers to a building', () => {
    const w = mk();
    const stranger = Object.values(w.npcs).find(n => n.alive && !n.official)!;
    expect(select.opLocked(w, 'buy_down', { npcId: stranger.id })).toBeTruthy();
    expect(select.opLocked(w, 'buy_down', { npcId: officialOf(w).id })).toBeUndefined();
  });
});

describe('springing somebody', () => {
  it('gets a jailed crew member out early and buys their loyalty', () => {
    const w = mk();
    const [id] = hire(w);
    const n = w.npcs[id];
    n.crew!.status = 'jailed'; n.crew!.statusDays = 30;
    const loyalty = n.crew!.loyalty;

    const owed = springFrom(n);
    expect(owed).toBe(30);
    expect(n.crew!.status).toBe('idle');
    expect(n.crew!.statusDays).toBe(0);
    expect(n.crew!.loyalty).toBeGreaterThan(loyalty);
  });

  it('runs end to end as an op', () => {
    const w = mk();
    const [id] = hire(w, 2);
    w.npcs[id].crew!.status = 'jailed'; w.npcs[id].crew!.statusDays = 25;
    w.player.cash = 500000; w.player.skills.brains = 12; w.player.skills.tech = 10; w.player.skills.charm = 8;
    const helper = w.player.crewIds.find(x => x !== id)!;
    const t = succeed(w, 'spring_crew', { targetNpcId: id }, [helper]);
    expect(t.npcs[id].crew!.status).toBe('idle');
  });

  it('only lists and only accepts your own people who are actually inside', () => {
    const w = mk();
    const [id] = hire(w, 2);
    expect(jailedCrew(w)).toEqual([]);
    expect(select.opLocked(w, 'spring_crew')).toBeTruthy();      // nobody inside at all

    w.npcs[id].crew!.status = 'jailed'; w.npcs[id].crew!.statusDays = 20;
    expect(jailedCrew(w).map(n => n.id)).toEqual([id]);
    expect(select.opLocked(w, 'spring_crew', { npcId: id })).toBeUndefined();

    const free = w.player.crewIds.find(x => x !== id)!;
    expect(select.opLocked(w, 'spring_crew', { npcId: free })).toBeTruthy();
  });
});

describe('killing a file', () => {
  it('closes a specific open case, which witness-silencing never does', () => {
    const w = mk();
    hire(w, 2);
    openCase(w, 'heist', 'The Parade job', {}, [], new Rng(3));
    const file = openCases(w)[0];
    expect(file.status).toBe('open');
    w.player.cash = 5_000_000; w.player.skills.brains = 14; w.player.skills.charm = 10;

    const t = succeed(w, 'buy_case', { targetCaseId: file.id });
    const after = (t.cases ?? []).find(c => c.id === file.id)!;
    expect(after.status).toBe('cold');
    expect(after.evidence).toBeLessThan(file.evidence);
    expect(t.cases!.filter(c => c.status === 'open')).toEqual([]);
  });

  it('measurably changes how the case resolves: a killed file stops building evidence', () => {
    const base = mk(); hire(base, 2);
    openCase(base, 'heist', 'The Parade job', {}, [], new Rng(3));
    const id = openCases(base)[0].id;
    base.player.cash = 5_000_000; base.player.skills.brains = 14; base.player.skills.charm = 10;
    base.player.heat = 60;

    // left alone, the file grows
    const left = structuredClone(base);
    const grew = left.cases!.find(c => c.id === id)!;
    const evidenceBefore = grew.evidence;
    for (let d = 0; d < 5; d++) { left.day++; tickCases(left, new Rng(d + 1)); }
    expect(left.cases!.find(c => c.id === id)!.evidence).toBeGreaterThan(evidenceBefore);

    // killed, it does not
    const killed = succeed(base, 'buy_case', { targetCaseId: id });
    const dead = killed.cases!.find(c => c.id === id)!;
    const frozen = dead.evidence;
    for (let d = 0; d < 5; d++) { killed.day++; tickCases(killed, new Rng(d + 1)); }
    expect(killed.cases!.find(c => c.id === id)!.evidence).toBe(frozen);
    expect(killed.cases!.find(c => c.id === id)!.status).toBe('cold');
  });

  it('costs more when the file is further along, and when the city is in a crackdown', () => {
    const w = mk();
    openCase(w, 'heist', 'The Parade job', {}, [], new Rng(3));
    const file = openCases(w)[0];

    setPosture(w, 'routine');
    file.evidence = 10; const early = buyCaseCost(w, file.id);
    file.evidence = 80; const late = buyCaseCost(w, file.id);
    expect(late).toBeGreaterThan(early);

    setPosture(w, 'crackdown');
    expect(buyCaseCost(w, file.id)).toBeGreaterThan(late);
  });

  it('is per target: there has to be an open file, and it has to be open', () => {
    const w = mk();
    hire(w, 2);
    expect(select.opLocked(w, 'buy_case')).toBeTruthy();
    openCase(w, 'heist', 'The Parade job', {}, [], new Rng(3));
    const file = openCases(w)[0];
    expect(select.opLocked(w, 'buy_case', { caseId: file.id })).toBeUndefined();
    file.status = 'cold';
    expect(select.opLocked(w, 'buy_case', { caseId: file.id })).toBeTruthy();
  });
});

describe('the difficulty term itself', () => {
  it('climbs with the rung', () => {
    const seen = POSTURE_ORDER.map(rung => { const w = mk(); setPosture(w, rung); return select.authorityDifficulty(w, { npcId: officialOf(w).id }); });
    for (let i = 1; i < seen.length; i++) expect(seen[i], POSTURE_ORDER[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('finds the building behind the target, or the hardest-looking one for a file', () => {
    const w = mk();
    const n = officialOf(w);
    expect(targetAuthority(w, { npcId: n.id })!.id).toBe(n.official!.authorityId);
    setPosture(w, 'routine');
    const hardest = authorities(w)[0];
    hardest.posture = 'crackdown'; hardest.attention = 90;
    expect(targetAuthority(w, { caseId: 'anything' })!.id).toBe(hardest.id);
    expect(rungOf('crackdown')).toBeGreaterThan(rungOf('routine'));
  });

  it('officials are the ones attached to a building, and the op reaches theirs', () => {
    const w = mk();
    for (const a of authorities(w)) for (const n of officialsOf(w, a)) expect(authorityOf(w, n)!.id).toBe(a.id);
  });

  it('none of this touches the faction stance ladder', () => {
    const w = mk();
    setPosture(w, 'crackdown');
    const n = officialOf(w);
    w.player.cash = 5_000_000; w.player.skills.charm = 12; w.player.skills.brains = 10;
    const stances = Object.values(w.factions).map(f => f.stance[PLAYER]);
    const t = succeed(w, 'buy_down', { targetNpcId: n.id });
    expect(Object.values(t.factions).map(f => f.stance[PLAYER])).toEqual(stances);
  });
});
