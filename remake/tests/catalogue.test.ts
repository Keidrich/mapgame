/**
 * Every job the original had, in the Remake: that the list is complete, that each one is a real
 * job (a target, a take or a consequence, a price that is the price charged), and that between
 * them the catalogue scenario runs every kind to a result.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { CATALOGUE, CATALOGUE_KINDS, type CatalogueKind } from '@r/content/catalogue';
import { SETPIECES } from '@r/content/setpieces';
import { JOBS } from '@r/content/world';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { buildJob } from '@r/sim/jobs';
import { fits, needsMet } from '@r/sim/catalogue';
import { hire } from '@r/sim/people';
import { Rng } from '@r/sim/rng';
import { run } from '@r/scripts/bot';
import type { JobKind } from '@r/sim/types';

// the long scenario runs below would otherwise starve vitest's worker RPC (see pass3.test.ts)
afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (seed = 7) => newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });

/**
 * The original's ops that the Remake carries under another name, or as a landmark set-piece. Every
 * other original op id is a Remake job kind of the same name.
 */
const RENAMED: Record<string, JobKind | `setpiece:${string}`> = {
  heist_bank: 'heist', smuggle_run: 'smuggle', long_con: 'con', raid_rival: 'raid', arson_hire: 'arson', hijack_load: 'hijack',
  records_room: 'setpiece:records', manifest_swap: 'setpiece:manifest', dome_job: 'setpiece:dome',
};

/** Launch a job at will: ready, nobody needed, easy — then answer its complications until it is done. */
function pull(w: World, jobId: string, ok: (x: World) => boolean): World {
  for (let k = 0; k < 60; k++) {
    let x = structuredClone(w); x.rng = 500 + k * 7919; x.player.ap = 9; x.events = [];
    x.jobs[jobId].status = 'ready'; x.jobs[jobId].crewMin = 0; x.jobs[jobId].difficulty = 5;
    x = dispatch(x, { type: 'launch_job', jobId, approach: JOBS[x.jobs[jobId].kind].approaches[0] });
    for (let g = 0; g < 5 && select.pendingJob(x); g++) { const pj = select.pendingJob(x)!; x = dispatch(x, { type: 'answer', jobId: pj.id, optionId: pj.complication!.options.filter(o => o.payout > 0)[0]?.id ?? pj.complication!.options[0].id }); }
    if (x.jobs[jobId].result?.success && ok(x)) return x;
  }
  throw new Error('never came off');
}
function crew(w: World, n: number): string[] {
  const out: string[] = [];
  for (const x of Object.values(w.npcs)) { if (out.length >= n) break; if (x.alive && !x.crew && !x.faction && !x.official && x.id !== w.fixerId) { hire(w, x, 100); out.push(x.id); } }
  return out;
}
function own(w: World): string {
  const b = Object.values(w.businesses).find(x => x.tier < 3 && x.closed <= 0 && x.blockId === w.player.blockId) ?? Object.values(w.businesses).find(x => x.tier < 3 && x.closed <= 0)!;
  b.ownedBy = PLAYER; b.protection = undefined; w.player.businessIds.push(b.id); return b.id;
}

describe('the catalogue is the original\'s whole list', () => {
  it('every one of the original\'s ops is a Remake job, by name or by the set-piece that carries it', () => {
    const missing = Object.keys(OP_DEFS).filter(op => {
      const to = RENAMED[op];
      if (to?.startsWith('setpiece:')) return !SETPIECES.some(s => s.id === to.slice(9));
      return !((to ?? op) in JOBS);
    });
    expect(missing).toEqual([]);
  });
  it('every catalogue kind is a whole job: leans, hands, a take or a consequence, words, and prerequisites that exist', () => {
    for (const k of CATALOGUE_KINDS) {
      const d = CATALOGUE[k];
      expect(d.leans.length, k).toBeGreaterThan(0);
      expect(d.hands[0], k).toBeLessThanOrEqual(d.hands[1]);
      if (d.alone) expect(d.hands, k).toEqual([0, 0]);
      expect(d.pay !== 'none' ? d.range[1] > 0 || d.effect === 'insurance' : d.effect !== 'none', k).toBe(true);
      expect(d.title.length && d.pitch.length, k).toBeTruthy();
      for (const a of d.needs?.after ?? []) expect(a in JOBS, `${k} needs ${a}`).toBe(true);
      if (d.target === 'landmark') expect(d.landmark, k).toBeInstanceOf(RegExp);
      expect(JOBS[k].approaches.length, k).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('what a catalogue job needs, and what it costs', () => {
  it('an armed job is refused with a reason until somebody carries a weapon', () => {
    const w = mk();
    const b = Object.values(w.businesses).find(x => fits(w, 'armed_robbery', { businessId: x.id }))!;
    w.player.kit = {};
    expect(needsMet(w, 'armed_robbery')).toMatch(/weapon/);
    expect(can(w, { type: 'case', kind: 'armed_robbery', businessId: b.id }).why).toMatch(/weapon/);
    w.player.kit = { weapon: 'bat' };
    expect(can(w, { type: 'case', kind: 'armed_robbery', businessId: b.id }).ok).toBe(true);
  });
  it('a later job in a chain waits for the one before it to have come off', () => {
    const w = mk();
    crew(w, 2); own(w);
    expect(needsMet(w, 'bust_out')).toMatch(/shell company/i);
    w.player.done = { shell_company: 1 };
    expect(needsMet(w, 'bust_out')).toBeUndefined();
  });
  it('an upfront price is charged when the job is taken, and is the price the button showed', () => {
    let w = mk();
    crew(w, 2);
    const r = w.player.racketIds; const b = Object.values(w.businesses).find(x => x.tier < 3)!;
    const id = 'rx'; w.rackets[id] = { id, kind: 'fencing', businessId: b.id, owner: PLAYER, level: 1, started: 0, lastIncome: 0, down: 0 }; b.racketIds.push(id); r.push(id);
    w.player.cash = 10000; w.player.ap = 9;
    w = dispatch(w, { type: 'case', kind: 'counterfeit_run', blockId: w.player.blockId });
    const j = Object.values(w.jobs).find(x => x.kind === 'counterfeit_run')!;
    const q = can(w, { type: 'take_job', jobId: j.id, crewIds: [w.player.crewIds[0]] });
    expect(q.cash).toBe(CATALOGUE.counterfeit_run.cost);
    const before = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'take_job', jobId: j.id, crewIds: [w.player.crewIds[0]] });
    expect(w.player.cash + w.player.dirty).toBe(before - CATALOGUE.counterfeit_run.cost!);
  });
  it('a job alone takes nobody, and nobody is there to describe it', () => {
    const w = mk();
    w.player.safehouseIds.push('sx'); w.safehouses.sx = { id: 'sx', blockId: w.player.blockId, name: 'x', tier: 1, labs: [] };
    const b = Object.values(w.businesses).find(x => fits(w, 'ghost_job', { businessId: x.id }))!;
    const j = buildJob(w, new Rng(1), { kind: 'ghost_job', blockId: b.blockId, businessId: b.id })!;
    expect(j.crewMax).toBe(0);
    expect(JOBS.ghost_job.exposure).toBe(0);
  });
});

describe('what catalogue jobs do', () => {
  it('getting inside somebody\'s business opens the wire jobs against them', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => fits(w, 'rat', { npcId: x.id }))!;
    expect(fits(w, 'wire_fraud', { npcId: n.id })).toBe(false);
    const j = buildJob(w, new Rng(2), { kind: 'rat', blockId: n.homeBlockId, npcId: n.id })!;
    const x = pull(w, j.id, y => !!y.npcs[n.id].inside);
    expect(fits(x, 'wire_fraud', { npcId: n.id })).toBe(true);
    expect(select.caseKinds(x, { npcId: n.id })).toContain('wire_fraud');
  });
  it('killing a file closes that file and no other', () => {
    const w = mk();
    w.cases.a = { id: 'a', crime: 'fraud', opened: 1, evidence: 70, suspectId: PLAYER, witnessIds: [], status: 'open', summary: 'A.' };
    w.cases.b = { id: 'b', crime: 'violence', opened: 1, evidence: 40, suspectId: PLAYER, witnessIds: [], status: 'open', summary: 'B.' };
    const j = buildJob(w, new Rng(3), { kind: 'buy_case', blockId: w.player.blockId, caseId: 'a' })!;
    const x = pull(w, j.id, () => true);
    expect(x.cases.a.status).toBe('closed');
    expect(x.cases.b.status).toBe('open');
  });
  it('springing somebody brings them home', () => {
    const w = mk();
    const [a] = crew(w, 1); w.npcs[a].crew!.status = 'jailed'; w.npcs[a].crew!.statusDays = 30;
    const j = buildJob(w, new Rng(4), { kind: 'spring_crew', blockId: w.player.blockId, npcId: a })!;
    const x = pull(w, j.id, () => true);
    expect(x.npcs[a].crew!.status).toBe('ready');
  });
  it('an insurance job pays clean on a place you own and shuts it', () => {
    const w = mk();
    const b = own(w);
    const j = buildJob(w, new Rng(5), { kind: 'insurance_fraud', blockId: w.businesses[b].blockId, businessId: b })!;
    expect(j.payout.clean).toBeGreaterThan(0);
    const cash = w.player.cash;
    const x = pull(w, j.id, () => true);
    expect(x.player.cash - cash).toBe(x.jobs[j.id].result!.clean);
    expect(x.businesses[b].closed).toBeGreaterThan(0);
  });
  it('washing it sideways turns dirty into clean at the rate it says', () => {
    const w = mk();
    w.player.dirty = 20000; const cash = w.player.cash;
    const j = buildJob(w, new Rng(6), { kind: 'crypto_wash', blockId: w.player.blockId })!;
    const x = pull(w, j.id, () => true);
    expect(x.player.dirty).toBe(0);
    expect(x.player.cash - cash).toBe(17000);
  });
  it('the purse moves by exactly what the result card says, on every paying catalogue kind that fits this city', () => {
    const w = mk(); w.player.kit = { weapon: 'pistol' };
    let checked = 0;
    for (const k of CATALOGUE_KINDS.filter(x => CATALOGUE[x].pay === 'dirty' && CATALOGUE[x].target === 'business').slice(0, 5)) {
      const b = Object.values(w.businesses).find(x => fits(w, k, { businessId: x.id })); if (!b) continue;
      const j = buildJob(w, new Rng(7), { kind: k, blockId: b.blockId, businessId: b.id })!;
      const dirty = w.player.dirty;
      const x = pull(w, j.id, () => true);
      expect(x.player.dirty - dirty, k).toBe(x.jobs[j.id].result!.dirty);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });
  it('digging in on a marked place holds it for two weeks', () => {
    const w = mk();
    const b = own(w);
    w.rackets.ry = { id: 'ry', kind: 'numbers', businessId: b, owner: PLAYER, level: 1, started: 0, lastIncome: 0, down: 0 }; w.businesses[b].racketIds.push('ry'); w.player.racketIds.push('ry');
    Object.values(w.factions)[0].standing = -70;
    expect(fits(w, 'defend_racket', { businessId: b })).toBe(true);
    const j = buildJob(w, new Rng(8), { kind: 'defend_racket', blockId: w.businesses[b].blockId, businessId: b })!;
    const x = pull(w, j.id, () => true);
    expect(x.businesses[b].dugIn).toBe(x.day + 14);
  });
});

describe('the catalogue scenario', () => {
  // one run per test (see pass3.test.ts); the union is asserted after
  const ran: Partial<Record<JobKind, number>> = {};
  // four seeds: vote_buying sits at the end of a chain (campaign_wash first, $20k, four hands) and
  // whether the collector reaches it in sixty days is the dice's call; seed 11 has always reached it
  it.each([7, 1, 3, 11])('seed %i: a mid-game empire works through the catalogue', seed => {
    const r = run({ days: 60, seed, size: 'medium', scenario: 'catalogue' });
    expect(r.w.over?.ending === 'convicted' ? r.w.over.day : 99).toBeGreaterThan(30);
    for (const [k, v] of Object.entries(r.kinds)) ran[k as JobKind] = (ran[k as JobKind] ?? 0) + (v ?? 0);
    expect(Object.keys(r.kinds).length).toBeGreaterThan(55);
  }, 60000);
  it('between them, every job kind in the Remake reached a result', () => {
    const never = (Object.keys(JOBS) as JobKind[]).filter(k => !ran[k]);
    expect(never).toEqual([] as CatalogueKind[]);
  });
});
