/**
 * Day and night (`sim/clock.ts`, `content/clock.ts`): two halves a day with their own hours, their
 * own open doors, their own people and their own work.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { splitHours } from '@r/content/clock';
import { can, dispatch, migrate, newWorld, select, type World } from '@r/sim/index';
import { buildJob } from '@r/sim/jobs';
import { Rng } from '@r/sim/rng';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (seed = 7) => newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });

describe('the clock', () => {
  it('a day starts in daylight with the day\'s hours; nightfall gives the night\'s; sleep brings the morning', () => {
    let w = mk();
    expect(select.half(w)).toBe('day');
    expect(w.player.ap).toBe(splitHours(w.player.apMax).day);
    w = dispatch(w, { type: 'nightfall' });
    expect(select.half(w)).toBe('night');
    expect(w.player.ap).toBe(splitHours(w.player.apMax).night);
    expect(can(w, { type: 'nightfall' }).ok).toBe(false);
    while (w.events.length) w = dispatch(w, { type: 'resolve_event', eventId: w.events[0].id, optionId: w.events[0].options[w.events[0].options.length - 1].id });
    const day = w.day;
    w = dispatch(w, { type: 'end_day' });
    expect(w.day).toBe(day + 1);
    expect(select.half(w)).toBe('day');
    expect(w.player.ap).toBe(splitHours(w.player.apMax).day);
  });

  it('sleeping in daylight skips the night: idle play and old bots still end a day in one press', () => {
    let w = mk();
    const day = w.day;
    w = dispatch(w, { type: 'end_day' });
    expect(w.day).toBe(day + 1);
    expect(select.half(w)).toBe('day');
    expect(w.events.every(e => !e.template.startsWith('night_'))).toBe(true);
  });

  it('a save from before day and night wakes in the morning with at most the day\'s hours', () => {
    const w = mk() as World; delete w.phase; w.player.ap = 99;
    const m = migrate(JSON.parse(JSON.stringify(w)));
    expect(m.phase).toBe('day');
    expect(m.player.ap).toBe(splitHours(m.player.apMax).day);
  });
});

describe('what is open when', () => {
  it('protection is a daytime pitch and recruiting a night one, each saying so', () => {
    let w = mk();
    const owner = Object.values(w.npcs).find(n => n.alive && n.workId && w.businesses[n.workId].ownerId === n.id && w.businesses[n.workId].tier < 3)!;
    const patron = Object.values(w.npcs).find(n => n.alive && !n.faction && !n.official && !n.crew && Object.values(w.businesses).some(b => b.patronIds.includes(n.id)))!;
    expect(select.closedNow(w, { type: 'scene', kind: 'recruit', npcId: patron.id })).toMatch(/after dark/);
    expect(select.closedNow(w, { type: 'scene', kind: 'protect', npcId: owner.id })).toBeUndefined();
    w = dispatch(w, { type: 'nightfall' });
    expect(select.closedNow(w, { type: 'scene', kind: 'protect', npcId: owner.id })).toMatch(/shutters/);
    expect(select.closedNow(w, { type: 'scene', kind: 'recruit', npcId: patron.id })).toBeUndefined();
    expect(can(w, { type: 'scene', kind: 'protect', npcId: owner.id, businessId: owner.workId, rate: 0.12 }).why).toMatch(/shutters/);
  });

  it('shops shut at night and the fixer does not; the bank keeps banking hours', () => {
    let w = mk();
    w = dispatch(w, { type: 'nightfall' });
    expect(select.closedNow(w, { type: 'buy_item', item: 'knuckles' as never, at: Object.keys(w.businesses)[0] })).toMatch(/shut/);
    expect(select.closedNow(w, { type: 'buy_item', item: 'knuckles' as never, at: 'fixer' })).toBeUndefined();
    expect(select.closedNow(w, { type: 'fixer_wash', amount: 100 })).toMatch(/bank/);
    expect(select.closedNow(w, { type: 'sell_street', product: 'booze', n: 1 })).toBeUndefined();
  });

  it('people are somewhere else at night: owners at work by day, regulars at their bar after dark', () => {
    let w = mk();
    const patron = Object.values(w.npcs).find(n => n.alive && !n.crew && !n.workId && Object.values(w.businesses).some(b => b.patronIds.includes(n.id) && b.blockId !== n.homeBlockId))!;
    const haunt = Object.values(w.businesses).find(b => b.patronIds.includes(patron.id))!;
    expect(select.whereIs(w, patron)).toBe(patron.homeBlockId);
    w = dispatch(w, { type: 'nightfall' });
    expect(select.whereIs(w, patron)).toBe(haunt.blockId);
    expect(select.whereLine(w, patron)).toMatch(/Out at/);
    // and a scene with them there needs you there
    w.player.blockId = patron.homeBlockId;
    expect(select.quote(w, 'chat', patron.id).disabled).toMatch(/^Go to/);
    w.player.blockId = haunt.blockId;
    expect(select.quote(w, 'chat', patron.id).disabled).toBeUndefined();
  });
});

describe('work by the hour', () => {
  it('a break-in goes better in the dark and a con in business hours, by the numbers on the sheet', () => {
    const w = mk();
    const b = Object.values(w.businesses).find(x => x.tier === 1)!;
    const burg = buildJob(w, new Rng(1), { kind: 'burglary', blockId: b.blockId, businessId: b.id })!;
    const day = select.jobOdds(w, burg, [], 'quiet');
    const n = dispatch(w, { type: 'nightfall' });
    const night = select.jobOdds(n, n.jobs[burg.id], [], 'quiet');
    expect(night.chance - day.chance).toBe(20);
    expect(night.factors.some(f => /night/.test(f.label))).toBe(true);
    expect(select.jobHour('con')).toBe('day');
    expect(select.jobHour('burglary')).toBe('night');
  });

  it('most nights bring an encounter from the night pool, and a job offered tonight is gone by morning', () => {
    let seen = 0, tonight = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let w = mk(seed);
      for (let d = 0; d < 4; d++) {
        w = dispatch(w, { type: 'nightfall' });
        for (const e of w.events) if (e.template.startsWith('night_')) {
          seen++;
          if (e.template === 'night_stranger') {
            const before = Object.keys(w.jobs).length;
            w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: 'take' });
            const j = Object.values(w.jobs).find(x => x.title.startsWith('Tonight'));
            if (j && Object.keys(w.jobs).length > before) { tonight++; expect(j.expires).toBe(w.day); }
          }
        }
        while (w.events.length) w = dispatch(w, { type: 'resolve_event', eventId: w.events[0].id, optionId: w.events[0].options[w.events[0].options.length - 1].id });
        w = dispatch(w, { type: 'end_day' });
        for (const j of Object.values(w.jobs)) if (j.title.startsWith('Tonight') && j.expires < w.day) expect(j.status === 'offer').toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(tonight).toBeGreaterThan(0);
  }, 30000);
});
