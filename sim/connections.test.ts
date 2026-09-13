import { describe, expect, it } from 'vitest';
import { generateWorld } from './generate';
import { backingOf, connect, connectionsOf, familyOf, linkConnections } from './connections';
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

describe('the family and friend web', () => {
  it('links more people, and further, the closer the district is', () => {
    let tight = 0, loose = 0, tightWide = 0, looseWide = 0;
    for (let seed = 0; seed < 8; seed++) {
      const w = mk(5);
      const close = testDistrict(w, 0.9, `c${seed}`);
      const cold = testDistrict(w, 0.05, `s${seed}`);
      linkConnections(w, [...close.blocks, ...cold.blocks], new Rng(seed * 31 + 1));
      tight += linkCount(close.people); loose += linkCount(cold.people);
      const offBlock = (people: Npc[]) => people.reduce((s, n) => s + connectionsOf(w, n).filter(c => c.npc.homeBlockId !== n.homeBlockId).length, 0);
      tightWide += offBlock(close.people); looseWide += offBlock(cold.people);
    }
    expect(tight).toBeGreaterThan(loose * 2);        // density scales with closeness
    expect(tightWide).toBeGreaterThan(looseWide * 2); // and so does reach: a tight district spans blocks
    expect(loose).toBeGreaterThan(0);                 // strangers still know somebody
  });

  it('never gives anyone more than a handful of ties, and keeps them mutual', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.95, 'm', 5, 8);
    linkConnections(w, blocks, new Rng(7));
    for (const n of people) {
      expect(n.connections.length).toBeLessThanOrEqual(4);
      for (const c of n.connections) {
        const other = w.npcs[c.npcId];
        expect(other.connections.find(x => x.npcId === n.id)?.kind).toBe(c.kind);
      }
    }
  });

  it('makes people with backup harder to scare and slower to trust', () => {
    const w = mk(5);
    const { blocks, people } = testDistrict(w, 0.95, 'b', 4, 8);
    linkConnections(w, blocks, new Rng(3));
    const withTies = people.filter(n => backingOf(w, n) > 0);
    const alone = people.filter(n => backingOf(w, n) === 0);
    expect(withTies.length).toBeGreaterThan(0);
    for (const n of withTies) { expect(n.nerve).toBeGreaterThan(50); expect(n.rel.trust).toBeLessThan(0); }
    for (const n of alone) { expect(n.nerve).toBe(50); expect(n.rel.trust).toBe(0); }
  });

  it('populates a real city with a web', () => {
    const w = mk(12);
    const people = Object.values(w.npcs).filter(n => n.role === 'owner' || n.role === 'patron');
    const linked = people.filter(n => n.connections.length);
    expect(linked.length).toBeGreaterThan(people.length * 0.1);
    for (const n of linked) for (const c of n.connections) expect(w.npcs[c.npcId]).toBeDefined();
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
