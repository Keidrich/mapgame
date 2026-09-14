/**
 * Whether the recurring antagonist can actually happen to a player who is winning.
 *
 * It could not. Notoriety floors at 0 and a loss took a flat slab off it, so a lieutenant who
 * came at the player and lost sat on the floor for ever and no later win ever climbed off it. A
 * sixty-day war soak had Pablo "Tiny" Delgado at the player's door **84 times** — W7 L77 — with a
 * notoriety of **0.0**, and *every* scenario in the sweep finished with zero nemeses. The system
 * was tuned to reward failure, which is backwards for a game whose arc is starting from nothing.
 *
 * Three properties have to hold at once, and they pull against each other — that is why they are
 * all here rather than one assertion about one number:
 *
 *  1. Somebody who keeps turning up builds notoriety **even under a run of player wins**.
 *  2. Somebody who *only ever* loses still plateaus **below** `known`: a presence, not a nemesis.
 *  3. Beating the player is still worth far more than merely showing up.
 */
import { describe, expect, it } from 'vitest';
import { MILESTONES, NEMESIS } from '@content/nemesis';
import { generateWorld, type Npc, type World } from './index';
import { notoriety, isNemesis, scoreMeeting } from './nemesis';

function mk(): { w: World; lt: Npc } {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 3 });
  const lt = Object.values(w.npcs).find(n => n.role === 'lieutenant' && n.alive)!;
  return { w, lt };
}
/** `won` is the lieutenant's win, which is how `resolveConfrontation` calls it. */
const meet = (w: World, lt: Npc, won: boolean, n = 1) => { for (let i = 0; i < n; i++) scoreMeeting(w, lt, won, 'property', 'at the door'); };

describe('a player who keeps winning still gets a nemesis', () => {
  it('turning up counts for something on its own', () => {
    const { w, lt } = mk();
    meet(w, lt, false, 12);   // twelve visits, twelve hidings
    expect(notoriety(lt), 'twelve trips to your door left no mark at all').toBeGreaterThan(5);
  });

  it('the real case: dozens of meetings, mostly losses, becomes a nemesis', () => {
    // Pablo's actual record from the war soak that produced the report.
    const { w, lt } = mk();
    for (let i = 0; i < 84; i++) meet(w, lt, i % 12 === 0);   // 7 wins in 84
    expect(notoriety(lt)).toBeGreaterThan(NEMESIS.known);
    expect(isNemesis(lt), 'the man at your door 84 times is still nobody').toBe(true);
  });

  it('but somebody who never once wins stays a name on a card, not a nemesis', () => {
    const { w, lt } = mk();
    meet(w, lt, false, 200);   // an absurd number of losses: the plateau, not a slow climb
    expect(notoriety(lt), 'losing every time still made a nemesis').toBeLessThan(NEMESIS.known);
    expect(isNemesis(lt)).toBe(false);
  });

  it('and beating the player is still worth far more than showing up', () => {
    const a = mk(); meet(a.w, a.lt, true, 10);
    const b = mk(); meet(b.w, b.lt, false, 10);
    expect(notoriety(a.lt)).toBeGreaterThan(notoriety(b.lt) * 3);
  });

  it('a loss shaves what is there rather than deleting a fixed slab of it', () => {
    // The old flat −6 is what made a floor-bound lieutenant permanent. Proportional erosion is
    // self-limiting: it takes more from somebody established than from somebody with nothing.
    const big = mk(); meet(big.w, big.lt, true, 10); const beforeBig = notoriety(big.lt);
    const small = mk(); meet(small.w, small.lt, true, 2); const beforeSmall = notoriety(small.lt);
    meet(big.w, big.lt, false); meet(small.w, small.lt, false);
    const lostBig = beforeBig - notoriety(big.lt), lostSmall = beforeSmall - notoriety(small.lt);
    expect(lostBig).toBeGreaterThan(lostSmall);
  });

  it('what the street already learned is never unlearned', () => {
    // A milestone is a thing that happened in public. Losing a fight afterwards does not take
    // their nickname back off them, and without a floor a long winning streak walks an
    // established nemesis back down past milestones they have already been paid.
    const { w, lt } = mk();
    meet(w, lt, true, 12);
    const named = MILESTONES.find(m => m.nickname)!;
    expect(lt.nemesis!.earned, 'this run never got far enough to test the floor').toContain(named.id);
    meet(w, lt, false, 100);
    expect(notoriety(lt)).toBeGreaterThanOrEqual(named.at);
    expect(lt.nemesis!.nickname, 'they lost the name the street gave them').toBeTruthy();
  });

  it('stakes still scale it: a fight is worth more than being talked over', () => {
    const loud = mk(); for (let i = 0; i < 5; i++) scoreMeeting(loud.w, loud.lt, true, 'violence', 'x');
    const quiet = mk(); for (let i = 0; i < 5; i++) scoreMeeting(quiet.w, quiet.lt, true, 'words', 'x');
    expect(notoriety(loud.lt)).toBeGreaterThan(notoriety(quiet.lt) * 2);
  });
});
