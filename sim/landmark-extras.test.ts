/**
 * A landmark is worth knowing for two reasons, not one.
 *
 * Each of the five was worth precisely one op, and an op you can pull once every few weeks is a
 * thin reason to walk across the city — for most of a run the building was a name on the map. Each
 * now has a standing draw as well: three have a **person** always found there, two sell an **item**
 * nobody else sells.
 *
 * "Reachable" is the whole assertion, and it is deliberately strict. A content table can describe a
 * person who is never placed and an item on a shelf that no `can()` will let you buy, and both
 * would read perfectly in the file and do nothing in the game. So these generate real cities and
 * then go and find the thing.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '@content/items';
import { LANDMARKS, LANDMARK_BY_ITEM } from '@content/landmarks';
import { SPECIALISTS } from '@content/specialists';
import { can, generateWorld, select, type Business, type World } from './index';
import { candidatesFor } from './specialists';

const mk = (seed: number): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 20; w.player.cash = 200_000;
  return w;
};
const SEEDS = [3, 4, 5, 7, 12];
const buildingFor = (w: World, id: string): Business | undefined => Object.values(w.businesses).find(b => b.landmark === id);

describe('the table itself', () => {
  it('gives every landmark exactly one second reason, never none and never both', () => {
    for (const l of LANDMARKS) {
      const both = !!l.person && !!l.item;
      expect(both, `${l.id} has a person and an item`).toBe(false);
      expect(!!l.person || !!l.item, `${l.id} has neither`).toBe(true);
    }
  });

  it('names an item that actually exists, and does not hand the same one to two buildings', () => {
    const items = LANDMARKS.map(l => l.item).filter(Boolean) as string[];
    for (const id of items) expect(ITEM_DEFS[id], id).toBeTruthy();
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('the people', () => {
  it.each(SEEDS)('are placed, and standing in their own building — seed %i', seed => {
    const w = mk(seed);
    for (const l of LANDMARKS.filter(x => x.person)) {
      const biz = buildingFor(w, l.id);
      expect(biz, `${l.id} was never built`).toBeTruthy();
      const them = Object.values(w.npcs).find(n => n.name === l.person!.name);
      expect(them, `${l.person!.name} is in the table and not in the city`).toBeTruthy();
      // "Always found there" is not a note on a sheet: `npcLocation` reads `favouriteBusinessIds`,
      // and that is the list a player follows to go and meet somebody.
      expect(them!.favouriteBusinessIds).toContain(biz!.id);
      expect(select.npcLocation(w, them!)?.id).toBe(biz!.id);
      expect(biz!.patronIds).toContain(them!.id);
    }
  });

  it.each(SEEDS)('arrive known, so the player can see what they are worth — seed %i', seed => {
    const w = mk(seed);
    for (const l of LANDMARKS.filter(x => x.person)) {
      const them = Object.values(w.npcs).find(n => n.name === l.person!.name)!;
      expect(select.isKnown(them), l.person!.name).toBe(true);
      expect(them.traits).toContain(l.person!.trait);
      expect(them.nerve).toBeGreaterThanOrEqual(l.person!.nerve);
      for (const [k, v] of Object.entries(l.person!.skills)) {
        expect(them.skills[k as keyof typeof them.skills], `${l.person!.name} ${k}`).toBeGreaterThanOrEqual(v as number);
      }
      expect(them.notes.join(' ')).toContain(l.person!.note);
    }
  });

  it.each(SEEDS)('are each a different person — seed %i', seed => {
    const w = mk(seed);
    const ids = LANDMARKS.filter(l => l.person).map(l => Object.values(w.npcs).find(n => n.name === l.person!.name)!.id);
    expect(new Set(ids).size, 'two landmarks share a face').toBe(ids.length);
  });

  it.each(SEEDS)('are worth the walk: each is hireable for the part their building is about — seed %i', seed => {
    const w = mk(seed);
    // This is what stops them being flavour. `candidatesFor` wants somebody known with the skill
    // above a floor, and every landmark person clears it — so the courthouse is where you go to
    // find a forger, and it is a fact about the game rather than a line in a blurb.
    const wants: Record<string, keyof typeof SPECIALISTS> = {
      grand_casino: 'inside_man',   // charm
      courthouse: 'forger',         // brains
      observatory: 'alarms',        // tech
    };
    for (const [lmId, role] of Object.entries(wants)) {
      const l = LANDMARKS.find(x => x.id === lmId)!;
      const them = Object.values(w.npcs).find(n => n.name === l.person!.name)!;
      expect(select.hireReason(w, role, them), `${l.person!.name} as ${role}`).toBeUndefined();
      expect(candidatesFor(w, role).map(n => n.id), `${l.person!.name} is not on the shortlist for ${role}`).toContain(them.id);
    }
  });
});

describe('the items', () => {
  it.each(SEEDS)('are on sale at their own landmark and reachable there — seed %i', seed => {
    const w = mk(seed);
    for (const l of LANDMARKS.filter(x => x.item)) {
      const biz = buildingFor(w, l.id)!;
      expect(select.isMarket(biz), `${l.name} does not trade`).toBe(true);
      expect(select.marketStock(biz).map(i => i.id)).toEqual([l.item]);
      // Reachable means `can()` says yes when you are standing there with the money — not merely
      // that the shelf lists it. A shelf no action will read is a shelf nobody can buy from.
      w.player.currentBlockId = biz.blockId;
      const gate = can(w, { type: 'buy_item', businessId: biz.id, itemId: l.item! });
      expect(gate.ok, gate.ok ? '' : gate.reason).toBe(true);
    }
  });

  it.each(SEEDS)('are on sale nowhere else in the city — seed %i', seed => {
    const w = mk(seed);
    for (const b of Object.values(w.businesses)) {
      if (!select.isMarket(b)) continue;
      for (const it of select.marketStock(b)) {
        const owner = LANDMARK_BY_ITEM[it.id];
        if (!owner) continue;
        // The one thing that makes a landmark item a reason to go there: it is not on the rotation
        // in a back room three blocks from where you started.
        expect(b.landmark, `${it.label} is on the shelf at ${b.name}`).toBe(owner.id);
      }
    }
  });

  it.each(SEEDS)('and the ordinary shops still have a proper shelf — seed %i', seed => {
    const w = mk(seed);
    // Filtering the landmark items out of the rotation must not have thinned the real shops.
    for (const b of Object.values(w.businesses).filter(x => !x.landmark && select.isMarket(x))) {
      expect(select.marketStock(b).length, b.name).toBeGreaterThanOrEqual(3);
    }
  });
});
