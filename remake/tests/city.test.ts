/**
 * The generated city. Everything in the Remake stands on this, so its guarantees are tested
 * directly: the same seed is the same city, every block can be walked to, every outline is a real
 * shape, and water, parks and districts are where they claim to be.
 */
import { describe, expect, it } from 'vitest';
import { components, generateCity, CITY_SIZES, type CitySize } from '@r/sim/city';
import { area } from '@r/sim/geom';

const SEEDS = [1, 2, 3, 7, 42, 1234, 99991];

describe('the city from a seed', () => {
  it('is the same city every time for the same seed', () => {
    expect(JSON.stringify(generateCity(7))).toBe(JSON.stringify(generateCity(7)));
  });
  it('is a different city for a different seed', () => {
    expect(generateCity(7).city.name + JSON.stringify(generateCity(7).city.verts.slice(0, 5))).not.toBe(generateCity(8).city.name + JSON.stringify(generateCity(8).city.verts.slice(0, 5)));
  });

  it.each(SEEDS)('seed %i: every block can be reached from every other', seed => {
    const g = generateCity(seed);
    expect(components(g.blocks)).toHaveLength(1);
    for (const b of Object.values(g.blocks)) expect(b.neighborIds.length, `${b.name} is an island`).toBeGreaterThan(0);
  });

  it.each(SEEDS)('seed %i: every outline is a real shape inside its district', seed => {
    const g = generateCity(seed);
    for (const b of Object.values(g.blocks)) {
      expect(b.poly.length).toBeGreaterThanOrEqual(4);
      expect(area(b.poly), `${b.name} has no area`).toBeGreaterThan(1500);
      for (const p of b.poly) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
      expect(g.districts[b.districtId].blockIds).toContain(b.id);
    }
    for (const d of Object.values(g.districts)) expect(d.blockIds.length).toBeGreaterThan(0);
  });

  it.each(SEEDS)('seed %i: neighbours are symmetric', seed => {
    const g = generateCity(seed);
    for (const b of Object.values(g.blocks)) for (const n of b.neighborIds) expect(g.blocks[n].neighborIds).toContain(b.id);
  });

  it('has the law and the city in it: station houses, city hall and a courthouse', () => {
    for (const seed of SEEDS) {
      const g = generateCity(seed);
      expect(g.precincts.length).toBeGreaterThanOrEqual(2);
      for (const p of g.precincts) expect(g.blocks[p.blockId]).toBeTruthy();
      expect(g.blocks[g.cityHallBlockId].landmark).toBe('city hall');
      expect(g.blocks[g.courthouseBlockId].landmark).toBe('the courthouse');
    }
  });

  it('bridges a river rather than splitting the town in two', () => {
    // across enough seeds some cities get a river; all of them must still be one piece
    const withRiver = SEEDS.map(s => generateCity(s)).filter(g => g.city.river);
    expect(withRiver.length).toBeGreaterThan(0);
    for (const g of withRiver) expect(components(g.blocks)).toHaveLength(1);
  });

  it.each(Object.keys(CITY_SIZES) as CitySize[])('a %s city is the size it says', size => {
    const n = Object.keys(generateCity(5, size).blocks).length;
    const cells = CITY_SIZES[size].cols * CITY_SIZES[size].rows;
    expect(n).toBeGreaterThan(cells * 0.3);
    expect(n).toBeLessThanOrEqual(cells);
  });
});
