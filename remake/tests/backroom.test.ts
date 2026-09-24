/**
 * The back rooms (`sim/backroom.ts`): the hand evaluator, a hand of five-card draw from the ante
 * to the showdown, dealing from the bottom, street dice and the numbers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { NUMBERS, POKER } from '@r/content/backroom';
import { can, dispatch, newWorld, type World } from '@r/sim/index';
import { autoHold, categoryOf, score } from '@r/sim/backroom';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

/** Cards by name: '2s' .. 'As'; suits s h d c. */
const C = (s: string) => s.split(' ').map(x => { const r = x.slice(0, -1), su = x.slice(-1); return 'shdc'.indexOf(su) * 13 + ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(r); });

describe('the hands', () => {
  it('ranks every category in order', () => {
    const order = ['2s 5h 9d Jc Ks', '2s 2h 9d Jc Ks', '2s 2h 9d 9c Ks', '2s 2h 2d Jc Ks', '5s 6h 7d 8c 9s', '2s 5s 9s Js Ks', '2s 2h 2d Kc Ks', '2s 2h 2d 2c Ks', '5s 6s 7s 8s 9s'];
    const scores = order.map(h => score(C(h)));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(order.map(h => categoryOf(C(h)))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('breaks ties on the pair, then the kickers; the wheel is a five-high straight', () => {
    expect(score(C('Ks Kh 2d 3c 4s'))).toBeGreaterThan(score(C('Qs Qh Ad Kc Js')));
    expect(score(C('Ks Kh Ad 3c 4s'))).toBeGreaterThan(score(C('Kd Kc Qd 3h 4h')));
    expect(categoryOf(C('As 2h 3d 4c 5s'))).toBe(4);
    expect(score(C('2s 3h 4d 5c 6s'))).toBeGreaterThan(score(C('As 2h 3d 4c 5s')));
    expect(score(C('Ks Kh 2d 3c 4s'))).toBe(score(C('Kd Kc 2h 3s 4c')));
  });
  it('the others keep pairs, four to a flush, or a high card', () => {
    expect(autoHold(C('Ks Kh 2d 7c 4s')).sort()).toEqual([0, 1]);
    expect(autoHold(C('2s 5s 9s Js Kh')).sort()).toEqual([0, 1, 2, 3]);
    expect(autoHold(C('2s 5h 9d Jc As'))).toEqual([4]);
  });
});

function atTable(): World {
  let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
  w.player.cash = 20000;
  w = dispatch(w, { type: 'nightfall' }); w.events = [];
  const bar = Object.values(w.businesses).find(b => b.type === 'bar' && b.closed <= 0)!;
  w.player.blockId = bar.blockId;
  return w;
}
const barOf = (w: World) => Object.values(w.businesses).find(b => b.type === 'bar' && b.blockId === w.player.blockId)!;

describe('the card table', () => {
  it('needs the night, the place and the bankroll; a hand runs ante, draw, bet, showdown', () => {
    let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    const bar = Object.values(w.businesses).find(b => b.type === 'bar')!;
    expect(can(w, { type: 'table_sit', businessId: bar.id, stake: 100 }).why).toMatch(/after dark/);
    w = atTable();
    const b = barOf(w);
    expect(can(w, { type: 'table_sit', businessId: b.id, stake: 7 }).ok).toBe(false);
    const money0 = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'table_sit', businessId: b.id, stake: 100 });
    expect(w.table?.stage).toBe('draw');
    expect(w.table!.hand).toHaveLength(5);
    expect(w.table!.pot).toBe(100 * (1 + POKER.seats));
    expect(w.player.cash + w.player.dirty).toBe(money0 - 100);
    // every card at the table is different
    const all = [...w.table!.hand, ...w.table!.seats.flatMap(s => s.hand), ...w.table!.deck];
    expect(new Set(all).size).toBe(52);
    w = dispatch(w, { type: 'poker_draw', hold: autoHold(w.table!.hand) });
    expect(w.table?.stage).toBe('bet');
    expect(w.table!.reads).toHaveLength(POKER.seats);
    w = dispatch(w, { type: 'poker_bet', move: 'call' });
    expect(w.table?.stage).toBe('done');
    expect(typeof w.table!.youWon).toBe('boolean');
    const net = w.table!.net;
    expect(w.player.cash + w.player.dirty).toBe(money0 + net);
    w = dispatch(w, { type: 'table_next' });
    expect(w.table!.hands).toBe(2);
    w = dispatch(w, { type: 'poker_draw', hold: [] });
    w = dispatch(w, { type: 'poker_bet', move: 'fold' });
    expect(w.table!.youWon).toBe(false);
    w = dispatch(w, { type: 'table_leave' });
    expect(w.table!.stage).toBe('left');
  });

  it('a raise either takes the pot uncontested or goes to a showdown; a fold loses only the ante', () => {
    for (let seed = 1; seed < 12; seed++) {
      let w = atTable(); w.rng = seed * 7919;
      w = dispatch(w, { type: 'table_sit', businessId: barOf(w).id, stake: 300 });
      w = dispatch(w, { type: 'poker_draw', hold: autoHold(w.table!.hand) });
      w = dispatch(w, { type: 'poker_bet', move: 'raise' });
      const t = w.table!;
      expect(t.stage).toBe('done');
      if (t.seats.every(s => s.folded)) expect(t.youWon).toBe(true);
    }
  });

  it('dealing from the bottom improves the hand or gets you thrown out', () => {
    let improved = 0, caught = 0;
    for (let seed = 1; seed < 40; seed++) {
      let w = atTable(); w.rng = seed * 104729;
      w = dispatch(w, { type: 'table_sit', businessId: barOf(w).id, stake: 100 });
      w = dispatch(w, { type: 'poker_draw', hold: [], cheat: true });
      if (w.table!.caught) { caught++; expect(can(w, { type: 'table_next' }).why).toMatch(/not welcome/); }
      else { expect(categoryOf(w.table!.hand)).toBeGreaterThanOrEqual(1); improved++; }
    }
    expect(improved).toBeGreaterThan(0);
    expect(caught).toBeGreaterThan(0);
  });

  it('the night encounter can seat you at the table', () => {
    let seen = false;
    for (let seed = 1; seed < 60 && !seen; seed++) {
      let w = newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });
      w.player.cash = 20000;
      w = dispatch(w, { type: 'nightfall' });
      const e = w.events.find(x => x.template === 'night_cards');
      if (!e) continue;
      seen = true;
      w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: 'play' });
      expect(w.table?.game).toBe('poker');
      expect(w.table!.seats[0].npcId).toBe(e.npcId);
    }
    expect(seen).toBe(true);
  });
});

describe('dice and the numbers', () => {
  it('dice pay even money and say how it went', () => {
    let w = atTable();
    const m0 = w.player.cash + w.player.dirty;
    w = dispatch(w, { type: 'dice', businessId: barOf(w).id, stake: 200 });
    const t = w.table!;
    expect(t.game).toBe('dice');
    expect(t.lines.length).toBeGreaterThan(0);
    expect(w.player.cash + w.player.dirty).toBe(m0 + (t.youWon ? 200 : -200));
  });

  it('a slip by day, the draw overnight, 600 to 1', () => {
    let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
    w.player.cash = 5000;
    // play every number the draw could land on is not allowed; three slips a day
    w = dispatch(w, { type: 'numbers', pick: 123, amount: 10 });
    w = dispatch(w, { type: 'numbers', pick: 456, amount: 10 });
    w = dispatch(w, { type: 'numbers', pick: 789, amount: 10 });
    expect(can(w, { type: 'numbers', pick: 1, amount: 10 }).why).toMatch(/Three slips/);
    const before = w.player.dirty;
    w = dispatch(w, { type: 'end_day' });
    const drawn = w.numbersDrawn!.n;
    const won = [123, 456, 789].includes(drawn);
    expect(w.player.dirty - before).toBeGreaterThanOrEqual(won ? 10 * NUMBERS.pays : 0);
    expect(w.player.slips ?? []).toHaveLength(0);
  });
});
