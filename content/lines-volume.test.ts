/**
 * There has to be enough of it.
 *
 * A pool of one is not a pool: the second time a player shakes down a coward they get the same
 * sentence, and by day forty a run has printed it a dozen times. That is not a subtle quality
 * problem — it is the single loudest thing wrong with a long game, because dialogue is the part the
 * player reads most.
 *
 * This is a **floor, not a target**. It exists so that a new trait key, a new approach or a new
 * scene kind cannot be added with one placeholder line and quietly ship: the pools grow together or
 * the suite says so. It cannot check that the writing is any good; it can check that there is some.
 */
import { describe, expect, it } from 'vitest';
import { generateWorld, sceneFor } from '@sim/index';
import { APPROACHES, LEDGER_CALLBACK, NEMESIS_OPENING, OPENING, REPUTATION_OPENING, RESULT } from './lines';

/** Four is the point at which a player stops noticing the loop inside one session. */
const MIN = 4;

describe('opening lines', () => {
  const keys = Object.entries(OPENING).flatMap(([kind, table]) => Object.entries(table).map(([key, lines]) => [`${kind}.${key}`, lines] as const));

  it('covers every scene kind, and every kind has a default to fall back on', () => {
    for (const kind of Object.keys(OPENING)) expect(OPENING[kind as keyof typeof OPENING].default, kind).toBeTruthy();
    expect(keys.length).toBeGreaterThanOrEqual(40);
  });

  it.each(keys)('%s has at least four of them', (_name, lines) => {
    expect(lines!.length).toBeGreaterThanOrEqual(MIN);
  });

  it('never repeats a line inside one pool, which would be a pool of fewer', () => {
    for (const [name, lines] of keys) expect(new Set(lines!).size, name).toBe(lines!.length);
  });
});

describe('result lines', () => {
  const keys = Object.entries(RESULT);

  it('has one pool per approach per outcome, with nothing missing', () => {
    // The pools are keyed by hand, so the guard is that the keys match the approaches that exist:
    // an approach added without its two pools silently falls back to "It works." forever.
    for (const [kind, list] of Object.entries(APPROACHES)) {
      for (const a of list) {
        for (const outcome of ['ok', 'fail']) expect(RESULT[`${kind}:${a.id}:${outcome}`], `${kind}:${a.id}:${outcome}`).toBeTruthy();
      }
    }
  });

  it.each(keys)('%s has at least four of them', (_name, lines) => {
    expect(lines.length).toBeGreaterThanOrEqual(MIN);
  });

  it('has no key that no approach can reach', () => {
    const reachable = new Set(Object.entries(APPROACHES).flatMap(([kind, list]) => list.flatMap(a => [`${kind}:${a.id}:ok`, `${kind}:${a.id}:fail`])));
    for (const k of Object.keys(RESULT)) expect(reachable.has(k), `${k} is dead content`).toBe(true);
  });
});

describe('the pools that read history', () => {
  it.each(Object.entries(NEMESIS_OPENING))('a nemesis has at least four things to say in a %s', (_kind, lines) => {
    expect(lines.length).toBeGreaterThanOrEqual(MIN);
  });

  it('gives a nemesis a line for every scene kind, so there is never a hole to fall through', () => {
    expect(Object.keys(NEMESIS_OPENING).sort()).toEqual(Object.keys(OPENING).sort());
  });

  it('has at least four ways to react to a name they have only heard', () => {
    expect(REPUTATION_OPENING.length).toBeGreaterThanOrEqual(MIN);
    // Every one of them has to be able to carry the name, or the table is half decoration.
    expect(REPUTATION_OPENING.some(l => l.includes('{street}'))).toBe(true);
  });

  it.each(Object.entries(LEDGER_CALLBACK))('has at least four ways to bring up a %s', (_kind, lines) => {
    expect(lines!.length).toBeGreaterThanOrEqual(MIN);
    // `{when}` is the whole reason these read as memory rather than as a label.
    for (const l of lines!) expect(l, l).toContain('{when}');
  });
});

describe('the writing itself', () => {
  const every = [
    ...Object.values(OPENING).flatMap(t => Object.values(t).flat()),
    ...Object.values(RESULT).flat(),
    ...Object.values(NEMESIS_OPENING).flat(),
    ...Object.values(LEDGER_CALLBACK).flat(),
  ].filter((l): l is string => typeof l === 'string');

  it('has no line left blank or stubbed', () => {
    for (const l of every) expect(l.trim().length, JSON.stringify(l)).toBeGreaterThan(8);
  });

  it('closes every quotation mark it opens', () => {
    // A dropped quote reads as a bug to a player, and it is the one typo this format invites.
    for (const l of every) expect(l.split('"').length % 2, l).toBe(1);
  });

  it('leaves no placeholder unfilled by whoever renders it', () => {
    // `{name}`/`{wins}` belong to the nemesis table, `{when}` to the callbacks, `{street}` to the
    // reputation table. A token anywhere else is a line that would print braces at a player.
    for (const l of [...Object.values(OPENING).flatMap(t => Object.values(t).flat()), ...Object.values(RESULT).flat()]) {
      expect(String(l), String(l)).not.toMatch(/\{[a-z]+\}/);
    }
  });
});

/**
 * Volume in the table is worth nothing if the picker never gets past the first entry.
 *
 * This lives here rather than next to `sceneFor` because it is the same claim as everything above:
 * a pool of five that always prints entry zero is a pool of one. It is also the failure the old
 * index actually had — `(w.day + n.id.length) % lines.length`, where npc ids are `n3` and `n47`, so
 * `id.length` took about two values across the whole city and everybody with a two-character id
 * said the same sentence on the same day. Filling the pools out would have hidden that, not fixed
 * it, which is exactly why the guard is here and not only on the table.
 */
describe('and the volume actually reaches the player', () => {
  const mk = () => {
    const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 12 });
    w.pendingEvents = []; w.day = 40;
    return w;
  };

  it('says something different to the same person on different days', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.grudge && !x.nemesis)!;
    n.grudge = undefined; n.ledger = [];
    const said = new Set<string>();
    for (let d = w.day; d < w.day + 30; d++) said.add(sceneFor({ ...w, day: d }, 'threaten', n.id).line);
    expect(said.size, 'one person, thirty days, and this many distinct lines').toBeGreaterThan(2);
  });

  it('says something different to different people on the same day', () => {
    const w = mk();
    // Same trait, same bars, same day: the only thing separating them is who they are, and that
    // has to be enough. This is the half the old index got wrong.
    const people = Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.grudge && !x.nemesis).slice(0, 12);
    expect(people.length).toBeGreaterThan(6);
    for (const n of people) { n.traits = ['hothead']; n.ledger = []; n.grudge = undefined; n.rel = { ...n.rel, trust: 10, fear: 0 }; }
    const said = new Set(people.map(n => sceneFor(w, 'threaten', n.id).line));
    expect(said.size, 'a dozen people on one day and this many distinct lines').toBeGreaterThan(2);
  });

  it('gives the same answer twice, so reopening a sheet never rerolls', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive)!;
    expect(sceneFor(w, 'visit', n.id).line).toBe(sceneFor(w, 'visit', n.id).line);
  });
});
