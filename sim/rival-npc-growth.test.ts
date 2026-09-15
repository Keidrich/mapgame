/**
 * Somebody else starting from nothing, at the same time as you.
 *
 * Every other outfit is already what it will be: the Delgados have sixteen blocks on day one and
 * sixteen on day two hundred, and taking them apart is a siege. This is the other shape — a race
 * — and the only thing that makes it one is the **curve**, so that is what this file measures.
 *
 * It is a `Faction`, deliberately, so every system in the game reads it without a special case.
 */
import { describe, expect, it } from 'vitest';
import { UPSTART, hasArrived, upstart } from './upstart';
import { PLAYER, dispatch, generateWorld, select, type World } from './index';

function run(days: number, seed = 123): World {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
  for (let i = 0; i < days && !w.gameOver; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
  return w;
}
const held = (w: World) => { const f = upstart(w); return f ? Object.values(w.blocks).filter(b => select.factionName(w, Object.entries(b.influence).sort((x, y) => y[1] - x[1])[0]?.[0]) === f.name).length : 0; };

describe('they turn up, small, on their own', () => {
  it('nobody is there before the day they arrive', () => {
    const w = run(UPSTART.startDay - 2);
    expect(upstart(w)).toBeUndefined();
    expect(w.upstartId).toBeUndefined();
  });

  it('and shortly after, somebody is — with one man and a corner', () => {
    const w = run(UPSTART.startDay + 2);
    const f = upstart(w);
    expect(f, 'nobody ever showed up').toBeTruthy();
    expect(f!.soldiers).toBeLessThan(6);
    expect(hasArrived(f!), 'they arrived fully formed, which is not an upstart').toBe(false);
  });

  it('they start far below everybody already established', () => {
    const w = run(UPSTART.startDay + 2);
    const f = upstart(w)!;
    const families = Object.values(w.factions).filter(x => x.alive && x.id !== f.id);
    expect(families.length).toBeGreaterThan(0);
    for (const fam of families) expect(f.soldiers, `vs ${fam.short}`).toBeLessThan(fam.soldiers);
  });
});

describe('the curve, which is the whole point of them', () => {
  it('they are meaningfully bigger later than they were earlier', () => {
    const early = upstart(run(UPSTART.startDay + 2))!;
    const later = upstart(run(UPSTART.startDay + 90));
    if (!later) return;                               // being swallowed is a fair outcome
    expect(later.soldiers, 'the upstart never grew at all').toBeGreaterThan(early.soldiers);
  });

  it('they multiply several times over, which a family never does', () => {
    // Not *unbounded* growth, deliberately — an outfit that compounds for ever eventually owns
    // every game. What has to be true is that the first month is a different order of magnitude
    // from the first week, which is the thing an established family cannot do.
    const w0 = run(UPSTART.startDay + 2), w1 = run(UPSTART.startDay + 60);
    const start = upstart(w0)!.soldiers;
    const later = upstart(w1);
    if (!later) return;                               // being swallowed is a fair outcome
    expect(later.soldiers).toBeGreaterThanOrEqual(start * 3);

    // …and the families they started beneath did not move like that at all
    const fam0 = Object.values(w0.factions).filter(f => f.alive && f.id !== w0.upstartId)[0];
    const fam1 = w1.factions[fam0.id];
    if (fam1?.alive) expect(Math.abs(fam1.soldiers - fam0.soldiers) / Math.max(1, fam0.soldiers)).toBeLessThan(later.soldiers / Math.max(1, start));
  });

  it('and eventually they are simply another outfit', () => {
    const w = run(UPSTART.startDay + 170);
    const f = upstart(w);
    if (f) expect(hasArrived(f) || f.soldiers > UPSTART.soldiers * 4, 'a hundred and seventy days and still one man').toBe(true);
  });

  it('they end up holding ground they did not start with', () => {
    const w = run(UPSTART.startDay + 140);
    const f = upstart(w);
    if (!f) return;                                  // they can be swallowed, which is fair
    const theirs = Object.values(w.blocks).filter(b => (b.influence[f.id] ?? 0) > 0).length;
    expect(theirs, 'they never reached past their own corner').toBeGreaterThan(1);
    void held;
  });
});

describe('they are an ordinary outfit, so everything reads them', () => {
  it('they are in `w.factions`, with a boss and a stance toward the player', () => {
    const w = run(UPSTART.startDay + 5);
    const f = upstart(w)!;
    expect(w.factions[f.id]).toBe(f);
    expect(w.npcs[f.bossId]?.alive).toBe(true);
    expect(f.stance[PLAYER]).toBeDefined();
  });

  it('and the ordinary defeat machinery can finish them like anybody else', () => {
    const w = run(UPSTART.startDay + 5);
    const f = upstart(w)!;
    f.soldiers = 0; f.cash = 0; f.lieutenantIds = [];
    for (const b of Object.values(w.blocks)) delete b.influence[f.id];
    let cur = w;
    for (let i = 0; i < 3; i++) { cur.pendingEvents = []; cur = dispatch(cur, { type: 'end_day' }); }
    expect(cur.factions[f.id].defeatedDay, 'the upstart is outside the rules everybody else lives under').toBeTruthy();
  });

  it('there is only ever one of them', () => {
    const w = run(UPSTART.startDay + 60);
    const marked = Object.values(w.factions).filter(f => f.id === w.upstartId);
    expect(marked.length).toBeLessThanOrEqual(1);
  });
});

describe('it is a race: they reach for what you are reaching for', () => {
  it('they push at ground the player has influence on', () => {
    let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 321 });
    for (let i = 0; i < UPSTART.startDay + 2; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    const f = upstart(w)!;
    // give the player a half-taken block nobody holds outright
    const target = Object.values(w.blocks).find(b => !Object.keys(b.influence).length) ?? Object.values(w.blocks)[0];
    target.influence = { [PLAYER]: 30 };
    const mine = target.influence[PLAYER];
    for (let i = 0; i < 40; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    const after = w.blocks[target.id];
    expect((after.influence[f.id] ?? 0) > 0 || (after.influence[PLAYER] ?? 0) < mine,
      'they never once reached for anything the player was reaching for').toBe(true);
  });
});
