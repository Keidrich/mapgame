import { describe, expect, it } from 'vitest';
import { buildingHeight, metres, parseRealCity, type OsmGeometryElement } from './realCity';

const origin = { lat: 40.719, lng: -73.9865 };
const box: [number, number, number, number] = [40.713, -73.995, 40.725, -73.978];
const points = [[40.719, -73.9865], [40.719, -73.986], [40.7195, -73.986], [40.7195, -73.9865], [40.719, -73.9865]].map(([lat, lon]) => ({ lat, lon }));
const parse = (e: OsmGeometryElement[]) => parseRealCity(e, origin, box, '2026-10-09');
describe('real geography adapter', () => {
  it('converts tagged height units and labels fallback heights honestly', () => {
    expect(metres('100 ft')).toBeCloseTo(30.48);
    expect(metres('12;15')).toBeUndefined();
    expect(buildingHeight({ height: '24 m', 'building:levels': '9' })).toEqual({ height: 24, minHeight: 0, heightSource: 'measured' });
    expect(buildingHeight({ 'building:levels': '6' }).height).toBeCloseTo(19.2);
    expect(buildingHeight({ height: 'unknown' }).heightSource).toBe('estimated');
    expect(buildingHeight({ height: '8', min_height: '20' }).minHeight).toBe(7);
  });
  it('preserves geographic scale with north up and stable source identities', () => {
    const b = parse([{ type: 'way', id: 4, tags: { building: 'yes', 'addr:housenumber': '10', 'addr:street': 'Orchard Street' }, geometry: points }]).buildings[0];
    expect(b.id).toBe('osm:way:4');
    expect(b.address).toBe('10 Orchard Street');
    expect(b.rings[0][1].x).toBeCloseTo(42.18, 0);
    expect(b.rings[0][2].y).toBeCloseTo(-55.66, 1);
    expect(b.rings[0]).toHaveLength(4);
  });
  it('assembles reversed relation members and keeps courtyard holes without duplicate buildings', () => {
    const hole = points.map(p => ({ lat: 40.71925 + (p.lat - 40.71925) / 3, lon: -73.98625 + (p.lon + 73.98625) / 3 }));
    const city = parse([
      { type: 'way', id: 1, tags: { building: 'yes' }, geometry: points },
      { type: 'relation', id: 9, tags: { building: 'apartments' }, members: [
        { type: 'way', ref: 1, role: 'outer', geometry: points.slice(0, 3) },
        { type: 'way', ref: 2, role: 'outer', geometry: points.slice(2).reverse() },
        { type: 'way', ref: 3, role: 'inner', geometry: hole },
      ] },
    ]);
    expect(city.buildings).toHaveLength(1);
    expect(city.buildings[0].rings).toHaveLength(2);
  });
  it('drops incomplete and invalid footprints, without losing a valid member of a broken relation', () => {
    const city = parse([
      { type: 'way', id: 1, tags: { building: 'yes' }, geometry: points },
      { type: 'way', id: 2, tags: { building: 'yes' }, geometry: points.slice(0, 3) },
      { type: 'way', id: 3, tags: { building: 'yes' }, geometry: [{ lat: NaN, lon: 0 }, ...points] },
      { type: 'relation', id: 9, tags: { building: 'yes' }, members: [{ type: 'way', ref: 1, role: 'outer', geometry: points.slice(0, 2) }] },
    ]);
    expect(city.buildings.map(b => b.id)).toEqual(['osm:way:1']);
  });
});
