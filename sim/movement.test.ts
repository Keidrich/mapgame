import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type Block, type World } from './index';
import { FOOTHOLD, legworkFor, route } from './travel';
import { BUSINESS_DEFS } from '@content/businesses';
import { owes } from './test-util';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });

/**
 * A fixed line of six blocks, A–F, each linked to the next. Built on top of a real world so
 * everything else (player, safehouses) is valid, but with a graph we control exactly.
 *
 *   A — B — C — D — E — F
 */
function line(w: World, n = 6): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < n; i++) {
    const id = `tb${i}`;
    const b: Block = {
      id, chunkKey: 'test', polygon: [], center: { lat: 51.5 + i * 0.001, lng: -0.12 }, areaM2: 10000,
      neighborIds: [], edgeKeys: [], streetNames: [], name: `Test ${String.fromCharCode(65 + i)}`,
      districtId: Object.keys(w.districts)[0] ?? '', wealth: 50, police: 40, heat: 0, population: 50,
      demand: { booze: 1, green: 1, pills: 1, hot_goods: 1, counterfeit: 1, streetwear: 1 }, influence: {},
      businessIds: [], memory: [], tags: [],
    };
    w.blocks[id] = b; blocks.push(b);
  }
  for (let i = 0; i < n - 1; i++) { blocks[i].neighborIds.push(blocks[i + 1].id); blocks[i + 1].neighborIds.push(blocks[i].id); }
  w.player.currentBlockId = blocks[0].id;
  w.player.legwork = w.player.legworkMax = 10;
  return blocks;
}

/** Give the player enough influence on a block to run it. */
function own(w: World, blockId: string) { w.blocks[blockId].influence = { [PLAYER]: 60 }; }
/** Give the player a presence short of running it. */
function foothold(w: World, blockId: string) { w.blocks[blockId].influence = { [PLAYER]: FOOTHOLD, rival: 50 }; }

describe('walking the block graph', () => {
  it('costs one legwork a hop, and the path is the shortest one', () => {
    const w = mk(); const b = line(w);
    expect(route(w, b[0].id, b[0].id)!.cost).toBe(0);
    expect(route(w, b[0].id, b[1].id)!.cost).toBe(1);
    expect(route(w, b[0].id, b[3].id)!.cost).toBe(3);
    expect(route(w, b[0].id, b[5].id)!.cost).toBe(5);
    expect(route(w, b[0].id, b[3].id)!.hops).toEqual([b[1].id, b[2].id, b[3].id]);
    // a shortcut from A to E makes the far end cheaper
    b[0].neighborIds.push(b[4].id); b[4].neighborIds.push(b[0].id);
    expect(route(w, b[0].id, b[5].id)!.cost).toBe(2);
  });

  it('refuses a destination that is not connected', () => {
    const w = mk(); const b = line(w);
    w.blocks.island = { ...b[0], id: 'island', name: 'Island', neighborIds: [] };
    expect(route(w, b[0].id, 'island')).toBeUndefined();
    const r = can(w, { type: 'move', toBlockId: 'island' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/No way through/);
  });

  it('spends legwork, not AP, and refuses when the walk is too far', () => {
    let w = mk(); const b = line(w);
    w.player.legwork = 2; const ap0 = w.player.ap;
    const far = can(w, { type: 'move', toBlockId: b[5].id });
    expect(far.ok).toBe(false);
    expect(far.ok === false && far.reason).toMatch(/5 legwork away and you have 2/);
    w = dispatch(w, { type: 'move', toBlockId: b[2].id });
    expect(w.player.currentBlockId).toBe(b[2].id);
    expect(w.player.legwork).toBe(0);
    expect(w.player.ap).toBe(ap0);          // walking never costs an action
    // out of legwork: even one hop is refused
    expect(can(w, { type: 'move', toBlockId: b[3].id }).ok).toBe(false);
    // and it comes back at End Day
    for (const e of w.pendingEvents) w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    w = dispatch(w, { type: 'end_day' });
    expect(w.player.legwork).toBe(w.player.legworkMax);
    expect(w.player.currentBlockId).toBe(b[2].id); // you stay where you slept
  });

  it('is free across blocks you run, and a safehouse alone buys nothing', () => {
    let w = mk(); const b = line(w);
    expect(route(w, b[0].id, b[5].id)!.cost).toBe(5);
    // a safehouse on every block does not make the walk cheaper any more: only influence does
    for (const x of b) { const id = `ts${x.id}`; w.safehouses[id] = { id, blockId: x.id, name: 'S', tier: 1, owner: PLAYER, stash: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0, streetwear: 0 }, cash: 0, productionIds: [], capacity: 60, hostageIds: [] }; x.safehouseId = id; w.player.safehouseIds.push(id); }
    expect(route(w, b[0].id, b[5].id)!.cost).toBe(5);
    // run the blocks and the whole stretch is free to move through
    for (const x of b) own(w, x.id);
    expect(route(w, b[0].id, b[5].id)!.cost).toBe(0);
    expect(route(w, b[0].id, b[1].id)!.cost).toBe(0);
    // and walking it costs nothing even with an empty pool
    w.player.legwork = 0;
    expect(can(w, { type: 'move', toBlockId: b[5].id }).ok).toBe(true);
    w = dispatch(w, { type: 'move', toBlockId: b[5].id });
    expect(w.player.currentBlockId).toBe(b[5].id);
    expect(w.player.legwork).toBe(0);
  });

  it('charges half where you have a foothold but do not run the block', () => {
    const w = mk(); const b = line(w);
    for (const x of b) foothold(w, x.id);
    expect(route(w, b[0].id, b[4].id)!.cost).toBe(2);   // four half-price hops
    expect(route(w, b[0].id, b[1].id)!.cost).toBe(1);   // a single hop still rounds up to 1
    expect(route(w, b[0].id, b[3].id)!.cost).toBe(2);   // 1.5 rounds up
    // just under the bar is full price
    for (const x of b) x.influence = { [PLAYER]: FOOTHOLD - 1, rival: 50 };
    expect(route(w, b[0].id, b[4].id)!.cost).toBe(4);
  });

  it('prefers a longer way round through your own turf', () => {
    const w = mk(); const b = line(w, 4);
    // a detour A → X → Y → D alongside the direct A → B → C → D
    for (const id of ['x', 'y']) w.blocks[id] = { ...b[0], id, name: id.toUpperCase(), neighborIds: [], influence: {} };
    w.blocks.x.neighborIds = [b[0].id, 'y']; w.blocks.y.neighborIds = ['x', b[3].id];
    b[0].neighborIds.push('x'); b[3].neighborIds.push('y');
    expect(route(w, b[0].id, b[3].id)!.cost).toBe(3);
    for (const id of [b[0].id, 'x', 'y', b[3].id]) own(w, id);
    const r = route(w, b[0].id, b[3].id)!;
    expect(r.cost).toBe(0);                    // all yours, so the long way round is free
    expect(r.hops).toEqual(['x', 'y', b[3].id]);
  });

  it('leaving your turf still costs, one hop at a time', () => {
    const w = mk(); const b = line(w);
    own(w, b[0].id); own(w, b[1].id);          // you run A and B, nothing else
    expect(route(w, b[0].id, b[1].id)!.cost).toBe(0);
    expect(route(w, b[0].id, b[2].id)!.cost).toBe(1);   // free to B, then one hop out
    expect(route(w, b[0].id, b[4].id)!.cost).toBe(3);
  });

  it('legwork comes from wheels', () => {
    expect(legworkFor(0)).toBe(3);
    expect(legworkFor(4)).toBe(5);
    expect(legworkFor(10)).toBe(8);
    const w = mk();
    expect(w.player.legworkMax).toBe(legworkFor(w.player.skills.wheels));
    expect(w.player.currentBlockId).toBe(select.startBlock(w).id);
  });
});

/** True when this action was refused specifically because the player is somewhere else. */
const blockedByDistance = (r: { ok: boolean; reason?: string }) => r.ok === false && /Walk over first/.test(r.reason ?? '');

describe('face-to-face actions need you to be there', () => {
  /** A person on the start block and one somewhere else. */
  const people = (w: World) => {
    const here = select.startBlock(w);
    const near = Object.values(w.npcs).find(n => n.alive && !n.official && n.homeBlockId === here.id && n.role === 'patron');
    const away = Object.values(w.npcs).find(n => n.alive && !n.official && n.homeBlockId !== here.id && n.role === 'patron');
    return { here, near, away };
  };

  it('refuses a visit, read, threaten or recruit off-block and allows it on-block', () => {
    const w = mk(3); const { near, away } = people(w);
    expect(near).toBeDefined(); expect(away).toBeDefined();
    // Recruiting checks the familiarity floor before it checks the distance, so that a player is
    // never walked across town only to be told they were never going to say yes. Both of these
    // therefore have to be people you already know, or the refusal under test never surfaces.
    owes(w, near!); owes(w, away!);
    for (const act of [
      { type: 'visit' as const, npcId: away!.id },
      { type: 'read' as const, npcId: away!.id },
      { type: 'threaten' as const, npcId: away!.id },
      { type: 'recruit' as const, npcId: away!.id },
    ]) expect(blockedByDistance(can(w, act))).toBe(true);
    // the same actions are never refused for distance when they are standing in front of you
    for (const act of [
      { type: 'visit' as const, npcId: near!.id },
      { type: 'read' as const, npcId: near!.id },
      { type: 'threaten' as const, npcId: near!.id },
      { type: 'recruit' as const, npcId: near!.id },
    ]) expect(blockedByDistance(can(w, act))).toBe(false);
    expect(can(w, { type: 'visit', npcId: near!.id }).ok).toBe(true);
  });

  it('a shakedown needs you at the door', () => {
    const w = mk(3);
    const here = select.startBlock(w);
    // a shakedown is refused for "nothing to shake here" before distance is even considered,
    // so both sides of this test need a place that can actually be leaned on
    const extortable = (b: { type: string }) => BUSINESS_DEFS[b.type as keyof typeof BUSINESS_DEFS].rackets.includes('protection');
    const mine = select.businessesIn(w, here.id).find(b => b.ownedBy === 'npc' && extortable(b));
    const other = Object.values(w.businesses).find(b => b.blockId !== here.id && b.ownedBy === 'npc' && extortable(b));
    expect(other).toBeDefined();
    expect(blockedByDistance(can(w, { type: 'shakedown', businessId: other!.id }))).toBe(true);
    if (mine) expect(blockedByDistance(can(w, { type: 'shakedown', businessId: mine.id }))).toBe(false);
  });

  it('walking there makes the action legal', () => {
    let w = mk(3); const { away } = people(w);
    const dest = away!.homeBlockId;
    const cost = select.travelCost(w, dest);
    expect(cost).toBeDefined();
    w.player.legwork = w.player.legworkMax = Math.max(w.player.legworkMax, cost!);
    expect(can(w, { type: 'visit', npcId: away!.id }).ok).toBe(false);
    w = dispatch(w, { type: 'move', toBlockId: dest });
    expect(w.player.currentBlockId).toBe(dest);
    expect(can(w, { type: 'visit', npcId: away!.id }).ok).toBe(true);
    expect(w.log.at(-1)!.text).toMatch(/You walk from/);
  });

  it('leaves paperwork alone: assign, audit, fire, bribes and buying do not need presence', () => {
    const w = mk(3);
    const here = select.startBlock(w);
    const away = Object.values(w.npcs).find(n => n.alive && n.role === 'patron' && n.homeBlockId !== here.id)!;
    // recruited by fiat, then managed from anywhere
    away.crew = { loyalty: 60, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    away.role = 'crew'; w.player.crewIds.push(away.id);
    expect(can(w, { type: 'assign', npcId: away.id }).ok).toBe(true);
    expect(can(w, { type: 'fire', npcId: away.id }).ok).toBe(true);
    const official = Object.values(w.npcs).find(n => n.official)!;
    w.player.cash = 500000;
    expect(can(w, { type: 'bribe_official', npcId: official.id, amount: 2000 }).ok).toBe(true);
    const farBiz = Object.values(w.businesses).find(b => b.blockId !== here.id && b.ownedBy === 'npc')!;
    expect(blockedByDistance(can(w, { type: 'buy_business', businessId: farBiz.id, offer: farBiz.value * 3 }))).toBe(false);
    const ltCrew = w.npcs[away.id].crew!; ltCrew.assignment = { kind: 'lieutenant', districtId: w.blocks[away.homeBlockId].districtId }; ltCrew.status = 'assigned';
    expect(blockedByDistance(can(w, { type: 'audit', npcId: away.id }))).toBe(false);
  });
});
