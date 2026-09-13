import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { HOUSEHOLD_MAX, MAX_LINKS, MIN_TIES, TIES_BASELINE, backingOf, connect, connectionsOf, familyOf, linkConnections } from './connections';
import { tickGossip } from './people';
import { Rng } from './rng';
import type { Block, District, Npc, World } from './types';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/**
 * A district we control exactly: `blocks` blocks, `per` people on each, all owners of a
 * one-business block so `linkConnections` sees them.
 */
function testDistrict(w: World, closeness: number, tag: string, blocks = 4, per = 6): { district: District; blocks: Block[]; people: Npc[] } {
  const district: District = { id: `d_${tag}`, kind: 'old_quarter', name: `Test ${tag}`, blockIds: [], chunkKey: 'test', closeness, nameGroups: { italian: 1 } };
  w.districts[district.id] = district;
  const made: Block[] = []; const people: Npc[] = [];
  for (let b = 0; b < blocks; b++) {
    const id = `${tag}b${b}`;
    const block: Block = {
      id, chunkKey: 'test', polygon: [], center: { lat: 51.5 + b * 0.001, lng: -0.12 }, areaM2: 10000, neighborIds: [], edgeKeys: [], streetNames: [],
      name: `${tag} ${b}`, districtId: district.id, wealth: 50, police: 40, heat: 0, population: 50,
      demand: { booze: 1, green: 1, pills: 1, hot_goods: 1, counterfeit: 1 }, influence: {}, businessIds: [], memory: [], tags: [],
    };
    w.blocks[id] = block; district.blockIds.push(id); made.push(block);
    for (let p = 0; p < per; p++) {
      const npc: Npc = {
        id: `${tag}n${b}_${p}`, name: `Person ${b}${p} Marconi`, role: p === 0 ? 'owner' : 'patron', traits: [], skills: { muscle: 4, brains: 4, charm: 4, wheels: 3, tech: 2 },
        homeBlockId: id, favouriteBusinessIds: [], rel: { trust: 0, fear: 0, respect: 0 }, nerve: 50, alive: true, known: false, connections: [], notes: [],
      };
      w.npcs[npc.id] = npc; people.push(npc);
      if (p === 0) { w.businesses[`${tag}z${b}`] = { id: `${tag}z${b}`, name: `Shop ${tag}${b}`, type: 'bar', blockId: id, ownerId: npc.id, patronIds: [], baseIncome: 100, value: 4000, condition: 90, ownedBy: 'npc', racketIds: [], insured: false, flags: [] }; block.businessIds.push(`${tag}z${b}`); }
      else w.businesses[`${tag}z${b}`].patronIds.push(npc.id);
    }
  }
  return { district, blocks: made, people };
}

const linkCount = (people: Npc[]) => people.reduce((s, n) => s + n.connections.length, 0);
const familyCount = (n: Npc) => n.connections.filter(c => c.kind === 'family').length;

/** Households, read back off the graph: connected components over the family edges. */
function households(people: Npc[], byId: (id: string) => Npc | undefined): Npc[][] {
  const seen = new Set<string>(); const out: Npc[][] = [];
  for (const n of people) {
    if (seen.has(n.id)) continue;
    const stack = [n]; const unit: Npc[] = []; seen.add(n.id);
    while (stack.length) {
      const cur = stack.pop()!; unit.push(cur);
      for (const c of cur.connections.filter(x => x.kind === 'family')) { const o = byId(c.npcId); if (o && !seen.has(o.id)) { seen.add(o.id); stack.push(o); } }
    }
    if (unit.length > 1) out.push(unit);
  }
  return out;
}

describe('the family and friend web', () => {
  it('gives everybody people, several of them, wherever they live', () => {
    const w = mk(5);
    const close = testDistrict(w, 0.9, 'e1', 4, 8);
    const cold = testDistrict(w, 0.05, 'e2', 4, 8);
    linkConnections(w, [...close.blocks, ...cold.blocks], new Rng(17));
    for (const n of [...close.people, ...cold.people]) expect(n.connections.length, n.id).toBeGreaterThanOrEqual(MIN_TIES);
    expect(MIN_TIES).toBeGreaterThan(1);   // "people", not "a person"
  });

  it('builds households rather than pairs: a family is everyone tied to everyone', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.9, 'h', 5, 8);
    linkConnections(w, blocks, new Rng(23));
    const units = households(people, id => w.npcs[id]);
    expect(units.length).toBeGreaterThan(3);
    expect(units.filter(u => u.length >= 3).length).toBeGreaterThan(units.length / 2); // most are real families
    for (const unit of units) {
      expect(unit.length).toBeLessThanOrEqual(HOUSEHOLD_MAX);
      // every member is family with every other member — a household, not a chain
      for (const a of unit) for (const b of unit) if (a !== b) expect(a.connections.find(c => c.npcId === b.id)?.kind, `${a.id}-${b.id}`).toBe('family');
    }
  });

  it('links more people, and further, the closer the district is', () => {
    let tight = 0, loose = 0, tightFam = 0, looseFam = 0, tightWide = 0, looseWide = 0;
    for (let seed = 0; seed < 8; seed++) {
      const w = mk(5);
      const close = testDistrict(w, 0.9, `c${seed}`);
      const cold = testDistrict(w, 0.05, `s${seed}`);
      linkConnections(w, [...close.blocks, ...cold.blocks], new Rng(seed * 31 + 1));
      tight += linkCount(close.people); loose += linkCount(cold.people);
      tightFam += close.people.reduce((s, n) => s + familyCount(n), 0);
      looseFam += cold.people.reduce((s, n) => s + familyCount(n), 0);
      const offBlock = (people: Npc[]) => people.reduce((s, n) => s + connectionsOf(w, n).filter(c => c.npc.homeBlockId !== n.homeBlockId).length, 0);
      tightWide += offBlock(close.people); looseWide += offBlock(cold.people);
    }
    expect(tight).toBeGreaterThan(loose * 1.3);       // denser where people are close
    expect(tightFam).toBeGreaterThan(looseFam * 1.3); // and the families are bigger
    expect(tightWide).toBeGreaterThan(looseWide * 2); // reach: a tight district spans blocks, a cold one stays on its own
    expect(loose).toBeGreaterThan(0);                 // strangers still have people
  });

  it('never makes anyone the hub of the neighbourhood, and keeps every tie mutual', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.95, 'm', 5, 8);
    linkConnections(w, blocks, new Rng(7));
    for (const n of people) {
      expect(n.connections.length).toBeLessThanOrEqual(MAX_LINKS);
      expect(new Set(n.connections.map(c => c.npcId)).size).toBe(n.connections.length); // no duplicate ties
      for (const c of n.connections) {
        const other = w.npcs[c.npcId];
        expect(other.connections.find(x => x.npcId === n.id)?.kind).toBe(c.kind);
        expect(other.connections.find(x => x.npcId === n.id)?.label).toBe(c.label);
      }
    }
  });

  it('stiffens only the people with more backup than everybody has', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.95, 'b', 4, 8);
    linkConnections(w, blocks, new Rng(3));
    const wellBacked = people.filter(n => backingOf(w, n) > TIES_BASELINE);
    const ordinary = people.filter(n => backingOf(w, n) <= TIES_BASELINE);
    expect(wellBacked.length).toBeGreaterThan(0);
    expect(ordinary.length).toBeGreaterThan(0);
    for (const n of wellBacked) { expect(n.nerve).toBeGreaterThan(50); expect(n.rel.trust).toBeLessThan(0); }
    // a city where everyone knows people is not a city where everyone is hard to frighten
    for (const n of ordinary) { expect(n.nerve).toBe(50); expect(n.rel.trust).toBe(0); }
  });

  it('populates a real city: everybody has people, most have family', () => {
    const w = mk(12);
    const people = Object.values(w.npcs).filter(n => n.role === 'owner' || n.role === 'patron');
    expect(people.length).toBeGreaterThan(100);
    for (const n of people) for (const c of n.connections) expect(w.npcs[c.npcId], `${n.id} → ${c.npcId}`).toBeDefined();
    expect(people.every(n => n.connections.length >= MIN_TIES)).toBe(true);
    const withFamily = people.filter(n => familyCount(n) > 0);
    expect(withFamily.length).toBeGreaterThan(people.length * 0.8);
    const units = households(people, id => w.npcs[id]);
    expect(units.filter(u => u.length >= 3).length).toBeGreaterThan(20); // real families, all over the city
    // a household reads as one family: most of it carries one surname, the rest married in
    const surnameShare = (u: Npc[]) => {
      const counts = new Map<string, number>();
      for (const n of u) { const last = n.name.split(' ').slice(-1)[0]; counts.set(last, (counts.get(last) ?? 0) + 1); }
      return Math.max(...counts.values()) / u.length;
    };
    expect(units.filter(u => surnameShare(u) >= 0.5).length).toBeGreaterThan(units.length * 0.6);
    // but taking the household name never turns two relatives into the same person
    for (const unit of units) expect(new Set(unit.map(n => n.name)).size, unit.map(n => n.name).join(', ')).toBe(unit.length);
  });
});

describe('the family agenda', () => {
  it('is only ever handed to somebody with real family, and points at them', () => {
    for (const seed of [3, 8, 15]) {
      const w = mk(seed);
      const family = Object.values(w.npcs).filter(n => n.agenda?.kind === 'family');
      for (const n of family) {
        const target = n.agenda!.target;
        expect(target, `${n.name} has a target`).toBeTruthy();
        const kin = w.npcs[target!];
        expect(kin, `${n.name}'s target exists`).toBeDefined();
        expect(familyOf(w, n).map(k => k.id)).toContain(kin.id);
      }
    }
  });
});

describe('gossip', () => {
  it('travels along a real tie to another block, not just the regulars at the bar', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.9, 'g', 2, 1);
    for (const n of people) n.connections = [];
    const [a, b] = people;
    // a stands alone on a block with nobody else: the tie is the only way word can travel
    w.blocks[a.homeBlockId].businessIds = [];
    a.favouriteBusinessIds = [];
    expect(b.homeBlockId).not.toBe(a.homeBlockId);
    connect(a, b, 'family', 'sibling');
    a.grudge = { since: w.day, reason: 'You slapped them in front of the whole street.', spread: 0 };
    const rng = new Rng(5);
    for (let d = 0; d < 12 && a.grudge && a.grudge.spread === 0; d++) tickGossip(w, rng);
    expect(a.grudge?.spread ?? 1).toBeGreaterThan(0);
    expect(b.rel.trust).toBeLessThan(0);
    expect(blocks.length).toBe(2);
  });
});
