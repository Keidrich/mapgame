/**
 * Who carries what, and what it does for them. Everything that reads a skill for a *person* on
 * a job or in a scene reads it through `skillOf`, so a pistol in somebody's belt counts wherever
 * that person's muscle does, and nowhere else.
 */
import { GEAR_TO_ITEM, ITEMS, type ItemId, type Slot } from '@r/content/kit';
import type { Id, Kit, Skill, World } from './types';
import { PLAYER } from './types';

export type Carrier = typeof PLAYER | Id;

export function kitOf(w: World, who: Carrier): Kit {
  if (who === PLAYER) return w.player.kit ?? {};
  return w.npcs[who]?.crew?.kit ?? {};
}
export function kitBonus(kit: Kit, skill: Skill): number {
  let n = 0;
  for (const id of Object.values(kit)) { const d = id ? ITEMS[id] : undefined; if (d?.skill === skill) n += d.bonus; }
  return n;
}
/** Protection from everything carried, stacked the way layers do: 1 − Π(1 − a). */
export function armourOf(kit: Kit): number {
  let keep = 1;
  for (const id of Object.values(kit)) { const a = id ? ITEMS[id]?.armour ?? 0 : 0; keep *= 1 - a; }
  return 1 - keep;
}
export function skillOf(w: World, who: Carrier, skill: Skill): number {
  const base = who === PLAYER ? w.player.skills[skill] : w.npcs[who]?.skills[skill] ?? 0;
  return base + kitBonus(kitOf(w, who), skill);
}

/** What a place sells. Nothing, for most places; the fixer sells what nobody else will. */
export function shopItems(w: World, at: Id | 'fixer'): ItemId[] {
  if (at === 'fixer') return (Object.keys(ITEMS) as ItemId[]).filter(id => ITEMS[id].sold.includes('fixer'));
  const b = w.businesses[at];
  if (!b || b.closed > 0) return [];
  return (Object.keys(ITEMS) as ItemId[]).filter(id => ITEMS[id].sold.includes(b.type));
}
export function isShop(w: World, businessId: Id) { return shopItems(w, businessId).length > 0; }

/** Put an item on somebody. Whatever they had in that slot goes back to the armoury. */
export function equip(w: World, item: ItemId, to: Carrier) {
  const p = w.player;
  const i = p.armoury.indexOf(item); if (i < 0) return;
  p.armoury.splice(i, 1);
  const kit = to === PLAYER ? (p.kit ??= {}) : (w.npcs[to].crew!.kit ??= {});
  const slot = ITEMS[item].slot;
  const was = kit[slot]; if (was) p.armoury.push(was);
  kit[slot] = item;
}
export function unequip(w: World, from: Carrier, slot: Slot) {
  const kit = from === PLAYER ? w.player.kit : w.npcs[from]?.crew?.kit;
  const item = kit?.[slot]; if (!kit || !item) return;
  delete kit[slot];
  w.player.armoury.push(item);
}
/** Somebody leaving the crew hands their kit back — the dead do not. */
export function returnKit(w: World, id: Id) {
  const kit = w.npcs[id]?.crew?.kit; if (!kit) return;
  for (const item of Object.values(kit)) if (item) w.player.armoury.push(item);
  w.npcs[id].crew!.kit = {};
}

/** A save from before kit existed: its outfit-wide gear levels become things the boss carries. */
export function migrateGear(w: World) {
  const p = w.player as World['player'] & { gear?: Record<keyof typeof GEAR_TO_ITEM, number> };
  if (!p.armoury) p.armoury = [];
  if (!p.kit) p.kit = {};
  if (p.gear) {
    for (const [k, lvl] of Object.entries(p.gear) as [keyof typeof GEAR_TO_ITEM, number][]) {
      if (lvl > 0) { const item = GEAR_TO_ITEM[k][Math.min(lvl, 3) - 1]; p.kit[ITEMS[item].slot] = item; }
    }
    delete p.gear;
  }
}
