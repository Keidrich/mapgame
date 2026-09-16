import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { mkNpc } from './populate';
import { Rng } from './rng';
import { NAME_GROUPS, NAME_GROUP_IDS, STYLE_LAST, groupsOfFirstName, groupsOfLastName, namesAgree } from '@content/names';
import { LANDMARKS } from '@content/landmarks';
import type { World } from './types';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/**
 * The people ordinary naming applies to: no faction house style, no official's title — and not
 * the five landmark characters, who are **written** rather than generated. Solomon "Sunday" Reyes
 * is a Spanish surname on a Hebrew first name on purpose; a city has people like that in it and a
 * generator that only ever pairs within a pool cannot produce one. Read off `LANDMARKS` rather
 * than listed here, so renaming one of them in content cannot quietly re-break this.
 */
const AUTHORED = new Set(LANDMARKS.map(l => l.person?.name).filter(Boolean));
const ordinary = (w: World) => Object.values(w.npcs).filter(n => !n.official && !AUTHORED.has(n.name) && (n.role === 'owner' || n.role === 'patron'));
/** 'First "Nick" Last' → ['First', 'Last']. */
const parts = (name: string) => { const p = name.replace(/"[^"]*"/g, '').split(/\s+/).filter(Boolean); return [p[0], p.slice(1).join(' ')] as const; };

describe('name pools', () => {
  it('has a meaningful pool per group, so a district stops repeating itself', () => {
    for (const g of NAME_GROUP_IDS) {
      const def = NAME_GROUPS[g];
      expect(def.first.length, `${g} first names`).toBeGreaterThanOrEqual(30);
      expect(def.last.length, `${g} last names`).toBeGreaterThanOrEqual(24);
      expect(new Set(def.first).size, `${g} first names are unique`).toBe(def.first.length);
      expect(new Set(def.last).size, `${g} last names are unique`).toBe(def.last.length);
    }
    // enough combinations that a city never runs out
    const pairs = NAME_GROUP_IDS.reduce((s, g) => s + NAME_GROUPS[g].first.length * NAME_GROUPS[g].last.length, 0);
    expect(pairs).toBeGreaterThan(8000);
  });

  it('knows which pool a name came from', () => {
    expect(groupsOfFirstName('Tony')).toContain('italian');
    expect(groupsOfLastName('Marconi')).toContain('italian');
    expect(namesAgree('Tony', 'Marconi')).toBe(true);
    expect(namesAgree('Tony', 'Byrne')).toBe(false);
  });
});

describe('naming a person', () => {
  it('pairs first and last from the same group for ordinary NPCs', () => {
    const w = mk(9);
    const people = ordinary(w);
    expect(people.length).toBeGreaterThan(50);
    const wrong = people.filter(n => { const [first, last] = parts(n.name); return !namesAgree(first, last); });
    expect(wrong.map(n => n.name)).toEqual([]);
  });

  it('does not repeat itself across a whole city', () => {
    const w = mk(4);
    const people = ordinary(w);
    const names = new Set(people.map(n => n.name));
    // full names are near-unique; the odd collision is fine, a third of the city sharing a name is not
    expect(names.size).toBeGreaterThan(people.length * 0.9);
    const firsts = new Set(people.map(n => parts(n.name)[0]));
    expect(firsts.size).toBeGreaterThan(40);
  });

  it('keeps the faction house surname override, with a first name that fits it', () => {
    const w = mk(3);
    const rng = new Rng(11);
    const block = Object.keys(w.blocks)[0];
    for (const style of Object.keys(STYLE_LAST)) {
      const n = mkNpc(rng, w, p => `${p}x${style}`, { role: 'boss', homeBlockId: block, style, strong: true });
      const [, last] = parts(n.name);
      expect(STYLE_LAST[style], `${style} surname`).toContain(last);
    }
  });

  it('names district by district, so a flavoured district reads as itself', () => {
    const w = mk(7);
    const rng = new Rng(21);
    const block = Object.keys(w.blocks)[0];
    const district = w.districts[w.blocks[block].districtId];
    district.nameGroups = { italian: 1 };
    const names = Array.from({ length: 20 }, (_, i) => mkNpc(rng, w, p => `${p}i${i}`, { role: 'patron', homeBlockId: block }).name);
    for (const name of names) {
      const [first, last] = parts(name);
      expect(groupsOfFirstName(first), name).toContain('italian');
      expect(groupsOfLastName(last), name).toContain('italian');
    }
  });
});
