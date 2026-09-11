import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';

const opts = { origin: { lat: 40.7128, lng: -74.006 }, placeName: 'Test City', playerName: 'Tester', background: 'charm' as const, seed: 42 };

describe('generateWorld', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(opts), b = generateWorld(opts);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
  it('builds a full city', () => {
    const w = generateWorld(opts);
    expect(Object.keys(w.blocks).length).toBe(127);
    expect(Object.keys(w.districts).length).toBe(7);
    expect(Object.keys(w.factions).length).toBe(4);
    expect(Object.keys(w.businesses).length).toBeGreaterThan(200);
    for (const biz of Object.values(w.businesses)) {
      expect(w.npcs[biz.ownerId]).toBeDefined();
      for (const p of biz.patronIds) expect(w.npcs[p].favouriteBusinessIds).toContain(biz.id);
    }
    const officials = Object.values(w.npcs).filter(n => n.official);
    expect(officials.map(o => o.official!.kind).sort()).toEqual(['captain', 'councillor', 'judge']);
  });
});

import { buildCity } from '@geo/blocks';
import { gridFixture } from '@geo/polygonize.test';
import { toLatLng } from '@geo/project';
import { dispatch, select } from './index';

describe('generateWorld from an OSM-style city', () => {
  const origin = { lat: 51.5074, lng: -0.1278 };
  const { pos, lines } = gridFixture(11, { diagonal: true });
  for (const p of pos.values()) { p.x -= 500; p.y -= 500; }
  const at = (x: number, y: number) => toLatLng(origin, { x, y });
  const city = buildCity({
    origin, roads: lines, nodePos: pos, water: [], industrial: [[{ x: 200, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 500 }, { x: 200, y: 500 }]],
    pois: [
      { id: 'p1', name: 'The Old Crown', type: 'bar', pos: at(-450, -450) }, { id: 'p2', name: 'Barclays', type: 'bank', pos: at(-50, -50) },
      { id: 'p3', name: 'Soho Nights', type: 'nightclub', pos: at(350, -350) }, { id: 'p4', name: 'Ace Motors', type: 'garage', pos: at(350, 350) },
      { id: 'p5', name: 'Golden Dragon', type: 'restaurant', pos: at(-350, 350) }, { id: 'p6', type: 'corner_store', pos: at(-350, 250) },
    ],
    places: [
      { name: 'Mayfair', pos: at(-400, -400), kind: 'neighbourhood' }, { name: 'The City', pos: at(0, 0), kind: 'quarter' },
      { name: 'Soho', pos: at(400, -400), kind: 'neighbourhood' }, { name: 'Docklands', pos: at(400, 400), kind: 'suburb' }, { name: 'Chinatown', pos: at(-400, 400), kind: 'neighbourhood' },
    ],
    radiusM: 900, minAreaM2: 3000,
  });
  it('uses real blocks, names, neighbourhoods and businesses', () => {
    const w = generateWorld({ origin, placeName: 'London', playerName: 'T', background: 'brains', seed: 3, city });
    expect(w.mapSource).toBe('osm');
    expect(Object.keys(w.blocks).length).toBe(city.blocks.length);
    const names = Object.values(w.districts).map(d => d.name).sort();
    expect(names).toEqual(['Chinatown', 'Docklands', 'Mayfair', 'Soho', 'The City']);
    const kinds = Object.values(w.districts).map(d => d.kind);
    expect(kinds.filter(k => k === 'downtown').length).toBe(1);
    const real = Object.values(w.businesses).filter(b => b.flags.includes('real')).map(b => b.name).sort();
    expect(real).toEqual(['Ace Motors', 'Barclays', 'Golden Dragon', 'Soho Nights', 'The Old Crown']);
    expect(Object.values(w.blocks).every(b => b.name.includes('&') || b.name.includes('block'))).toBe(true);
    expect(Object.values(w.blocks).every(b => b.neighborIds.length > 0 && b.polygon.length >= 3)).toBe(true);
    const start = select.startBlock(w);
    expect(start.businessIds.length).toBeGreaterThan(0);
  });
  it('plays 30 days without breaking', () => {
    let w = generateWorld({ origin, placeName: 'London', playerName: 'T', background: 'brains', seed: 3, city });
    for (let d = 0; d < 30; d++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
    expect(w.day).toBe(31);
    expect(Object.values(w.factions).reduce((s, f) => s + select.blocksOf(w, f.id).length, 0)).toBeGreaterThan(4);
  });
});
