/**
 * The hard boundary of the district-flavour work: a name group is cosmetic. It decides
 * what people are called and nothing else — never skills, traits, nerve or trust. The only
 * social input to how hard somebody is to frighten is their own connection count, which
 * comes from the district's `closeness`, an independent property of the place.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { TIES_BASELINE, applyBacking, connect } from './connections';
import { mkNpc } from './populate';
import { Rng } from './rng';
import type { Npc } from './types';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const stats = (n: Npc) => ({ skills: n.skills, nerve: n.nerve, traits: n.traits, rel: n.rel, recipe: n.recipe ?? null });

describe('a name group changes names and nothing else', () => {
  it('rolls identical skills, traits and nerve whatever a district is flavoured as', () => {
    const w = mk(6);
    const blockId = Object.keys(w.blocks)[0];
    const district = w.districts[w.blocks[blockId].districtId];
    const run = (weights: Record<string, number>) => {
      district.nameGroups = weights;
      const rng = new Rng(4242);
      return Array.from({ length: 25 }, (_, i) => mkNpc(rng, w, p => `${p}probe${i}`, { role: 'patron', homeBlockId: blockId, nerveBias: 45 }));
    };
    const italians = run({ italian: 1 });
    const others = run({ east_asian: 1 });
    expect(italians.map(stats)).toEqual(others.map(stats));           // same rolls, exactly
    expect(italians.map(n => n.name)).not.toEqual(others.map(n => n.name)); // different names
  });

  it('keeps no ethnicity or name-group field on a person', () => {
    const w = mk(2);
    for (const n of Object.values(w.npcs).slice(0, 50)) {
      const keys = Object.keys(n).map(k => k.toLowerCase());
      for (const banned of ['ethnicity', 'namegroup', 'group', 'culture', 'race']) expect(keys).not.toContain(banned);
    }
  });

  it('gives the same backing bonus to everyone with the same number of ties', () => {
    const w = mk(8);
    const blockId = Object.keys(w.blocks)[0];
    const district = w.districts[w.blocks[blockId].districtId];
    const rng = new Rng(99);
    const make = (weights: Record<string, number>, tag: string) => { district.nameGroups = weights; const n = mkNpc(rng, w, p => `${p}${tag}`, { role: 'patron', homeBlockId: blockId, nerveBias: 50 }); n.nerve = 50; n.rel.trust = 0; return n; };
    // two people with identical households, from two different naming pools
    const a = make({ italian: 1 }, 'a'); const b = make({ east_asian: 1 }, 'b');
    const ties = TIES_BASELINE + 2;
    for (let i = 0; i < ties; i++) {
      connect(a, make({ italian: 1 }, `ak${i}`), 'family', 'cousin');
      connect(b, make({ east_asian: 1 }, `bk${i}`), 'family', 'cousin');
    }
    applyBacking(w, a); applyBacking(w, b);
    expect(a.nerve).toBe(b.nerve);
    expect(a.rel.trust).toBe(b.rel.trust);
    expect(a.nerve).toBeGreaterThan(50);   // backup above what everyone has does stiffen somebody
  });
});

describe('the source itself', () => {
  const dir = new URL('.', import.meta.url).pathname;
  const simFiles = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const GROUPY = /NameGroup|nameGroups?|NAME_GROUPS?|NAME_GROUP_IDS|groupsOf(First|Last)Name|STYLE_GROUP/;

  it('reads name groups in exactly two places: the type contract and the naming code', () => {
    const readers = simFiles.filter(f => GROUPY.test(readFileSync(join(dir, f), 'utf8')));
    expect(readers.sort()).toEqual(['connections.ts', 'populate.ts', 'types.ts']);
  });

  it('never mentions a group on a line that works out skills, traits, nerve or trust', () => {
    const STATTY = /\b(skills|nerve|traits|trust|fear|respect|rel\.)\b/;
    for (const f of simFiles) {
      for (const [i, line] of readFileSync(join(dir, f), 'utf8').split('\n').entries()) {
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue; // comments may discuss the rule
        if (GROUPY.test(line) && STATTY.test(line)) throw new Error(`${f}:${i + 1} mixes a name group with a stat: ${line.trim()}`);
      }
    }
  });

  it('only ever uses the group to build the name, inside mkNpc', () => {
    const src = readFileSync(join(dir, 'populate.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function mkNpc'), src.indexOf('function nameGroupFor'));
    const lines = body.split('\n').filter(l => /\bgroup\b/.test(l) && !l.trim().startsWith('//'));
    // the group is chosen, then spent on a first and a last name; nothing below reads it
    expect(lines.length).toBe(3);
    for (const l of lines) expect(l).toMatch(/nameGroupFor|NAME_GROUPS\[group\]/);
  });

  it('uses closeness, not names, to drive the connection web', () => {
    const src = readFileSync(join(dir, 'connections.ts'), 'utf8');
    expect(src).toMatch(/closeness/);
    // the one name-group use in here guards a cosmetic rename, and touches no stat
    const groupLines = src.split('\n').filter(l => GROUPY.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    for (const l of groupLines) expect(l).toMatch(/import|groupsOfLastName/);
  });
});
