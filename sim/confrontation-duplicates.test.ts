/**
 * The "duplicate" repel event, which was not a duplicate.
 *
 * Reported from four soak runs across three scenarios: a rival-repel line firing twice, back to
 * back, with identical wording on the same day. It looked exactly like one event being logged or
 * resolved twice. It was not. In war a faction takes **two acts a day**, so two genuinely
 * different incidents — muscle in one of your rackets, one of your crew against a wall across
 * town — were both answered with a fight, both won, and both printed the same fixed string, which
 * named the faction and nothing else. Two events; one sentence.
 *
 * So there are two things to hold, and only the second is a deduplication:
 *
 *  1. **Every outcome line says where it happened.** A log the player cannot use to tell two
 *     incidents apart is a log that reads as a bug, and did.
 *  2. **One door, one crowd.** Two acts a day *can* pick the same racket twice, and that is the
 *     one case where a genuine duplicate was possible.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, select, type Confrontation, type World } from './index';
import { mkRacket } from './reducer';
import { alreadyAtTheDoor, queueConfrontation, resolveConfrontation } from './combat';
import { Rng } from './rng';

function atWar(): World {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 5 });
  w.pendingEvents = [];
  w.day = 30; w.player.cash = 40_000; w.player.ap = 8;
  const kinds = ['protection', 'numbers', 'bookmaking', 'gambling_den'] as const;
  Object.values(w.businesses).filter(b => b.ownedBy === 'npc').slice(0, 4).forEach((b, i) => {
    b.protection = { factionId: PLAYER, rate: 0.15, since: 5 };
    mkRacket(w, kinds[i], b);
  });
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, 3)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  for (const f of Object.values(w.factions)) { f.standing[PLAYER] = -100; f.stance[PLAYER] = 'war'; }
  return w;
}

/** Two different incidents, the shape war actually produces in one day. */
function twoIncidents(w: World): [Confrontation, Confrontation] {
  const f = Object.values(w.factions)[0];
  const r = w.rackets[w.player.racketIds[0]]; const biz = w.businesses[r.businessId];
  const victim = w.npcs[w.player.crewIds[0]];
  return [
    queueConfrontation(w, { factionId: f.id, kind: 'racket', war: true, racketId: r.id, businessId: biz.id, blockId: biz.blockId, text: 'muscle at the racket' }),
    queueConfrontation(w, { factionId: f.id, kind: 'crew', war: true, npcId: victim.id, blockId: victim.homeBlockId, text: 'somebody against a wall' }),
  ];
}

describe('two incidents in one day read as two incidents', () => {
  for (const answer of ['fight', 'backup', 'flee', 'absent'] as const) {
    it(`answering both with ${answer} writes two different lines`, () => {
      const w = atWar();
      const [a, b] = twoIncidents(w);
      const before = w.log.length;
      resolveConfrontation(w, a, answer, new Rng(1));
      resolveConfrontation(w, b, answer, new Rng(1));   // same roll, so the outcomes match too
      const written = w.log.slice(before).map(l => l.text);
      expect(written.length, 'nothing was logged').toBeGreaterThanOrEqual(2);
      expect(new Set(written).size, `identical lines for two different incidents: ${written[0]}`).toBe(written.length);
    });
  }

  it('and each line names the place it happened at', () => {
    const w = atWar();
    const [a] = twoIncidents(w);
    const biz = w.businesses[a.businessId!];
    const before = w.log.length;
    resolveConfrontation(w, a, 'fight', new Rng(1));
    expect(w.log.slice(before).map(l => l.text).join(' ')).toContain(biz.name);
  });
});

describe('one door, one crowd', () => {
  it('a second act the same day cannot queue on a place that already has somebody at it', () => {
    const w = atWar();
    const r = w.rackets[w.player.racketIds[0]]; const biz = w.businesses[r.businessId];
    expect(alreadyAtTheDoor(w, { businessId: biz.id })).toBe(false);
    queueConfrontation(w, { factionId: Object.values(w.factions)[0].id, kind: 'racket', war: true, racketId: r.id, businessId: biz.id, blockId: biz.blockId, text: 'first' });
    expect(alreadyAtTheDoor(w, { businessId: biz.id }), 'two crowds at the same door in one day').toBe(true);
    expect(alreadyAtTheDoor(w, { npcId: w.player.crewIds[0] }), 'a person is not a building').toBe(false);
  });

  it('yesterday does not block today', () => {
    const w = atWar();
    const biz = w.businesses[w.rackets[w.player.racketIds[0]].businessId];
    queueConfrontation(w, { factionId: Object.values(w.factions)[0].id, kind: 'business', war: true, businessId: biz.id, blockId: biz.blockId, text: 'first' });
    w.day++;
    expect(alreadyAtTheDoor(w, { businessId: biz.id })).toBe(false);
  });

  it('a played war never writes the same line twice on one day', () => {
    // The end-to-end version of the report: play it out and read the log the player would read.
    let w = atWar();
    for (let i = 0; i < 25; i++) {
      w.pendingEvents = [];
      for (const c of select.confrontations(w)) resolveConfrontation(w, c, 'fight', new Rng(w.day + 1));
      w = dispatch(w, { type: 'end_day' });
    }
    const seen = new Map<string, number>();
    for (const l of w.log) { const k = `${l.day}|${l.text}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    const dupes = [...seen.entries()].filter(([k, n]) => n > 1 && /put the first one down|more of them than there are of you|round the corner|out the back|were not there when/i.test(k));
    expect(dupes.map(([k]) => k), 'confrontation lines still repeat verbatim within a day').toEqual([]);
  });
});
