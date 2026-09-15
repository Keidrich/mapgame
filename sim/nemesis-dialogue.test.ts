/**
 * Somebody with a record does not sound like somebody without one.
 *
 * The whole recurring-antagonist arc — notoriety, milestones, an earned nickname that replaces the
 * name everywhere — ran underneath dialogue that could not see any of it. `openingLine` picked on
 * trait and trust, so a hothead lieutenant who had beaten the player three times and a hothead
 * shopkeeper met for the first time read from the same handful of sentences. The system worked and
 * sounded like furniture.
 *
 * The rule: a nemesis draws from `NEMESIS_OPENING` **instead of** the trait table, not as well as.
 * When somebody with a record walks in, the record is the thing in the room.
 */
import { describe, expect, it } from 'vitest';
import { NEMESIS_OPENING, OPENING } from '@content/lines';
import { NEMESIS } from '@content/nemesis';
import { generateWorld, sceneFor, select, type Npc, type World } from './index';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 40;
  return w;
};

/** Two people, alike in every way the dialogue reads — same trait, same bars, no history. */
function twoAlike(w: World): [Npc, Npc] {
  const pool = Object.values(w.npcs).filter(x => x.alive && !x.nemesis && !x.grudge);
  const [a, b] = [pool[0], pool[1]];
  for (const n of [a, b]) {
    n.traits = ['hothead']; n.ledger = []; n.grudge = undefined;
    n.rel = { ...n.rel, trust: 10, fear: 0 };
  }
  return [a, b];
}
/** Make one of them somebody. Notoriety is the only thing that separates them afterwards. */
function makeNemesis(n: Npc, day: number, wins = 3, nickname?: string): Npc {
  n.nemesis = { since: day - 20, wins, losses: 1, notoriety: NEMESIS.known + 20, earned: [], nickname };
  return n;
}
const say = (w: World, n: Npc, kind: 'visit' | 'threaten' | 'shakedown' | 'recruit' | 'parley' | 'broker' = 'threaten') => sceneFor(w, kind, n.id).line;

describe('a nemesis and an ordinary person with the same trait', () => {
  it('do not say the same thing', () => {
    const w = mk();
    const [ordinary, somebody] = twoAlike(w);
    makeNemesis(somebody, w.day);
    expect(select.isNemesis(somebody)).toBe(true);
    expect(select.isNemesis(ordinary)).toBe(false);
    expect(say(w, somebody)).not.toBe(say(w, ordinary));
  });

  it('draw from different pools entirely, not the same pool at different offsets', () => {
    const w = mk();
    const [ordinary, somebody] = twoAlike(w);
    makeNemesis(somebody, w.day);
    // Across every scene kind and a fortnight of days, nothing a nemesis says may be a line the
    // hothead table could have produced, and vice versa. Offsetting into one shared pool would
    // satisfy "not equal today" and fail this.
    // `threaten` and `shakedown` only: a `visit` appends neighbourhood gossip and a home-turf note,
    // so its line is not a bare pool entry and set membership would be the wrong question there.
    const traitLines = new Set([...OPENING.threaten.hothead!, ...OPENING.shakedown.hothead!]);
    for (let d = w.day; d < w.day + 14; d++) {
      const t = { ...w, day: d };
      for (const kind of ['threaten', 'shakedown'] as const) {
        expect(traitLines.has(say(t, somebody, kind)), `day ${d} ${kind}`).toBe(false);
        expect(traitLines.has(say(t, ordinary, kind)), `day ${d} ${kind} (control)`).toBe(true);
      }
    }
  });

  it('gives the nemesis their earned name, not the one on their birth certificate', () => {
    const w = mk();
    const [, somebody] = twoAlike(w);
    makeNemesis(somebody, w.day, 3, 'the Nail');
    // `{name}` resolves through `nemesisName`, which is the same function the log goes through —
    // so a lieutenant the street renamed is renamed here too, or the dialogue calls them something
    // nothing else in the game calls them any more.
    // Only some lines in a pool name them, so this sweeps days as well as scene kinds: the claim is
    // that the name reaches the dialogue at all, not that every sentence carries it.
    const everything: string[] = [];
    for (let d = w.day; d < w.day + 20; d++) for (const k of Object.keys(NEMESIS_OPENING)) everything.push(say({ ...w, day: d }, somebody, k as 'visit'));
    expect(everything.join(' ')).not.toContain('{name}');
    expect(everything.filter(l => l.includes('the Nail')).length, 'the earned name never once appears').toBeGreaterThan(0);
    // …and never the given name alongside it, which is the bug `withNickname` exists to prevent.
    expect(everything.filter(l => l.includes(somebody.name)).length, 'called them their old name too').toBe(0);
  });

  it('leaves no placeholder showing, on any scene kind or any day', () => {
    const w = mk();
    const [, somebody] = twoAlike(w);
    makeNemesis(somebody, w.day, 4, 'Stone');
    for (let d = w.day; d < w.day + 30; d++) {
      for (const kind of Object.keys(NEMESIS_OPENING) as (keyof typeof NEMESIS_OPENING)[]) {
        expect(say({ ...w, day: d }, somebody, kind), `${kind} day ${d}`).not.toMatch(/\{[a-z]+\}/);
      }
    }
  });

  it('only counts the times out loud when there is a number worth saying', () => {
    const w = mk();
    const [, somebody] = twoAlike(w);
    // One win is not a record. A line built around "we have done this 1 times" is worse than no
    // line at all, so the pool is filtered rather than the number being fudged.
    makeNemesis(somebody, w.day, 1);
    for (let d = w.day; d < w.day + 30; d++) {
      expect(say({ ...w, day: d }, somebody, 'threaten')).not.toMatch(/\b1 times\b/);
    }
  });

  it('is not triggered by a record too thin to have earned it', () => {
    const w = mk();
    const [ordinary, somebody] = twoAlike(w);
    // Below `NEMESIS.known` they are a name on a card, and `isNemesis` says so. Dialogue must agree
    // with the rest of the game about where that line is rather than keeping its own threshold.
    somebody.nemesis = { since: w.day - 20, wins: 1, losses: 4, notoriety: NEMESIS.known - 1, earned: [] };
    expect(select.isNemesis(somebody)).toBe(false);
    // Not "says the same sentence as the control" — two people never do, because the pick is salted
    // per person and that is the variety this whole pass is for. The claim is which pool they read.
    const traitLines = new Set(OPENING.threaten.hothead!);
    for (let d = w.day; d < w.day + 14; d++) expect(traitLines.has(say({ ...w, day: d }, somebody)), `day ${d}`).toBe(true);
    void ordinary;
  });

  it('says the same thing twice when asked twice, like everything else here', () => {
    const w = mk();
    const [, somebody] = twoAlike(w);
    makeNemesis(somebody, w.day);
    expect(say(w, somebody)).toBe(say(w, somebody));
  });
});
