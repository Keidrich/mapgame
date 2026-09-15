/**
 * Kit: the player's own equipment, read-only helpers over `content/items.ts`.
 *
 * An item is a def id in `player.items` (owned) and `player.equipped` (carried). Duplicates
 * are allowed — two bats are two bats — and nothing here is an instance with state, because
 * for this phase items do not wear out, break or get lost. When something does take a piece
 * of kit off you, it removes one id and that is the whole of it.
 *
 * The two arrays are optional on `Player` on purpose: a save made before kit existed has
 * neither, and everything here defaults instead of dropping the save.
 */
import { EQUIP_MAX, ITEM_DEFS, RESALE, type ItemDef, type ItemMods } from '@content/items';
import type { OpApproach } from '@content/rackets';
import { hashString } from './rng';
import type { Business, Skills, World } from './types';

export { EQUIP_MAX, RESALE };

const defsOf = (ids: readonly string[]): ItemDef[] => ids.map((id: string) => ITEM_DEFS[id]).filter(Boolean);

/** Everything the player owns, carried or not. */
export function ownedItems(w: World): ItemDef[] { return defsOf(w.player.items ?? []); }
/** What they have on them right now — the only kit an op can use. */
export function equippedItems(w: World): ItemDef[] { return defsOf(w.player.equipped ?? []); }
export function isEquipped(w: World, itemId: string): boolean { return (w.player.equipped ?? []).includes(itemId); }
export function ownedCount(w: World, itemId: string): number { return (w.player.items ?? []).filter(id => id === itemId).length; }
export function equippedCount(w: World, itemId: string): number { return (w.player.equipped ?? []).filter(id => id === itemId).length; }
export function equipSlotsLeft(w: World): number { return Math.max(0, EQUIP_MAX - (w.player.equipped ?? []).length); }

/** The carried kit's skill help, as a lump added to the crew's total on a job. */
export function kitSkillBoost(w: World): Partial<Skills> {
  const out: Partial<Skills> = {};
  for (const it of equippedItems(w)) {
    for (const [k, v] of Object.entries(it.mods.skillBoost ?? {}) as [keyof Skills, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/**
 * How much the carried kit scales an approach's skill weights: the sum of what each item is
 * worth to that approach. A sawn-off is +0.5 on loud and −0.35 on quiet, so the same kit that
 * makes one approach a good idea makes the other one worse.
 */
export function kitApproachBias(w: World, approach?: OpApproach): number {
  if (!approach) return 0;
  let bias = 0;
  for (const it of equippedItems(w)) bias += it.mods.approachBias?.[approach] ?? 0;
  return bias;
}

/** What the carried kit does to the heat a job leaves behind, the same way an approach does. */
export function kitHeatMult(w: World): number {
  let mult = 1;
  for (const it of equippedItems(w)) mult *= it.mods.heatMult ?? 1;
  return mult;
}

/** Everything the kit is doing at once, for the UI to explain in one place. */
export function kitMods(w: World, approach?: OpApproach): ItemMods & { approachBias: number } {
  return { skillBoost: kitSkillBoost(w), approachBias: kitApproachBias(w, approach), heatMult: kitHeatMult(w) };
}

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
