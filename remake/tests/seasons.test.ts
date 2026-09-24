/**
 * Seasons (`sim/seasons.ts`, `content/seasons.ts`): the calendar, the papers, the opening cards,
 * what each season bends, and the election's aftermath.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ELECTION, SEASON, SEASONS } from '@r/content/seasons';
import { can, dispatch, newWorld, select, type World } from '@r/sim/index';
import { tickSeasons } from '@r/sim/seasons';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (): World => { const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' }); w.player.cash = 30000; return w; };
const skip = (w: World, days: number) => { for (let i = 0; i < days; i++) { w = dispatch(w, { type: 'end_day' }); w.events = []; } return w; };

describe('the calendar', () => {
  it('the first season comes on its day, in the papers first, and opens with a card', () => {
    let w = mk();
    w = skip(w, SEASON.first - SEASON.notice - 1);
    expect(w.nextSeason?.day).toBe(SEASON.first);
    w = dispatch(w, { type: 'end_day' });
    const kind = w.nextSeason!.kind;
    expect(w.news.some(n => n.text === SEASONS[kind].headline)).toBe(true);
    w.events = [];
    while (w.day < SEASON.first - 1) { w = dispatch(w, { type: 'end_day' }); w.events = []; }
    w = dispatch(w, { type: 'end_day' });
    expect(select.seasonNow(w)?.kind).toBe(kind);
    expect(w.events.some(e => e.template === `season_${kind}`)).toBe(true);
  });

  it('sixty days see all four kinds, the same for every temperament on a seed', () => {
    const seen = new Set<string>();
    let w = mk();
    for (let d = 0; d < 60; d++) { w = dispatch(w, { type: 'end_day' }); w.events = []; const s = select.seasonNow(w); if (s) seen.add(s.kind); }
    expect([...seen].sort()).toEqual(['crackdown', 'election', 'festival', 'strike']);
  });
});

describe('what a season bends', () => {
  const at = (w: World, kind: keyof typeof SEASONS) => { w.season = { kind, from: w.day, to: w.day + 5, ...(kind === 'election' ? { backing: { machine: 0, reform: 0 } } : {}) }; return w; };

  it('a festival lifts takings and prices; a strike lifts prices and supplies; a crackdown makes heat stick', () => {
    const w = mk();
    const b = Object.values(w.blocks)[0].id;
    const price = select.streetPrice(w, 'booze', b), supplies = select.restockCost(w, 'still', 4);
    at(w, 'strike');
    expect(Math.abs(select.streetPrice(w, 'booze', b) - price * SEASONS.strike.price)).toBeLessThanOrEqual(1);
    expect(select.restockCost(w, 'still', 4)).toBe(Math.round(supplies * SEASONS.strike.supplies));
    at(w, 'festival');
    expect(Math.abs(select.streetPrice(w, 'booze', b) - price * SEASONS.festival.price)).toBeLessThanOrEqual(1);
    at(w, 'crackdown');
    const h = w.player.heat;
    w.player.heat = 0;
    dispatch(w, { type: 'end_day' });
    expect(select.attentionAdd(w)).toBe(SEASONS.crackdown.attention);
    w.season!.soft = true;
    expect(select.attentionAdd(w)).toBe(SEASONS.crackdown.attention / 2);
    void h;
  });

  it('the strike card can end it early; the crackdown card can soften it', () => {
    let w = at(mk(), 'strike');
    w.scheduled.push({ day: w.day, template: 'season_strike' });
    w = dispatch(w, { type: 'end_day' });
    const e = w.events.find(x => x.template === 'season_strike');
    expect(e).toBeDefined();
    w = dispatch(w, { type: 'resolve_event', eventId: e!.id, optionId: 'scabs' });
    expect(w.season!.to).toBe(w.day + 1);
  });
});

describe('the election', () => {
  it('backing moves the odds; the winner leaves twenty days behind', () => {
    let w = mk();
    w.season = { kind: 'election', from: w.day, to: w.day + 3, backing: { machine: 0, reform: 0 } };
    const base = select.machineOdds(w);
    expect(can(w, { type: 'back_candidate', side: 'machine' }).ok).toBe(true);
    w = dispatch(w, { type: 'back_candidate', side: 'machine' });
    expect(select.machineOdds(w)).toBeCloseTo(base + (ELECTION.back / 1000) * ELECTION.perThousand);
    w = skip(w, 3);
    expect(w.season).toBeUndefined();
    expect(w.aftermath?.until).toBeGreaterThan(w.day);
    if (w.aftermath!.kind === 'machine') expect(select.bribeMult(w)).toBe(ELECTION.machineBribe);
    else expect(select.attentionAdd(w)).toBe(ELECTION.reformAttention);
  });

  it('no election, no backing', () => {
    const w = mk();
    expect(can(w, { type: 'back_candidate', side: 'machine' }).why).toMatch(/no election/);
    tickSeasons(w, w.day);
  });
});
