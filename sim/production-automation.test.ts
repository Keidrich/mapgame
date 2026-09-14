/**
 * Standing orders.
 *
 * The production assignment put somebody in the room but left every decision with the player:
 * the recipe was picked by hand with `set_recipe`, and every unit that came out sat where it
 * was made until the player personally carried it. A second still doubled the clicking rather
 * than the empire.
 */
import { describe, expect, it } from 'vitest';
import { RECIPES } from '@content/rackets';
import { FOREMAN, SUPPLY } from './automation';
import { PLAYER, can, dispatch, generateWorld, select, type Id, type Production, type Safehouse, type World } from './index';
import { bestRecipeFor, foremanOf, runForeman, supplyRacket, supplyRule } from './automation';
import { emptyStash } from './generate';
import { mkRacket } from './reducer';
import { canHost } from './tiers';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed }); w.pendingEvents = []; w.player.cash = 300000; return w; };

function house(w: World, blockId?: Id): Safehouse {
  const s: Safehouse = { id: `sh_${Object.keys(w.safehouses).length}`, blockId: blockId ?? w.player.currentBlockId, name: 'The house', tier: 2, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: 200, hostageIds: [] };
  w.safehouses[s.id] = s; w.player.safehouseIds.push(s.id); w.blocks[s.blockId].safehouseId = s.id;
  return s;
}
function still(w: World, s: Safehouse): Production {
  const pr: Production = { id: `pr_${Object.keys(w.productions).length}`, kind: 'still', safehouseId: s.id, level: 1, stock: 0, lastOutput: 0, disrupted: 0 };
  w.productions[pr.id] = pr; s.productionIds.push(pr.id);
  return pr;
}
function hire(w: World, n = 1): Id[] {
  const out: Id[] = [];
  for (const x of Object.values(w.npcs).filter(v => v.alive && !v.crew && v.role === 'patron').slice(0, n)) {
    x.role = 'crew'; x.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    x.skills.tech = 8; w.player.crewIds.push(x.id); w.player.crewEver++; out.push(x.id);
  }
  return out;
}

describe('the foreman is a real assignment', () => {
  it('can be given to a crew member, and only for a production of yours', () => {
    const w = mk(); const [id] = hire(w);
    const s = house(w); const pr = still(w, s);
    expect(can(w, { type: 'assign', npcId: id, assignment: { kind: 'foreman', productionId: pr.id } }).ok).toBe(true);
    expect(can(w, { type: 'assign', npcId: id, assignment: { kind: 'foreman', productionId: 'nope' } }).ok).toBe(false);
  });

  it('takes the job and becomes the worker too — nobody runs a still from a desk', () => {
    const w = mk(); const [id] = hire(w);
    const s = house(w); const pr = still(w, s);
    const t = dispatch(w, { type: 'assign', npcId: id, assignment: { kind: 'foreman', productionId: pr.id } });
    expect(foremanOf(t, pr.id)?.id).toBe(id);
    expect(t.productions[pr.id].workerId).toBe(id);
  });

  it('two people cannot run the same one', () => {
    const w = mk(); const [a, b] = hire(w, 2);
    const s = house(w); const pr = still(w, s);
    const t = dispatch(w, { type: 'assign', npcId: a, assignment: { kind: 'foreman', productionId: pr.id } });
    expect(can(t, { type: 'assign', npcId: b, assignment: { kind: 'foreman', productionId: pr.id } }).ok).toBe(false);
  });
});

describe('it keeps the production on the best recipe it knows', () => {
  it('picks nothing when you know nothing — the house standard is a real option', () => {
    const w = mk(); const s = house(w); const pr = still(w, s);
    expect(select.recipesForKind(w, 'still')).toEqual([]);
    expect(bestRecipeFor(w, pr)).toBeUndefined();
  });

  it('switches to a known recipe without any set_recipe call from the player', () => {
    const w = mk(); const [id] = hire(w);
    const s = house(w); const pr = still(w, s);
    w.player.recipes = ['sugar_shine'];        // clearly beats the house standard on volume
    expect(pr.recipe).toBeUndefined();

    const t = dispatch(w, { type: 'assign', npcId: id, assignment: { kind: 'foreman', productionId: pr.id } });
    runForeman(t, t.productions[pr.id]);
    expect(t.productions[pr.id].recipe).toBe('sugar_shine');
  });

  it('and keeps switching as you learn better ones', () => {
    const w = mk(); const [id] = hire(w);
    const s = house(w); const pr = still(w, s); pr.workerId = id;
    w.player.recipes = ['sugar_shine'];
    runForeman(w, pr);
    expect(pr.recipe).toBe('sugar_shine');
    w.player.recipes = ['sugar_shine', 'overproof'];   // more volume again
    runForeman(w, pr);
    expect(pr.recipe).toBe('overproof');
    expect(RECIPES[pr.recipe!]).toBeTruthy();
  });

  it('takes the premium method once the shelves are full, and volume before that', () => {
    // the whole reason the slow careful recipes exist. With room, more units is more money;
    // with none, every unit you make displaces one you already have, so it had better be worth more.
    const roomy = mk(); const [id] = hire(roomy);
    const rs = house(roomy); const rp = still(roomy, rs); rp.workerId = id;
    roomy.player.recipes = ['overproof', 'bonded'];
    const full = structuredClone(roomy);
    full.safehouses[rs.id].stash.booze = full.safehouses[rs.id].capacity - 2;

    runForeman(roomy, rp);
    runForeman(full, full.productions[rp.id]);
    expect(roomy.productions[rp.id].recipe, 'room to spare: take the volume').toBe('overproof');
    expect(full.productions[rp.id].recipe, 'no room left: make it worth more per bottle').toBe('bonded');
  });

  it('goes quiet when the heat is up, which is the point of the new axis', () => {
    const cool = mk(); const cs = house(cool); const cp = still(cool, cs);
    cool.player.recipes = ['overproof', 'copper_pot'];   // loud and high-volume vs quiet and slow
    cool.player.heat = 0;
    const hot = structuredClone(cool);
    hot.player.heat = 95;

    runForeman(cool, cp);
    runForeman(hot, hot.productions[cp.id]);
    expect(cool.productions[cp.id].recipe, 'cool: take the volume').toBe('overproof');
    expect(hot.productions[cp.id].recipe, 'hot: take the quiet one').toBe('copper_pot');
  });
});

describe('it keeps the tin full and the shelves clear', () => {
  it('buys ingredients when they run out, without being asked', () => {
    const w = mk(); const s = house(w); const pr = still(w, s);
    pr.stock = 0;
    const before = w.player.cash + w.player.dirty;
    runForeman(w, pr);
    expect(pr.stock).toBeGreaterThanOrEqual(FOREMAN.restockDays);
    expect(w.player.cash + w.player.dirty).toBeLessThan(before);
  });

  it('says so rather than silently doing nothing when you cannot afford it', () => {
    const w = mk(); const s = house(w); const pr = still(w, s);
    pr.stock = 0; w.player.cash = 0; w.player.dirty = 0;
    const did = runForeman(w, pr);
    expect(pr.stock).toBe(0);
    expect(did.join(' ')).toMatch(/afford/);
  });

  it('moves output out of a full house into one with room', () => {
    const w = mk();
    const full = house(w); const spare = house(w, Object.values(w.blocks).find(b => b.id !== full.blockId)!.id);
    const pr = still(w, full);
    full.stash.booze = full.capacity - 5;
    runForeman(w, pr);
    expect(spare.stash.booze, 'nothing was moved anywhere').toBeGreaterThan(0);
    expect(full.stash.booze).toBeLessThan(full.capacity - 5);
  });

  it('leaves a house alone while it still has room', () => {
    const w = mk();
    const a = house(w); const b = house(w, Object.values(w.blocks).find(x => x.id !== a.blockId)!.id);
    const pr = still(w, a);
    a.stash.booze = 10;
    runForeman(w, pr);
    expect(b.stash.booze).toBe(0);
  });
});

describe('distribution: where a racket draws its stock', () => {
  function dealer(w: World, sameBlock: boolean) {
    const biz = Object.values(w.businesses).find(b => b.patronIds.length > 0)!;
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    const r = mkRacket(w, 'dealing', biz); r.product = 'green';
    const blockId = sameBlock ? biz.blockId : Object.values(w.blocks).find(b => b.id !== biz.blockId)!.id;
    const s = house(w, blockId); s.stash.green = 120;
    w.player.stash.green = 0;
    return { r, s, biz };
  }

  it('defaults to its own block, which is the behaviour the dealing fix shipped with', () => {
    const w = mk(); const { r, s } = dealer(w, true);
    expect(supplyRule(r)).toBe('block');
    const moved = supplyRacket(w, r, 'green');
    expect(moved).toBeGreaterThan(0);
    expect(w.player.stash.green).toBe(moved);
    expect(s.stash.green).toBe(120 - moved);
  });

  it('on "this block" it will not reach across town', () => {
    const w = mk(); const { r, s } = dealer(w, false);
    expect(supplyRacket(w, r, 'green')).toBe(0);
    expect(s.stash.green).toBe(120);
  });

  it('on "anywhere you own" it will', () => {
    const w = mk(); const { r, s } = dealer(w, false);
    const t = dispatch(w, { type: 'set_supply', racketId: r.id, rule: 'empire' });
    expect(supplyRule(t.rackets[r.id])).toBe('empire');
    const moved = supplyRacket(t, t.rackets[r.id], 'green');
    expect(moved).toBeGreaterThan(0);
    expect(t.safehouses[s.id].stash.green).toBeLessThan(120);
  });

  it('on "by hand" it never moves anything, however much you have', () => {
    const w = mk(); const { r } = dealer(w, true);
    const t = dispatch(w, { type: 'set_supply', racketId: r.id, rule: 'manual' });
    expect(supplyRacket(t, t.rackets[r.id], 'green')).toBe(0);
  });

  it('moves a bounded amount per day, not the whole warehouse at once', () => {
    const w = mk(); const { r, s } = dealer(w, true);
    s.stash.green = 5000;
    expect(supplyRacket(w, r, 'green')).toBe(SUPPLY.perDay);
  });

  it('end to end: a foreman upstairs and a dealer downstairs run themselves', () => {
    let w = mk(); const [id] = hire(w);
    // A place that can host dealing, with nobody else already collecting from it. Both halves
    // matter: the tier gate means not every business can host it, and a business under a rival's
    // protection earns the rival, not you — which looks exactly like the delivery never arriving.
    const biz = Object.values(w.businesses).find(b => b.patronIds.length > 0 && canHost(b, 'dealing') && !b.protection)!;
    biz.ownedBy = 'player'; w.player.businessIds.push(biz.id);
    const r = mkRacket(w, 'dealing', biz); r.product = 'booze';
    const s = house(w, biz.blockId);
    const pr = still(w, s); pr.stock = 20;
    w.player.recipes = ['sugar_shine'];
    w = dispatch(w, { type: 'assign', npcId: id, assignment: { kind: 'foreman', productionId: pr.id } });

    // Best day rather than the last one: `lastIncome` is a snapshot, and a racket that takes an
    // incident reads zero for the few days it is disrupted however well the pipeline works. The
    // claim is that stock made upstairs reaches the corner and sells, not that day five was good.
    let best = 0;
    for (let d = 0; d < 5; d++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); best = Math.max(best, w.rackets[r.id].lastIncome); }
    expect(w.productions[pr.id].recipe, 'the foreman never picked a recipe').toBe('sugar_shine');
    expect(w.safehouses[s.id].stash.booze, 'the foreman never made anything').toBeGreaterThan(0);
    expect(best, 'nothing ever reached the corner').toBeGreaterThan(0);
  });
});
