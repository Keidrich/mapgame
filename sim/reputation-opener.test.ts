/**
 * A name arrives before you do.
 *
 * `w.player.street` is the mirror of a nemesis's earned nickname: cross a fear-or-respect threshold
 * and the street stops using what you typed at the character screen. `playerName()` puts it through
 * every log line — and nobody in the city had ever said it to your face, which made the one piece of
 * state that summarises how you have actually been playing invisible in the place a player spends
 * most of their reading.
 *
 * It fires on a **first** meeting and nowhere else, which is the whole point of it: a reputation is
 * what somebody knows about you when they do not know you. The sixth conversation with the same
 * shopkeeper repeating your street name back at you would be the line that finally made the system
 * look like a system.
 *
 * Built as `lifestyleLine`'s pattern — read one piece of player state, return a clause or an empty
 * string, let the caller append it — deliberately, rather than a second mechanism for the same job.
 */
import { describe, expect, it } from 'vitest';
import { REPUTATION_OPENING } from '@content/lines';
import { FEARED_NAMES, RESPECTED_NAMES, STREET_NAME } from '@content/nemesis';
import { dispatch, generateWorld, sceneFor, type Npc, type World } from './index';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 40;
  return w;
};
/** Somebody the player has genuinely never dealt with, and nothing else on them to add clauses. */
function stranger(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.nemesis && !x.grudge)!;
  n.grudge = undefined; n.ledger = []; n.nemesis = undefined;
  n.rel = { ...n.rel, trust: 5, fear: 0, metDay: undefined, contacts: undefined };
  return n;
}
const line = (w: World, n: Npc) => sceneFor(w, 'visit', n.id).line;
/** Every line the reputation table can produce for this world, with the name filled in. */
const shapes = (w: World) => REPUTATION_OPENING.map(l => l.replace(/\{street\}/g, w.player.street!).trim());

describe('before you are anybody', () => {
  it('says nothing about a name you have not earned', () => {
    const w = mk();
    const n = stranger(w);
    expect(w.player.street).toBeUndefined();
    for (let d = w.day; d < w.day + 20; d++) {
      const l = line({ ...w, day: d }, n);
      expect(l).not.toMatch(/I've heard that name|know the name|checking an answer/);
    }
  });
});

describe('once the street has given you one', () => {
  it('a first meeting reacts to it', () => {
    const w = mk();
    const n = stranger(w);
    w.player.street = 'the Hammer';
    const l = line(w, n);
    expect(shapes(w).some(sh => l.includes(sh)), l).toBe(true);
    // Not every line in the pool says the name out loud — some of them are the moment of
    // recognition rather than the word. That it lands on one that does is the next test's job.
  });

  it('and the same person, before and after, does not open the same way', () => {
    const before = mk(); const nb = stranger(before);
    const after = mk(); const na = stranger(after);
    after.player.street = 'the Hammer';
    expect(line(after, na)).not.toBe(line(before, nb));
    expect(line(after, na).length).toBeGreaterThan(line(before, nb).length);
  });

  it('leaves no placeholder showing, on any day', () => {
    const w = mk();
    const n = stranger(w);
    w.player.street = 'Bad News';
    for (let d = w.day; d < w.day + 30; d++) expect(line({ ...w, day: d }, n), `day ${d}`).not.toMatch(/\{[a-z]+\}/);
  });

  it('says whichever name you actually earned, feared or respected', () => {
    for (const name of [FEARED_NAMES[0], RESPECTED_NAMES[0]]) {
      const w = mk();
      const n = stranger(w);
      w.player.street = name;
      // The table carries the name, so the pick has to land on a line that uses it at least
      // sometimes — otherwise the reaction is generic and the two pools may as well be one.
      const said: string[] = [];
      for (let d = w.day; d < w.day + 20; d++) said.push(line({ ...w, day: d }, n));
      expect(said.filter(l => l.includes(name)).length, name).toBeGreaterThan(0);
    }
  });
});

describe('and only on a first meeting', () => {
  it('says nothing to somebody who has dealt with you before', () => {
    const w = mk();
    const n = stranger(w);
    w.player.street = 'the Hammer';
    expect(shapes(w).some(sh => line(w, n).includes(sh))).toBe(true);

    // Somebody who has been in front of you already knows what you are called.
    n.rel = { ...n.rel, metDay: w.day - 8, contacts: 3 };
    for (let d = w.day; d < w.day + 20; d++) {
      const l = line({ ...w, day: d }, n);
      expect(shapes({ ...w, day: d }).some(sh => l.includes(sh)), `day ${d}: ${l}`).toBe(false);
    }
  });

  it('stops after the meeting that actually happens, not on a timer', () => {
    const w = mk();
    const n = stranger(w);
    w.player.street = 'the Hammer';
    w.player.currentBlockId = n.homeBlockId;
    expect(shapes(w).some(sh => line(w, n).includes(sh))).toBe(true);

    // A real visit through the reducer, which is what sets `metDay`/`contacts` — so this is the
    // rule holding against the game's own bookkeeping rather than against a hand-set field.
    const next = dispatch(w, { type: 'visit', npcId: n.id, approach: 'listen' });
    const after = next.npcs[n.id];
    expect(after.rel.metDay ?? after.rel.contacts, 'the visit recorded nothing').toBeDefined();
    expect(shapes(next).some(sh => line(next, after).includes(sh)), line(next, after)).toBe(false);
  });
});

describe('the threshold it hangs off', () => {
  it('is the one the rest of the game uses, not a second copy', () => {
    // If dialogue ever grew its own idea of when somebody is somebody, the name would appear in
    // conversation before or after the log announced it. It reads `player.street` and nothing else.
    expect(STREET_NAME.at).toBeGreaterThan(0);
    const w = mk();
    const n = stranger(w);
    w.player.fear = STREET_NAME.at + 20;
    expect(w.player.street, 'a bar reading high is not a name until the tick says so').toBeUndefined();
    expect(shapes({ ...w, player: { ...w.player, street: 'x' } }).length).toBeGreaterThan(0);
    expect(line(w, n)).not.toMatch(/heard that name/);
  });
});
