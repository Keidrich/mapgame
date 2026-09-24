/**
 * Your character (`sim/character.ts`, `content/character.ts`): training and study, the streak,
 * boosts and the habit, drying out, and reputation on the odds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BOOSTS, HABIT, REPUTATION, TRAIN } from '@r/content/character';
import { can, dispatch, newWorld, select, PLAYER, type World } from '@r/sim/index';
import { skillOf } from '@r/sim/kit';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (): World => { const w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' }); w.player.cash = 20000; return w; };
const night = (w: World) => { w = dispatch(w, { type: 'nightfall' }); w.events = []; return w; };

describe('training and study', () => {
  it('study by day with the books: hours for experience, once a day', () => {
    let w = mk();
    const xp = w.player.xp.brains, lvl = w.player.skills.brains, ap = w.player.ap;
    w = dispatch(w, { type: 'train', skill: 'brains', at: 'books' });
    expect(w.player.ap).toBe(ap - TRAIN.ap);
    expect(w.player.xp.brains + (w.player.skills.brains - lvl) * 1000).toBeGreaterThan(xp);
    expect(can(w, { type: 'train', skill: 'brains', at: 'books' }).why).toMatch(/Tomorrow/);
    expect(can(w, { type: 'train', skill: 'muscle', at: 'books' }).ok).toBe(false);
  });

  it('the gym is for after dark, on its block, and charges unless it is yours', () => {
    let w = mk();
    const gym = Object.values(w.businesses).find(b => b.type === 'gym')!;
    expect(can(w, { type: 'train', skill: 'muscle', at: gym.id }).why).toMatch(/after dark/);
    w = night(w);
    expect(can(w, { type: 'train', skill: 'muscle', at: gym.id }).why).toMatch(/^Go to/);
    w.player.blockId = gym.blockId;
    expect(select.trainFee(w, gym.id)).toBe(TRAIN.fee * gym.tier);
    const cash = w.player.cash;
    w = dispatch(w, { type: 'train', skill: 'muscle', at: gym.id });
    expect(w.player.cash).toBe(cash - TRAIN.fee * gym.tier);
    w.businesses[gym.id].ownedBy = PLAYER;
    expect(select.trainFee(w, gym.id)).toBe(0);
    const diner = Object.values(w.businesses).find(b => b.type === 'diner')!;
    expect(can(w, { type: 'train', skill: 'muscle', at: diner.id }).ok).toBe(false);
  });

  it('keeping at it pays: each day in a row adds experience, a missed day starts over', () => {
    let w = mk();
    const first = select.trainXp(w, 'books');
    w = dispatch(w, { type: 'train', skill: 'brains', at: 'books' });
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    expect(select.streakNow(w)).toBe(2);
    expect(select.trainXp(w, 'books')).toBe(first + TRAIN.streak);
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    expect(select.streakNow(w)).toBe(1);
  });
});

describe('boosts and habit', () => {
  it('bennies buy hours; a bump raises muscle and charm and shows on the odds', () => {
    let w = mk();
    w.npcs[w.fixerId!].rel.met = 1;
    const ap = w.player.ap;
    w = dispatch(w, { type: 'take_boost', kind: 'pep', at: 'fixer' });
    expect(w.player.ap).toBe(ap + 2);
    expect(w.player.habit).toBe(BOOSTS.pep.habit);
    expect(can(w, { type: 'take_boost', kind: 'pep', at: 'fixer' }).why).toMatch(/Once a day/);
    const m = skillOf(w, PLAYER, 'muscle');
    w = dispatch(w, { type: 'take_boost', kind: 'nerve', at: 'fixer' });
    expect(skillOf(w, PLAYER, 'muscle')).toBe(m + HABIT.nerveSkill);
    const n = Object.values(w.npcs).find(x => x.alive && !x.official && !x.crew && x.rel.fear < 30)!;
    const q = select.quote(w, 'intimidate', n.id);
    expect(q.factors.some(f => /bump/.test(f.label))).toBe(true);
  });

  it('past the line, a day without a boost costs hours; the habit fades; drying out takes most of it', () => {
    let w = mk();
    w.player.habit = 60;
    w = dispatch(w, { type: 'end_day' }); w.events = [];
    expect(w.player.habit).toBe(60 - HABIT.fade);
    expect(w.player.ap).toBeLessThan(select.hours(w).day);
    expect(select.shaking(w)).toBe(true);
    w.npcs[w.fixerId!].rel.met = 1;
    w = dispatch(w, { type: 'dry_out' });
    expect(w.player.habit).toBe(60 - HABIT.fade - HABIT.dryOut.cut);
  });
});

describe('reputation', () => {
  it('follows fear and respect, and puts its line on the odds of the scenes it suits', () => {
    const w = mk();
    expect(select.reputation(w)).toBe('nobody');
    w.player.fear = 70; w.player.respect = 20;
    expect(select.reputation(w)).toBe('feared');
    const n = Object.values(w.npcs).find(x => x.alive && !x.official && !x.crew && x.rel.fear < 30)!;
    w.player.blockId = select.whereIs(w, n);
    const q = select.quote(w, 'intimidate', n.id);
    expect(q.factors.find(f => /reputation/.test(f.label))?.n).toBe(REPUTATION.feared.hard);
    w.player.respect = 70;
    expect(select.reputation(w)).toBe('honoured');
    w.player.fear = 20;
    expect(select.reputation(w)).toBe('respected');
  });
});
