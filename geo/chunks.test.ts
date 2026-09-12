import { describe, expect, it } from 'vitest';
import { buildChunk, chunkBounds, chunkIndex, chunkKeyAt, chunkNeighbors, chunksInBox, hexChunk, union } from './chunks';
import { classify, parsePois, parseRoads } from './osm';
import { gridFixture } from './polygonize.test';
import { toLatLng } from './project';

const origin = { lat: 41.88, lng: -87.63 };

describe('chunk grid', () => {
  it('keys are stable and bounds contain the point', () => {
    const key = chunkKeyAt(origin); const b = chunkBounds(key);
    expect(origin.lat).toBeGreaterThanOrEqual(b.south); expect(origin.lat).toBeLessThan(b.north);
    expect(origin.lng).toBeGreaterThanOrEqual(b.west); expect(origin.lng).toBeLessThan(b.east);
    expect(chunkKeyAt(b.center)).toBe(key);
    expect(chunkNeighbors(key).length).toBe(4);
    const box = chunksInBox(b.south - 0.001, b.west - 0.001, b.north + 0.001, b.east + 0.001);
    expect(box).toContain(key); expect(box.length).toBe(9);
    expect(chunkIndex({ lat: -33.9, lng: 151.2 }).cy).toBeLessThan(0);
  });
});

describe('buildChunk', () => {
  const key = chunkKeyAt(origin); const c = chunkBounds(key).center;
  const make = () => {
    const { pos, lines } = gridFixture(9, { diagonal: true, stub: true });
    for (const p of pos.values()) { p.x -= 400; p.y -= 400; }
    return buildChunk({ key, roads: lines, nodePos: pos, water: [], industrial: [], pois: [
      { id: 'p1', name: 'Blue Anchor', type: 'bar', pos: toLatLng(c, { x: -350, y: -350 }) }, { id: 'p2', type: 'bank', pos: toLatLng(c, { x: 5000, y: 5000 }) },
    ], places: [], minAreaM2: 3000 });
  };
  it('produces linked, named blocks with stable ids', () => {
    const a = make(), b = make();
    expect(a.blocks.length).toBeGreaterThan(50);
    expect(a.blocks.map(x => x.id)).toEqual(b.blocks.map(x => x.id));
    expect(new Set(a.blocks.map(x => x.id)).size).toBe(a.blocks.length);
    for (const blk of a.blocks) {
      expect(blk.neighborIds.length).toBeGreaterThan(0);
      for (const n of blk.neighborIds) expect(a.blocks.find(x => x.id === n)!.neighborIds).toContain(blk.id);
      expect(blk.edgeKeys!.length).toBeGreaterThanOrEqual(3);
      expect(blk.streetNames.length).toBeGreaterThan(0);
    }
    expect(a.pois.length).toBe(1); expect(a.pois[0].blockId).toBeDefined();
  });
  it('drops blocks in water and caps the count', () => {
    const { pos, lines } = gridFixture(9, { diagonal: true });
    for (const p of pos.values()) { p.x -= 400; p.y -= 400; }
    const lake = [{ x: -410, y: -410 }, { x: -190, y: -410 }, { x: -190, y: -190 }, { x: -410, y: -190 }];
    const ch = buildChunk({ key, roads: lines, nodePos: pos, water: [lake], industrial: [], pois: [], places: [], minAreaM2: 100, maxBlocks: 30 });
    expect(ch.blocks.length).toBeLessThanOrEqual(30);
    expect(ch.blocks.every(b => b.areaM2 > 0)).toBe(true);
  });
});

describe('union', () => {
  it('joins two squares sharing an edge into one ring', () => {
    const u = union(['1', '2', '3', '4'], ['2', '5', '6', '3'])!;
    expect(u.length).toBe(6); expect(new Set(u)).toEqual(new Set(['1', '2', '3', '4', '5', '6']));
  });
});

describe('osm parsing', () => {
  it('parses ways with geometry and classifies POIs', () => {
    const roads = parseRoads({ elements: [
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Elm St' }, nodes: [10, 11], geometry: [{ lat: 41.88, lon: -87.63 }, { lat: 41.881, lon: -87.63 }] },
      { type: 'way', id: 2, tags: { highway: 'residential', tunnel: 'yes' }, nodes: [10, 12], geometry: [{ lat: 41.88, lon: -87.63 }, { lat: 41.88, lon: -87.631 }] },
      { type: 'way', id: 3, tags: { natural: 'water' }, nodes: [1, 2, 3, 4, 1], geometry: [{ lat: 41.88, lon: -87.63 }, { lat: 41.881, lon: -87.63 }, { lat: 41.881, lon: -87.631 }, { lat: 41.88, lon: -87.631 }, { lat: 41.88, lon: -87.63 }] },
    ] }, origin);
    expect(roads.roads.length).toBe(1); expect(roads.roads[0].name).toBe('Elm St'); expect(roads.water.length).toBe(1); expect(roads.nodePos.size).toBe(2);
    const pois = parsePois({ elements: [
      { type: 'node', id: 5, lat: 41.88, lon: -87.63, tags: { amenity: 'pub', name: 'The Crown' } },
      { type: 'way', id: 6, center: { lat: 41.88, lon: -87.63 }, tags: { shop: 'pawnbroker', name: 'Ace Pawn' } },
      { type: 'node', id: 7, lat: 41.88, lon: -87.63, tags: { place: 'neighbourhood', name: 'The Loop' } },
      { type: 'node', id: 8, lat: 41.88, lon: -87.63, tags: { amenity: 'bench' } },
    ] });
    expect(pois.pois.map(p => p.type)).toEqual(['bar', 'pawn']); expect(pois.places[0].name).toBe('The Loop');
    expect(classify({ amenity: 'nightclub' })).toBe('nightclub'); expect(classify({ tourism: 'motel' })).toBe('motel');
  });
});

describe('hexChunk', () => {
  it('tiles a chunk with linked hexes', () => {
    const c = hexChunk(chunkKeyAt(origin));
    expect(c.blocks.length).toBeGreaterThan(30);
    expect(c.blocks.every(b => b.neighborIds.length >= 2 && b.polygon.length === 6 && b.edgeKeys!.length === 6)).toBe(true);
  });
});
