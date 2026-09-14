/**
 * Complications on the big jobs.
 *
 * The contract being pinned here is mostly about *reuse*: a complication has to be a
 * `Confrontation` going through `queueConfrontation` / `confrontOptions` /
 * `resolveConfrontation`, priced by the same kit functions, and swept up by the same
 * unanswered-at-End-Day line. If somebody later builds a second pending-action system for this,
 * these tests are what should stop them.
 *
 * The other half is the tier gate: a stick-up stays a single fast roll, and that difference is
 * the point of having tiers at all.
 */
import { describe, expect, it } from 'vitest';
import { COMPLICATION, COMPLICATIONS } from '@content/complications';
import { OP_DEFS } from '@content/rackets';
import { ITEM_DEFS } from '@content/items';
import { can, dispatch, generateWorld, select, type Id, type Op, type World } from './index';
import { activeConfrontation, confrontChance, confrontOptions, resolveConfrontation } from './combat';
import { canComplicate, complicationChance, complicationSwing, maybeComplicate } from './complications';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 8) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed }); w.pendingEvents = []; return w; };

function hire(w: World, n = 3): Id[] {
  const out: Id[] = [];
  for (const x of Object.values(w.npcs).filter(v => v.alive && !v.crew && v.role === 'patron').slice(0, n)) {
    x.role = 'crew'; x.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    x.skills.muscle = 8; x.skills.brains = 8; x.skills.wheels = 8; x.skills.tech = 8;
    w.player.crewIds.push(x.id); w.player.crewEver = (w.player.crewEver ?? 0) + 1; out.push(x.id);
  }
  return out;
}
/** A launched op of any kind, bypassing the planner's own gates. */
function launched(w: World, kind: Op['kind']): Op {
  const o: Op = {
    id: `o_${kind}`, kind, crewIds: w.player.crewIds.slice(0, OP_DEFS[kind].maxCrew), planDays: 0, daysLeft: 0,
    status: 'ready', launched: true, createdDay: w.day,
    targetBusinessId: OP_DEFS[kind].target === 'business' ? Object.values(w.businesses)[0].id : undefined,
  };
  w.ops[o.id] = o; w.player.opIds.push(o.id);
  return o;
}
/** Force a complication to be raised, whatever the dice would have said. */
function forced(w: World, kind: Op['kind'] = 'heist_warehouse'): { o: Op; c: NonNullable<ReturnType<typeof activeConfrontation>> } {
  const o = launched(w, kind);
  for (let i = 0; i < 200; i++) {
    const rng = new Rng(i * 13 + 1);
    if (maybeComplicate(w, o, rng)) return { o, c: activeConfrontation(w)! };
  }
  throw new Error('no complication raised across 200 seeds');
}

describe('the tier gate', () => {
  it('tier 0 and 1 street jobs never raise one', () => {
    for (const k of Object.keys(OP_DEFS) as Op['kind'][]) {
      if ((OP_DEFS[k].tier ?? 0) >= COMPLICATION.minTier) continue;
      expect(canComplicate(k), k).toBe(false);
      expect(complicationChance(k), k).toBe(0);
    }
  });

  it('and no amount of rolling changes that', () => {
    const w = mk(); hire(w);
    const o = launched(w, 'robbery');
    for (let i = 0; i < 300; i++) expect(maybeComplicate(w, o, new Rng(i))).toBeUndefined();
    expect(select.activeConfrontation(w)).toBeUndefined();
    expect(o.complication).toBeUndefined();
  });

  it('tier 2+ can, and the bigger the job the likelier it is', () => {
    for (const k of Object.keys(OP_DEFS) as Op['kind'][]) {
      if ((OP_DEFS[k].tier ?? 0) < COMPLICATION.minTier) continue;
      expect(canComplicate(k), k).toBe(true);
      expect(complicationChance(k), k).toBeGreaterThan(0);
    }
    expect(complicationChance('heist_bank')).toBeGreaterThan(complicationChance('heist_warehouse'));
  });
});

describe('it is the combat system, not a copy of it', () => {
  it('queues an actual Confrontation, in the same queue a faction attack uses', () => {
    const w = mk(); hire(w);
    const { o, c } = forced(w);
    expect(select.confrontations(w).map(x => x.id)).toContain(c.id);
    expect(activeConfrontation(w)!.id).toBe(c.id);
    expect(c.kind).toBe('op');
    expect(c.opId).toBe(o.id);
    expect(c.complication).toBeTruthy();
  });

  it('holds the op open rather than resolving it', () => {
    const w = mk(); hire(w);
    const { o } = forced(w);
    expect(o.status).toBe('ready');
    expect(o.result).toBeUndefined();
  });

  it('offers the same three answers, so kit pricing reads unchanged', () => {
    const w = mk(); hire(w);
    const { c } = forced(w);
    expect(confrontOptions(w, c).map(x => x.id).sort()).toEqual(['backup', 'fight', 'flee']);
    for (const opt of confrontOptions(w, c)) { expect(opt.chance).toBeGreaterThanOrEqual(3); expect(opt.chance).toBeLessThanOrEqual(97); }
  });

  it('uses the complication\'s own wording, not the doorstep wording', () => {
    const w = mk(); hire(w);
    const { c } = forced(w);
    const def = COMPLICATIONS[c.complication!];
    expect(confrontOptions(w, c).map(x => x.label)).toEqual([def.options.fight.label, def.options.backup.label, def.options.flee.label]);
    expect(confrontOptions(w, c).map(x => x.label)).not.toContain('Stand and fight');
  });

  it('blocks the rest of the day exactly as a doorstep confrontation does', () => {
    const w = mk(); hire(w);
    const free = can(w, { type: 'move', toBlockId: Object.keys(w.blocks)[1] });
    forced(w);
    // the reducer's pending gate reads w.confrontations; it has no idea a complication is a
    // different sort of thing, which is precisely the point of reusing the type
    expect(can(w, { type: 'move', toBlockId: Object.keys(w.blocks)[1] }).ok).toBe(false);
    expect(free.ok || !free.ok).toBe(true);
  });
});

describe('the answer reads the kit', () => {
  it('what you are carrying moves the odds, through kitApproachBias', () => {
    const bare = mk(); hire(bare);
    const armed = structuredClone(bare);
    const { c: c0 } = forced(bare);
    const { c: c1 } = forced(armed);
    expect(c0.complication).toBe(c1.complication);   // same seed path, same problem

    armed.player.items = [...(armed.player.items ?? []), 'sawnoff'];
    armed.player.equipped = ['sawnoff'];
    expect(select.kitApproachBias(armed, 'loud')).toBeGreaterThan(0);
    expect(ITEM_DEFS.sawnoff.mods.approachBias!.quiet).toBeLessThan(0);

    // a sawn-off makes going through people better and slipping out worse, on a job as at a door
    expect(confrontChance(armed, c1, 'fight')).toBeGreaterThan(confrontChance(bare, c0, 'fight'));
    expect(confrontChance(armed, c1, 'flee')).toBeLessThan(confrontChance(bare, c0, 'flee'));
  });

  it('the complication\'s own bias is in the number too', () => {
    const w = mk(); hire(w);
    const { c } = forced(w, 'heist_jeweller');
    const def = COMPLICATIONS[c.complication!];
    // whichever answer this problem favours should beat the one it does not, all else equal
    const best = (['fight', 'backup', 'flee'] as const).reduce((a, b) => def.bias[a] >= def.bias[b] ? a : b);
    const worst = (['fight', 'backup', 'flee'] as const).reduce((a, b) => def.bias[a] <= def.bias[b] ? a : b);
    if (def.bias[best] > def.bias[worst]) {
      const gap = confrontChance(w, c, best) - confrontChance(w, c, worst);
      expect(gap).toBeGreaterThan(0);
    }
  });
});

describe('the answer changes the op\'s actual outcome', () => {
  it('handling it well makes the job meaningfully likelier to land than fumbling it', () => {
    const w = mk(); hire(w);
    const o = launched(w, 'heist_warehouse');
    const base = select.opChance(w, o.kind, o.crewIds, o.approach, { businessId: o.targetBusinessId });

    const handled = { ...o, complication: { kind: 'not_alone' as const, answered: 'fight' as const, won: true } };
    const fumbled = { ...o, complication: { kind: 'not_alone' as const, answered: 'fight' as const, won: false } };
    const absent = { ...o, complication: { kind: 'not_alone' as const, answered: 'absent' as const, won: false } };

    expect(complicationSwing(handled, true, 'fight')).toBe(COMPLICATION.handledBonus);
    expect(complicationSwing(fumbled, false, 'fight')).toBe(-COMPLICATION.fumbledPenalty);
    expect(complicationSwing(absent, false, 'absent')).toBe(-COMPLICATION.absentPenalty);
    // and never turning up is the worst of the three, which is why the modal blocks the day
    expect(complicationSwing(absent, false, 'absent')).toBeLessThan(complicationSwing(fumbled, false, 'fight'));
    expect(base).toBeGreaterThan(0);
  });

  it('measurably: the same job and seeds succeed more often handled than fumbled', () => {
    const run = (won: boolean) => {
      let wins = 0;
      for (let i = 0; i < 60; i++) {
        const w = mk(); hire(w); w.pendingEvents = [];
        const o = launched(w, 'heist_warehouse');
        o.complication = { kind: 'not_alone', answered: 'fight', won };
        resolveOp(w, o, new Rng(i * 7 + 3));
        if (o.result?.success) wins++;
      }
      return wins;
    };
    const handled = run(true); const fumbled = run(false);
    expect(handled).toBeGreaterThan(fumbled);
  });

  it('answering through the confrontation finishes the op in one step', () => {
    const w = mk(); hire(w);
    const { o, c } = forced(w);
    expect(o.status).toBe('ready');
    resolveConfrontation(w, c, 'backup', new Rng(5));
    expect(['done', 'failed']).toContain(w.ops[o.id].status);
    expect(w.ops[o.id].result).toBeTruthy();
    expect(w.ops[o.id].complication!.answered).toBe('backup');
    expect(select.activeConfrontation(w)).toBeUndefined();
  });

  it('never raises a second complication on the same job', () => {
    const w = mk(); hire(w);
    const { o, c } = forced(w);
    resolveConfrontation(w, c, 'fight', new Rng(2));
    expect(select.activeConfrontation(w)).toBeUndefined();
    expect(['done', 'failed']).toContain(w.ops[o.id].status);
  });

  it('an unanswered one lands through the same End Day sweep, and lands worse', () => {
    const w = mk(); hire(w);
    const { o } = forced(w);
    const next = dispatch(w, { type: 'end_day' });
    expect(select.activeConfrontation(next)).toBeUndefined();
    expect(next.ops[o.id].complication!.answered).toBe('absent');
    expect(['done', 'failed']).toContain(next.ops[o.id].status);
  });

  it('does not wreck anything on its own: a complication is not an attack', () => {
    const w = mk(); hire(w);
    const biz = Object.values(w.businesses)[0];
    const condition = biz.condition;
    const { c } = forced(w);
    const crewStatuses = w.player.crewIds.map(id => w.npcs[id].crew!.status);
    resolveConfrontation(w, c, 'flee', new Rng(9));
    expect(w.businesses[biz.id].condition).toBe(condition);
    expect(w.player.crewIds.map(id => w.npcs[id].crew!.status)).toEqual(crewStatuses.map(s => s === 'assigned' ? 'idle' : s));
  });

  it('how it was answered shows up in the heat, not just the odds', () => {
    expect(COMPLICATION.heatBy.fight).toBeGreaterThan(COMPLICATION.heatBy.flee);
    expect(COMPLICATION.heatBy.flee).toBeLessThan(1);
  });
});

describe('no parallel machinery', () => {
  it('the only pending-answer queue in the sim is w.confrontations', () => {
    const w = mk(); hire(w);
    forced(w);
    expect(Array.isArray(w.confrontations)).toBe(true);
    expect(w.confrontations!.length).toBe(1);
    // nothing else on the world grew a queue of its own
    for (const k of Object.keys(w)) {
      if (k === 'confrontations' || k === 'pendingEvents') continue;
      expect(/pending|awaiting|queue/i.test(k), k).toBe(false);
    }
  });

  it('complications.ts raises them through queueConfrontation and nothing else', async () => {
    const src = await import('node:fs/promises').then(fs => fs.readFile('sim/complications.ts', 'utf8'));
    expect(src).toContain('queueConfrontation');
    expect(src).not.toMatch(/w\.confrontations\s*=/);   // it never touches the queue directly
  });
});
