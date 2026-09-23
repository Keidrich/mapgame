/** The populated world: people, places, outfits, officials, and where you start. */
import { describe, expect, it } from 'vitest';
import { FEMALE_START, NAME_GROUPS, NAME_GROUP_IDS } from '@r/content/names';
import { BUSINESSES } from '@r/content/world';
import { newWorld, PLAYER, select } from '@r/sim/index';

const mk = (seed = 7, size: 'small' | 'medium' | 'large' = 'medium') => newWorld({ seed, size, name: 'T', background: 'grifter' });

describe('the people', () => {
  it('reads women and men off the name tables correctly', () => {
    // The first name after the split must be a woman's in every group. A reordered table fails
    // here instead of quietly calling Tony "she" in every generated line.
    const firstWoman: Record<string, string> = { italian: 'Rosa', slavic: 'Katya', black_american: 'Tasha', east_asian: 'Mei', latino: 'Lupe', irish: 'Maeve', middle_eastern: 'Layla', anglo: 'Ruth' };
    for (const g of NAME_GROUP_IDS) expect(NAME_GROUPS[g].first[FEMALE_START[g]]).toBe(firstWoman[g]);
  });
  it('gives everybody a whole name, a pronoun, a face and sensible numbers', () => {
    const w = mk();
    for (const n of Object.values(w.npcs)) {
      expect(n.first.length).toBeGreaterThan(0); expect(n.last.length).toBeGreaterThan(0);
      expect(['he', 'she', 'they']).toContain(n.pronoun);
      expect(n.nerve).toBeGreaterThanOrEqual(0); expect(n.nerve).toBeLessThanOrEqual(100);
      expect(n.traits.length).toBeGreaterThan(0);
      expect(w.blocks[n.homeBlockId], `${n.first} lives nowhere`).toBeTruthy();
      for (const t of n.ties) expect(w.npcs[t.id].ties.some(x => x.id === n.id), 'ties go both ways').toBe(true);
    }
  });
  it('every business has a living owner and a real block', () => {
    const w = mk();
    for (const b of Object.values(w.businesses)) {
      expect(w.npcs[b.ownerId]?.alive).toBe(true);
      expect(w.blocks[b.blockId].businessIds).toContain(b.id);
      expect(b.income).toBeGreaterThanOrEqual(0);
      expect(BUSINESSES[b.type].tier).toBe(b.tier);
    }
  });
  it('parks have nothing to protect', () => {
    const w = mk();
    const parks = Object.values(w.blocks).filter(select.isParkBlock);
    for (const p of parks) expect(p.businessIds).toHaveLength(0);
  });
});

describe('the outfits and the city', () => {
  it.each([['small', 3], ['medium', 4], ['large', 5]] as const)('a %s city has %i outfits, each with a boss and ground', (size, n) => {
    const w = mk(11, size);
    const fs = Object.values(w.factions);
    expect(fs).toHaveLength(n);
    for (const f of fs) {
      expect(w.npcs[f.bossId].alive).toBe(true);
      expect(f.lieutenantIds.length).toBeGreaterThan(0);
      expect(select.factionBlocks(w, f.id).length).toBeGreaterThan(3);
    }
  });
  it('leaves most of the city unclaimed at the start', () => {
    for (const seed of [1, 2, 3]) {
      const w = mk(seed);
      const held = Object.values(w.factions).reduce((t, f) => t + select.factionBlocks(w, f.id).length, 0);
      expect(held / Object.keys(w.blocks).length).toBeLessThan(0.45);
    }
  });
  it('starts you away from every outfit\'s home, somewhere with doors', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = mk(seed);
      const b = w.blocks[w.player.blockId];
      expect(Object.values(w.factions).map(f => f.homeDistrictId)).not.toContain(b.districtId);
      expect(b.businessIds.length).toBeGreaterThan(0);
      expect(select.blockController(w, b.id)).not.toBe(Object.keys(w.factions)[0]);
    }
  });
  it('has the officials and a fixer', () => {
    const w = mk();
    const kinds = select.officials(w).map(n => n.official);
    for (const k of ['captain', 'judge', 'prosecutor', 'councillor']) expect(kinds).toContain(k);
    expect(w.fixerId && w.npcs[w.fixerId].alive).toBe(true);
  });
  it('opens with work on the board', () => {
    const w = mk();
    expect(Object.values(w.jobs).filter(j => j.status === 'offer').length).toBeGreaterThan(0);
    expect(w.player.blockId).toBeTruthy();
    expect(w.blocks[w.player.blockId].influence[PLAYER]).toBeGreaterThan(0);
  });
  it('the whole world survives a JSON round trip, which is what a save is', () => {
    const w = mk();
    const s = JSON.stringify(w);
    // idempotent, and nothing JSON would silently turn into null
    expect(JSON.stringify(JSON.parse(s))).toBe(s);
    expect(s).not.toMatch(/NaN|Infinity/);
    expect(s.length / 1024, 'a save should stay well under a few MB').toBeLessThan(2500);
  });
});
