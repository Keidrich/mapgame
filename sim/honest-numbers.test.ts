/**
 * A number in a log line has to be the number that happened.
 *
 * This exists because it did not. `addHeat` puts five multipliers between what a caller asks for
 * and what the player's heat bar does — working alone, bought legitimacy, the hour, home turf, a
 * school on the corner — and every call site printed its own argument. A 16-heat job on a quiet
 * night announced "+16 heat" and moved the bar by 9. Every clamped stat had the same hole at its
 * ceiling: "+25 loyalty" at 96 is +4, "−15 heat" at 5 is −5.
 *
 * The rule the whole file enforces: **the mutators return what landed, and log lines print that.**
 * The grep test at the bottom is the one that stops this coming back, because the failure mode is
 * somebody adding a new line next year with a hardcoded figure in it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGITIMACY } from '@content/fortune';
import { generateWorld, type World } from './index';
import { addHeat, bumpLoyalty, gainFear, gainRespect, heatMult, heatNote, loseHeat, statNote } from './util';

const mk = (seed = 21): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
  w.pendingEvents = [];
  return w;
};

describe('addHeat says what it did', () => {
  it('returns the figure the bar actually moved by, not the one it was handed', () => {
    const w = mk();
    w.player.heat = 0;
    const asked = 16;
    const got = addHeat(w, asked);
    expect(got).toBeCloseTo(w.player.heat, 6);
    // the bot's own reported bug: a lone wolf at 09:00 does not take the full figure
    expect(got).toBeLessThan(asked);
    expect(got).toBeCloseTo(asked * heatMult(w), 6);
  });

  it('is honest at the ceiling: a big hit at 98 reports what fitted', () => {
    const w = mk();
    w.player.heat = 98;
    expect(addHeat(w, 40)).toBeCloseTo(2, 6);
    expect(w.player.heat).toBe(100);
  });

  it('and at the floor, coming off: −15 at heat 5 is −5', () => {
    const w = mk();
    w.player.heat = 5;
    expect(loseHeat(w, 15)).toBe(-5);
    expect(w.player.heat).toBe(0);
  });

  it('never returns more than was asked for', () => {
    const w = mk();
    for (const ask of [1, 6, 10, 16, 30]) {
      w.player.heat = 0;
      expect(addHeat(w, ask), `asking for ${ask}`).toBeLessThanOrEqual(ask);
    }
  });
});

describe('the multiplier stack is one piece of arithmetic, not two copies', () => {
  it('addHeat applies exactly heatMult', () => {
    const w = mk();
    w.player.heat = 0;
    const m = heatMult(w);
    expect(addHeat(w, 20)).toBeCloseTo(20 * m, 6);
  });

  it('and never discounts past the floor, however much is stacked on it', () => {
    const w = mk();
    w.player.legitimacy = LEGITIMACY.cap;   // respectable
    w.hour = 2;                              // and out at night
    expect(heatMult(w)).toBeGreaterThanOrEqual(LEGITIMACY.heatFloor);
  });
});

describe('the clamped stats report what landed', () => {
  it('loyalty at the ceiling', () => {
    const w = mk();
    const n = Object.values(w.npcs)[0];
    n.crew = { status: 'idle', loyalty: 96, cut: 0, joinedDay: 1 } as never;
    expect(bumpLoyalty(n, 25)).toBe(4);
  });

  it('loyalty on somebody who does not work for you is nothing, not a crash', () => {
    const w = mk();
    expect(bumpLoyalty(Object.values(w.npcs).find(x => !x.crew), 10)).toBe(0);
    expect(bumpLoyalty(undefined, 10)).toBe(0);
  });

  it('the player\'s own fear and respect', () => {
    const w = mk();
    w.player.fear = 97; w.player.respect = 100;
    expect(gainFear(w, 10)).toBe(3);
    expect(gainRespect(w, 10)).toBe(0);
  });
});

describe('the note a log line prints', () => {
  it('rounds, signs, and says nothing at all when nothing moved', () => {
    expect(heatNote(9.4)).toBe(' (+9 heat)');
    expect(heatNote(-5)).toBe(' (−5 heat)');
    expect(heatNote(0)).toBe('');
    expect(heatNote(0.2)).toBe('');           // rounds to nothing, so prints nothing
    expect(statNote(4, 'loyalty')).toBe(' (+4 loyalty)');
  });
});

describe('no log line anywhere prints a figure it made up', () => {
  // The regression guard. Every one of these was a lie when this file was written, and the only
  // thing that stops a new one appearing is a test that reads the source.
  const files = ['sim', 'content', 'ui'].flatMap(dir => {
    const walk = (d: string): string[] => readdirSync(new URL(`../${d}/`, import.meta.url), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    return walk(dir);
  }).filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'));

  it('finds no hardcoded heat, loyalty, fear or respect delta in a string', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (f === 'sim/util.ts') return;                     // the helpers' own doc comments
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        const m = line.match(/\([^)]*[+−-]\d+ (heat|loyalty|fear|respect)[^)]*\)/);
        if (m) bad.push(`${f}:${i + 1}  ${m[0]}`);
      });
    }
    expect(bad, `print what the mutator returned instead:\n${bad.join('\n')}`).toEqual([]);
  });
});
