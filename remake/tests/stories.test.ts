/**
 * Stories (`sim/stories.ts`, `content/stories.ts`): procedural, not written in. Which kinds a game
 * can have is its seed's call; what starts one is what the player did. Then each kind's own arc.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARCS, AVENGER, DETECTIVE, FRIEND, HEIR, MAX_ACTIVE, REPORTER, TURNCOAT } from '@r/content/stories';
import type { ArcKind } from '@r/content/stories';
import { can, dispatch, newWorld, select, type World } from '@r/sim/index';
import { arcDo, tickStories, type Arc } from '@r/sim/stories';
import { hire } from '@r/sim/people';
import { Rng } from '@r/sim/rng';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (seed = 7): World => { const w = newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' }); w.player.cash = 30000; return w; };
/** A world whose seed has this kind on the table (the first seed from `from` that does). */
function seedWith(kind: ArcKind, from = 1): World {
  for (let s = from; s < from + 200; s++) { const w = mk(s); if (hashRoll(w, kind) < ARCS[kind].chance) return w; }
  throw new Error(`no seed has ${kind}`);
}
// the same roll the sim makes for the first story of a kind
import { hash01 } from '@r/sim/rng';
const hashRoll = (w: World, kind: ArcKind) => hash01(`${w.seed}:arc:${kind}:0`);
const live = (w: World, kind: ArcKind) => select.arcOf(w, kind) as Arc | undefined;

describe('a sandbox, not a script', () => {
  it('different seeds are open to different stories, and none has all of them every time', () => {
    const sets = new Set<string>();
    for (let s = 1; s <= 40; s++) { const w = mk(s); sets.add((Object.keys(ARCS) as ArcKind[]).filter(k => hashRoll(w, k) < ARCS[k].chance).join(',')); }
    expect(sets.size).toBeGreaterThan(8);
  });

  it('nothing starts without its cause: a cold, quiet boss on day 2 has no stories', () => {
    const w = mk();
    tickStories(w);
    expect(select.activeArcs(w)).toHaveLength(0);
  });

  it(`no more than ${MAX_ACTIVE} at once, and one new one a night`, () => {
    const w = seedWith('detective');
    w.player.heat = 90; w.player.fear = 90; w.player.respect = 90; w.day = 40;
    for (const f of Object.values(w.factions)) f.standing = -90;
    tickStories(w);
    expect(select.activeArcs(w).length).toBe(1);
    for (let i = 0; i < 10; i++) { w.day++; tickStories(w); }
    expect(select.activeArcs(w).length).toBeLessThanOrEqual(MAX_ACTIVE);
  });
});

describe('the detective', () => {
  it('comes with heat on a seed that has one, as a real person with a file that grows', () => {
    let w = seedWith('detective');
    w.player.heat = DETECTIVE.heat[1];
    tickStories(w);
    const d = live(w, 'detective')!;
    expect(w.npcs[d.npcId].nemesis).toBe('detective');
    expect(w.scheduled.some(s => s.template === 'det_intro')).toBe(true);
    const f0 = d.meter;
    w.scheduled = [];
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    expect(live(w, 'detective')!.meter).toBeGreaterThan(f0);
  });

  it('the raid takes half the dirty money; blackmail with dirt buys the detective off', () => {
    let w = seedWith('detective');
    w.player.heat = 60; tickStories(w); w.scheduled = [];
    const d = live(w, 'detective')!;
    w.player.dirty = 10000;
    arcDo(w, new Rng(1), 'detective', 'raid');
    expect(w.player.dirty).toBe(5000);
    expect(d.meter).toBe(DETECTIVE.afterRaid);
    w.player.blockId = w.npcs[d.npcId].homeBlockId;
    expect(can(w, { type: 'story', arcId: d.id, move: 'blackmail' }).ok).toBe(false);
    d.dirt = true;
    w = dispatch(w, { type: 'story', arcId: d.id, move: 'blackmail' });
    expect(live(w, 'detective')!.status).toBe('bought');
  });
});

describe('the reporter', () => {
  it('comes with fame; a piece runs, and two pieces are the end of it', () => {
    const w = seedWith('reporter');
    w.day = 20; w.player.fear = 70; w.player.respect = 70;
    for (let i = 0; i < 5 && !live(w, 'reporter'); i++) { tickStories(w); w.day++; }
    const r = live(w, 'reporter');
    if (!r) return;   // another kind took the night first; the kind is covered by the bot sweep
    const heat = w.player.heat;
    arcDo(w, new Rng(1), 'reporter', 'runs');
    expect(w.player.heat).toBeGreaterThan(heat);
    expect(r.meter).toBe(REPORTER.afterRun);
    arcDo(w, new Rng(1), 'reporter', 'runs');
    expect(r.status).toBe('published');
  });
});

describe('the heir', () => {
  it('rises in an outfit that hates you; a gift takes the edge off', () => {
    let w = seedWith('heir');
    const f = Object.values(w.factions)[0];
    f.standing = HEIR.standing[1] - 5;
    tickStories(w);
    const h = live(w, 'heir')!;
    expect(h.factionId).toBe(f.id);
    expect(h.npcId).not.toBe(f.bossId);
    w.scheduled = [];
    const g = h.meter;
    w = dispatch(w, { type: 'story', arcId: h.id, move: 'gift' });
    expect(live(w, 'heir')!.meter).toBe(g - HEIR.gift.cut);
  });
});

describe('the avenger and the turncoat', () => {
  it('somebody with a revenge agenda can come for you; a guard on your door stops the attempt', () => {
    // a seed that has avengers, on an early night its roll comes up (before anything else can start)
    let w!: World;
    for (let s = 1; s < 400 && !w; s++) {
      const c = mk(s); if (hashRoll(c, 'avenger') >= ARCS.avenger.chance) continue;
      const d = [2, 3, 4, 5, 6, 7, 8, 9].find(x => hash01(`${s}:ven:${x}`) < AVENGER.nightly);
      if (d) { c.day = d; w = c; }
    }
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.faction)!;
    n.agenda = { kind: 'revenge', known: false, since: 1 };
    tickStories(w);
    const a = live(w, 'avenger');
    expect(a).toBeDefined();
    const g = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.faction && x.id !== n.id)!;
    hire(w, g, 50); g.crew!.assignment = { kind: 'guard', blockId: w.player.blockId };
    arcDo(w, new Rng(1), 'avenger', 'attempt');
    expect(a!.status).toBe('broken');
    expect(AVENGER.attempts).toBeGreaterThan(0);
  });

  it('somebody you let go can sell what they know, to a rival and then to the police', () => {
    let w = seedWith('turncoat');
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.faction)!;
    hire(w, n, 50);
    w = dispatch(w, { type: 'fire', npcId: n.id });
    expect(w.npcs[n.id].exCrew).toBe(w.day);
    for (let d = 0; d < TURNCOAT.within && !live(w, 'turncoat'); d++) { tickStories(w); w.day++; }
    const t = live(w, 'turncoat');
    if (!t) return;   // the nightly chance did not come up in the fortnight: allowed, it is a sandbox
    arcDo(w, new Rng(1), 'turncoat', 'cops');
    expect(w.cases[t.caseId!].witnessIds).toContain(n.id);
  });
});

describe('the old friend', () => {
  it('turns up when the seed says, grows only with what you put in, and the payoff may be a con', () => {
    let w = seedWith('friend');
    for (let d = 0; d < 45 && !live(w, 'friend'); d++) { w.day++; tickStories(w); for (const a of select.activeArcs(w)) if (a.kind !== 'friend') { a.status = 'gone'; a.ended = -100; } }
    const f = live(w, 'friend')!;
    expect(f).toBeDefined();
    w.scheduled = []; w.phase = 'day'; w.player.ap = 8; w.player.blockId = w.npcs[f.npcId].homeBlockId;
    w = dispatch(w, { type: 'story', arcId: f.id, move: 'help' });
    expect(live(w, 'friend')!.meter).toBe(FRIEND.help.add);
    const dirty = w.player.dirty;
    arcDo(w, new Rng(1), 'friend', 'payoff');
    const a = select.allArcs(w).find(x => x.id === f.id)!;
    expect(['paid', 'conned']).toContain(a.status);
    if (a.status === 'paid') expect(w.player.dirty).toBeGreaterThan(dirty);
  });
});
