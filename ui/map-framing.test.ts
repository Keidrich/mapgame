/**
 * How the map decides what you are looking at when a city loads.
 *
 * The bug this pins: the map used to `jumpTo` the world origin at a hard-coded zoom 15.2. The
 * origin is where the *player* starts, not the middle of anything, and 15.2 was chosen against a
 * phone — so on an iPad in landscape the whole city sat in the top third of the screen with half
 * the viewport black underneath it. A constant that has never seen a screen cannot frame one.
 *
 * `cityFrame` is pure precisely so this file can exist: the interesting failure is a padding box
 * that does not fit inside the canvas, which MapLibre answers by **refusing the entire `fitBounds`
 * call** — the view simply stays wherever it was and nothing says why. That is invisible to a
 * screenshot on the size you happened to test and fatal on the size you did not.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '@sim/generate';
import { cityFrame } from './components/Map';
import type { World } from '@sim/types';

const world = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 4 });

/** Real devices, plus the two shapes that broke: a very short map and a very narrow one. */
const SCREENS: [string, number, number][] = [
  ['iPhone portrait', 390, 844],
  ['iPhone landscape', 844, 390],
  ['iPad mini', 744, 1133],
  ['iPad portrait', 820, 1180],
  ['iPad landscape', 1180, 820],
  ['iPad Pro', 1366, 1024],
  ['iPad split view', 507, 1180],
  ['a phone with the keyboard up', 390, 260],
  ['something absurd', 320, 100],
];

describe('framing the city', () => {
  it.each(SCREENS)('keeps the padding inside the canvas on %s', (_name, width, height) => {
    const f = cityFrame(world, { width, height });
    expect(f).not.toBeNull();
    const p = f!.padding;
    // MapLibre throws `Map#fitBounds: padding must not exceed the canvas` and does nothing at all,
    // so "fits" has to mean strictly — not "usually fits on the sizes we tried".
    expect(p.top + p.bottom).toBeLessThan(height);
    expect(p.left + p.right).toBeLessThan(width);
    for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('frames every block that exists, not the point the player starts on', () => {
    const f = cityFrame(world, { width: 1180, height: 820 })!;
    const [[west, south], [east, north]] = f.bounds;
    for (const b of Object.values(world.blocks)) {
      expect(b.center.lng).toBeGreaterThanOrEqual(west);
      expect(b.center.lng).toBeLessThanOrEqual(east);
      expect(b.center.lat).toBeGreaterThanOrEqual(south);
      expect(b.center.lat).toBeLessThanOrEqual(north);
    }
    // And the origin is genuinely not the middle — which is the whole reason centring on it was
    // wrong. If this ever stops being true the bug is gone for a reason nobody wrote down.
    const offCentre = Math.abs(world.origin.lng - (west + east) / 2) / (east - west);
    expect(offCentre).toBeGreaterThan(0.01);
  });

  it('gives a bigger screen more of the city rather than more empty space', () => {
    // The padding is a *share* of the viewport, so the fraction of the screen left for the city
    // never shrinks as the screen grows. That is the property the old fixed zoom did not have.
    const phone = cityFrame(world, { width: 390, height: 844 })!;
    const pad = cityFrame(world, { width: 1366, height: 1024 })!;
    const usable = (f: NonNullable<ReturnType<typeof cityFrame>>, w: number, h: number) =>
      ((w - f.padding.left - f.padding.right) * (h - f.padding.top - f.padding.bottom)) / (w * h);
    expect(usable(pad, 1366, 1024)).toBeGreaterThanOrEqual(usable(phone, 390, 844) - 1e-9);
  });

  it('will not zoom past street level for a city too small to fill the screen', () => {
    // Otherwise a two-block starter city on an iPad Pro fits itself to the rooftops.
    expect(cityFrame(world, { width: 1366, height: 1024 })!.maxZoom).toBeLessThanOrEqual(17);
  });

  it('hands back nothing when there is no shape to fit, so the caller falls back to a point', () => {
    expect(cityFrame(null, { width: 820, height: 1180 })).toBeNull();
    const oneBlock = { ...world, blocks: { a: Object.values(world.blocks)[0] } } as World;
    expect(cityFrame(oneBlock, { width: 820, height: 1180 })).toBeNull();
  });
});

describe('what is already open when the map appears', () => {
  // The other half of the tablet bug: the legend opened itself above 700px "for desktop", so on
  // every tablet a panel covered the top-left of the map — the same corner as the grid-city
  // banner — from the moment the game loaded. Nothing that sits over the map may decide whether
  // it is open by measuring the window; a tablet is not a desktop and neither is a rotated phone.
  //
  // The check is deliberately blunt — App.tsx is nothing but the shell and the things that sit on
  // top of the map, so there is no legitimate reason for anything in it to measure the window.
  it('does not open a map overlay by guessing from the viewport width', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/innerWidth/);
  });
});
