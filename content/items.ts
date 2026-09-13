/**
 * Kit: what the player personally carries. A layer alongside the product Stash, not a
 * replacement for it — the stash is bulk goods you sell by the unit, this is equipment you
 * own, carry, and take on a job.
 *
 * Every item is a tradeoff, never a flat upgrade. A sawn-off makes a loud job far better and
 * a quiet one much worse; lockpicks do the opposite; a car gets you away from both. The
 * numbers below are the whole of an item's effect — `sim/items.ts` reads them and nothing
 * else invents behaviour per item.
 */
import type { OpApproach } from './rackets';
import type { Skills } from '@sim/types';

export type ItemCategory = 'weapon' | 'tool' | 'tech' | 'vehicle';

export interface ItemMods {
  /** Added to the crew's skill total on an op, as if somebody brought an extra pair of hands. */
  skillBoost?: Partial<Skills>;
  /** Per approach: how much it scales that approach's skill weights. +0.3 is a third better, −0.2 a fifth worse. */
  approachBias?: Partial<Record<OpApproach, number>>;
  /** Multiplies the heat an op leaves behind, the same way an approach does. */
  heatMult?: number;
}

export interface ItemDef {
  id: string;
  label: string;
  icon: string;
  category: ItemCategory;
  cost: number;          // what a market asks, in clean cash
  blurb: string;         // one line, on the row
  detail: string;        // what it actually does, for the explainer
  mods: ItemMods;
  /** Only the back rooms will touch it; a pawn shop will not have it on the shelf. */
  underCounter?: boolean;
}

/** How much of your kit you can carry at once. Everything else is at home. */
export const EQUIP_MAX = 3;
/** What a market pays for a used one, before the haggling your charm does. */
export const RESALE = 0.5;

export const ITEM_DEFS: Record<string, ItemDef> = {
  // ---- weapons: three tiers, each louder than the last ----
  bat: {
    id: 'bat', label: 'Baseball Bat', icon: '🏏', category: 'weapon', cost: 90,
    blurb: 'Nobody can prove what it is for.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.12, quiet: -0.08 }, heatMult: 1.05 },
    detail: 'Muscle +1. Loud jobs go a little better, quiet ones a little worse. Barely raises heat — it is a bat until you swing it.',
  },
  pistol: {
    id: 'pistol', label: 'Pistol', icon: '🔫', category: 'weapon', cost: 900, underCounter: true,
    blurb: 'Ends most arguments before they start.', mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.3, quiet: -0.2 }, heatMult: 1.25 },
    detail: 'Muscle +2. Loud jobs land far more often and quiet ones much less: you cannot be subtle carrying this. Every job leaves a quarter more heat.',
  },
  sawnoff: {
    id: 'sawnoff', label: 'Sawn-Off', icon: '💥', category: 'weapon', cost: 2600, underCounter: true,
    blurb: 'For when the point needs making once.', mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.5, quiet: -0.35 }, heatMult: 1.5 },
    detail: 'Muscle +3 and the best there is on a loud job. A quiet job with this under your coat is barely worth attempting, and the police remember the ones that go wrong.',
  },
  // ---- tools ----
  lockpicks: {
    id: 'lockpicks', label: 'Lockpick Set', icon: '🗝️', category: 'tool', cost: 400,
    blurb: 'Doors stop being doors.', mods: { skillBoost: { tech: 1 }, approachBias: { quiet: 0.35, loud: -0.15 }, heatMult: 0.9 },
    detail: 'Tech +1. Quiet jobs go a third better and loud ones slightly worse, and a job done through the lock leaves less behind.',
  },
  // ---- tech: also the groundwork for what comes after ----
  burner: {
    id: 'burner', label: 'Burner Phone', icon: '📱', category: 'tech', cost: 120,
    blurb: 'A number nobody has had before.', mods: { skillBoost: { brains: 1 }, approachBias: { quiet: 0.1, inside: 0.15 }, heatMult: 0.85 },
    detail: 'Brains +1, and an inside job runs smoother when nobody can tie the calls to you. Cuts the heat a job leaves by 15%.',
  },
  laptop: {
    id: 'laptop', label: 'Laptop', icon: '💻', category: 'tech', cost: 1800,
    blurb: 'Somebody else\'s books, open on your table.', mods: { skillBoost: { brains: 1, tech: 2 }, approachBias: { quiet: 0.2, inside: 0.1 }, heatMult: 0.95 },
    detail: 'Brains +1, tech +2. Quiet jobs go a fifth better. Worth having before you ever touch a keyboard in anger.',
  },
  // ---- vehicle ----
  getaway: {
    id: 'getaway', label: 'Getaway Car', icon: '🚙', category: 'vehicle', cost: 4500, underCounter: true,
    blurb: 'Plates that belong to nobody.', mods: { skillBoost: { wheels: 2 }, approachBias: { loud: 0.2, quiet: 0.05 }, heatMult: 0.85 },
    detail: 'Wheels +2, better on a loud job and a little better on a quiet one, and leaving fast means 15% less heat however it went.',
  },
};

export const ITEM_IDS = Object.keys(ITEM_DEFS);
export const CATEGORY_LABELS: Record<ItemCategory, string> = { weapon: 'Weapon', tool: 'Tool', tech: 'Tech', vehicle: 'Vehicle' };
