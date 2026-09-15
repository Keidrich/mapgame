/**
 * Buying headroom on caps that already existed.
 *
 * The thing that makes this worth testing rather than obvious: a purchased cap is only real if
 * every *enforcer* of that cap reads the new number. Beds are checked in the reducer when you
 * take somebody on and again in `scenes.ts` when somebody offers themselves; the safehouse limit
 * did not exist as a number at all before this. A raise that only one of those sees is worse than
 * no raise, because the player has paid for something that half works.
 */
import { describe, expect, it } from 'vitest';
import { CEILING, SAFEHOUSE_BASE_LIMIT } from '@content/fortune';
import { can, dispatch, generateWorld, select, type Npc, type World } from './index';
import { bedsTotal, ceilingAt, ceilingPrice, extraBeds, safehouseLimit } from './fortune';

function rich(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 55 });
  w.pendingEvents = []; w.day = 60; w.player.cash = 20_000_000;
  return w;
}
/** Fill every bed there is, so the next recruit is the one the cap refuses. */
function fillBeds(w: World): Npc[] {
  const spare = Object.values(w.npcs).filter(n => n.alive && n.role === 'patron' && !n.crew);
  const take = spare.slice(0, bedsTotal(w));
  for (const n of take) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 1 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  return spare.slice(bedsTotal(w));
}

describe('a bought cap is a permanent, real cap', () => {
  it('beds go up and stay up', () => {
    let w = rich();
    const before = bedsTotal(w);
    w = dispatch(w, { type: 'buy_ceiling', kind: 'crew' });
    expect(extraBeds(w)).toBe(CEILING.crew.per);
    expect(bedsTotal(w)).toBe(before + CEILING.crew.per);
    for (let i = 0; i < 5; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    expect(ceilingAt(w, 'crew'), 'the purchase evaporated overnight').toBe(1);
  });

  it('and it survives a save round trip', () => {
    const w = dispatch(rich(), { type: 'buy_ceiling', kind: 'safehouse' });
    const reloaded = JSON.parse(JSON.stringify(w)) as World;
    expect(safehouseLimit(reloaded)).toBe(safehouseLimit(w));
  });

  it('each one costs more than the last, and they run out', () => {
    let w = rich();
    let last = 0;
    for (let i = 0; i < CEILING.crew.max; i++) {
      const price = ceilingPrice(w, 'crew')!;
      expect(price, `buy ${i}`).toBeGreaterThan(last);
      last = price;
      w = dispatch(w, { type: 'buy_ceiling', kind: 'crew' });
    }
    expect(ceilingPrice(w, 'crew')).toBeUndefined();
    expect(can(w, { type: 'buy_ceiling', kind: 'crew' }).ok, 'kept selling past the top').toBe(false);
  });
});

describe('the raise reaches the thing that actually enforces the cap', () => {
  it('the reducer lets you take somebody on that it refused a moment ago', () => {
    const w = rich();
    const spare = fillBeds(w);
    const n = spare[0];
    // fully eligible on every *other* axis, so the only thing left to refuse them is the bed
    n.known = true; n.rel.trust = 90; n.rel.metDay = 1; n.rel.contacts = 8; n.rel.favours = 2;
    w.player.currentBlockId = n.homeBlockId;

    const before = can(w, { type: 'recruit', npcId: n.id });
    expect(before.ok, 'the bed cap was not actually binding, so this proves nothing').toBe(false);
    expect(!before.ok && before.reason).toMatch(/No room/i);

    const roomier = dispatch(w, { type: 'buy_ceiling', kind: 'crew' });
    const after = can(roomier, { type: 'recruit', npcId: n.id });
    expect(after.ok || !/No room/i.test((after as { reason: string }).reason),
      `still refused for space: ${!after.ok && after.reason}`).toBe(true);
  });

  it('every reader of the bed count sees the same number', () => {
    // `scenes.ts` has its own bed arithmetic for somebody offering themselves. One function now.
    const w = dispatch(rich(), { type: 'buy_ceiling', kind: 'crew' });
    expect(select.bedsTotal(w)).toBe(bedsTotal(w));
    expect(bedsTotal(w)).toBeGreaterThan(2);
  });

  it('safehouses have a limit at all now, and buying raises it', () => {
    const w = rich();
    expect(safehouseLimit(w)).toBe(SAFEHOUSE_BASE_LIMIT);
    const blocks = Object.values(w.blocks).filter(b => !b.safehouseId).slice(0, SAFEHOUSE_BASE_LIMIT + 2);
    let cur = w;
    for (let i = 0; i < SAFEHOUSE_BASE_LIMIT; i++) cur = dispatch(cur, { type: 'rent_safehouse', blockId: blocks[i].id });
    expect(cur.player.safehouseIds.length).toBe(SAFEHOUSE_BASE_LIMIT);

    const refused = can(cur, { type: 'rent_safehouse', blockId: blocks[SAFEHOUSE_BASE_LIMIT].id });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/at once/i);

    cur = dispatch(cur, { type: 'buy_ceiling', kind: 'safehouse' });
    expect(safehouseLimit(cur)).toBe(SAFEHOUSE_BASE_LIMIT + CEILING.safehouse.per);
    expect(can(cur, { type: 'rent_safehouse', blockId: blocks[SAFEHOUSE_BASE_LIMIT].id }).ok).toBe(true);
  });
});

describe('it adds no new caps', () => {
  it('both kinds raise a number that was already there', () => {
    const w = rich();
    // beds existed before any of this: two of your own plus whatever a safehouse holds
    expect(bedsTotal(w)).toBe(2 + extraBeds(w));
    expect(extraBeds(w)).toBe(0);
    // and the safehouse limit is a constant, not a new stat on the player
    expect(SAFEHOUSE_BASE_LIMIT).toBeGreaterThan(0);
    expect(w.player.ceilings).toBeUndefined();
  });
});
