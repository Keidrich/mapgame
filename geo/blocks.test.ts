import { describe, expect, it } from 'vitest';
import { buildCity, union } from './blocks';
import { gridFixture } from './polygonize.test';
import { parsePois, parseRoads, classify, roadsQuery } from './osm';
import { hexCity } from './hexcity';
import { toLatLng } from './project';

const origin = { lat: 41.88, lng: -87.63 };

describe('buildCity', () => {
  it('turns a street grid into blocks with neighbours, names and POIs', () => {
    const { pos, lines } = gridFixture(7, { diagonal: true, stub: true });
    // recentre so the grid surrounds the origin
    for (const p of pos.values()) { p.x -= 300; p.y -= 300; }
    const city = buildCity({
      origin, roads: lines, nodePos: pos, water: [], industrial: [],
      pois: [{ id: 'p1', name: 'Blue Anchor', type: 'bar', pos: toLatLng(origin, { x: -250, y: -250 }) }, { id: 'p2', type: 'bank', pos: toLatLng(origin, { x: 5000, y: 5000 }) }],
      places: [], radiusM: 1000, minAreaM2: 3000,
    });
    // 36 cells, 6 halved by the diagonal → 42 faces; halves are 5000 m² > minArea so nothing merges
    expect(city.blocks.length).toBe(42);
    for (const b of city.blocks) {
      expect(b.neighborIds.length).toBeGreaterThan(0);
      for (const n of b.neighborIds) expect(city.blocks.find(x => x.id === n)!.neighborIds).toContain(b.id);
      expect(b.streetNames.length).toBeGreaterThan(0);
      expect(b.polygon.length).toBeGreaterThanOrEqual(3);
    }
    expect(city.pois.length).toBe(1);
    expect(city.pois[0].blockId).toBeDefined();
    expect(city.blocks.find(b => b.id === city.pois[0].blockId)!.streetNames).toContain('Avenue 0');
  });
  it('merges slivers and respects the block cap', () => {
    const { pos, lines } = gridFixture(9, { diagonal: true });
    for (const p of pos.values()) { p.x -= 400; p.y -= 400; }
    const city = buildCity({ origin, roads: lines, nodePos: pos, water: [], industrial: [], pois: [], places: [], radiusM: 2000, minAreaM2: 6000, maxBlocks: 40 });
    expect(city.blocks.length).toBeLessThanOrEqual(40);
    // no halves left: everything is at least minArea
    for (const b of city.blocks) expect(b.areaM2).toBeGreaterThanOrEqual(6000 - 1);
  });
  it('drops blocks in water', () => {
    const { pos, lines } = gridFixture(5);
    for (const p of pos.values()) { p.x -= 200; p.y -= 200; }
    const lake = [{ x: -210, y: -210 }, { x: -90, y: -210 }, { x: -90, y: -90 }, { x: -210, y: -90 }];
    const city = buildCity({ origin, roads: lines, nodePos: pos, water: [lake], industrial: [], pois: [], places: [], radiusM: 1000, minAreaM2: 100 });
    expect(city.blocks.length).toBe(15);
  });
});

describe('union', () => {
  it('joins two squares sharing an edge into one ring', () => {
    const a = ['1', '2', '3', '4'], b = ['2', '5', '6', '3'];
    // a: 1→2→3→4 ; b: 2→5→6→3 shares edge 2-3 (a has 2→3, b has 3→2)
    const u = union(a, b)!;
    expect(u.length).toBe(6);
    expect(new Set(u)).toEqual(new Set(['1', '2', '3', '4', '5', '6']));
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
    expect(roadsQuery(origin, 1500)).toMatch(/\[out:json\].*way\["highway"~.*out geom;/);
  });
});

describe('hexCity', () => {
  it('produces the same shape as an OSM city', () => {
    const c = hexCity(origin);
    expect(c.blocks.length).toBe(127);
    expect(c.blocks.every(b => b.neighborIds.length >= 3 && b.polygon.length === 6)).toBe(true);
  });
});
