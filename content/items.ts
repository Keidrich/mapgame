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

/** Weapons group into families that climb their own ladder. Cosmetic: it groups the shelf. */
export type ItemFamily = 'melee' | 'pistol' | 'shotgun' | 'rifle' | 'explosive';

export interface ItemDef {
  id: string;
  label: string;
  icon: string;
  category: ItemCategory;
  family?: ItemFamily;
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
  // ---- melee: cheap, quiet-ish, and nobody can prove what it was for ----
  knuckles: {
    id: 'knuckles', label: 'Knuckledusters', icon: '🥊', category: 'weapon', family: 'melee', cost: 40,
    blurb: 'Fits in a coat pocket.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.08, quiet: -0.04 } },
    detail: 'Muscle +1 and almost no extra heat. The cheapest way to stop being the smaller man in the room.',
  },
  bat: {
    id: 'bat', label: 'Baseball Bat', icon: '🏏', category: 'weapon', family: 'melee', cost: 90,
    blurb: 'Nobody can prove what it is for.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.12, quiet: -0.08 }, heatMult: 1.05 },
    detail: 'Muscle +1. Loud jobs go a little better, quiet ones a little worse. Barely raises heat — it is a bat until you swing it.',
  },
  machete: {
    id: 'machete', label: 'Machete', icon: '🔪', category: 'weapon', family: 'melee', cost: 260, underCounter: true,
    blurb: 'Ends a conversation without a bang.', mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.2, quiet: -0.12 }, heatMult: 1.15 },
    detail: 'Muscle +2 and the top of what you can carry without it being a firearm. Frightening out of all proportion to the price.',
  },
  // ---- pistols ----
  pistol: {
    id: 'pistol', label: 'Pistol', icon: '🔫', category: 'weapon', family: 'pistol', cost: 900, underCounter: true,
    blurb: 'Ends most arguments before they start.', mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.3, quiet: -0.2 }, heatMult: 1.25 },
    detail: 'Muscle +2. Loud jobs land far more often and quiet ones much less: you cannot be subtle carrying this. Every job leaves a quarter more heat.',
  },
  revolver: {
    id: 'revolver', label: 'Magnum Revolver', icon: '🔫', category: 'weapon', family: 'pistol', cost: 1500, underCounter: true,
    blurb: 'Six that go through a car door.', mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.36, quiet: -0.26 }, heatMult: 1.35 },
    detail: 'Muscle +3. Hits harder than a pistol in every way, including how loudly the police hear about it.',
  },
  suppressed: {
    id: 'suppressed', label: 'Suppressed Pistol', icon: '🤫', category: 'weapon', family: 'pistol', cost: 3200, underCounter: true,
    blurb: 'The only gun worth taking on a quiet job.', mods: { skillBoost: { muscle: 2, tech: 1 }, approachBias: { loud: 0.15, quiet: 0.2, inside: 0.1 }, heatMult: 0.8 },
    detail: 'Muscle +2, tech +1, and the exception to the rule: it helps a quiet job as much as a loud one, and cuts the heat a job leaves by a fifth. Expensive for the reason you would expect.',
  },
  // ---- shotguns ----
  sawnoff: {
    id: 'sawnoff', label: 'Sawn-Off', icon: '💥', category: 'weapon', family: 'shotgun', cost: 2600, underCounter: true,
    blurb: 'For when the point needs making once.', mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.5, quiet: -0.35 }, heatMult: 1.5 },
    detail: 'Muscle +3 and one of the best there is on a loud job. A quiet job with this under your coat is barely worth attempting, and the police remember the ones that go wrong.',
  },
  pump: {
    id: 'pump', label: 'Pump-Action', icon: '🔫', category: 'weapon', family: 'shotgun', cost: 3600, underCounter: true,
    blurb: 'The sound alone clears a room.', mods: { skillBoost: { muscle: 4 }, approachBias: { loud: 0.6, quiet: -0.45 }, heatMult: 1.65 },
    detail: 'Muscle +4 and the best loud weapon in the catalogue. Also the surest way to turn a quiet plan into a disaster and a job into a manhunt.',
  },
  // ---- rifle: the one that lets you not be in the room ----
  rifle: {
    id: 'rifle', label: 'Hunting Rifle', icon: '🎯', category: 'weapon', family: 'rifle', cost: 4400, underCounter: true,
    blurb: 'Reach. You do not have to be close.', mods: { skillBoost: { muscle: 3, brains: 1 }, approachBias: { loud: 0.42, quiet: -0.18, inside: 0.15 }, heatMult: 1.4 },
    detail: 'Muscle +3, brains +1. Nearly as good as a shotgun on a loud job and far less of a liability on a careful one, because the work happens from somewhere else.',
  },
  // ---- explosives: cheap chaos, and the heat to match ----
  molotov: {
    id: 'molotov', label: 'Molotov', icon: '🔥', category: 'weapon', family: 'explosive', cost: 70,
    blurb: 'A bottle, a rag, and a decision.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.28, quiet: -0.3 }, heatMult: 1.7 },
    detail: 'Loud jobs go a quarter better for almost nothing, but a fire is the loudest thing you can do: every job leaves 70% more heat.',
  },
  pipebomb: {
    id: 'pipebomb', label: 'Pipe Bomb', icon: '🧨', category: 'weapon', family: 'explosive', cost: 1300, underCounter: true,
    blurb: 'Somebody has to build it. Carefully.', mods: { skillBoost: { muscle: 2, tech: 1 }, approachBias: { loud: 0.45, quiet: -0.38 }, heatMult: 1.9 },
    detail: 'Muscle +2, tech +1, and a loud job goes far better. It also doubles what the job leaves behind: the police treat a bomb as a different kind of crime, because it is.',
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
export const FAMILY_LABELS: Record<ItemFamily, string> = { melee: 'Melee', pistol: 'Pistol', shotgun: 'Shotgun', rifle: 'Rifle', explosive: 'Explosive' };
