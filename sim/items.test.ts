/**
 * Kit: what it does to a job's odds and its heat, what you can carry, and what a market pays.
 */
import { describe, expect, it } from 'vitest';
import { EQUIP_MAX, ITEM_DEFS, RESALE, type ItemDef } from '@content/items';
import { OP_APPROACHES } from '@content/rackets';
import { can, dispatch, generateWorld, select, type World } from './index';
import { isMarket, marketStock } from './items';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
/** A world with crew to send, cash to spend, and no events in the way. */
function ready(seed = 12): World {
  const w = mk(seed);
  w.pendingEvents = [];
  w.player.cash = 50000;
  // three hands on the job, so the crew skill sum is a real number to move
  for (const n of Object.values(w.npcs).filter(x => x.role === 'patron').slice(0, 3)) {
    n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    n.role = 'crew'; w.player.crewIds.push(n.id);
  }
  return w;
}
const crewIds = (w: World) => w.player.crewIds;
const give = (w: World, ...ids: string[]) => { w.player.items = [...(w.player.items ?? []), ...ids]; };
const carry = (w: World, ...ids: string[]) => { give(w, ...ids); w.player.equipped = [...(w.player.equipped ?? []), ...ids]; };

describe('the catalogue', () => {
  it('is a real catalogue: every category, a weapon ladder, and no flat upgrades', () => {
    const all = Object.values(ITEM_DEFS);
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const cat of ['weapon', 'tool', 'tech', 'vehicle', 'armor'] as const) expect(all.some(i => i.category === cat), cat).toBe(true);
    const weapons = all.filter(i => i.category === 'weapon');
    expect(weapons.length).toBeGreaterThanOrEqual(8);
    // Every family has more than one thing in it, and **price does not decide the order**.
    //
    // This used to assert a straight ladder — dearer meant louder and hotter — which was true
    // while each family was one or two items deep and stopped being true the day they were filled
    // out. A Benelli costs more than an 870 and is *quieter and cooler*: you are buying a
    // professional weapon rather than a statement, and that is the whole point of a family having
    // members. What price must still buy is a **peak**: the dearest thing in a family has to be
    // the best in it at something, or it is priced for nothing.
    for (const family of ['melee', 'pistol', 'revolver', 'shotgun', 'rifle', 'explosive'] as const) {
      const rung = weapons.filter(i => i.family === family).sort((a, b) => a.cost - b.cost);
      expect(rung.length, family).toBeGreaterThan(1);
      const top = rung[rung.length - 1];
      const peaks = [
        (i: ItemDef) => i.mods.skillBoost?.muscle ?? 0,
        (i: ItemDef) => i.mods.approachBias?.loud ?? 0,
        (i: ItemDef) => i.mods.approachBias?.quiet ?? 0,
        (i: ItemDef) => -(i.mods.heatMult ?? 1),
      ];
      expect(peaks.some(p => p(top) === Math.max(...rung.map(p))), `${family}: the dearest buys nothing`).toBe(true);
    }
    // the loudest thing in the catalogue is a firearm or a bomb, not a bat
    const loudest = weapons.slice().sort((a, b) => (b.mods.approachBias?.loud ?? 0) - (a.mods.approachBias?.loud ?? 0))[0];
    expect(['shotgun', 'explosive', 'rifle']).toContain(loudest.family);
    // A weapon worth taking on a careful job is small and close: a razor, a tool, a suppressed .22.
    // Nothing with a barrel worth the name is ever on that list, which is the rule the old
    // "exactly one" assertion was really protecting.
    const quiet = weapons.filter(i => (i.mods.approachBias?.quiet ?? 0) > 0);
    expect(quiet.length, 'nothing is worth carrying on a careful job').toBeGreaterThan(0);
    for (const q of quiet) expect(['melee', 'pistol'], `${q.id} helps a quiet job`).toContain(q.family);
    for (const q of quiet.filter(i => i.family === 'pistol')) expect(q.mods.heatMult ?? 1, q.id).toBeLessThan(1);
    // Every item that helps one approach hurts another, or pays for itself in heat.
    //
    // Armour is exempt and that exemption is the definition of the category: it has no business
    // on a job at all, so it has no `approachBias` and no `heatMult` to balance. What it costs is
    // one of the three things you can carry, and on the heavy end a `skillBoost` penalty — which
    // the armour tests assert separately, because *having* no op effect is the load-bearing claim.
    for (const item of all.filter(i => i.category !== 'armor')) {
      const bias = Object.values(item.mods.approachBias ?? {});
      const helps = bias.some(v => v > 0);
      const costs = bias.some(v => v < 0) || (item.mods.heatMult ?? 1) > 1;
      expect(helps, item.id).toBe(true);
      expect(costs || (item.mods.heatMult ?? 1) < 1, item.id).toBe(true);
    }
  });
});

describe('kit in the odds', () => {
  it('skillBoost lifts the crew total, so a job that stretches them gets easier', () => {
    const w = ready();
    const before = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    carry(w, 'sawnoff');
    expect(select.kitSkillBoost(w).muscle).toBe(ITEM_DEFS.sawnoff.mods.skillBoost!.muscle);
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'loud')).toBeGreaterThan(before);
  });

  it('approachBias cuts both ways: a sawn-off is worth having loud and a liability quiet', () => {
    const w = ready();
    const loudBefore = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    const quietBefore = select.opChance(w, 'heist_bank', crewIds(w), 'quiet');
    carry(w, 'sawnoff');
    const loudAfter = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    const quietAfter = select.opChance(w, 'heist_bank', crewIds(w), 'quiet');
    expect(loudAfter).toBeGreaterThan(loudBefore + 5);   // meaningfully better, not a rounding nudge
    expect(quietAfter).toBeLessThan(quietBefore - 5);    // and meaningfully worse the other way
    expect(select.kitApproachBias(w, 'loud')).toBeGreaterThan(0);
    expect(select.kitApproachBias(w, 'quiet')).toBeLessThan(0);
  });

  it('lockpicks are the mirror image', () => {
    const w = ready();
    const quietBefore = select.opChance(w, 'heist_bank', crewIds(w), 'quiet');
    const loudBefore = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    carry(w, 'lockpicks');
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'quiet')).toBeGreaterThan(quietBefore);
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'loud')).toBeLessThan(loudBefore);
  });

  it('counts only what is carried, not what is owned', () => {
    const w = ready();
    const base = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    give(w, 'sawnoff', 'glock19');                       // in a drawer at home
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'loud')).toBe(base);
    w.player.equipped = ['sawnoff'];
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'loud')).toBeGreaterThan(base);
  });

  it('cannot gild a job the crew is already over-qualified for, but can still spoil it', () => {
    // opChance caps each skill's contribution at 1.3× what the job needs. A stick-up with three
    // hands is already at that ceiling, so a gun adds nothing there — and the quiet penalty still
    // lands, which is the point: carrying it is a decision either way.
    // On a minCrew-0 job the player is one of those hands too, so the player's own muscle is put
    // out of the way here; the ceiling under test is the crew's, not theirs.
    const w = ready();
    w.player.skills.muscle = 0;
    const loud = select.opChance(w, 'robbery', crewIds(w), 'loud');
    const quiet = select.opChance(w, 'robbery', crewIds(w), 'quiet');
    carry(w, 'sawnoff');
    expect(select.opChance(w, 'robbery', crewIds(w), 'loud')).toBe(loud);
    expect(select.opChance(w, 'robbery', crewIds(w), 'quiet')).toBeLessThan(quiet);
  });

  it('a job you can do alone counts you as one of the hands', () => {
    // Without this a solo-capable op with no crew on it has a skill sum of zero and floors at the
    // 3% minimum, while the tree advertises it as "solo ok". Jobs that require crew are unaffected.
    const w = ready();
    const strong = select.opChance(w, 'robbery', [], 'loud');
    w.player.skills.muscle = 0;
    expect(select.opChance(w, 'robbery', [], 'loud')).toBeLessThan(strong);

    // heist_bank needs a crew by definition, so the player's own hands are not in its sum
    const before = select.opChance(w, 'heist_bank', crewIds(w), 'loud');
    w.player.skills.muscle = 10;
    expect(select.opChance(w, 'heist_bank', crewIds(w), 'loud')).toBe(before);
  });

  it('stacks what is on you, and stays inside the odds clamp', () => {
    const w = ready();
    carry(w, 'sawnoff', 'sedan', 'glock19');
    expect(select.kitApproachBias(w, 'loud')).toBeCloseTo(
      ITEM_DEFS.sawnoff.mods.approachBias!.loud! + ITEM_DEFS.sedan.mods.approachBias!.loud! + ITEM_DEFS.glock19.mods.approachBias!.loud!, 5);
    const chance = select.opChance(w, 'robbery', crewIds(w), 'loud');
    expect(chance).toBeLessThanOrEqual(97);
    expect(chance).toBeGreaterThanOrEqual(3);
  });
});

describe('kit in the heat', () => {
  const heatOf = (w: World, approach: 'loud' | 'quiet') => {
    const before = w.player.heat;
    const op = { id: 'o_test', kind: 'robbery' as const, approach, crewIds: crewIds(w), planDays: 0, daysLeft: 0, status: 'ready' as const, createdDay: 1, targetBusinessId: Object.keys(w.businesses)[0] };
    w.ops[op.id] = op; w.player.opIds.push(op.id);
    resolveOp(w, w.ops[op.id], new Rng(7));
    return w.player.heat - before;
  };

  it('multiplies what a job leaves behind, up for a sawn-off and down for a burner', () => {
    const plain = heatOf(ready(), 'loud');
    const armed = ready(); carry(armed, 'sawnoff');
    const quiet = ready(); carry(quiet, 'burner');
    expect(select.kitHeatMult(armed)).toBeCloseTo(ITEM_DEFS.sawnoff.mods.heatMult!, 5);
    expect(select.kitHeatMult(quiet)).toBeCloseTo(ITEM_DEFS.burner.mods.heatMult!, 5);
    expect(heatOf(armed, 'loud')).toBeGreaterThan(plain);
    expect(heatOf(quiet, 'loud')).toBeLessThan(plain);
  });

  it('multiplies with the approach rather than replacing it', () => {
    const w = ready(); carry(w, 'sawnoff', 'glock19');
    expect(select.kitHeatMult(w)).toBeCloseTo(ITEM_DEFS.sawnoff.mods.heatMult! * ITEM_DEFS.glock19.mods.heatMult!, 5);
    expect(OP_APPROACHES.quiet.heat).toBeLessThan(OP_APPROACHES.loud.heat);   // the approach still counts for what it did
  });
});

describe('carrying', () => {
  it('caps what you can have on you', () => {
    const w = ready();
    give(w, 'bat', 'glock19', 'lockpicks', 'burner');
    for (const id of ['bat', 'glock19', 'lockpicks']) {
      const r = can(w, { type: 'equip', itemId: id, on: true });
      expect(r.ok, id).toBe(true);
      Object.assign(w, dispatch(w, { type: 'equip', itemId: id, on: true }));
    }
    expect(w.player.equipped!.length).toBe(EQUIP_MAX);
    const full = can(w, { type: 'equip', itemId: 'burner', on: true });
    expect(full.ok).toBe(false);
    expect(full.ok === false && full.reason).toContain(String(EQUIP_MAX));
    // put one down and the slot comes back
    const after = dispatch(w, { type: 'equip', itemId: 'bat', on: false });
    expect(after.player.equipped!.length).toBe(EQUIP_MAX - 1);
    expect(can(after, { type: 'equip', itemId: 'burner', on: true }).ok).toBe(true);
  });

  it('will not carry what you do not own, or put down what you are not holding', () => {
    const w = ready();
    expect(can(w, { type: 'equip', itemId: 'glock19', on: true }).ok).toBe(false);
    give(w, 'glock19');
    expect(can(w, { type: 'equip', itemId: 'glock19', on: false }).ok).toBe(false);
    expect(can(w, { type: 'equip', itemId: 'nonsense', on: true }).ok).toBe(false);
  });

  it('will not carry the same one twice when you only have one', () => {
    let w = ready();
    give(w, 'bat');
    w = dispatch(w, { type: 'equip', itemId: 'bat', on: true });
    expect(can(w, { type: 'equip', itemId: 'bat', on: true }).ok).toBe(false);
    give(w, 'bat');                                  // a second bat, and now you can
    expect(can(w, { type: 'equip', itemId: 'bat', on: true }).ok).toBe(true);
  });
});

describe('markets', () => {
  const marketIn = (w: World) => Object.values(w.businesses).find(b => isMarket(b))!;

  it('are pawn shops and back rooms, and a back room carries what a pawn shop cannot', () => {
    const w = ready();
    const pawn = Object.values(w.businesses).find(b => b.type === 'pawn');
    const back = Object.values(w.businesses).find(b => b.type === 'black_market');
    expect(pawn || back, 'a city has somewhere to buy kit').toBeTruthy();
    if (pawn) expect(marketStock(pawn).every(i => !i.underCounter)).toBe(true);
    for (const b of Object.values(w.businesses).filter(x => !isMarket(x))) expect(marketStock(b)).toEqual([]);
    // a shop's shelf is its own and does not shift underneath the player
    const m = marketIn(w);
    expect(marketStock(m).map(i => i.id)).toEqual(marketStock(m).map(i => i.id));
    expect(marketStock(m).length).toBeGreaterThan(0);
  });

  it('sells for clean cash, face to face, and hands over the goods', () => {
    const w = ready();
    const m = marketIn(w);
    const item = marketStock(m)[0];
    const away = Object.keys(w.blocks).find(id => id !== m.blockId)!;
    w.player.currentBlockId = away;
    const far = can(w, { type: 'buy_item', businessId: m.id, itemId: item.id });
    expect(far.ok).toBe(false);
    expect(far.ok === false && far.reason).toMatch(/Walk over first/);

    w.player.currentBlockId = m.blockId;
    w.player.cash = item.cost - 1;
    expect(can(w, { type: 'buy_item', businessId: m.id, itemId: item.id }).ok).toBe(false);  // clean cash only
    w.player.dirty = 99999;
    expect(can(w, { type: 'buy_item', businessId: m.id, itemId: item.id }).ok).toBe(false);  // dirty does not buy it
    w.player.cash = item.cost;
    const next = dispatch(w, { type: 'buy_item', businessId: m.id, itemId: item.id });
    expect(next.player.cash).toBe(0);
    expect(next.player.items).toContain(item.id);
    expect(next.player.dirty).toBe(99999);                                                   // untouched
  });

  it('will not sell you what is not on the shelf', () => {
    const w = ready();
    const m = marketIn(w);
    w.player.currentBlockId = m.blockId;
    const absent = Object.values(ITEM_DEFS).find(i => !marketStock(m).some(s => s.id === i.id));
    if (absent) expect(can(w, { type: 'buy_item', businessId: m.id, itemId: absent.id }).ok).toBe(false);
  });

  it('buys used kit back at a used price, in dirty money', () => {
    const w = ready();
    const m = marketIn(w);
    w.player.currentBlockId = m.blockId;
    carry(w, 'glock19');
    const dirtyBefore = w.player.dirty; const cleanBefore = w.player.cash;
    const paid = select.sellPrice(w, ITEM_DEFS.glock19);
    expect(paid).toBeLessThan(ITEM_DEFS.glock19.cost * (RESALE + 0.15));      // used goods, used prices
    const next = dispatch(w, { type: 'sell_item', businessId: m.id, itemId: 'glock19' });
    expect(next.player.dirty).toBe(dirtyBefore + paid);                      // dirty, like anything else out of a back room
    expect(next.player.cash).toBe(cleanBefore);
    expect(next.player.items).not.toContain('glock19');
    expect(next.player.equipped).not.toContain('glock19');                    // and it is off you, not just out of the drawer
    expect(can(next, { type: 'sell_item', businessId: m.id, itemId: 'glock19' }).ok).toBe(false);
  });

  it('keeps the second one when you sell one of a pair', () => {
    const w = ready();
    const m = marketIn(w);
    w.player.currentBlockId = m.blockId;
    carry(w, 'bat'); give(w, 'bat');
    const next = dispatch(w, { type: 'sell_item', businessId: m.id, itemId: 'bat' });
    expect(select.ownedCount(next, 'bat')).toBe(1);
    expect(select.equippedCount(next, 'bat')).toBe(1);                       // the one in your hand stays in your hand
  });
});
