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
  target: 'business' | 'npc' | 'faction' | 'block' | 'district' | 'none';
  targetTypes?: string[];      // business types
  ownBusiness?: boolean;       // must target your own business
  cost?: number;               // upfront
  tier?: number;               // where it sits in the ops tree, for layout only
  requires?: OpRequires;       // what the empire must look like before this is on the table
}

/** What an op needs from you before it is even offered. All conditions must hold. */
export interface OpRequires {
  crewCount?: number;          // people who have ever joined your crew
  safehouseTier?: number;      // a safehouse at this tier or better
  racketKinds?: RacketKind[];  // at least one of these running right now
  businessOwned?: boolean;     // you own a business outright
  priorOps?: OpKind[];         // you have pulled off at least one of these
}
export const OP_DEFS: Record<OpKind, OpDef> = {
  heist_bank:      { label: 'Bank Job', icon: '🏦', blurb: 'The big one. Vault, hostages, getaway.', planDays: 5, minCrew: 3, maxCrew: 5, needs: { brains: 14, muscle: 10, wheels: 8, tech: 8 }, difficulty: 80, payout: [40000, 120000], heat: 35, target: 'business', targetTypes: ['bank'], tier: 4, requires: { priorOps: ['heist_jeweller', 'heist_armored'] } },
  heist_jeweller:  { label: 'Jewel Heist', icon: '💎', blurb: 'Smash and grab, or cut the glass. Loot needs fencing.', planDays: 3, minCrew: 2, maxCrew: 4, needs: { brains: 8, tech: 8, wheels: 6 }, difficulty: 60, payout: [12000, 40000], lootKind: 'hot_goods', heat: 20, target: 'business', targetTypes: ['jeweller'], tier: 3, requires: { safehouseTier: 2 } },
  heist_armored:   { label: 'Armored Car', icon: '🚚', blurb: 'Hit the truck on its route. Loud.', planDays: 4, minCrew: 3, maxCrew: 5, needs: { muscle: 16, wheels: 10, brains: 6 }, difficulty: 70, payout: [25000, 70000], heat: 30, target: 'business', targetTypes: ['armored_depot'], tier: 3, requires: { safehouseTier: 2 } },
  heist_warehouse: { label: 'Warehouse Job', icon: '📦', blurb: 'Empty a warehouse overnight. Goods, not cash.', planDays: 2, minCrew: 2, maxCrew: 4, needs: { muscle: 6, wheels: 8, tech: 4 }, difficulty: 45, payout: [6000, 18000], lootKind: 'hot_goods', heat: 12, target: 'business', targetTypes: ['warehouse'], tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  robbery:         { label: 'Stick-Up', icon: '🔫', blurb: 'Walk in, take the till. Quick and dumb.', planDays: 0, minCrew: 0, maxCrew: 2, needs: { muscle: 5 }, difficulty: 30, payout: [400, 1800], heat: 8, target: 'business', tier: 0 },
  insurance_fraud: { label: 'Insurance Fraud', icon: '🔥', blurb: 'Torch your own insured place, collect the policy.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { tech: 5, brains: 4 }, difficulty: 40, payout: [0, 0], heat: 10, target: 'business', ownBusiness: true, tier: 1, requires: { businessOwned: true } },
  check_kiting:    { label: 'Check Kiting', icon: '🧾', blurb: 'Float bad paper between banks through a front you own.', planDays: 3, minCrew: 1, maxCrew: 2, needs: { brains: 10 }, difficulty: 50, payout: [5000, 15000], heat: 8, target: 'business', ownBusiness: true, tier: 1, requires: { businessOwned: true } },
  smuggle_run:     { label: 'Smuggle Run', icon: '🛻', blurb: 'Drive a load in from out of town. Product at cost.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { wheels: 8 }, difficulty: 40, payout: [0, 0], lootKind: 'booze', heat: 8, target: 'none', cost: 1500, tier: 1, requires: { crewCount: 1 } },
  frame:           { label: 'Frame', icon: '🗂️', blurb: 'Plant product and paper on a rival boss or lieutenant and let the cops do the rest. Quiet, if it works.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { brains: 8, tech: 6 }, difficulty: 55, payout: [0, 0], heat: 5, target: 'npc', cost: 500, tier: 1, requires: { crewCount: 1 } },
  hit:             { label: 'Hit', icon: '🎯', blurb: 'Someone stops being a problem. Permanently.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { muscle: 10, wheels: 4 }, difficulty: 55, payout: [0, 0], heat: 25, target: 'npc', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  intimidate:      { label: 'Send a Message', icon: '🔨', blurb: 'Bats and broken windows. Fear without a body.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 6 }, difficulty: 25, payout: [0, 0], heat: 6, target: 'business', tier: 0 },
  takeover:        { label: 'Take the Corner', icon: '🏴', blurb: 'Roll up on a street crew and take their block. Lighter than a faction raid.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 8 }, difficulty: 35, payout: [300, 1200], heat: 8, target: 'block', tier: 0 },
  steal_formula:   { label: 'Steal a Formula', icon: '📜', blurb: 'Break into a rival cook, a pharmacy or a print works and leave with something you can use.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { tech: 8, brains: 6 }, difficulty: 50, payout: [0, 0], heat: 10, target: 'none', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  scout_block:     { label: 'Scout the Edges', icon: '🔦', blurb: 'Walk the dead streets at the edge of a district and find out what is still standing. You may come back with nothing.', planDays: 1, minCrew: 0, maxCrew: 2, needs: { brains: 5, tech: 3, wheels: 3 }, difficulty: 30, payout: [0, 0], heat: 2, target: 'district', tier: 0 },
  claim_abandoned: { label: 'Take the Lot', icon: '🏚️', blurb: 'Move into a derelict block: clear whoever is sleeping there, or buy the paperwork. Nobody collects rent on a place that is not on anyone\'s books.', planDays: 1, minCrew: 0, maxCrew: 3, needs: { muscle: 5, brains: 4 }, difficulty: 35, payout: [0, 0], heat: 6, target: 'block', tier: 1, requires: { priorOps: ['scout_block'] } },
  kidnap:          { label: 'Take Someone', icon: '🕳️', blurb: 'Put somebody in the back of a van and hold them somewhere quiet. You need a safehouse with room, and holding them is its own problem.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { muscle: 8, wheels: 6 }, difficulty: 50, payout: [0, 0], heat: 18, target: 'npc', tier: 2, requires: { crewCount: 1, safehouseTier: 1 } },
  raid_rival:      { label: 'Raid Rival Racket', icon: '⚔️', blurb: 'Hit a rival racket, take the cash box, wreck the place.', planDays: 1, minCrew: 2, maxCrew: 5, needs: { muscle: 12, wheels: 4 }, difficulty: 50, payout: [1500, 6000], heat: 12, target: 'business', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
};

export const SAFEHOUSE_TIERS = [
  { rent: 600, capacity: 60, crewBeds: 3, label: 'Back room' },
  { rent: 2500, capacity: 200, crewBeds: 6, label: 'Apartment' },
  { rent: 8000, capacity: 600, crewBeds: 12, label: 'Compound' },
];

export const RACKET_UPGRADE_COST = [0, 1500, 5000];
/** Production upgrade cost as a multiple of the production's setup cost, by current level. */
export const PRODUCTION_UPGRADE_MULT = [0, 1.2, 2.5];
export const PRODUCTION_LEVEL = { output: 0.7, quality: 8, heat: 0.4 }; // per level above 1

export interface RecipeDef { label: string; kind: ProductionKind; blurb: string; quality: number; output: number; heat: number; risk: number }
/** Recipes change what a production makes. Unlocked by the Steal a Formula op or by recruiting a specialist who knows one. */
export const RECIPES: Record<string, RecipeDef> = {
  aged:        { label: 'Barrel-aged', kind: 'still', blurb: 'Slower, but people ask for it by name.', quality: 25, output: 0.8, heat: 1, risk: 1 },
  sugar_shine: { label: 'Sugar shine', kind: 'still', blurb: 'Volume over taste.', quality: -10, output: 1.4, heat: 1, risk: 1.1 },
  hydro:       { label: 'Hydroponics', kind: 'grow_op', blurb: 'More lamps, more yield, more on the power bill.', quality: 5, output: 1.3, heat: 1.25, risk: 1 },
  import_cut:  { label: 'Import cut', kind: 'grow_op', blurb: 'A strain nobody else in town has.', quality: 25, output: 0.9, heat: 1, risk: 1 },
  clean_synth: { label: 'Clean synthesis', kind: 'lab', blurb: 'Fewer fumes, fewer fires, a better product.', quality: 20, output: 1, heat: 0.8, risk: 0.7 },
  bulk_press:  { label: 'Bulk press', kind: 'lab', blurb: 'Press them fast and cut them hard.', quality: -10, output: 1.5, heat: 1.3, risk: 1.2 },
  intaglio:    { label: 'Intaglio plates', kind: 'print_shop', blurb: 'Real plates. Passes at a bank.', quality: 30, output: 0.85, heat: 1, risk: 1 },
  bleach_wash: { label: 'Bleached bills', kind: 'print_shop', blurb: 'Wash ones, print hundreds. Fast and ugly.', quality: -15, output: 1.4, heat: 1.2, risk: 1.1 },
};
/** What a unit of product sells for relative to average quality (50). */
export const qualityMult = (q: number) => 0.7 + q / 200;

/** Delegation: what it takes to hand a crew member a district, and what they do with it. */
export const LIEUTENANT = {
  ap: 1,
  minLoyalty: 50,
  minDays: 5,          // days in the crew before you would trust them with a book
  minSkills: 9,        // muscle + brains + charm
  cutMult: 1.5,        // lieutenants cost more
  influencePerDay: 1,  // on district blocks where you already have a foothold
  coverFloor: 0.5,     // runner factor for an unmanned racket they cover: floor + skill/12
  coverCap: 1.15,
  riskMult: 0.85,      // incident risk on unmanned rackets they cover (unmanned is 1.2, a runner 0.7)
  skimMin: 0.08, skimMax: 0.2,
  skimEventAt: 400,    // undiscovered skim before "the books feel light" can come up
  flipChance: 0.05,    // per day, per lieutenant, when a hostile faction has a foothold in the district
  flipResist: 45,      // loyalty (with trait adjustments) needed to bring the offer to you instead of taking it
  flipInfluence: 15,   // player influence lost per district block when they go over
};
export const TRAIT_LABELS: Record<string, string> = {
  greedy: 'Greedy', loyal: 'Loyal', coward: 'Coward', hothead: 'Hothead', connected: 'Connected',
  honest: 'Honest', ambitious: 'Ambitious', junkie: 'Junkie', gambler: 'Gambler', quiet: 'Quiet',
};

export type OpApproach = 'loud' | 'quiet' | 'inside';
export interface OpApproachDef { label: string; icon: string; blurb: string; good: string; bad: string; skillWeight: Partial<Skills>; difficulty: number; payout: number; heat: number }
export const OP_APPROACHES: Record<OpApproach, OpApproachDef> = {
  loud:   { label: 'Go in loud', icon: '💥', blurb: 'Muscle and wheels. Fast, brutal, unforgettable.', good: '+25% take', bad: 'Heat ×1.6; failure means bodies', skillWeight: { muscle: 1.3, wheels: 1.2, tech: 0.6, brains: 0.8 }, difficulty: -4, payout: 1.25, heat: 1.6 },
  quiet:  { label: 'Quiet job', icon: '🤫', blurb: 'Brains and tech. In and out with nobody the wiser.', good: 'Heat ×0.5', bad: 'Harder; a slip means arrests', skillWeight: { tech: 1.3, brains: 1.3, muscle: 0.6, wheels: 0.9 }, difficulty: 6, payout: 1, heat: 0.5 },
  inside: { label: 'Inside man', icon: '🕵️', blurb: 'Someone at the target who trusts you opens the door. They take a cut.', good: 'Much easier', bad: 'Fail and your contact is burned', skillWeight: { brains: 1.1 }, difficulty: -22, payout: 0.85, heat: 0.7 },
};
