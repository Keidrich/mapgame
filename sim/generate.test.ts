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
