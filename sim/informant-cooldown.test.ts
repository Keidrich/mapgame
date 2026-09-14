/**
 * When an arrangement lapses.
 *
 * `goesCold` was one flat number for everybody, so every asset turned in the same week and left
 * alone became eligible to drift on the same morning — and two separate soak runs had several
 * "is not returning calls" lines land on one day. The 20%-a-day roll spreads the drop a little
 * and does nothing about the clump, because they all entered the pool together.
 *
 * The offset is derived from the person's id rather than rolled, which matters for two reasons
 * beyond the clustering: `/sim` has no `Math.random`, and a save reloaded mid-arrangement has to
 * come back with the same clock it had.
 */
import { describe, expect, it } from 'vitest';
import { ASSET } from '@content/informants';
import { generateWorld, type Npc, type World } from './index';
import { coldAfter, goneCold, turnAsset } from './informants';

function crowd(n = 24): { w: World; people: Npc[] } {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 6 });
  const people = Object.values(w.npcs).filter(x => x.alive && !x.crew).slice(0, n);
  expect(people.length, 'not enough people generated to test a clump').toBe(n);
  return { w, people };
}

describe('go-cold timers are per-relationship, not one global clock', () => {
  it('a batch turned on the same day does not all come due on the same day', () => {
    const { w, people } = crowd();
    for (const n of people) turnAsset(w, n, 'muscle');
    const due = new Set(people.map(n => coldAfter(n)));
    expect(due.size, `all ${people.length} lapse on the same day`).toBeGreaterThan(3);
  });

  it('and the spread is real: no single day takes more than a fraction of them', () => {
    const { w, people } = crowd();
    for (const n of people) turnAsset(w, n, 'muscle');
    const worstDay = Math.max(...[...new Set(people.map(n => coldAfter(n)))]
      .map(d => people.filter(n => coldAfter(n) === d).length));
    expect(worstDay / people.length, 'most of the batch still lapses together').toBeLessThan(0.4);
  });

  it('nobody drifts early, and nobody holds on for ever', () => {
    const { w, people } = crowd(8);
    for (const n of people) turnAsset(w, n, 'informant');
    for (const n of people) {
      expect(coldAfter(n)).toBeGreaterThanOrEqual(ASSET.goesCold);
      expect(coldAfter(n)).toBeLessThanOrEqual(ASSET.goesCold + ASSET.coldSpread);
    }
  });

  it('the clock is stable: reading it twice, and after a save round trip, gives the same day', () => {
    const { w, people } = crowd(6);
    for (const n of people) turnAsset(w, n, 'muscle');
    const first = people.map(n => coldAfter(n));
    const reloaded = JSON.parse(JSON.stringify(w)) as World;
    expect(people.map(n => coldAfter(n))).toEqual(first);
    expect(people.map(n => coldAfter(reloaded.npcs[n.id]))).toEqual(first);
  });

  it('it is still a silence timer: hearing from you resets it for that person alone', () => {
    const { w, people } = crowd(4);
    for (const n of people) turnAsset(w, n, 'muscle');
    const [a, b] = people;
    w.day = ASSET.goesCold + ASSET.coldSpread + 2;
    expect(goneCold(w, a) && goneCold(w, b), 'nobody went cold, so this checked nothing').toBe(true);
    a.ledger = [...(a.ledger ?? []), { day: w.day - 1, kind: 'intel', text: 'They got word to you.' }];
    expect(goneCold(w, a), 'somebody you heard from yesterday drifted anyway').toBe(false);
    expect(goneCold(w, b)).toBe(true);
  });
});
