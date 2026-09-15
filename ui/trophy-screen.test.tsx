/**
 * The record.
 *
 * The whole point of this screen is the constraint behind it: **no new state**. Every row is
 * aggregated from things the game was already writing for its own reasons — `w.log`, the NPC
 * ledgers, `w.ops`, `w.factions`, and the counters on `w.player`. So these tests are mostly
 * about provenance: put the source data in the shape the game itself produces, and check the
 * row appears; take it away, and check the row is *still there*, empty.
 *
 * That last part matters. An empty row is not a missing row — "First body — never" is part of
 * somebody's record, and arguably the most interesting line on the page.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { trophies } from '@sim/trophies';
import { remember } from '@sim/ledger';
import { generateWorld, PLAYER, type Op, type World } from '@sim/index';
import { LANDMARKS } from '@content/landmarks';
import { TrophyScreen } from './components/TrophyScreen';
import { newGame } from './store';
import { plain } from './test-util';

const mk = (): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 610 });
  w.pendingEvents = []; w.day = 40;
  return w;
};

/** An op in the shape the reducer leaves behind once it has finished. */
const finished = (w: World, kind: Op['kind'], createdDay: number): Op => {
  const id = `op_${Object.keys(w.ops).length + 1}`;
  const o: Op = { id, kind, crewIds: [], planDays: 1, daysLeft: 0, status: 'done', createdDay };
  w.ops[id] = o;
  return o;
};

const row = (w: World, id: string) => trophies(w).find(t => t.id === id);

describe('it aggregates from the ops log', () => {
  it('the first job is the earliest one by the day it was planned, not insertion order', () => {
    const w = mk();
    finished(w, 'intimidate', 18);
    finished(w, 'robbery', 4);
    finished(w, 'smuggle_run', 9);
    expect(row(w, 'first_job')!.day).toBe(4);
  });

  it('a job still running is not part of the record', () => {
    const w = mk();
    const o = finished(w, 'robbery', 4);
    o.status = 'ready';
    expect(row(w, 'first_job')!.value).toBeUndefined();
    expect(row(w, 'first_job')!.day).toBeUndefined();
  });

  it('kinds pulled counts distinct kinds against the whole catalogue', () => {
    const w = mk();
    finished(w, 'robbery', 3);
    finished(w, 'robbery', 8);
    finished(w, 'intimidate', 11);
    expect(row(w, 'kinds')!.value).toMatch(/^2 of \d+$/);
  });

  it('landmarks worked counts the one-off jobs that only exist in one place', () => {
    const w = mk();
    finished(w, LANDMARKS[0].op, 20);
    finished(w, LANDMARKS[1].op, 25);
    expect(row(w, 'landmarks')!.value).toBe(`2 of ${LANDMARKS.length}`);
  });

  it('first body reads off a hit and stays empty without one', () => {
    const w = mk();
    finished(w, 'robbery', 3);
    expect(row(w, 'first_hit')!.value).toBeUndefined();
    finished(w, 'hit', 31);
    expect(row(w, 'first_hit')!.day).toBe(31);
  });
});

describe('it aggregates from the log the game already writes', () => {
  it('the biggest score is the largest figure in a payout line', () => {
    const w = mk();
    w.log.push({ day: 10, text: 'Clean in and out. $4,200 in the bag.', tone: 'good', refs: {} });
    w.log.push({ day: 22, text: 'Count Room: $31,500 in the bag.', tone: 'good', refs: {} });
    w.log.push({ day: 30, text: 'Clean in and out. $900 in the bag.', tone: 'good', refs: {} });
    expect(row(w, 'biggest')!.value).toBe('$31,500');
    expect(row(w, 'biggest')!.detail).toMatch(/Count Room/);
  });

  it('a dollar figure in a line that is not a payout does not become a score', () => {
    const w = mk();
    w.log.push({ day: 12, text: 'Wages: $60,000 out the door this week.', tone: 'bad', refs: {} });
    expect(row(w, 'biggest')!.value).toBeUndefined();
  });

  it('the closest call comes from the bust line the law already logs', () => {
    const w = mk();
    expect(row(w, 'closest')!.value).toBeUndefined();
    w.log.push({ day: 27, text: 'BUSTED. The task force came through everything at once.', tone: 'bad', refs: {} });
    expect(row(w, 'closest')!.day).toBe(27);
  });
});

describe('it aggregates from the counters and the world', () => {
  it('outfits finished counts only the ones you finished, and names all the dead', () => {
    const w = mk();
    const fs = Object.values(w.factions);
    fs[0].defeatedDay = 20; fs[0].defeatedBy = PLAYER;
    fs[1].defeatedDay = 25; fs[1].defeatedBy = fs[0].id;
    const t = row(w, 'destroyed')!;
    expect(t.value).toBe('1');
    expect(t.detail).toContain(fs[0].short);
    expect(t.detail).toContain(fs[1].short);
  });

  it('busts and crew read straight off the player counters', () => {
    const w = mk();
    expect(row(w, 'busts')!.value).toBe('Never');
    w.player.busts = 3; w.player.crewEver = 11;
    expect(row(w, 'busts')!.value).toBe('3');
    expect(row(w, 'crew')!.value).toBe('11');
  });

  it('the longest history is the fattest ledger, and it names the day it started', () => {
    const w = mk();
    const [a, b] = Object.values(w.npcs);
    w.day = 5; remember(w, a, 'met', 'You met.');
    w.day = 9; remember(w, a, 'favour', 'They did you a turn.');
    w.day = 12; remember(w, b, 'met', 'You met.');
    w.day = 40;
    const t = row(w, 'oldest')!;
    expect(t.value).toBe(a.name);
    expect(t.detail).toMatch(/2 things between you, going back to day 5/);
  });

  it('the line you took over from appears only once there is one', () => {
    const w = mk();
    expect(row(w, 'line')).toBeUndefined();
    w.player.succeededFrom = ['Rosa Vey'];
    expect(row(w, 'line')!.value).toBe('Rosa Vey');
  });
});

describe('the screen itself', () => {
  it('keeps the empty rows rather than hiding them — a blank is part of the record', () => {
    const w = mk();
    const rows = trophies(w);
    expect(rows.some(t => t.value === undefined)).toBe(true);
    newGame(w);
    const html = plain(renderToString(<TrophyScreen />));
    expect(html).toContain('—');
  });

  it('adds no new state: the world is the same object it was before the screen looked at it', () => {
    const w = mk();
    finished(w, 'robbery', 6);
    const before = JSON.stringify(w);
    trophies(w);
    expect(JSON.stringify(w)).toBe(before);
  });
});
