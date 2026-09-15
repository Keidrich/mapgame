/**
 * What a business looks like on the map, and when.
 *
 * Two contracts, both of which are the kind that quietly rot:
 *
 *  - **the handover.** Below `MARKER_BLOCK_PX` of on-screen block width the icons collapse to a
 *    count badge. The number is a balance between "you can see what is there" and "the chips
 *    overlap each other", and the test below holds the *relationship* — a block must stay
 *    comfortably wider than the chip sitting in it — rather than the literal number, so tuning it
 *    is allowed and shrinking it until the map is soup is not.
 *  - **tier colour.** Every rung of the ladder has to have a hue and a legend row. This is
 *    exactly the kind of thing that ships fine and then goes half-missing the day somebody adds a
 *    tier 5 — which has happened once already with business icons.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIERS } from '@content/businesses';
import { generateWorld } from '@sim/generate';
import { MARKER_BLOCK_PX } from './components/Map';
import { legendKeys } from './App';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const tiers = Object.keys(TIERS).map(Number);

describe('when icons give way to a count', () => {
  it('leaves a block at least twice the width of the chip standing in it', () => {
    // The chip is 26px in the HUD skin, 28px in the base one. Any threshold that does not clear
    // twice the larger of those puts a marker over its own block's edges, and on a busy block the
    // ring of them ends up drawn on the neighbours.
    const CHIP_PX = 28;
    expect(MARKER_BLOCK_PX).toBeGreaterThanOrEqual(CHIP_PX * 2);
  });

  it('shows them further out than the old full-block threshold', () => {
    // 96 was a block filling most of a phone's width: you had to be on top of one street before
    // the map showed you anything. This is the regression guard for going back to that.
    expect(MARKER_BLOCK_PX).toBeLessThan(96);
  });
});

describe('tier colour', () => {
  it('every rung of the ladder has a hue', () => {
    for (const t of tiers) {
      expect(css, `--tier-${t} is not defined`).toContain(`--tier-${t}:`);
      expect(css, `--tier-${t}-line is not defined`).toContain(`--tier-${t}-line:`);
    }
  });

  it('every rung has a marker rule that uses it', () => {
    for (const t of tiers) {
      expect(css, `.biz-marker.t${t} has no rule`).toMatch(new RegExp(`\\.biz-marker\\.t${t}\\s*\\{`));
    }
  });

  it('no tier borrows gold or law blue, which already mean something else on this map', () => {
    // gold is always "yours" and blue is always the law. A tier wearing either is a marker that
    // reads as a claim about ownership or about the police.
    const taken = ['#f5c542', '#f2c94c', '#4d8df6', '#58a6f0'];
    for (const t of tiers) {
      const hue = css.match(new RegExp(`--tier-${t}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();
      expect(hue, `--tier-${t} has no hex value`).toBeTruthy();
      expect(taken, `--tier-${t} is a colour the map has already spent`).not.toContain(hue);
    }
  });

  it('and the legend names every one of them, so the colours are not a private joke', () => {
    const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 4 });
    const keys = legendKeys(w);
    expect(keys.places.map(p => p.name)).toEqual(tiers.map(t => TIERS[t as 1].label));
    // and the two keys stay separate: territory is a filled swatch, a tier is an outlined one,
    // and a legend that merged them would be claiming a shop is an outfit.
    expect(keys.ground.map(g => g.id)).not.toEqual(expect.arrayContaining(keys.places.map(p => p.id)));
  });
});
