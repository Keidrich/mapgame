import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RealCity } from '@geo/realCity';
import { pointInRing } from '@geo/project';
import { geographyId, newRealCityWorld, realCityGeography } from '@r/sim/realCity';
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
