import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BIG_CITIES } from '@content/cities';
import { distanceM } from '@geo/project';
import { JITTER_HARD_CAP_M, JITTER_MIN_M, SECTOR_LABELS, boxSpanM, jitterOrigin, placePrecision, shouldJitter } from './start';
import { Rng } from './rng';

const TOKYO = { lat: 35.6762, lng: 139.6503 };
const REYKJAVIK = { lat: 64.1466, lng: -21.9426 }; // high latitude: longitude metres shrink

describe('starting somewhere else in the same city', () => {
  it('lands a few km out, never on the pin and never out of town', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = jitterOrigin(TOKYO, new Rng(seed));
      const d = distanceM(TOKYO, c.origin);
      expect(d).toBeGreaterThanOrEqual(JITTER_MIN_M - 1);
      expect(d).toBeLessThanOrEqual(JITTER_HARD_CAP_M);
      expect(Math.abs(d - c.distanceM)).toBeLessThan(50); // the reported distance is the real one
      expect(SECTOR_LABELS).toContain(c.label.replace('the ', '').replace(' side', ''));
    }
  });

  it('holds the radius at any latitude', () => {
    for (let seed = 0; seed < 100; seed++) {
      const d = distanceM(REYKJAVIK, jitterOrigin(REYKJAVIK, new Rng(seed)).origin);
      expect(d).toBeGreaterThanOrEqual(JITTER_MIN_M - 1);
      expect(d).toBeLessThanOrEqual(JITTER_HARD_CAP_M);
    }
  });

  it('respects a tighter cap for a smaller place, and never exceeds the hard cap', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(distanceM(TOKYO, jitterOrigin(TOKYO, new Rng(seed), { maxM: 1500 }).origin)).toBeLessThanOrEqual(1600);
      expect(distanceM(TOKYO, jitterOrigin(TOKYO, new Rng(seed), { maxM: 50000 }).origin)).toBeLessThanOrEqual(JITTER_HARD_CAP_M);
    }
  });

  it('spreads across the whole compass, so replays are different corners', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 80; seed++) seen.add(jitterOrigin(TOKYO, new Rng(seed)).sector);
    expect(seen.size).toBe(SECTOR_LABELS.length);
  });

  it('never gives back the corner you are already in', () => {
    for (let seed = 0; seed < 200; seed++) {
      const first = jitterOrigin(TOKYO, new Rng(seed));
      const again = jitterOrigin(TOKYO, new Rng(seed + 1000), { avoidSector: first.sector });
      expect(again.sector).not.toBe(first.sector);
      expect(again.sector).toBeGreaterThanOrEqual(0);
      expect(again.sector).toBeLessThan(SECTOR_LABELS.length);
    }
  });

  it('is deterministic for a seed, and different across seeds', () => {
    expect(jitterOrigin(TOKYO, new Rng(42))).toEqual(jitterOrigin(TOKYO, new Rng(42)));
    expect(jitterOrigin(TOKYO, new Rng(42)).origin).not.toEqual(jitterOrigin(TOKYO, new Rng(43)).origin);
  });
});

describe('what gets moved and what does not', () => {
  it('moves city-level picks only', () => {
    expect(shouldJitter('city')).toBe(true);
    expect(shouldJitter('exact')).toBe(false);
    expect(shouldJitter('device')).toBe(false);
  });

  it('reads a geocoder row: a city is a city, an address is an address', () => {
    expect(placePrecision({ class: 'place', type: 'city' })).toBe('city');
    expect(placePrecision({ class: 'place', type: 'town' })).toBe('city');
    expect(placePrecision({ class: 'boundary', type: 'administrative' })).toBe('city');
    expect(placePrecision({ class: 'place', type: 'house', addresstype: 'house' })).toBe('exact');
    expect(placePrecision({ class: 'highway', type: 'residential' })).toBe('exact');
    expect(placePrecision({ class: 'amenity', type: 'restaurant' })).toBe('exact');
    expect(placePrecision({ class: 'place', type: 'neighbourhood' })).toBe('exact');
    expect(placePrecision(undefined)).toBe('exact');
  });

  it('measures a bounding box, or says it cannot', () => {
    expect(boxSpanM(['51.28', '51.69', '-0.51', '0.33'])!).toBeGreaterThan(40000);
    expect(boxSpanM(['51.5', '51.5005', '-0.12', '-0.1195'])!).toBeLessThan(100);
    expect(boxSpanM(undefined)).toBeUndefined();
    expect(boxSpanM(['nope'])).toBeUndefined();
  });
});

describe('the random city pool', () => {
  it('is big, unique, and spread across the inhabited world', () => {
    expect(BIG_CITIES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(BIG_CITIES.map(c => c.name)).size).toBe(BIG_CITIES.length);
    for (const c of BIG_CITIES) {
      expect(Math.abs(c.lat), c.name).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lng), c.name).toBeLessThanOrEqual(180);
    }
    // every inhabited continent, by rough lat/lng box
    const has = (f: (c: { lat: number; lng: number }) => boolean) => BIG_CITIES.some(f);
    expect(has(c => c.lat > 15 && c.lng < -50), 'North America').toBe(true);
    expect(has(c => c.lat < 12 && c.lng < -35), 'South America').toBe(true);
    expect(has(c => c.lat > 35 && c.lng > -12 && c.lng < 45), 'Europe').toBe(true);
    expect(has(c => c.lat < 35 && c.lat > -35 && c.lng > -20 && c.lng < 52), 'Africa').toBe(true);
    expect(has(c => c.lng > 60 && c.lat > 0), 'Asia').toBe(true);
    expect(has(c => c.lat < -20 && c.lng > 110), 'Oceania').toBe(true);
    expect(BIG_CITIES.filter(c => c.lng < -50 && c.lat > 15).length).toBeLessThan(BIG_CITIES.length / 2); // not a US tour
  });
});

describe('the onboarding screen', () => {
  const src = readFileSync(new URL('../ui/components/Onboarding.tsx', import.meta.url), 'utf8');

  it('only ever jitters behind the shouldJitter guard', () => {
    expect(src.match(/jitterOrigin\(/g)?.length).toBe(1);
    const fn = src.slice(src.indexOf('function toCorner'), src.indexOf('export function Onboarding'));
    expect(fn).toMatch(/if \(!shouldJitter\(p\.precision\)\) return p;/);
    expect(fn.indexOf('shouldJitter')).toBeLessThan(fn.indexOf('jitterOrigin'));
  });

  it('marks the device and a tapped or typed address as exact, so they are never moved', () => {
    expect(src).toMatch(/name: 'Where you are', precision: 'device'/);
    expect(src).toMatch(/onPick=\{\(lat, lng\) => setPlace\(\{ lat, lng, name: `\$\{lat\.toFixed\(3\)\}, \$\{lng\.toFixed\(3\)\}`, precision: 'exact' \}\)\}/);
    // a search row's precision comes from the geocoder, never hardcoded
    expect(src).toMatch(/precision: placePrecision\(r\)/);
    const cityMarks = src.split('\n').filter(l => l.includes("precision: 'city'"));
    expect(cityMarks.length).toBe(1);                 // only one place claims 'city' outright:
    expect(cityMarks[0]).toMatch(/\.\.\.c/);           // the random big-city button
  });

  it('offers a re-roll that avoids the corner you are in', () => {
    expect(src).toMatch(/toCorner\(p, p\.sector\)/);
    expect(src).toMatch(/Try a different corner of/);
  });
});
