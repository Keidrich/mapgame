import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RealCity } from '@geo/realCity';
import { pointInRing } from '@geo/project';
import { geographyId, newRealCityWorld, realCityGeography, repairRealCityPlaces, placeFits } from '@r/sim/realCity';
import { can, dispatch, newWorld, select } from '@r/sim/index';
import { generateCity } from '@r/sim/city';
import { decodeSave, REAL_SAVE_DB } from '@r/ui/real-city/save';
const city = JSON.parse(readFileSync('public/data/lower-east-side.json', 'utf8')) as RealCity;

describe('real neighborhood', () => {
  it('uses one connected street-face graph, with symmetric real boundaries', () => {
    const { gen } = realCityGeography(city), blocks = Object.values(gen.blocks), seen = new Set([blocks[0].id]), queue = [blocks[0].id];
    for (let i = 0; i < queue.length; i++) for (const n of gen.blocks[queue[i]].neighborIds) {
      expect(gen.blocks[n].neighborIds).toContain(queue[i]);
      const here = gen.blocks[queue[i]].poly, there = gen.blocks[n].poly;
      expect(here.filter(p => there.some(q => Math.hypot(p.x - q.x, p.y - q.y) < .02)).length).toBeGreaterThanOrEqual(2);
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    expect(seen.size).toBe(blocks.length); expect(blocks.length).toBe(24);
    expect(Object.values(gen.districts).every(d => d.blockIds.length >= 6)).toBe(true);
  });
  it('keeps seeded identities stable when source arrays are reordered', () => {
    const reordered = { ...city, streets: [...city.streets].reverse(), buildings: [...city.buildings].reverse() };
    expect(geographyId(reordered)).toBe(geographyId(city));
    expect(newRealCityWorld(reordered)).toEqual(newRealCityWorld(city));
    const changed = structuredClone(city); changed.buildings[0].rings[0][0].x += 1;
    expect(geographyId(changed)).not.toBe(geographyId(city));
  });
  it('binds fictional places to actual footprints inside their game block', () => {
    const w = newRealCityWorld(city);
    for (const b of Object.values(w.businesses)) {
      const footprint = city.buildings.find(x => x.id === b.buildingId)!;
      expect(footprint).toBeDefined(); expect(b.pos).toEqual(footprint.center);
      expect(pointInRing(footprint.center, w.blocks[b.blockId].poly)).toBe(true);
      expect(select.businessesAtBuilding(w, footprint.id)).toContain(b);
    }
    expect(city.buildings.length).toBeGreaterThan(Object.keys(w.businesses).length * 50);
  });
  it('restores actions and stable place identities and rejects incompatible saves', () => {
    let w = newRealCityWorld(city);
    const b = Object.values(w.businesses).find(b => b.blockId === w.player.blockId && can(w, { type: 'scene', kind: 'chat', npcId: b.ownerId, businessId: b.id }).ok)!;
    expect(b).toBeDefined(); const ap = w.player.ap;
    w = dispatch(w, { type: 'scene', kind: 'chat', npcId: b.ownerId, businessId: b.id });
    expect(w.player.ap).toBeLessThan(ap);
    const envelope = JSON.parse(JSON.stringify({ format: 1, geographyId: geographyId(city), world: w }));
    expect(decodeSave(envelope, geographyId(city))).toEqual(w);
    expect(() => decodeSave(envelope, 'changed-map')).toThrow(/preserved/);
    expect(() => decodeSave({}, geographyId(city))).toThrow(/preserved/);
    expect(REAL_SAVE_DB).not.toBe('rackets.remake.save.v1');
    const bad = structuredClone(envelope); delete bad.world.businesses[b.id].buildingId;
    expect(() => decodeSave(bad, geographyId(city))).toThrow(/preserved/);
  });
  it('does not change default generation or its RNG order', () => {
    const opts = { seed: 7, size: 'small', name: 'Nobody', background: 'grifter' } as const;
    expect(newWorld(opts)).toEqual(newWorld(opts, generateCity(opts.seed, opts.size)));
    expect(newWorld(opts).city.geography).toBeUndefined();
  });
  it('rejects incomplete geography instead of making disconnected routes', () => {
    expect(() => realCityGeography({ ...city, streets: [] })).toThrow(/Not enough/);
  });
});

it('repairs legacy tiny storefronts without changing gameplay progress or valid bindings', () => {
  let w = newRealCityWorld(city);
  const { buildingsByBlock } = realCityGeography(city);
  // Recreate the old id-order placement, including the reported 6 m² structure.
  delete w.city.geography!.placementVersion;
  for (const block of Object.values(w.blocks)) block.businessIds.forEach((id, i) => {
    const site = city.buildings.find(b => b.id === buildingsByBlock[block.id][i % buildingsByBlock[block.id].length])!;
    w.businesses[id].buildingId = site.id; w.businesses[id].pos = { ...site.center };
  });
  const local = Object.values(w.businesses).find(b => b.blockId === w.player.blockId)!;
  w = dispatch(w, { type: 'scene', kind: 'chat', npcId: local.ownerId, businessId: local.id });
  const before = structuredClone(w), result = repairRealCityPlaces(w, city);
  expect(result.moved).toBeGreaterThan(0); expect(w).toEqual(before);
  for (const biz of Object.values(result.world.businesses)) {
    expect(placeFits(city, biz.buildingId, biz.type)).toBe(true);
    const old = before.businesses[biz.id];
    if (placeFits(city, old.buildingId, old.type)) expect(biz.buildingId).toBe(old.buildingId);
    expect({ ...biz, buildingId: old.buildingId, pos: old.pos }).toEqual(old);
  }
  expect({ ...result.world, businesses: before.businesses, city: before.city }).toEqual(before);
  expect(repairRealCityPlaces(result.world, city).world).toBe(result.world);
});
it('uses suitable ground-floor premises for every business and exposes true travel costs on the map', () => {
  const w = newRealCityWorld(city);
  for (const p of select.realCityPlaces(w)) {
    expect(placeFits(city, p.buildingId, p.type)).toBe(true);
    expect(p.travel).toBe(select.travelCost(w, w.businesses[p.id].blockId));
    expect(p.here).toBe(w.businesses[p.id].blockId === w.player.blockId);
  }
});
