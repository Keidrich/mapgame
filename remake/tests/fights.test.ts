/**
 * Fights (`sim/fights.ts`, `content/fights.ts`): the odds, the rounds, bullets, attacks and
 * ambushes, and being hurt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FIGHT, HURT } from '@r/content/fights';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { hire } from '@r/sim/people';
import { brawl, fightOdds, soldiersOn } from '@r/sim/fights';
import { Rng } from '@r/sim/rng';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

function mk(): World {
  const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'bruiser' });
  const pool = Object.values(w.npcs).filter(n => n.alive && !n.faction && !n.official && n.role !== 'fixer').slice(0, 4);
  for (const n of pool) { hire(w, n, 80); n.skills.muscle = 7; }
  w.player.cash = 50000;
  return w;
}
/** A rival block next to nobody's business: pick one the first outfit holds. */
function rivalBlock(w: World) {
  const f = Object.values(w.factions)[0];
  const b = Object.values(w.blocks).find(x => (x.influence[f.id] ?? 0) >= 10)!;
  return { f, b };
}

describe('the odds', () => {
  it('more people and loaded guns mean better odds; an empty gun counts for nothing', () => {
    const w = mk();
    const { f } = rivalBlock(w);
    const them = soldiersOn(w, f);
    const alone = fightOdds(w, [PLAYER], them);
    const four = fightOdds(w, [PLAYER, ...w.player.crewIds], them);
    expect(four).toBeGreaterThan(alone);
    w.player.kit = { weapon: 'pistol' };
    const dry = fightOdds(w, [PLAYER], them);
    w.player.bullets = 50;
    expect(fightOdds(w, [PLAYER], them)).toBeGreaterThan(dry);
    expect(select.personPower(w, PLAYER, false)).toBe(FIGHT.base + (w.player.skills.muscle + 2) * FIGHT.perMuscle);
  });

  it('three rounds at most; bullets are spent by whoever has a gun; somebody goes down', () => {
    const w = mk();
    const { f } = rivalBlock(w);
    w.player.kit = { weapon: 'pistol' }; w.player.bullets = 5;
    const r = brawl(w, new Rng(3), [PLAYER, ...w.player.crewIds], soldiersOn(w, f), 'Test');
    expect(r.lines.length).toBeLessThanOrEqual(FIGHT.rounds + 1);
    expect(w.player.bullets).toBeLessThan(5);
    expect(w.fight?.title).toBe('Test');
  });
});

describe('taking it to them', () => {
  it('needs the night, standing on their block, and their soldiers there', () => {
    let w = mk();
    const { f, b } = rivalBlock(w);
    const a = { type: 'attack' as const, factionId: f.id, blockId: b.id, crewIds: w.player.crewIds };
    expect(can(w, a).why).toMatch(/after dark/);
    w = dispatch(w, { type: 'nightfall' });
    while (w.events.length) w = dispatch(w, { type: 'resolve_event', eventId: w.events[0].id, optionId: w.events[0].options[w.events[0].options.length - 1].id });
    expect(can(w, a).why).toMatch(/^Go to/);
    w.player.blockId = b.id;
    expect(can(w, a).ok).toBe(true);
    const soldiers = w.factions[f.id].soldiers;
    w = dispatch(w, a);
    expect(w.fight?.title).toContain(f.short);
    expect(w.factions[f.id].soldiers).toBe(Math.max(0, soldiers - (w.fight?.down ?? 0)));
    expect(w.factions[f.id].standing).toBeLessThan(f.standing);
    w = dispatch(w, { type: 'seen_fight' });
    expect(w.fight?.seen).toBe(true);
  });

  it('a truce is a promise: no attacking inside one', () => {
    let w = mk();
    const { f, b } = rivalBlock(w);
    w.factions[f.id].truceUntil = w.day + 10;
    w = dispatch(w, { type: 'nightfall' });
    w.events = [];
    w.player.blockId = b.id;
    expect(can(w, { type: 'attack', factionId: f.id, blockId: b.id, crewIds: [] }).why).toMatch(/truce/);
  });
});

describe('ambushes and being hurt', () => {
  it('an outfit at war waits for you at nightfall, sometimes, and the card gives the odds', () => {
    let seen = false;
    for (let seed = 1; seed < 30 && !seen; seed++) {
      let w = newWorld({ seed, size: 'medium', name: 'T', background: 'bruiser' });
      for (const f of Object.values(w.factions)) f.standing = -80;
      w = dispatch(w, { type: 'nightfall' });
      const e = w.events.find(x => x.template === 'night_ambush');
      if (e) { seen = true; expect(e.options[0].label).toMatch(/\d+%/); w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: 'fight' }); expect(w.fight).toBeDefined(); }
    }
    expect(seen).toBe(true);
  });

  it('hurt means fewer hours each morning until you mend; the doctor halves it', () => {
    let w = mk();
    w.player.hurtDays = 4;
    w = dispatch(w, { type: 'end_day' });
    expect(w.player.ap).toBe(Math.max(HURT.minHours, select.hours(w).day - HURT.hoursLost));
    expect(w.player.hurtDays).toBe(3);
    const fx = w.npcs[w.fixerId!]; fx.rel.met = 1;
    w = dispatch(w, { type: 'patch_up' });
    expect(w.player.hurtDays).toBe(1);
  });

  it('rounds come in boxes, from the fixer or where a gun is sold', () => {
    let w = mk();
    w.npcs[w.fixerId!].rel.met = 1;
    expect(can(w, { type: 'buy_bullets', n: 7, at: 'fixer' }).ok).toBe(false);
    w = dispatch(w, { type: 'buy_bullets', n: 25, at: 'fixer' });
    expect(w.player.bullets).toBe(25);
  });
});
