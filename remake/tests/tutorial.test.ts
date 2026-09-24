/**
 * The tutorial — the quest strip — can be followed. A rookie who does only what the strip says
 * (`scripts/tutorial.ts`) gets through the whole opening in a few weeks on every seed and background
 * tried, and the specific breaks the first tutorial run found stay fixed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, newWorld, select, type World } from '@r/sim/index';
import { hire } from '@r/sim/people';
import { OPENING, tutorial } from '@r/scripts/tutorial';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const lead = (w: World, id: string) => select.leads(w).find(l => l.id === id)!;

describe('the tutorial', () => {
  for (const seed of [7, 1, 3]) for (const background of ['grifter', 'bruiser'] as const) {
    it(`a rookie following only the strip finishes the opening by day 25 (seed ${seed}, ${background})`, () => {
      const r = tutorial({ days: 25, seed, background });
      const open = r.steps.filter(s => OPENING.includes(s.id));
      expect(open.filter(s => s.done === undefined).map(s => `${s.id}: ${s.stuck.slice(-2).join(' | ')}`)).toEqual([]);
    });
  }

  it('introducing yourself on day one counts', () => {
    // `rel.met` is a day, and the old check wanted it over 1: anybody met the first evening never counted
    let w = newWorld({ seed: 42, size: 'medium', name: 'T', background: 'grifter' });
    const l = lead(w, 'talk');
    expect(l.done).toBe(false);
    const n = w.npcs[l.npcId!];
    expect(n.rel.met).toBeFalsy();   // it points at somebody new, not a neighbour you already know
    w = dispatch(w, { type: 'travel', blockId: n.homeBlockId });
    w = dispatch(w, { type: 'scene', kind: 'chat', npcId: n.id });
    expect(w.day).toBe(1);
    expect(lead(w, 'talk').done).toBe(true);
  });

  it('the back-room step points at your best ground and says what it is waiting on', () => {
    const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    const b = Object.values(w.blocks).find(x => x.id !== w.player.blockId && x.businessIds.length)!;
    b.influence.player = 20;
    w.player.cash = 0; w.player.dirty = 100;
    const l = lead(w, 'safehouse');
    expect(l.blockId).toBe(b.id);
    expect(l.blocked).toMatch(/Costs \$900/);
    w.player.dirty = 5000;
    expect(lead(w, 'safehouse').blocked).toBeUndefined();
  });

  it('a blocked step never stalls the strip: it moves on to one that can be done', () => {
    const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'bruiser' });
    // the first three steps done by hand: a place protected, its owner met and on side
    const biz = Object.values(w.businesses).find(x => x.blockId === w.player.blockId && x.tier < 3)!;
    biz.protection = { by: 'player', rate: 0.12, since: 1 };
    const n = w.npcs[biz.ownerId]; n.rel.met = 2; n.rel.trust = 40;
    w.player.cash = 0; w.player.dirty = 50;
    const racket = lead(w, 'racket');
    expect(racket.done).toBe(false);
    expect(racket.blocked).toMatch(/Costs/);
    expect(select.nextLead(w)?.id).not.toBe('racket');
  });

  it('dealing says it earns nothing without product', () => {
    const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    expect(select.racketWarning(w, 'dealing')).toMatch(/earns nothing/);
    expect(select.racketWarning(w, 'numbers')).toBeUndefined();
    w.player.stash.booze.n = 10;
    expect(select.racketWarning(w, 'dealing')).toBeUndefined();
  });

  it('a greedy recruit asks for a raise at most every three weeks, and not past half again their worth', () => {
    let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    const n = Object.values(w.npcs).find(x => x.alive && !x.faction && !x.official && x.role !== 'fixer')!;
    n.traits = ['greedy'];
    hire(w, n, 100);
    let asks = 0;
    for (let d = 0; d < 42; d++) {
      for (const e of w.events) if (e.template === 'crew_raise') asks++;
      while (w.events.length) w = dispatch(w, { type: 'resolve_event', eventId: w.events[0].id, optionId: w.events[0].options[0].id });
      w.player.dirty += 1000;
      w = dispatch(w, { type: 'end_day' });
    }
    expect(asks).toBeLessThanOrEqual(2);
    expect(w.npcs[n.id].crew!.cut).toBeLessThan(100 * 1.3 * 1.3 + 30);
  });
});
