import { describe, expect, it } from 'vitest';
import { PLAYER, can, dispatch, generateWorld, select, type World } from './index';
import { RECIPES } from '@content/rackets';
import { addProduct, moveProduct, productionQuality, qualityOf, resolveProductionEvent, unlockRecipe } from './production';
import { resolveOp } from './ops';
import { Rng } from './rng';

const mk = (seed = 5) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed });

/** A world with a safehouse, a still, and a tech-8 worker on it. */
function setup(seed = 5): { w: World; prodId: string; shId: string; workerId: string } {
  let w = mk(seed); w.player.cash = 60000;
  const start = select.startBlock(w);
  w = dispatch(w, { type: 'rent_safehouse', blockId: start.id });
  const shId = w.player.safehouseIds[0]; expect(shId).toBeDefined();
  w = dispatch(w, { type: 'start_production', safehouseId: shId, kind: 'still' });
  const prodId = w.safehouses[shId].productionIds[0]; expect(prodId).toBeDefined();
  const n = Object.values(w.npcs).find(x => x.role === 'patron' && x.alive)!;
  n.skills = { muscle: 3, brains: 4, charm: 4, wheels: 2, tech: 8 }; n.traits = [];
  n.crew = { loyalty: 70, cut: 60, status: 'idle', statusDays: 0, joinedDay: 1 }; n.role = 'crew'; w.player.crewIds.push(n.id);
  w = dispatch(w, { type: 'assign', npcId: n.id, assignment: { kind: 'production', productionId: prodId } });
  w = dispatch(w, { type: 'restock_production', productionId: prodId, days: 7 });
  return { w, prodId, shId, workerId: n.id };
}

describe('production quality and recipes', () => {
  it('quality comes from the worker, the level and the recipe, and follows the product', () => {
    const { w, prodId, shId } = setup();
    const pr = w.productions[prodId];
    const withWorker = productionQuality(w, pr);
    expect(withWorker).toBeGreaterThan(60);
    pr.workerId = undefined; expect(productionQuality(w, pr)).toBeLessThan(withWorker); pr.workerId = w.player.crewIds[0];
    pr.level = 3; expect(productionQuality(w, pr)).toBeGreaterThan(withWorker); pr.level = 1;
    w.player.recipes = ['aged']; pr.recipe = 'aged'; expect(productionQuality(w, pr)).toBe(Math.min(100, withWorker + RECIPES.aged.quality));
    // a day of output lands in the safehouse at that quality, and moving it carries the number along
    let w2 = dispatch(w, { type: 'end_day' });
    for (const e of w2.pendingEvents) w2 = dispatch(w2, { type: 'resolve_event', eventId: e.id, optionId: e.options.at(-1)!.id });
    const sh = w2.safehouses[shId];
    expect(sh.stash.booze).toBeGreaterThan(0);
    expect(qualityOf(sh, 'booze')).toBe(w2.productions[prodId].quality);
    const w3 = dispatch(w2, { type: 'move_stash', from: shId, to: 'player', product: 'booze', amount: sh.stash.booze });
    expect(qualityOf(w3.player, 'booze')).toBe(qualityOf(sh, 'booze'));
    // and quality moves the street price
    const q = qualityOf(w3.player, 'booze'); w3.player.ap = 8;
    const sellAt = (quality: number) => { const t = structuredClone(w3); t.player.quality = { booze: quality }; const r = dispatch(t, { type: 'sell_product', product: 'booze', amount: 5, blockId: select.startBlock(t).id }); return r.player.dirty - t.player.dirty; };
    expect(sellAt(90)).toBeGreaterThan(sellAt(20));
    void q;
  });
  it('mixing keeps a weighted average', () => {
    const h = { stash: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 } } as { stash: Record<'booze' | 'green' | 'pills' | 'hot_goods' | 'counterfeit', number>; quality?: Partial<Record<'booze', number>> };
    addProduct(h, 'booze', 10, 80); addProduct(h, 'booze', 10, 40);
    expect(qualityOf(h, 'booze')).toBe(60);
    const other = { stash: { booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 } };
    moveProduct(h, other, 'booze', 5);
    expect(h.stash.booze).toBe(15); expect(qualityOf(other, 'booze')).toBe(60);
  });
  it('upgrades and recipes are actions with rules', () => {
    let { w, prodId } = setup();
    expect(can(w, { type: 'set_recipe', productionId: prodId, recipe: 'aged' }).ok).toBe(false); // not known
    expect(unlockRecipe(w, 'aged', 'Test.')).toBe(true);
    expect(unlockRecipe(w, 'aged', 'Test.')).toBe(false);
    w = dispatch(w, { type: 'set_recipe', productionId: prodId, recipe: 'aged' });
    expect(w.productions[prodId].recipe).toBe('aged');
    expect(can(w, { type: 'set_recipe', productionId: prodId, recipe: 'hydro' }).ok).toBe(false); // wrong kind
    const cash = w.player.cash;
    w = dispatch(w, { type: 'upgrade_production', productionId: prodId });
    expect(w.productions[prodId].level).toBe(2); expect(w.player.cash).toBeLessThan(cash);
    w = dispatch(w, { type: 'upgrade_production', productionId: prodId });
    expect(can(w, { type: 'upgrade_production', productionId: prodId }).ok).toBe(false);
  });
  it('a stolen formula and a specialist recruit both unlock recipes', () => {
    const { w, workerId } = setup();
    const op = { id: 'o1', kind: 'steal_formula' as const, crewIds: [workerId], planDays: 0, daysLeft: 0, status: 'ready' as const, createdDay: w.day, launched: true };
    w.ops[op.id] = op; w.npcs[workerId].skills.tech = 10; w.npcs[workerId].skills.brains = 10;
    let got = false;
    for (let i = 0; i < 12 && !got; i++) { const t = structuredClone(w); resolveOp(t, t.ops[op.id], new Rng(i)); got = (t.player.recipes ?? []).length > 0; if (got) expect(RECIPES[t.player.recipes![0]].kind).toBe('still'); }
    expect(got).toBe(true);
    // specialist
    const w2 = mk(5); w2.player.cash = 5000;
    const n = Object.values(w2.npcs).find(x => x.role === 'patron' && x.alive)!; n.recipe = 'hydro'; n.rel.trust = 90; n.traits = ['greedy'];
    let w3 = w2; let tries = 0;
    while (!w3.npcs[n.id].crew && tries++ < 8) { w3 = dispatch(w3, { type: 'recruit', npcId: n.id, approach: 'cut' }); w3.player.ap = 8; }
    expect(w3.player.recipes).toContain('hydro');
  });
  it('production events change the world', () => {
    const { w, prodId, shId } = setup();
    const sh = w.safehouses[shId]; addProduct(sh, 'booze', 40, 30); w.productions[prodId].quality = 30; w.productions[prodId].lastOutput = 5;
    const ev = { id: 'e1', day: w.day, kind: 'bad_batch', title: '', text: '', options: [], refs: { blockId: sh.blockId } };
    const t = structuredClone(w); expect(resolveProductionEvent(t, ev, 'dump', new Rng(1))).toBe(true); expect(t.safehouses[shId].stash.booze).toBe(28);
    const t2 = structuredClone(w); resolveProductionEvent(t2, ev, 'sell', new Rng(1)); expect(t2.player.heat).toBeGreaterThan(w.player.heat);
    // shortage doubles restock
    const before = select.restockCost(w, w.productions[prodId], 7);
    w.market = { shortage: { still: w.day + 6 }, saturation: {} };
    expect(select.restockCost(w, w.productions[prodId], 7)).toBe(before * 2);
    expect(select.sellMult(w, 'booze')).toBeCloseTo(0.7 + 50 / 200, 5);
    w.market.saturation.booze = w.day + 5;
    expect(select.sellMult(w, 'booze')).toBeLessThan(0.7 + 50 / 200);
    void PLAYER;
  });
});
