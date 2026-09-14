/**
 * Standing orders: the difference between owning a production and running one by hand.
 *
 * The `production` crew assignment already had somebody working a still — but the player was
 * still picking the recipe by hand, and every unit that came out sat in a safehouse until they
 * personally carried it somewhere. A second still in a second safehouse doubled the clicking,
 * not the empire.
 *
 * Two standing orders fix that, in the same family as the existing collect / hack assignments:
 *
 *  - **A foreman** (`{ kind: 'foreman', productionId }`) keeps a production on the best recipe
 *    you currently know, restocks its ingredients, and walks the output to the nearest
 *    safehouse that has room. It is the production assignment with its head up.
 *  - **A distribution rule** on a product racket says where its stock comes from: the block it
 *    sits on, anywhere you own, or nowhere (you feed it by hand). This generalises the
 *    same-block restock that shipped with the dealing fix.
 *
 * Both are read by the tick. Neither invents a new kind of state: a foreman is an `Assignment`,
 * a rule is a field on the `Racket` that already existed.
 */
import { PRODUCTION_DEFS, RECIPES, qualityMult } from '@content/rackets';
import { productionQuality, recipesForKind, restockCost } from './production';
import { streetPrice } from './economy';
import { PLAYER, type Id, type Npc, type Production, type ProductKind, type Racket, type Safehouse, type World } from './types';
import { log, money } from './util';

/** How a product racket gets its stock. `block` is the default the dealing fix shipped with. */
export type SupplyRule = 'block' | 'empire' | 'manual';
export const SUPPLY_LABELS: Record<SupplyRule, { label: string; blurb: string }> = {
  block:  { label: 'This block', blurb: 'Takes from a safehouse of yours on this block. Nothing travels.' },
  empire: { label: 'Anywhere you own', blurb: 'Your people move it across town to whichever corner is selling.' },
  manual: { label: 'By hand', blurb: 'Nothing arrives unless you carry it yourself.' },
};

/** Units a standing order moves per racket per day. Deliberately finite: this is people driving. */
export const SUPPLY = { perDay: 40, empireHeat: 0.4 };
/** What a foreman will spend on ingredients without being asked, and how deep they keep the tin. */
export const FOREMAN = { restockDays: 7, keepStockAbove: 2, moveToSafehouse: 60 };

export const supplyRule = (r: Racket): SupplyRule => r.supply ?? 'block';

// ---------------------------------------------------------------- the best recipe you know
/**
 * Which known recipe this production should be running. "Best" is not simply the highest
 * quality: a recipe that doubles your heat while the police are already looking at you is a bad
 * recipe that day. Value per day is output × what a unit fetches at that quality, discounted by
 * what the extra heat and risk will cost you — so a foreman quietly moves to the slow, clean
 * method when things get warm, and back when they cool.
 */
export function bestRecipeFor(w: World, pr: Production): string | undefined {
  const known = recipesForKind(w, pr.kind);
  if (!known.length) return undefined;
  const heatPressure = 0.5 + w.player.heat / 70;          // 0.5 when clean, ~1.9 at heat 100
  const was = pr.recipe;
  // score against the real quality this production would actually reach with each recipe —
  // worker skill and upgrades are most of that number, so a flat guess ranks them wrongly
  // How full the house is decides what "best" even means. With room to spare, what matters is
  // value *per day* and volume wins. With the shelves full, every unit you make displaces one
  // you already have, so what matters is value *per unit* and the premium methods are suddenly
  // the right answer. Without this the slow, careful recipes were dead weight at every moment
  // of the game — measured, not assumed.
  const house = w.safehouses[pr.safehouseId];
  const used = house ? Object.values(house.stash).reduce((a, b) => a + b, 0) : 0;
  const fullness = house && house.capacity > 0 ? Math.min(1, used / house.capacity) : 0;
  const score = (id: string | undefined) => {
    const r = id ? RECIPES[id] : undefined;
    pr.recipe = id;
    const quality = productionQuality(w, pr);
    const worth = qualityMult(quality) * Math.pow(r?.output ?? 1, 1 - fullness);
    const cost = ((r?.heat ?? 1) - 1) * 0.35 * heatPressure + ((r?.risk ?? 1) - 1) * 0.3 * heatPressure;
    return worth - cost;
  };
  // the house standard (no recipe) is a real option and sometimes the right one: a premium
  // method that cuts output by a fifth has to earn that back on price, and often does not
  let best: string | undefined; let bestScore = score(undefined);
  for (const id of known) { const s = score(id); if (s > bestScore + 1e-9) { bestScore = s; best = id; } }
  pr.recipe = was;
  return best;
}

// ---------------------------------------------------------------- the foreman
export function foremanOf(w: World, productionId: Id): Npc | undefined {
  return w.player.crewIds
    .map(id => w.npcs[id])
    .find(n => n?.crew?.assignment?.kind === 'foreman' && n.crew.assignment.productionId === productionId && n.crew.status === 'assigned');
}
/** Somewhere of yours with room, nearest first — the same safehouse by preference. */
function nearestRoom(w: World, from: Safehouse, want: number): Safehouse | undefined {
  const room = (s: Safehouse) => s.capacity - Object.values(s.stash).reduce((a, b) => a + b, 0);
  return w.player.safehouseIds
    .map(id => w.safehouses[id])
    .filter(s => s && s.id !== from.id && room(s) >= Math.min(want, 1))   // never back where it came from
    .sort((a, b) => room(b) - room(a))[0];
}

/**
 * One day of a foreman's attention: keep it stocked, keep it on the right recipe, and move the
 * output somewhere it will not be wasted. Returns what they actually did, for the log.
 */
export function runForeman(w: World, pr: Production): string[] {
  const did: string[] = [];
  const house = w.safehouses[pr.safehouseId]; if (!house) return did;
  const def = PRODUCTION_DEFS[pr.kind];

  // 1. keep the tin full
  if (pr.stock <= FOREMAN.keepStockAbove) {
    const days = FOREMAN.restockDays;
    const cost = restockCost(w, pr, days);
    if (w.player.cash + w.player.dirty >= cost) {
      const fromDirty = Math.min(w.player.dirty, cost);
      w.player.dirty -= fromDirty; w.player.cash -= cost - fromDirty;
      pr.stock += days;
      did.push(`restocked ${days} days (${money(cost)})`);
    } else did.push('could not afford ingredients');
  }

  // 2. keep it on the best recipe you know
  const want = bestRecipeFor(w, pr);
  if (want !== pr.recipe) {
    pr.recipe = want;
    did.push(want ? `switched to ${RECIPES[want].label}` : 'went back to the house standard');
  }

  // 3. move finished goods somewhere with room
  const full = Object.values(house.stash).reduce((a, b) => a + b, 0) >= house.capacity * 0.85;
  if (full) {
    const to = nearestRoom(w, house, FOREMAN.moveToSafehouse);
    if (to) {
      const moved = moveProduct(house, to, def.product, FOREMAN.moveToSafehouse);
      if (moved > 0) did.push(`moved ${moved} to ${to.name}`);
    }
  }
  return did;
}

/** Shift units between two holders, respecting what is there and what fits. */
export function moveProduct(from: { stash: Record<string, number>; capacity?: number }, to: { stash: Record<string, number>; capacity?: number }, product: ProductKind, want: number): number {
  const have = from.stash[product] ?? 0;
  const used = Object.values(to.stash).reduce((a, b) => a + b, 0);
  const room = to.capacity === undefined ? Infinity : Math.max(0, to.capacity - used);
  const moved = Math.max(0, Math.min(have, want, room));
  if (moved <= 0) return 0;
  from.stash[product] = have - moved;
  to.stash[product] = (to.stash[product] ?? 0) + moved;
  return moved;
}

// ---------------------------------------------------------------- supply to a racket
/**
 * Feed one product racket from wherever its rule says it may draw. Returns units delivered.
 * `block` only reaches a safehouse on the racket's own block; `empire` reaches any of yours and
 * costs a little heat for the driving; `manual` does nothing at all.
 */
export function supplyRacket(w: World, r: Racket, product: ProductKind): number {
  const rule = supplyRule(r);
  if (rule === 'manual') return 0;
  const biz = w.businesses[r.businessId]; if (!biz) return 0;
  const houses = w.player.safehouseIds.map(id => w.safehouses[id]).filter(Boolean);
  const eligible = rule === 'block' ? houses.filter(s => s.blockId === biz.blockId) : houses;
  const source = eligible.filter(s => (s.stash[product] ?? 0) > 0).sort((a, b) => (b.stash[product] ?? 0) - (a.stash[product] ?? 0))[0];
  if (!source) return 0;
  const moved = moveProduct(source, { stash: w.player.stash }, product, SUPPLY.perDay);
  return moved;
}

/** Everything a player would want to know about a racket's standing order, for its card. */
export function supplyReading(w: World, r: Racket, product: ProductKind): { rule: SupplyRule; available: number; where?: string } {
  const rule = supplyRule(r);
  const biz = w.businesses[r.businessId];
  const houses = w.player.safehouseIds.map(id => w.safehouses[id]).filter(Boolean);
  const eligible = rule === 'manual' ? [] : rule === 'block' ? houses.filter(s => biz && s.blockId === biz.blockId) : houses;
  const withStock = eligible.filter(s => (s.stash[product] ?? 0) > 0).sort((a, b) => (b.stash[product] ?? 0) - (a.stash[product] ?? 0));
  return { rule, available: withStock.reduce((n, s) => n + (s.stash[product] ?? 0), 0), where: withStock[0]?.name };
}

// ---------------------------------------------------------------- the daily pass
/** Every foreman, then every standing order. Called once from the tick. */
export function tickAutomation(w: World, productProduct: (r: Racket) => ProductKind | undefined) {
  for (const pr of Object.values(w.productions)) {
    if (!w.player.safehouseIds.includes(pr.safehouseId)) continue;
    const boss = foremanOf(w, pr.id);
    if (!boss) continue;
    const did = runForeman(w, pr);
    if (did.length) log(w, `${boss.name} ${did.join(', ')} at ${w.safehouses[pr.safehouseId]?.name ?? 'the house'}.`, 'info', { npcId: boss.id, blockId: w.safehouses[pr.safehouseId]?.blockId });
  }
  let hauled = 0;
  for (const id of w.player.racketIds) {
    const r = w.rackets[id]; if (!r || r.disrupted) continue;
    const product = productProduct(r); if (!product) continue;
    const moved = supplyRacket(w, r, product);
    if (moved > 0 && supplyRule(r) === 'empire') hauled += moved;
  }
  return hauled;
}

/** What the empire-wide haulage costs in attention, once per day rather than per racket. */
export function haulHeat(units: number): number { return units > 0 ? SUPPLY.empireHeat : 0; }

export { streetPrice, PLAYER };
