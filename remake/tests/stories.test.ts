/**
 * Stories (`sim/stories.ts`, `content/stories.ts`): the detective's arrival, his file and his
 * raid, what you can do about him; the heir's oath, grudge, beats and the showdown.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DETECTIVE, HEIR } from '@r/content/stories';
import { can, dispatch, newWorld, select, type World } from '@r/sim/index';
import { detectiveRaid, tickStories } from '@r/sim/stories';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (): World => { const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' }); w.player.cash = 30000; return w; };
const skip = (w: World, days: number) => { for (let i = 0; i < days; i++) { w = dispatch(w, { type: 'end_day' }); w.events = []; } return w; };

describe('the detective', () => {
  it('turns up once you are hot, as a real person with a file, and introduces himself', () => {
    let w = mk();
    w.player.heat = DETECTIVE.heatTrigger;
    tickStories(w);
    const d = select.detective(w)!;
    expect(d.status).toBe('active');
    expect(w.npcs[d.npcId].nemesis).toBe('detective');
    expect(w.scheduled.some(s => s.template === 'det_intro')).toBe(true);
    const f0 = d.file;
    w = skip(w, 3);
    expect(select.detective(w)!.file).toBeGreaterThan(f0);
  });

  it('at each threshold he acts once; the raid takes half the dirty money and opens a thick file', () => {
    const w = mk();
    w.player.heat = 50; tickStories(w);
    const d = select.detective(w)!;
    d.file = DETECTIVE.watch; w.scheduled = [];
    tickStories(w);
    expect(w.scheduled.map(s => s.template)).toContain('det_watch');
    w.player.dirty = 10000;
    detectiveRaid(w);
    expect(w.player.dirty).toBe(5000);
    expect(Object.values(w.cases).some(c => c.crime === 'racketeering' && c.witnessIds.includes(d.npcId))).toBe(true);
    expect(d.file).toBe(DETECTIVE.afterRaid);
  });

  it('dirt then blackmail buys him off; an honest man writes the bribe down', () => {
    let w = mk();
    w.player.heat = 50; tickStories(w); w.scheduled = [];
    const d = select.detective(w)!;
    w.player.blockId = w.npcs[d.npcId].homeBlockId;
    expect(can(w, { type: 'detective', move: 'blackmail' }).why).toMatch(/Dig first/);
    d.dirt = true;
    w = dispatch(w, { type: 'detective', move: 'blackmail' });
    expect(select.detective(w)!.status).toBe('bought');
    const w2 = mk(); w2.player.heat = 50; tickStories(w2); w2.scheduled = [];
    const d2 = select.detective(w2)!; d2.honest = true; w2.player.blockId = w2.npcs[d2.npcId].homeBlockId;
    const file = d2.file;
    const w3 = dispatch(w2, { type: 'detective', move: 'bribe' });
    expect(select.detective(w3)!.status).toBe('active');
    expect(select.detective(w3)!.file).toBe(file + DETECTIVE.bribe.refused);
  });
});

describe('the heir', () => {
  it('rises in an outfit that hates you, swears an oath, and the grudge grows', () => {
    let w = mk();
    const f = Object.values(w.factions)[0];
    f.standing = HEIR.standingTrigger;
    tickStories(w);
    const h = select.heir(w)!;
    expect(h.factionId).toBe(f.id);
    expect(w.npcs[h.npcId].faction).toBe(f.id);
    expect(h.npcId).not.toBe(f.bossId);
    expect(w.scheduled.some(s => s.template === 'heir_oath')).toBe(true);
    const g = h.grudge;
    w = skip(w, 2);
    expect(select.heir(w)!.grudge).toBeGreaterThan(g);
  });

  it('boils over into a showdown; a partnership ends it with a truce', () => {
    let w = mk();
    const f = Object.values(w.factions)[0];
    f.standing = -80; tickStories(w); w.scheduled = [];
    select.heir(w)!.grudge = HEIR.boil;
    w = dispatch(w, { type: 'end_day' });
    w = dispatch(w, { type: 'end_day' });
    const e = w.events.find(x => x.template === 'heir_showdown');
    expect(e).toBeDefined();
    w = dispatch(w, { type: 'resolve_event', eventId: e!.id, optionId: 'partner' });
    expect(select.heir(w)!.status).toBe('partner');
    expect(w.factions[f.id].truceUntil).toBeGreaterThan(w.day);
  });

  it('a gift takes the edge off', () => {
    let w = mk();
    Object.values(w.factions)[0].standing = -80; tickStories(w); w.scheduled = [];
    const g = select.heir(w)!.grudge;
    w = dispatch(w, { type: 'heir', move: 'gift' });
    expect(select.heir(w)!.grudge).toBe(g - HEIR.gift.cut);
  });
});
