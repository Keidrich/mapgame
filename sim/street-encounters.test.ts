/**
 * The dead time between decisions.
 *
 * Walking costs legwork and produced one line — "You walk from J8 to K7" — for the whole game.
 * These are the small things that happen on the way. Two properties matter and they pull against
 * each other: **rare enough to stay texture** (a thing that fires every move is noise) and
 * **varied enough to be texture at all** (one encounter repeated is worse than none).
 *
 * And they are deliberately not a second event deck: nothing here stops to ask the player
 * anything. If one ever needs a modal it belongs in `sim/events.ts` instead.
 */
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_CHANCE, onTheWay } from './encounters';
import { dispatch, generateWorld, type World } from './index';
import { Rng } from './rng';

function walker(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 400 });
  w.pendingEvents = []; w.day = 40; w.player.heat = 40;
  // somebody worth bumping into: the encounters that need a familiar face should be able to fire
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, 40)) {
    n.known = true; n.rel.metDay = 1; n.rel.contacts = 3;
  }
  return w;
}
/** Many walks, and what came of them. */
function stroll(w: World, moves = 600) {
  const blocks = Object.keys(w.blocks);
  let fired = 0;
  const before = w.log.length;
  for (let i = 0; i < moves; i++) if (onTheWay(w, blocks[i % blocks.length], new Rng(i + 1))) fired++;
  return { fired, lines: w.log.slice(before).map(e => e.text) };
}

describe('rare enough to stay texture', () => {
  it('most walks are still just a walk', () => {
    const w = walker();
    const { fired } = stroll(w);
    expect(fired / 600).toBeLessThan(0.25);
    expect(ENCOUNTER_CHANCE).toBeLessThan(0.2);
  });

  it('but it does happen, often enough to notice over a long game', () => {
    const w = walker();
    const { fired } = stroll(w);
    expect(fired, 'six hundred walks and nothing ever happened').toBeGreaterThan(20);
  });

  it('and never twice from one walk', () => {
    const w = walker();
    const before = w.log.length;
    onTheWay(w, Object.keys(w.blocks)[0], new Rng(1));
    expect(w.log.length - before).toBeLessThanOrEqual(1);
  });
});

describe('varied enough to be worth having', () => {
  it('several different things happen, not one thing over and over', () => {
    const w = walker();
    const { lines } = stroll(w);
    const shapes = new Set(lines.map(t => t.slice(0, 18)));
    expect(shapes.size, `only ${shapes.size} distinct kinds over a long walk`).toBeGreaterThanOrEqual(4);
  });

  it('and no single one of them is most of what happens', () => {
    const w = walker();
    const { lines } = stroll(w);
    const counts = new Map<string, number>();
    for (const t of lines) { const k = t.slice(0, 18); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const most = Math.max(...counts.values());
    expect(most / lines.length, 'one encounter is the whole table in practice').toBeLessThan(0.6);
  });

  it('a quiet corner stays quiet rather than producing a fallback', () => {
    // an empty block has nobody to meet; the table declines and rolls on rather than inventing
    // somebody, and if nothing fits, nothing happens
    const w = walker();
    const empty = Object.values(w.blocks).find(b => b.businessIds.length === 0);
    if (!empty) return;
    w.player.heat = 0;
    let fired = 0;
    for (let i = 0; i < 200; i++) if (onTheWay(w, empty.id, new Rng(i + 1))) fired++;
    expect(fired / 200).toBeLessThan(ENCOUNTER_CHANCE + 0.02);
  });
});

describe('it is texture, not a second event deck', () => {
  it('nothing it does ever stops to ask the player something', () => {
    const w = walker();
    const before = w.pendingEvents.length;
    stroll(w, 400);
    expect(w.pendingEvents.length, 'an encounter queued a decision').toBe(before);
  });

  it('and nothing it does is large', () => {
    const w = walker();
    const cash = w.player.dirty, heat = w.player.heat;
    stroll(w, 400);
    expect(Math.abs(w.player.dirty - cash), 'the street handed out a fortune').toBeLessThan(6_000);
    expect(Math.abs(w.player.heat - heat)).toBeLessThan(40);
  });

  it('it never fires once the game is over', () => {
    const w = walker();
    w.gameOver = { reason: 'straight', text: 'out' };
    expect(stroll(w, 100).fired).toBe(0);
  });
});

describe('it really is on the walk', () => {
  it('travelling can produce one, through the ordinary action', () => {
    let w = walker();
    const here = w.blocks[w.player.currentBlockId];
    const there = here.neighborIds.map(id => w.blocks[id]).find(Boolean);
    if (!there) return;
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      const before = w.log.length;
      w.player.legwork = 9;
      w = dispatch(w, { type: 'move', toBlockId: w.player.currentBlockId === here.id ? there.id : here.id });
      if (w.log.slice(before).length > 1) seen = true;
    }
    expect(seen, 'sixty walks and the street was empty every time').toBe(true);
  });
});
