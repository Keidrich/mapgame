import type { RacketKind, ProductionKind, OpKind, ProductKind, Skills } from '@sim/types';

export interface RacketDef {
  label: string;
  icon: string;
  blurb: string;
  setupCost: number;
  skill: keyof Skills;         // the runner's relevant skill
  heat: number;                // heat/day at level 1
  incomeBase: number;          // $/day at level 1 with an average runner, before scaling
  scale: 'business' | 'block' | 'float' | 'stash'; // what drives income
  dirty: boolean;              // produces dirty cash
  needsProduct?: boolean;
  launderCap?: number;         // laundering: $/day capacity at level 1
  risk: number;                // 0..1 daily chance of an incident at level 1
}

export const RACKET_DEFS: Record<RacketKind, RacketDef> = {
  protection:   { label: 'Protection', icon: '🛡️', blurb: 'The owner pays you a cut so nothing bad happens.', setupCost: 0, skill: 'muscle', heat: 0.5, incomeBase: 0, scale: 'business', dirty: true, risk: 0.04 },
  numbers:      { label: 'Numbers', icon: '🎟️', blurb: 'A daily lottery the neighbourhood plays. Steady money.', setupCost: 400, skill: 'brains', heat: 1, incomeBase: 120, scale: 'block', dirty: true, risk: 0.03 },
  bookmaking:   { label: 'Bookmaking', icon: '🏇', blurb: 'Take bets on the fights and the ponies.', setupCost: 800, skill: 'brains', heat: 2, incomeBase: 200, scale: 'block', dirty: true, risk: 0.05 },
  gambling_den: { label: 'Gambling Den', icon: '🎲', blurb: 'Card games in the back room. Big money, big noise.', setupCost: 2500, skill: 'charm', heat: 4, incomeBase: 450, scale: 'block', dirty: true, risk: 0.08 },
  loansharking: { label: 'Loansharking', icon: '💸', blurb: 'Lend at 20% a week. Collect however you have to.', setupCost: 500, skill: 'muscle', heat: 2, incomeBase: 0, scale: 'float', dirty: true, risk: 0.06 },
  fencing:      { label: 'Fencing', icon: '🧳', blurb: 'Turn hot goods into cash at 60 cents on the dollar.', setupCost: 600, skill: 'charm', heat: 2, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.04 },
  chop_shop:    { label: 'Chop Shop', icon: '🚗', blurb: 'Steal cars from the nice blocks, sell the parts.', setupCost: 1800, skill: 'wheels', heat: 3, incomeBase: 320, scale: 'block', dirty: true, risk: 0.07 },
  dealing:      { label: 'Dealing', icon: '💊', blurb: 'Move product to the patrons. Needs stock.', setupCost: 300, skill: 'charm', heat: 3, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.08 },
  laundering:   { label: 'Laundering', icon: '🧼', blurb: 'Dirty money in, clean money out, minus a cut.', setupCost: 1500, skill: 'brains', heat: 1, incomeBase: 0, scale: 'business', dirty: false, launderCap: 1500, risk: 0.03 },
  smuggling:    { label: 'Smuggling', icon: '🚢', blurb: 'Product comes in cheap through here.', setupCost: 2000, skill: 'wheels', heat: 3, incomeBase: 260, scale: 'block', dirty: true, risk: 0.06 },
  no_show_jobs: { label: 'No-Show Jobs', icon: '🧾', blurb: 'Your guys are on the payroll. They never show.', setupCost: 1200, skill: 'charm', heat: 2, incomeBase: 380, scale: 'business', dirty: false, risk: 0.04 },
};

export interface ProductionDef {
  label: string; icon: string; blurb: string; product: ProductKind;
  setupCost: number; ingredientCost: number; outputBase: number; skill: keyof Skills; heat: number; risk: number;
}
export const PRODUCTION_DEFS: Record<ProductionKind, ProductionDef> = {
  still:      { label: 'Still', icon: '🥃', blurb: 'Bathtub booze. Cheap to run, sells everywhere.', product: 'booze', setupCost: 1200, ingredientCost: 40, outputBase: 12, skill: 'tech', heat: 1, risk: 0.04 },
  grow_op:    { label: 'Grow Op', icon: '🌿', blurb: 'Lamps and patience. Best kept somewhere quiet.', product: 'green', setupCost: 2500, ingredientCost: 60, outputBase: 10, skill: 'brains', heat: 2, risk: 0.05 },
  lab:        { label: 'Lab', icon: '⚗️', blurb: 'Pills. High margin, high heat, and it stinks.', product: 'pills', setupCost: 6000, ingredientCost: 150, outputBase: 8, skill: 'tech', heat: 4, risk: 0.09 },
  print_shop: { label: 'Print Shop', icon: '🖨️', blurb: 'Funny money. Passes at 40 cents on the dollar.', product: 'counterfeit', setupCost: 4000, ingredientCost: 80, outputBase: 9, skill: 'tech', heat: 3, risk: 0.07 },
};

export const PRODUCT_INFO: Record<ProductKind, { label: string; icon: string; price: number; heat: number }> = {
  booze:       { label: 'Booze', icon: '🥃', price: 45, heat: 0.5 },
  green:       { label: 'Green', icon: '🌿', price: 90, heat: 1 },
  pills:       { label: 'Pills', icon: '💊', price: 180, heat: 2 },
  hot_goods:   { label: 'Hot Goods', icon: '📦', price: 100, heat: 1 },
  counterfeit: { label: 'Counterfeit', icon: '💵', price: 40, heat: 1.5 },
};

export interface OpDef {
  label: string; icon: string; blurb: string;
  planDays: number; minCrew: number; maxCrew: number;
  needs: Partial<Skills>;      // sum of crew skill across members needed for a fair roll
  difficulty: number;          // 0..100
  payout: [number, number];    // cash or loot value range
  lootKind?: ProductKind;
  heat: number;
  target: 'business' | 'npc' | 'faction' | 'block' | 'none';
  targetTypes?: string[];      // business types
  ownBusiness?: boolean;       // must target your own business
  cost?: number;               // upfront
}
export const OP_DEFS: Record<OpKind, OpDef> = {
  heist_bank:      { label: 'Bank Job', icon: '🏦', blurb: 'The big one. Vault, hostages, getaway.', planDays: 5, minCrew: 3, maxCrew: 5, needs: { brains: 14, muscle: 10, wheels: 8, tech: 8 }, difficulty: 80, payout: [40000, 120000], heat: 35, target: 'business', targetTypes: ['bank'] },
  heist_jeweller:  { label: 'Jewel Heist', icon: '💎', blurb: 'Smash and grab, or cut the glass. Loot needs fencing.', planDays: 3, minCrew: 2, maxCrew: 4, needs: { brains: 8, tech: 8, wheels: 6 }, difficulty: 60, payout: [12000, 40000], lootKind: 'hot_goods', heat: 20, target: 'business', targetTypes: ['jeweller'] },
  heist_armored:   { label: 'Armored Car', icon: '🚚', blurb: 'Hit the truck on its route. Loud.', planDays: 4, minCrew: 3, maxCrew: 5, needs: { muscle: 16, wheels: 10, brains: 6 }, difficulty: 70, payout: [25000, 70000], heat: 30, target: 'business', targetTypes: ['armored_depot'] },
  heist_warehouse: { label: 'Warehouse Job', icon: '📦', blurb: 'Empty a warehouse overnight. Goods, not cash.', planDays: 2, minCrew: 2, maxCrew: 4, needs: { muscle: 6, wheels: 8, tech: 4 }, difficulty: 45, payout: [6000, 18000], lootKind: 'hot_goods', heat: 12, target: 'business', targetTypes: ['warehouse'] },
  robbery:         { label: 'Stick-Up', icon: '🔫', blurb: 'Walk in, take the till. Quick and dumb.', planDays: 0, minCrew: 1, maxCrew: 2, needs: { muscle: 5 }, difficulty: 30, payout: [400, 1800], heat: 8, target: 'business' },
  insurance_fraud: { label: 'Insurance Fraud', icon: '🔥', blurb: 'Torch your own insured place, collect the policy.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { tech: 5, brains: 4 }, difficulty: 40, payout: [0, 0], heat: 10, target: 'business', ownBusiness: true },
  check_kiting:    { label: 'Check Kiting', icon: '🧾', blurb: 'Float bad paper between banks through a front you own.', planDays: 3, minCrew: 1, maxCrew: 2, needs: { brains: 10 }, difficulty: 50, payout: [5000, 15000], heat: 8, target: 'business', ownBusiness: true },
  smuggle_run:     { label: 'Smuggle Run', icon: '🛻', blurb: 'Drive a load in from out of town. Product at cost.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { wheels: 8 }, difficulty: 40, payout: [0, 0], lootKind: 'booze', heat: 8, target: 'none', cost: 1500 },
  hit:             { label: 'Hit', icon: '🎯', blurb: 'Someone stops being a problem. Permanently.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { muscle: 10, wheels: 4 }, difficulty: 55, payout: [0, 0], heat: 25, target: 'npc' },
  intimidate:      { label: 'Send a Message', icon: '🔨', blurb: 'Bats and broken windows. Fear without a body.', planDays: 0, minCrew: 1, maxCrew: 3, needs: { muscle: 6 }, difficulty: 25, payout: [0, 0], heat: 6, target: 'business' },
  raid_rival:      { label: 'Raid Rival Racket', icon: '⚔️', blurb: 'Hit a rival racket, take the cash box, wreck the place.', planDays: 1, minCrew: 2, maxCrew: 5, needs: { muscle: 12, wheels: 4 }, difficulty: 50, payout: [1500, 6000], heat: 12, target: 'business' },
};

export const SAFEHOUSE_TIERS = [
  { rent: 600, capacity: 60, crewBeds: 3, label: 'Back room' },
  { rent: 2500, capacity: 200, crewBeds: 6, label: 'Apartment' },
  { rent: 8000, capacity: 600, crewBeds: 12, label: 'Compound' },
];

export const RACKET_UPGRADE_COST = [0, 1500, 5000];
export const TRAIT_LABELS: Record<string, string> = {
  greedy: 'Greedy', loyal: 'Loyal', coward: 'Coward', hothead: 'Hothead', connected: 'Connected',
  honest: 'Honest', ambitious: 'Ambitious', junkie: 'Junkie', gambler: 'Gambler', quiet: 'Quiet',
};
