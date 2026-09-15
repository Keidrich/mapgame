/**
 * When the name on the job belongs to somebody your own people love.
 *
 * The game already knew this was true: `Npc.connections` has held the family and friend web since
 * generation, and a hit has always been allowed to land on anybody. The two simply never met — you
 * put a job on a man and found out afterwards, silently, from a loyalty number, that he was
 * somebody's brother.
 *
 * What these hold is that the four answers are genuinely four *different* things, with no clean
 * one. If any branch ever becomes strictly the best, the scene has stopped being a decision.
 */
import { describe, expect, it } from 'vitest';
import { KIN } from '@content/kin';
import { can, dispatch, generateWorld, select, type Npc, type World } from './index';
import { Rng } from './rng';
import { connect } from './connections';
import { kinOnTheJob, resolveKin } from './kin';

const mk = (seed = 3): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
  w.pendingEvents = []; w.confrontations = []; w.day = 20;
  return w;
};

/** One of yours who is close to you, and a man on the street who is their brother. */
function brothers(w: World, loyalty = 80): { crew: Npc; mark: Npc } {
  const pool = Object.values(w.npcs).filter(n => n.alive && !n.official);
  const crew = pool[0]; const mark = pool.find(n => n.id !== crew.id && n.homeBlockId !== crew.id)!;
  crew.crew = { loyalty, cut: 120, status: 'idle', statusDays: 0, joinedDay: 1 }; crew.role = 'crew';
  w.player.crewIds = [crew.id, pool[2].id];
  pool[2].crew = { loyalty: 50, cut: 120, status: 'idle', statusDays: 0, joinedDay: 1 }; pool[2].role = 'crew';
  mark.crew = undefined; mark.role = 'patron'; mark.alive = true;
  connect(crew, mark, 'family', 'brother');
  w.player.crewEver = 4; w.player.currentBlockId = mark.homeBlockId;
  w.player.skills = { muscle: 10, brains: 8, charm: 8, wheels: 8, tech: 8 };
  w.player.racketIds = ['r1'];
  w.rackets.r1 = { id: 'r1', kind: 'protection', businessId: Object.values(w.businesses)[0].id, owner: 'player', startedDay: 1, level: 1, lastIncome: 50, disrupted: 0 } as never;
  return { crew, mark };
}
/** Plan the hit, and hand back the scene it raises. */
function planTheHit(w: World, crew: Npc, mark: Npc) {
  const next = dispatch(w, { type: 'plan_op', kind: 'hit', crewIds: [w.player.crewIds.find(id => id !== crew.id)!], targetNpcId: mark.id });
  return { w: next, scene: select.confrontations(next).find(c => c.kind === 'kin') };
}

describe('the web comes to the door', () => {
  it('somebody loyal turns up when the job is on their brother', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    expect(kinOnTheJob(w, 'hit', mark.id)?.crew.id).toBe(crew.id);
    const { scene } = planTheHit(w, crew, mark);
    expect(scene, 'the job went out and nobody said anything').toBeDefined();
    expect(scene!.npcId).toBe(crew.id);
    expect(scene!.text).toContain(mark.name);
  });

  it('before it goes out, not after — there would be nothing left to decide', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    const { w: after, scene } = planTheHit(w, crew, mark);
    expect(scene).toBeDefined();
    expect(after.npcs[mark.id].alive, 'they were already dead when it was raised').toBe(true);
  });

  it('somebody who merely works for you is not somebody who turns up', () => {
    const w = mk(); const { mark } = brothers(w, KIN.loyal - 10);
    expect(kinOnTheJob(w, 'hit', mark.id)).toBeUndefined();
  });

  it('and neither is a stranger, which is why this stays rare', () => {
    const w = mk(); brothers(w);
    const nobody = Object.values(w.npcs).find(n => n.alive && !n.crew && !select.connectionsOf(w, n).some(c => c.npc.crew))!;
    expect(kinOnTheJob(w, 'hit', nobody.id)).toBeUndefined();
  });

  it('a job that does not end them is nobody\'s business', () => {
    const w = mk(); const { mark } = brothers(w);
    expect(kinOnTheJob(w, 'mugging', mark.id)).toBeUndefined();
    expect(kinOnTheJob(w, 'hit', mark.id)).toBeDefined();
  });

  it('the scene is answerable, and the odds shown are the odds used', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    const { w: after, scene } = planTheHit(w, crew, mark);
    const opts = select.confrontOptions(after, scene!);
    expect(opts.map(o => o.id).sort()).toEqual(['call_off', 'nothing', 'straight', 'theirs']);
    for (const o of opts) expect(o.chance, o.id).toBe(select.kinChance(after, scene!, o.id as never));
    expect(can(after, { type: 'resolve_confrontation', id: scene!.id, approach: 'call_off' }).ok).toBe(true);
  });
});

describe('four answers, four different prices', () => {
  const setup = () => { const w = mk(); const { crew, mark } = brothers(w); const r = planTheHit(w, crew, mark); return { w: r.w, scene: r.scene!, crew: r.w.npcs[crew.id], mark: r.w.npcs[mark.id] }; };

  it('calling it off: he lives, and they owe you the largest thing anybody can owe you', () => {
    const { w, scene, crew, mark } = setup();
    const before = select.favours(crew);
    expect(resolveKin(w, scene, 'call_off', new Rng(1))).toBe('abort');
    expect(mark.alive).toBe(true);
    expect(crew.crew!.loyalty).toBeGreaterThan(80);
    expect(select.favours(crew), 'calling it off bought nothing').toBeGreaterThan(before);
  });

  it('letting them do it: it is done, quietly — and it costs you the person', () => {
    // Never certain, whoever they are: `kinChance` tops out well short of 100 because this is the
    // one thing nerve decides and nothing else can buy. So roll until it lands, and check the land.
    let landed = false;
    for (let i = 0; i < 40 && !landed; i++) {
      const { w, scene, crew, mark } = setup();
      crew.nerve = 100;
      const before = crew.crew!.loyalty;
      if (resolveKin(w, scene, 'theirs', new Rng(i)) !== 'done') continue;
      landed = true;
      expect(mark.alive).toBe(false);
      expect(crew.crew!.loyalty).toBeLessThan(before);
      expect(w.player.heat, 'somebody else did it and it still cost you nothing').toBeGreaterThan(0);
    }
    expect(landed, 'forty tries and nobody ever went through with it').toBe(true);
  });

  it('…and when they cannot, he lives and he knows exactly who sent them', () => {
    // A flinch is their nerve and nothing else: you cannot talk somebody into being able to do it.
    let flinched = false;
    for (let i = 0; i < 40 && !flinched; i++) {
      const t = setup(); t.crew.nerve = 0;
      if (resolveKin(t.w, t.scene, 'theirs', new Rng(i)) !== 'abort') continue;
      flinched = true;
      expect(t.mark.alive).toBe(true);
      expect(t.mark.grudge, 'he does not hold it against the man who came').toBeDefined();
    }
    expect(flinched, 'nobody ever failed to kill their own brother').toBe(true);
  });

  it('telling them straight leaves the job running either way — it buys how they take it', () => {
    for (const nerve of [0, 100]) {
      const { w, scene, crew } = setup();
      crew.crew!.loyalty = nerve ? 95 : 56;
      w.player.skills.charm = nerve ? 12 : 0;
      expect(resolveKin(w, scene, 'straight', new Rng(7))).toBe('go');
    }
  });

  it('saying nothing is the worst of the four, and is what an unanswered day does', () => {
    const { w, scene, crew } = setup();
    const before = crew.crew!.loyalty;
    expect(resolveKin(w, scene, 'nothing', new Rng(4))).toBe('go');
    expect(crew.crew!.loyalty).toBeLessThan(before + KIN.straightFail);   // worse than the worst telling
    expect(crew.grudge, 'they did not hold it against you').toBeDefined();
  });

  it('and letting the day end for them is exactly saying nothing', () => {
    const { w, scene, crew } = setup();
    const quiet = dispatch(w, { type: 'end_day' });
    expect(select.confrontations(quiet).some(c => c.id === scene.id), 'it survived the night').toBe(false);
    expect(quiet.npcs[crew.id].grudge, 'walking away cost nothing').toBeDefined();
  });
});

describe('the op follows the answer', () => {
  it('calling it off stops the job and gives the crew back', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    const { w: after, scene } = planTheHit(w, crew, mark);
    const opId = scene!.opId!;
    const done = dispatch(after, { type: 'resolve_confrontation', id: scene!.id, approach: 'call_off' });
    expect(done.ops[opId].status).toBe('aborted');
    expect(done.player.opIds).not.toContain(opId);
    for (const id of done.ops[opId].crewIds) expect(done.npcs[id].crew?.status).toBe('idle');
  });

  it('and nobody is left holding a job that somebody else already did', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    const { w: after, scene } = planTheHit(w, crew, mark);
    const done = dispatch(after, { type: 'resolve_confrontation', id: scene!.id, approach: 'theirs' });
    expect(done.ops[scene!.opId!].status).toBe('aborted');
  });

  it('but telling them, or not, leaves the job exactly where it was', () => {
    const w = mk(); const { crew, mark } = brothers(w);
    const { w: after, scene } = planTheHit(w, crew, mark);
    const done = dispatch(after, { type: 'resolve_confrontation', id: scene!.id, approach: 'straight' });
    expect(['planning', 'ready']).toContain(done.ops[scene!.opId!].status);
  });
});
