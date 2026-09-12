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
    expect(Object.keys(w.blocks).length).toBeGreaterThan(30);
    expect(Object.keys(w.districts).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(w.factions).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(w.businesses).length).toBeGreaterThan(80);
    for (const biz of Object.values(w.businesses)) {
      expect(w.npcs[biz.ownerId]).toBeDefined();
      for (const p of biz.patronIds) expect(w.npcs[p].favouriteBusinessIds).toContain(biz.id);
    }
    const officials = Object.values(w.npcs).filter(n => n.official);
    expect(officials.map(o => o.official!.kind).sort()).toEqual(['captain', 'councillor', 'judge']);
  });
});

import { buildChunk, chunkBounds, chunkKeyAt, hexChunk } from '@geo/chunks';
import { gridFixture } from '@geo/polygonize.test';
import { toLatLng, toXY } from '@geo/project';
import { dispatch, select } from './index';

/** A synthetic OSM chunk: an 11×11 street grid with a diagonal, centred on the chunk that contains `origin`. */
function fixtureChunk(origin: { lat: number; lng: number }, shift = { x: 0, y: 0 }) {
  const key = chunkKeyAt(origin); const c = chunkBounds(key).center;
  const { pos, lines } = gridFixture(11, { diagonal: true });
  const o = toXY(c, origin);
  for (const p of pos.values()) { p.x += o.x - 500 + shift.x; p.y += o.y - 500 + shift.y; }
  const at = (x: number, y: number) => toLatLng(origin, { x, y });
  return buildChunk({
    key, roads: lines, nodePos: pos, water: [], industrial: [[{ x: o.x + 200, y: o.y + 200 }, { x: o.x + 500, y: o.y + 200 }, { x: o.x + 500, y: o.y + 500 }, { x: o.x + 200, y: o.y + 500 }]],
    pois: [
      { id: 'p1', name: 'The Old Crown', type: 'bar', pos: at(-450, -450) }, { id: 'p2', name: 'Barclays', type: 'bank', pos: at(-50, -50) },
      { id: 'p3', name: 'Soho Nights', type: 'nightclub', pos: at(350, -350) }, { id: 'p4', name: 'Ace Motors', type: 'garage', pos: at(350, 350) },
      { id: 'p5', name: 'Golden Dragon', type: 'restaurant', pos: at(-350, 350) }, { id: 'p6', type: 'corner_store', pos: at(-350, 250) },
    ],
    places: [
      { name: 'Mayfair', pos: at(-400, -400), kind: 'neighbourhood' }, { name: 'The City', pos: at(0, 0), kind: 'quarter' },
      { name: 'Soho', pos: at(400, -400), kind: 'neighbourhood' }, { name: 'Docklands', pos: at(400, 400), kind: 'suburb' }, { name: 'Chinatown', pos: at(-400, 400), kind: 'neighbourhood' },
    ],
    minAreaM2: 3000,
  });
}

describe('generateWorld from an OSM-style chunk', () => {
  const origin = chunkBounds(chunkKeyAt({ lat: 51.5074, lng: -0.1278 })).center;
  const chunk = fixtureChunk(origin);
  it('uses real blocks, names, neighbourhoods and businesses', () => {
    const w = generateWorld({ origin, placeName: 'London', playerName: 'T', background: 'brains', seed: 3, chunk });
    expect(w.mapSource).toBe('osm');
    expect(Object.keys(w.blocks).length).toBe(chunk.blocks.length);
    expect(Object.values(w.districts).map(d => d.name).sort()).toEqual(['Chinatown', 'Docklands', 'Mayfair', 'Soho', 'The City']);
    expect(Object.values(w.districts).filter(d => d.kind === 'downtown').length).toBe(1);
    const real = Object.values(w.businesses).filter(b => b.flags.includes('real')).map(b => b.name).sort();
    expect(real).toEqual(['Ace Motors', 'Barclays', 'Golden Dragon', 'Soho Nights', 'The Old Crown']);
    expect(Object.values(w.blocks).every(b => b.name.includes('&') || b.name.includes('block'))).toBe(true);
    expect(Object.values(w.blocks).every(b => b.neighborIds.length > 0 && b.polygon.length >= 3 && b.edgeKeys.length >= 3)).toBe(true);
    expect(select.startBlock(w).businessIds.length).toBeGreaterThan(0);
    expect(Object.keys(w.factions).length).toBeGreaterThanOrEqual(2);
  });
  it('plays 30 days without breaking', () => {
    let w = generateWorld({ origin, placeName: 'London', playerName: 'T', background: 'brains', seed: 3, chunk });
    for (let d = 0; d < 30; d++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
    expect(w.day).toBe(31);
    expect(Object.values(w.factions).reduce((s, f) => s + select.blocksOf(w, f.id).length, 0)).toBeGreaterThan(4);
  });
  it('populates a neighbouring hex chunk and links it across the border', () => {
    let w = generateWorld({ origin, placeName: 'London', playerName: 'T', background: 'brains', seed: 3, chunk: hexChunk(chunkKeyAt(origin)) });
    const before = Object.keys(w.blocks).length;
    const [cx, cy] = chunkKeyAt(origin).split('_').map(Number);
    const east = hexChunk(`${cx + 1}_${cy}`);
    w = dispatch(w, { type: 'populate_chunk', chunk: east });
    expect(Object.keys(w.blocks).length).toBe(before + east.blocks.length);
    expect(w.chunks[east.key]).toBeDefined();
    // second time is a no-op
    const again = dispatch(w, { type: 'populate_chunk', chunk: east });
    expect(Object.keys(again.blocks).length).toBe(Object.keys(w.blocks).length);
    // every new block has a district and some businesses; ids are stable hex ids
    for (const b of east.blocks) { expect(w.blocks[b.id].districtId).toBeTruthy(); expect(w.districts[w.blocks[b.id].districtId].chunkKey).toBe(east.key); }
    for (let d = 0; d < 5; d++) { for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id }); w = dispatch(w, { type: 'end_day' }); }
    expect(w.day).toBe(6);
  });
});
