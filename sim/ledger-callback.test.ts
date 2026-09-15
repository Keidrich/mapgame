/**
 * The opening line reads the history the game was already keeping.
 *
 * `sim/ledger.ts` has recorded every meaningful exchange with every person since the standing pass
 * — a favour, a threat, a deal, a night somebody's door went in — and `openingLine` never once
 * looked at it. What somebody said to you was a function of their trait and your trust bar, so the
 * conversation after you did them a good turn opened exactly like the conversation before it. The
 * data was there; the dialogue simply did not read it.
 *
 * Two things worth pinning, and the second is the one that makes it worth having:
 *
 *  - the line references the **specific** last thing, not "some history exists" — a threat and a
 *    favour have to produce recognisably different openings;
 *  - and it stays a *chance*, resolved deterministically, because somebody who opens with the same
 *    favour nine visits running is a worse kind of repetitive than a small line pool.
 */
import { describe, expect, it } from 'vitest';
import { LEDGER_CALLBACK } from '@content/lines';
import { generateWorld, sceneFor, type Npc, type World } from './index';
import { remember } from './ledger';
import { ledgerCallback } from './scenes';
import { openingFor } from './conversation';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 40;
  return w;
};
/** Somebody ordinary: no grudge, no record, nothing else that would add clauses of its own. */
function plain(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.nemesis)!;
  n.grudge = undefined; n.ledger = []; n.rel = { ...n.rel, trust: 10, fear: 0 };
  return n;
}
const line = (w: World, n: Npc) => sceneFor(w, 'visit', n.id).line;

/**
 * The first day on or after `w.day` where this person would actually bring their history up.
 *
 * The gate is a deterministic hash of who and when, so a test cannot simply assert it fires today.
 * Searching for a day it fires is the honest way to test a probabilistic rule: it proves the rule
 * *can* fire without pinning the hash, which is an implementation detail nobody should be able to
 * break a test by tuning.
 */
function dayItFires(w: World, n: Npc, within = 15): number | undefined {
  const from = w.day;
  for (let d = from; d < from + within; d++) { w.day = d; if (ledgerCallback(w, n)) { w.day = from; return d; } }
  w.day = from;
  return undefined;
}

describe('bringing up the last thing that happened', () => {
  it('says nothing at all when there is no history to say anything about', () => {
    const w = mk();
    const n = plain(w);
    for (let d = w.day; d < w.day + 20; d++) expect(ledgerCallback({ ...w, day: d }, n)).toBeUndefined();
  });

  it('brings up a recent favour, in the words the favour table uses', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'favour', 'You squared something for them with the Vitales.');

    const day = dayItFires(w, n);
    expect(day, 'a fresh favour never came up in a fortnight').toBeDefined();
    w.day = day!;

    const cb = ledgerCallback(w, n)!;
    expect(cb.entry.kind).toBe('favour');
    // The line is one of the favour pool's, with `{when}` resolved — not a label, not the raw entry.
    const shapes = LEDGER_CALLBACK.favour!.map(l => l.replace(/\{when\}/g, ''));
    expect(shapes.some(sh => cb.line.replace(/this morning|yesterday|the other day|last week|a couple of weeks back|a while back/g, '') === sh)).toBe(true);
    expect(cb.line).not.toContain('{when}');
    expect(line(w, n)).toContain(cb.line.trim());
  });

  it('is specific: a threat and a favour do not produce the same opening', () => {
    const favoured = mk(); const nf = plain(favoured);
    remember(favoured, nf, 'favour', 'You squared something for them.');
    const threatened = mk(); const nt = plain(threatened);
    remember(threatened, nt, 'threat', 'You told them what happens if the money is late again.');

    // Same person, same seed, same day — the only difference in the world is what is on the page.
    const day = dayItFires(favoured, nf);
    expect(day).toBeDefined();
    favoured.day = day!; threatened.day = day!;

    const a = ledgerCallback(favoured, nf);
    const b = ledgerCallback(threatened, nt);
    expect(a, 'the favour did not come up').toBeTruthy();
    expect(b, 'the threat did not come up').toBeTruthy();
    expect(a!.line).not.toBe(b!.line);
    expect(LEDGER_CALLBACK.favour!.map(l => l.replace(/\{when\}/g, '')).some(sh => a!.line.includes(sh.slice(0, 18).trim()))).toBe(true);
    expect(LEDGER_CALLBACK.threat!.map(l => l.replace(/\{when\}/g, '')).some(sh => b!.line.includes(sh.slice(0, 18).trim()))).toBe(true);
  });

  it('brings up the most recent thing, not the first thing', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'favour', 'Ancient history.');
    w.day += 3;
    remember(w, n, 'harm', 'Somebody put their window in and everybody knows whose people.');

    const day = dayItFires(w, n);
    expect(day).toBeDefined();
    w.day = day!;
    expect(ledgerCallback(w, n)!.entry.kind).toBe('harm');
  });

  it('lets an old thing go: a year-old favour is not what you open with', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'favour', 'You squared something for them.');
    w.day += 200;
    for (let d = w.day; d < w.day + 20; d++) expect(ledgerCallback({ ...w, day: d }, n)).toBeUndefined();
  });

  it('never opens with "we have met", which is news to nobody', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'met', 'You met them.');
    for (let d = w.day; d < w.day + 20; d++) expect(ledgerCallback({ ...w, day: d }, n)).toBeUndefined();
  });

  it('is a chance, not a certainty — the same favour does not open every conversation', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'favour', 'You squared something for them.');
    let fired = 0;
    for (let d = w.day; d < w.day + 20; d++) if (ledgerCallback({ ...w, day: d }, n)) fired++;
    expect(fired, 'it never came up in twenty days').toBeGreaterThan(0);
    expect(fired, 'it came up every single day, which is the other failure').toBeLessThan(20);
  });

  it('is settled by the world, not by a roll: the same day twice says the same thing', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'deal', 'You bought their whole back room of hot goods.');
    for (let d = w.day; d < w.day + 10; d++) {
      const a = ledgerCallback({ ...w, day: d }, n);
      const b = ledgerCallback({ ...w, day: d }, n);
      expect(a?.line).toBe(b?.line);
    }
  });

  it('does not also print the raw receipt: the conversation screen says it once', () => {
    const w = mk();
    const n = plain(w);
    remember(w, n, 'favour', 'You squared something for them with the Vitales.');
    // `openingFor` — the conversation screen's opener, not `sceneFor`'s — used to append
    // `(Last time: ...)` unconditionally. Now that the opening speaks to the same entry in voice,
    // printing the receipt for *that* entry is the game saying it twice in one breath.
    const fires = dayItFires(w, n);
    expect(fires).toBeDefined();
    w.day = fires!;
    expect(ledgerCallback(w, n)).toBeTruthy();
    expect(openingFor(w, 'visit', n)).not.toContain('Last time:');

    // …and on a day it does not fire, the receipt is still there. Losing it entirely would be
    // trading one bug for a quieter one.
    // Search only inside the callback's own recency window: past it both clauses go quiet for the
    // same reason, and the test would pass without proving anything.
    const entryDay = n.ledger![0].day;
    let quiet: number | undefined;
    for (let d = entryDay; d <= entryDay + 20 && quiet === undefined; d++) if (!ledgerCallback({ ...w, day: d }, n)) quiet = d;
    expect(quiet, 'it came up on every day of the window').toBeDefined();
    expect(openingFor({ ...w, day: quiet! }, 'visit', n)).toContain('Last time:');
  });
});
