/**
 * Kit: equipment, read-only helpers over `content/items.ts`.
 *
 * An item is a def id in `items` (owned) and `equipped` (carried). Duplicates are allowed — two
 * bats are two bats — and nothing here is an instance with state, because for this phase items do
 * not wear out, break or get lost. When something does take a piece of kit off you, it removes one
 * id and that is the whole of it.
 *
 * **Anybody can carry kit.** The player and every member of the crew hold the same pair of arrays,
 * so every read below takes a `Kitted` and defaults to `w.player` — which is what the old
 * single-subject signatures meant, spelled out. Both arrays are optional on both types on purpose:
 * a save made before kit existed has neither on the player, a save made before crew had pockets has
 * neither on any NPC, and everything here defaults instead of dropping the save.
 */
import { EQUIP_MAX, ITEM_DEFS, RESALE, type ItemDef, type ItemMods } from '@content/items';
import type { OpApproach } from '@content/rackets';
import { hashString } from './rng';
import type { Business, Id, Skills, World } from './types';

export { EQUIP_MAX, RESALE };

/** Anything with pockets: the player, or somebody in the crew. */
export interface Kitted { items?: Id[]; equipped?: Id[] }

const defsOf = (ids: readonly string[]): ItemDef[] => ids.map((id: string) => ITEM_DEFS[id]).filter(Boolean);

/** Everything they own, carried or not. */
export function ownedItems(w: World, who: Kitted = w.player): ItemDef[] { return defsOf(who.items ?? []); }
/** What they have on them right now — the only kit a job can use. */
export function equippedItems(w: World, who: Kitted = w.player): ItemDef[] { return defsOf(who.equipped ?? []); }
export function isEquipped(w: World, itemId: string, who: Kitted = w.player): boolean { return (who.equipped ?? []).includes(itemId); }
export function ownedCount(w: World, itemId: string, who: Kitted = w.player): number { return (who.items ?? []).filter(id => id === itemId).length; }
export function equippedCount(w: World, itemId: string, who: Kitted = w.player): number { return (who.equipped ?? []).filter(id => id === itemId).length; }
/** `EQUIP_MAX` is per person, not per outfit: three things each, however many of you there are. */
export function equipSlotsLeft(w: World, who: Kitted = w.player): number { return Math.max(0, EQUIP_MAX - (who.equipped ?? []).length); }

// --------------------------------------------------- what a set of kit is worth
// One implementation of each formula, over a list of items. **Who is holding them is the caller's
// question** — one person (`kitSkillBoost`), everybody on an op (`jobSkillBoost`), or whoever
// turned up to a fight at your door (`sim/combat.ts`, over `poolKit`). Keeping the formulas here
// and the "whose kit" question outside them is what stopped this pass forking the heat maths three
// ways: the same three lines price a mugging and a man on your doorstep.

export function skillBoostOf(items: readonly ItemDef[]): Partial<Skills> {
  const out: Partial<Skills> = {};
  for (const it of items) {
    for (const [k, v] of Object.entries(it.mods.skillBoost ?? {}) as [keyof Skills, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
export function approachBiasOf(items: readonly ItemDef[], approach?: OpApproach): number {
  if (!approach) return 0;
  let bias = 0;
  for (const it of items) bias += it.mods.approachBias?.[approach] ?? 0;
  return bias;
}
export function heatMultOf(items: readonly ItemDef[]): number {
  let mult = 1;
  for (const it of items) mult *= it.mods.heatMult ?? 1;
  return mult;
}

/** One person's carried kit: its skill help, as a lump. */
export function kitSkillBoost(w: World, who: Kitted = w.player): Partial<Skills> { return skillBoostOf(equippedItems(w, who)); }

/**
 * How much one person's carried kit scales an approach's skill weights: the sum of what each item
 * is worth to that approach. A sawn-off is +0.5 on loud and −0.35 on quiet, so the same kit that
 * makes one approach a good idea makes the other one worse.
 */
export function kitApproachBias(w: World, approach?: OpApproach, who: Kitted = w.player): number { return approachBiasOf(equippedItems(w, who), approach); }

/**
 * What the carried kit is worth on the night somebody comes for you personally.
 *
 * The only kit number a job never sees, and **the only one that is never pooled** — a vest stops
 * a bullet aimed at the man wearing it and nobody else, so `jobKit` below leaves it alone. It is
 * summed here and added in `personalCover`, which is the one place the game subtracts a defence, so
 * armour cannot leak into `opChance` or `addHeat` however it is written: neither of them reads this.
 */
export function kitCover(w: World, who: Kitted = w.player): number {
  let cover = 0;
  for (const it of equippedItems(w, who)) cover += it.mods.cover ?? 0;
  return cover;
}

/** What one person's carried kit does to the heat a job leaves behind, the same way an approach does. */
export function kitHeatMult(w: World, who: Kitted = w.player): number { return heatMultOf(equippedItems(w, who)); }

/** Everything one person's kit is doing at once, for the UI to explain in one place. */
export function kitMods(w: World, approach?: OpApproach, who: Kitted = w.player): ItemMods & { approachBias: number } {
  return { skillBoost: kitSkillBoost(w, who), approachBias: kitApproachBias(w, approach, who), heatMult: kitHeatMult(w, who) };
}

// --------------------------------------------------- the kit that is actually on a job
/**
 * Whose hands are on this job: the crew assigned to it, plus you — unless you are not available
 * to be anywhere.
 *
 * Ops resolve at End Day whether or not the player can be there (`sim/tick.ts` runs them
 * unconditionally), so "it ran without you" is a real state and not a hypothetical: you can be in a
 * cell, or deliberately off the street. On those nights the job is your crew and their kit, which
 * is the sharpest reason in the game to have bought them any.
 *
 * Note this is about *kit*, not skill. Whether the player's own hands count toward the skill total
 * is a separate, older rule (`opChance` folds them in on `minCrew === 0` jobs only) and this pass
 * deliberately does not touch it.
 */
export function handsOn(w: World, crewIds: readonly Id[]): Kitted[] {
  const hands: Kitted[] = [];
  if (w.player.jailedDays <= 0 && (w.player.layLowUntil ?? 0) <= w.day) hands.push(w.player);
  for (const id of crewIds) { const n = w.npcs[id]; if (n) hands.push(n); }
  return hands;
}

/**
 * The kit a job actually runs on: **one item per category, across everybody on it, whole.**
 *
 * This is the decision this feature turns on, so it is spelled out rather than left to fall out.
 *
 * *Not* the sum of everybody's kit. Heat is **multiplicative** — five crew each carrying a sawn-off
 * at ×1.4 would be ×5.4 heat on one job — and `approachBias` feeds a `1 + bias` multiplier on every
 * skill weight, so fifteen items of bias would swamp the roll entirely. Summing does not need
 * balancing; it needs not doing.
 *
 * *Not* the best value per mod either, which is the other obvious answer and the worse one: picking
 * the quietest heat off one gun and the biggest muscle off another lets a player carry both and keep
 * only the good half of each. That would dissolve the tradeoffs the catalogue is built on — a
 * Benelli is dearer than an 870 *and quieter*, and the whole point is that you choose.
 *
 * So: a job carries one weapon, one tool, one vehicle. Whichever is the **dearest of its kind**
 * anybody brought is the one that counts, and its whole `mods` block counts with it — its help and
 * its cost together. Cost is the only scalar the catalogue has for how serious a piece of kit is,
 * and it is used here for that and nothing else (it deliberately does *not* order mod quality
 * inside a family; see `docs/DESIGN.md` §4.7c). Ties break on id so the answer is stable.
 *
 * Armour is excluded outright. Its one job mod is a penalty for wearing it (`wheels −3` on a plate
 * carrier) and its real effect is `cover`, which is personal. Pooling it would mean a second man in
 * a light vest could cancel the first man's plates, which is nonsense — so the wearer keeps both
 * halves, and neither reaches the job.
 */
export function poolKit(w: World, hands: readonly Kitted[]): ItemDef[] {
  const best = new Map<ItemDef['category'], ItemDef>();
  for (const who of hands) {
    for (const it of equippedItems(w, who)) {
      if (it.category === 'armor') continue;
      const held = best.get(it.category);
      if (!held || it.cost > held.cost || (it.cost === held.cost && it.id < held.id)) best.set(it.category, it);
    }
  }
  return [...best.values()];
}

/** `poolKit` over whoever is on this op. */
export function jobKit(w: World, crewIds: readonly Id[]): ItemDef[] { return poolKit(w, handsOn(w, crewIds)); }

/** The skill help the kit on this job is worth, added to the crew's total. */
export function jobSkillBoost(w: World, crewIds: readonly Id[]): Partial<Skills> { return skillBoostOf(jobKit(w, crewIds)); }
/** How much the kit on this job scales the approach's skill weights. */
export function jobApproachBias(w: World, crewIds: readonly Id[], approach?: OpApproach): number { return approachBiasOf(jobKit(w, crewIds), approach); }
/** What the kit on this job does to the heat it leaves behind. */
export function jobHeatMult(w: World, crewIds: readonly Id[]): number { return heatMultOf(jobKit(w, crewIds)); }

// ---------------------------------------------------------------- markets
/**
 * The three shops that trade in kit, and what each one will put out.
 *
 * One table rather than three branches, so adding a fourth shop is a row here and nothing else:
 *
 *  - a **pawn shop** takes anything and displays what it is allowed to — a broad, shallow shelf;
 *  - a **computer store** sells tech and only tech, all of it legal, and knows its own trade, so
 *    its shelf is narrower in kind and deeper in it. This is where a wire player actually shops;
 *  - a **back room** carries everything, including what nobody with a sign over the door will
 *    touch. That is the whole of what `underCounter` means.
 */
const SHELVES: Partial<Record<Business['type'], { want: number; keep: (it: ItemDef) => boolean }>> = {
  pawn:           { want: 3, keep: it => !it.underCounter },
  computer_store: { want: 4, keep: it => it.category === 'tech' && !it.underCounter },
  black_market:   { want: 5, keep: () => true },
};

/** Places that trade in kit. */
export function isMarket(biz: Business): boolean { return !!SHELVES[biz.type]; }

/**
 * What this place has on the shelf. Derived from the business id, so a shop's stock is its own
 * and never changes under the player — and costs nothing in the save.
 */
export function marketStock(biz: Business): ItemDef[] {
  const shop = SHELVES[biz.type]; if (!shop) return [];
  const shelf = Object.values(ITEM_DEFS).filter(shop.keep);
  if (!shelf.length) return [];
  const h = hashString(biz.id);
  // a stable, shop-specific slice, always in the same order. Stepping by two rather than one is
  // what stops every shop of a kind looking like the one down the road.
  const start = h % shelf.length;
  return Array.from({ length: Math.min(shop.want, shelf.length) }, (_, i) => shelf[(start + i * 2) % shelf.length])
    .filter((it, i, all) => all.indexOf(it) === i);
}

/** What a market asks for one. */
export function buyPrice(item: ItemDef): number { return item.cost; }
/**
 * What they pay for a used one: half, nudged by how well the player talks. Dirty money, like
 * anything else sold out of a back room — there is no clean-cash exception for selling kit.
 */
export function sellPrice(w: World, item: ItemDef): number {
  return Math.max(1, Math.round(item.cost * RESALE * (0.9 + w.player.skills.charm / 50)));
}
