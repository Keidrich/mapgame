/**
 * What a nemesis keeps when the man he was beating dies.
 *
 * Everywhere else in the game `w.player` is treated as one uninterrupted thing, and that is right:
 * the blocks do not care who is holding them. A nemesis is the exception, because it is the only
 * relationship in the game that is **about the protagonist personally** — `Npc.nemesis` holds
 * notoriety, and `sim/nemesis.ts` defines that number as what a win *against the player* is worth
 * to them. Carrying it over intact would mean inheriting somebody's enemy along with their car.
 *
 * The split is written down in the header of `sim/legacy.ts` and implemented in `inheritNemeses`.
 * This file asserts **both halves**: not fully intact, and not fully reset. A test that only
 * checked one side would pass against a version that threw the whole record away, which would be
 * just as wrong in the other direction — the war with their outfit is real and did not stop.
 */
import { describe, expect, it } from 'vitest';
import { NEMESIS, MILESTONES } from '@content/nemesis';
import { generateWorld, sceneFor, select, type Npc, type World } from './index';
import { SUCCESSION, succeed } from './legacy';
import { knowsYou, isNemesis, notoriety, scoreMeeting } from './nemesis';
import { ledgerOf } from './ledger';
import { PLAYER } from './types';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 60;
  return w;
};
/** Enough crew that there is somebody to take over. */
function crew(w: World, n = 3): Npc[] {
  const out: Npc[] = [];
  for (const p of Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.official && !x.nemesis).slice(0, n)) {
    p.crew = { loyalty: 85, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    p.role = 'crew'; w.player.crewIds.push(p.id); out.push(p);
  }
  return out;
}
/** A lieutenant with a long, public record: a nickname, milestones paid, meetings behind them. */
function madeMan(w: World, opts: { notoriety?: number; earned?: string[] } = {}): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && x.role === 'lieutenant')
    ?? Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.nemesis = {
    since: 12, wins: 7, losses: 2, met: 9,
    notoriety: opts.notoriety ?? 80,
    earned: opts.earned ?? ['hardened', 'muscle', 'named'],
    nickname: 'the Nail',
  };
  n.traits = [...new Set([...n.traits, 'hothead' as const])];
  return n;
}
const hand = (w: World) => succeed(w, 'Somebody got to you, and there was nobody between you and them.');

describe('the outfit’s war carries', () => {
  it('keeps the record: one outfit’s wins against another are not the dead man’s property', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    hand(w);
    expect(foe.nemesis!.wins).toBe(7);
    expect(foe.nemesis!.losses).toBe(2);
  });

  it('keeps everything the street already decided about them', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    const traits = [...foe.traits];
    hand(w);
    // A milestone is a thing that happened in public — `earnedFloor` has always said that losing a
    // fight afterwards does not unhappen it, and the boss dying is not different.
    expect(foe.nemesis!.earned).toEqual(['hardened', 'muscle', 'named']);
    expect(foe.nemesis!.nickname).toBe('the Nail');
    expect(select.nemesisName(foe)).toContain('the Nail');
    expect(foe.traits).toEqual(traits);
  });

  it('never falls below what the street knows: a named man is still a named man', () => {
    const w = mk(); crew(w);
    const named = MILESTONES.find(m => m.id === 'named')!;
    const foe = madeMan(w, { notoriety: 90 });
    hand(w);
    expect(notoriety(foe)).toBeGreaterThanOrEqual(named.at);
    expect(isNemesis(foe), 'the city forgot a man with a street name').toBe(true);
  });

  it('leaves the faction-level conflict entirely alone', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    const f = foe.faction ? w.factions[foe.faction] : Object.values(w.factions)[0];
    f.standing[PLAYER] = -70; f.grudges = ['they took the docks'];
    const stance = f.stance[PLAYER];
    hand(w);
    expect(f.standing[PLAYER]).toBe(-70);
    expect(f.stance[PLAYER]).toBe(stance);
    expect(f.grudges).toEqual(['they took the docks']);
  });

  it('leaves their ledger and their grudge alone, because the outfit did those things', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    foe.ledger = [{ day: 20, kind: 'harm', text: 'They put two of yours in hospital.' }];
    foe.grudge = { since: 30, reason: 'you tried to put them in a van', spread: 2 };
    hand(w);
    expect(ledgerOf(foe)).toHaveLength(1);
    expect(foe.grudge?.reason).toBe('you tried to put them in a van');
  });
});

describe('the personal thing does not', () => {
  it('cuts their notoriety, because it was a score against a man who is dead', () => {
    const w = mk(); crew(w);
    // No milestones earned, so nothing is holding the floor up and the cut is visible in full.
    const foe = madeMan(w, { notoriety: 60, earned: [] });
    hand(w);
    expect(notoriety(foe)).toBeCloseTo(60 * SUCCESSION.nemesisKeeps, 5);
    expect(notoriety(foe)).toBeLessThan(60);
  });

  it('is a cut and not a wipe: not fully intact, and not fully reset', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w, { notoriety: 60, earned: [] });
    hand(w);
    // The whole claim of the brief, in one assertion pair.
    expect(notoriety(foe)).toBeGreaterThan(0);
    expect(notoriety(foe)).toBeLessThan(60);
  });

  it('zeroes the meetings: they have not met you', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    expect(knowsYou(foe)).toBe(true);
    hand(w);
    expect(foe.nemesis!.met).toBe(0);
    expect(knowsYou(foe), 'he remembers a man he has never met').toBe(false);
  });

  it('restarts the clock on the day the outfit changed hands', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    expect(foe.nemesis!.since).toBe(12);
    hand(w);
    expect(foe.nemesis!.since).toBe(w.day);
  });

  it('does it for everybody with a record, not only the one who did it', () => {
    const w = mk(); crew(w);
    const a = madeMan(w, { notoriety: 70, earned: [] });
    const b = Object.values(w.npcs).find(n => n.alive && !n.crew && n.id !== a.id)!;
    b.nemesis = { since: 5, wins: 3, losses: 0, met: 3, notoriety: 40, earned: [] };
    hand(w);
    for (const n of [a, b]) { expect(n.nemesis!.met, n.name).toBe(0); expect(n.nemesis!.since).toBe(w.day); }
  });
});

describe('and it is audible', () => {
  it('a man with a street name stops talking to you like somebody he has history with', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    foe.grudge = undefined; foe.ledger = [];
    const before = sceneFor(w, 'threaten', foe.id).line;

    hand(w);
    const after = sceneFor(w, 'threaten', foe.id).line;
    expect(after).not.toBe(before);
    // He is still somebody — the city has not forgotten him — and he is talking to a stranger.
    expect(isNemesis(foe)).toBe(true);
    expect(knowsYou(foe)).toBe(false);
    expect(after, 'still counting meetings he has not had').not.toMatch(/times\. I remember all of them|of all the doors/i);
  });

  it('and starts again the next time he turns up', () => {
    const w = mk(); crew(w);
    const foe = madeMan(w);
    hand(w);
    expect(knowsYou(foe)).toBe(false);
    scoreMeeting(w, foe, true, 'violence', 'They came for you and got through.');
    expect(foe.nemesis!.met).toBe(1);
    expect(knowsYou(foe), 'meeting him again changed nothing').toBe(true);
  });
});

describe('an old save', () => {
  it('loads with everybody already acquainted, exactly as it behaved', () => {
    // `met` is optional and absent means "as many as `wins + losses`". A save made before the split
    // has no `met` on anybody, and must not turn every established nemesis into a stranger.
    const w = mk();
    const foe = madeMan(w);
    delete foe.nemesis!.met;
    expect(knowsYou(foe)).toBe(true);
    expect(isNemesis(foe)).toBe(true);
  });

  it('and somebody with no record at all is not somebody you know', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.nemesis)!;
    expect(knowsYou(n)).toBe(false);
  });
});

describe('the two constants sit together', () => {
  it('a nemesis keeps less than an heir inherits, because one is a thing and one is a score', () => {
    expect(SUCCESSION.nemesisKeeps).toBeLessThan(SUCCESSION.inherits);
    expect(SUCCESSION.nemesisKeeps).toBeGreaterThan(0);
    expect(NEMESIS.known).toBeGreaterThan(0);
  });
});
