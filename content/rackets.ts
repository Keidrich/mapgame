import type { RacketKind, ProductionKind, OpKind, ProductKind, Skills, Stance } from '@sim/types';

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
  protection:   { label: 'Protection', icon: '💪', blurb: 'The owner pays you a cut so nothing bad happens.', setupCost: 0, skill: 'muscle', heat: 0.5, incomeBase: 0, scale: 'business', dirty: true, risk: 0.04 },
  numbers:      { label: 'Numbers', icon: '🎟️', blurb: 'A daily lottery the neighbourhood plays. Steady money.', setupCost: 400, skill: 'brains', heat: 1, incomeBase: 120, scale: 'block', dirty: true, risk: 0.03 },
  bookmaking:   { label: 'Bookmaking', icon: '🏇', blurb: 'Take bets on the fights and the ponies.', setupCost: 800, skill: 'brains', heat: 2, incomeBase: 200, scale: 'block', dirty: true, risk: 0.05 },
  gambling_den: { label: 'Gambling Den', icon: '🎲', blurb: 'Card games in the back room. Big money, big noise.', setupCost: 2500, skill: 'charm', heat: 4, incomeBase: 450, scale: 'block', dirty: true, risk: 0.08 },
  loansharking: { label: 'Loansharking', icon: '💸', blurb: 'Lend at 20% a week. Collect however you have to.', setupCost: 500, skill: 'muscle', heat: 2, incomeBase: 0, scale: 'float', dirty: true, risk: 0.06 },
  fencing:      { label: 'Fencing', icon: '💼', blurb: 'Turn hot goods into cash at 60 cents on the dollar.', setupCost: 600, skill: 'charm', heat: 2, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.04 },
  chop_shop:    { label: 'Chop Shop', icon: '🚗', blurb: 'Steal cars from the nice blocks, sell the parts.', setupCost: 1800, skill: 'wheels', heat: 3, incomeBase: 320, scale: 'block', dirty: true, risk: 0.07 },
  dealing:      { label: 'Dealing', icon: '💊', blurb: 'Move product to the patrons. Needs stock.', setupCost: 300, skill: 'charm', heat: 3, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.08 },
  laundering:   { label: 'Laundering', icon: '♻️', blurb: 'Dirty money in, clean money out, minus a cut.', setupCost: 1500, skill: 'brains', heat: 1, incomeBase: 0, scale: 'business', dirty: false, launderCap: 1500, risk: 0.03 },
  smuggling:    { label: 'Smuggling', icon: '🚢', blurb: 'Product comes in cheap through here.', setupCost: 2000, skill: 'wheels', heat: 3, incomeBase: 260, scale: 'block', dirty: true, risk: 0.06 },
  carding:      { label: 'Carding', icon: '💳', blurb: 'Somebody in the back turns stolen cards into clean-looking receipts. Wholesale, no questions.', setupCost: 900, skill: 'tech', heat: 2, incomeBase: 0, scale: 'stash', dirty: true, risk: 0.05 },
  no_show_jobs: { label: 'No-Show Jobs', icon: '📋', blurb: 'Your guys are on the payroll. They never show.', setupCost: 1200, skill: 'charm', heat: 2, incomeBase: 380, scale: 'business', dirty: false, risk: 0.04 },
  // ---- kinds worth picking between, now that spreading one thin costs you and stacking pays ----
  union_dues:     { label: 'Union Dues', icon: '📢', blurb: 'The local is yours. Dues come in every week and nobody asks where they go.', setupCost: 2200, skill: 'charm', heat: 1, incomeBase: 300, scale: 'business', dirty: false, risk: 0.03 },
  counterfeiting: { label: 'Counterfeiting', icon: '🖨️', blurb: 'A press in the back room. Worth what somebody will take for it, which is what a fence is for.', setupCost: 1600, skill: 'tech', heat: 3, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.06 },
  after_hours:    { label: 'After Hours', icon: '🌃', blurb: 'The place does not close. Drinks at four in the morning, at four in the morning prices.', setupCost: 1400, skill: 'charm', heat: 3, incomeBase: 340, scale: 'block', dirty: true, risk: 0.07 },
  policy_bank:    { label: 'Policy Bank', icon: '🏦', blurb: 'Not a numbers route but the bank behind several of them. Somebody else does the walking.', setupCost: 3200, skill: 'brains', heat: 2, incomeBase: 520, scale: 'block', dirty: true, risk: 0.05 },
  // ---------------------------------------------------------------- the crime pass
  // What the tier 1/2 types added alongside them are actually for. Each one is deliberately
  // vague about method: the game is about who pays who and what it costs, never about how.
  parts_stripping: { label: 'Parts Stripping', icon: '🔩', blurb: 'Cars come in whole and leave in pieces. Nobody reports the pieces.', setupCost: 900, skill: 'tech', heat: 2.5, incomeBase: 210, scale: 'block', dirty: true, risk: 0.06 },
  relay_export:    { label: 'Relay & Export', icon: '🚛', blurb: 'Somebody else\'s car, quietly, and out of the city before the paperwork catches up.', setupCost: 2200, skill: 'wheels', heat: 4, incomeBase: 380, scale: 'block', dirty: true, risk: 0.09 },
  card_supply:     { label: 'Card Supply', icon: '📱', blurb: 'You do not work the machines. You supply the people who do, and take a cut of all of it.', setupCost: 1600, skill: 'tech', heat: 3, incomeBase: 300, scale: 'block', dirty: true, risk: 0.07 },
  knockoffs:       { label: 'Knockoffs', icon: '👕', blurb: 'A rail at the front with the right labels on the wrong cloth. Nobody asks and nobody checks.', setupCost: 1400, skill: 'charm', heat: 1.5, incomeBase: 0, scale: 'stash', dirty: true, needsProduct: true, risk: 0.04 },
  script_diversion:{ label: 'Script Diversion', icon: '💊', blurb: 'A professional with a signature, a debt, and a reason to look the other way.', setupCost: 3000, skill: 'charm', heat: 3.5, incomeBase: 420, scale: 'block', dirty: true, risk: 0.08 },
};

export interface ProductionDef {
  label: string; icon: string; blurb: string; product: ProductKind;
  setupCost: number; ingredientCost: number; outputBase: number; skill: keyof Skills; heat: number; risk: number;
}
export const PRODUCTION_DEFS: Record<ProductionKind, ProductionDef> = {
  still:      { label: 'Still', icon: '🍺', blurb: 'Bathtub booze. Cheap to run, sells everywhere.', product: 'booze', setupCost: 1200, ingredientCost: 40, outputBase: 12, skill: 'tech', heat: 1, risk: 0.04 },
  grow_op:    { label: 'Grow Op', icon: '🌿', blurb: 'Lamps and patience. Best kept somewhere quiet.', product: 'green', setupCost: 2500, ingredientCost: 60, outputBase: 10, skill: 'brains', heat: 2, risk: 0.05 },
  lab:        { label: 'Lab', icon: '⚗️', blurb: 'Pills. High margin, high heat, and it stinks.', product: 'pills', setupCost: 6000, ingredientCost: 150, outputBase: 8, skill: 'tech', heat: 4, risk: 0.09 },
  print_shop: { label: 'Print Shop', icon: '🖨️', blurb: 'Funny money. Passes at 40 cents on the dollar.', product: 'counterfeit', setupCost: 4000, ingredientCost: 80, outputBase: 9, skill: 'tech', heat: 3, risk: 0.07 },
  cut_house:  { label: 'Cut House', icon: '👕', blurb: 'Machines, a pattern table, and somebody\'s label sewn onto none of their cloth.', product: 'streetwear', setupCost: 3200, ingredientCost: 70, outputBase: 11, skill: 'charm', heat: 2, risk: 0.05 },
};

export const PRODUCT_INFO: Record<ProductKind, { label: string; icon: string; price: number; heat: number }> = {
  booze:       { label: 'Booze', icon: '🍺', price: 45, heat: 0.5 },
  green:       { label: 'Green', icon: '🌿', price: 90, heat: 1 },
  pills:       { label: 'Pills', icon: '💊', price: 180, heat: 2 },
  hot_goods:   { label: 'Hot Goods', icon: '📦', price: 100, heat: 1 },
  counterfeit: { label: 'Counterfeit', icon: '💵', price: 40, heat: 1.5 },
  streetwear:  { label: 'Streetwear', icon: '👕', price: 75, heat: 0.6 },
};

export type OpFamily = 'wire';

/** What a family is called and what it is, for the badge and the tree's grouping line. */
export const OP_FAMILIES: Record<OpFamily, { label: string; icon: string; blurb: string }> = {
  wire: { label: 'The wire', icon: '📡', blurb: 'Get inside somebody, use what you found, and switch them off. One lane, three jobs, in that order.' },
};

export interface OpDef {
  label: string; icon: string; blurb: string;
  planDays: number; minCrew: number; maxCrew: number;
  needs: Partial<Skills>;      // sum of crew skill across members needed for a fair roll
  difficulty: number;          // 0..100
  payout: [number, number];    // cash or loot value range
  lootKind?: ProductKind;
  heat: number;
  target: 'business' | 'npc' | 'faction' | 'block' | 'district' | 'case' | 'none';
  targetTypes?: string[];      // business types
  ownRacket?: boolean;         // aimed at a place where you run something: yours to defend, not to rob
  modes?: OpMode[];            // op-specific choices, on top of the three approaches
  ownBusiness?: boolean;       // must target your own business
  cost?: number;               // upfront
  /**
   * Upfront cost that depends on the world rather than a constant — buying down a crackdown
   * costs many times what buying down a routine patrol does. `select.opCost()` folds this in
   * for both the affordability check and the charge, so they can never disagree.
   */
  costScales?: 'authority';
  tier?: number;               // where it sits in the ops tree, for layout only
  /**
   * A family of jobs that belong together and do not read that way from their names alone.
   * "Get Inside Their Business", "Wire Fraud" and "Pull Their Wires" are one lane — you get in,
   * you use what you found, you switch it off — and nothing in the tree said so. Layout and a
   * badge only; nothing mechanical reads this.
   */
  family?: OpFamily;
  requires?: OpRequires;       // what the empire must look like before this is on the table
}

/** What an op needs from you before it is even offered. All conditions must hold. */
export interface OpMode { id: string; label: string; icon: string; blurb: string; good: string; bad: string }

export interface OpRequires {
  crewCount?: number;          // people who have ever joined your crew
  safehouseTier?: number;      // a safehouse at this tier or better
  racketKinds?: RacketKind[];  // at least one of these running right now
  businessOwned?: boolean;     // you own a business outright
  priorOps?: OpKind[];         // you have pulled off at least one of these
  /** Somebody has to be at one of these stances with you. War work is not on the table in peacetime. */
  stance?: Stance[];
  /** Something in your hand: these are jobs you do not walk into empty-handed. */
  weapon?: boolean;
  /**
   * Per-target, not per-player: you must have been inside *this person's* business before.
   * Every other condition here asks about the empire; this one asks about the mark, so it is
   * checked against the op's own target rather than against global history.
   */
  rattedTarget?: boolean;
  /** Per-target, same template: the mark must be an official who answers to an Authority. */
  officialTarget?: boolean;
  /** Per-target: the mark must be one of your own, sitting in a cell right now. */
  jailedTarget?: boolean;
  /** Per-target: you must have cased this place recently. `Business.casedUntil` decides. */
  casedTarget?: boolean;
  /** Per-target: the job is aimed at an open case file, so there has to be one. */
  caseTarget?: boolean;
  /**
   * Per-target: the block must be a derelict you have actually found and nobody has claimed.
   * This replaced `priorOps: ['scout_block']`, which asked the wrong question — plenty of
   * derelict blocks are visibly derelict from the start, and a player who walked onto one and
   * saw it with their own eyes still could not take it until they had run a scouting op
   * somewhere else entirely. Reported from real play.
   */
  derelictTarget?: boolean;
}
export const OP_DEFS: Record<OpKind, OpDef> = {
  heist_bank:      { label: 'Bank Job', icon: '🏦', blurb: 'The big one. Vault, hostages, getaway.', planDays: 5, minCrew: 3, maxCrew: 5, needs: { brains: 14, muscle: 10, wheels: 8, tech: 8 }, difficulty: 80, payout: [40000, 120000], heat: 35, target: 'business', targetTypes: ['bank'], tier: 4, requires: { priorOps: ['heist_jeweller', 'heist_armored'] } },
  heist_jeweller:  { label: 'Jewel Heist', icon: '💎', blurb: 'Smash and grab, or cut the glass. Loot needs fencing.', planDays: 3, minCrew: 2, maxCrew: 4, needs: { brains: 8, tech: 8, wheels: 6 }, difficulty: 60, payout: [12000, 40000], lootKind: 'hot_goods', heat: 20, target: 'business', targetTypes: ['jeweller'], tier: 3, requires: { safehouseTier: 2 } },
  heist_armored:   { label: 'Armored Car', icon: '🚚', blurb: 'Hit the truck on its route. Loud.', planDays: 4, minCrew: 3, maxCrew: 5, needs: { muscle: 16, wheels: 10, brains: 6 }, difficulty: 70, payout: [25000, 70000], heat: 30, target: 'business', targetTypes: ['armored_depot'], tier: 3, requires: { safehouseTier: 2 } },
  heist_warehouse: { label: 'Warehouse Job', icon: '📦', blurb: 'Empty a warehouse overnight. Goods, not cash.', planDays: 2, minCrew: 2, maxCrew: 4, needs: { muscle: 6, wheels: 8, tech: 4 }, difficulty: 45, payout: [6000, 18000], lootKind: 'hot_goods', heat: 12, target: 'business', targetTypes: ['warehouse'], tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  robbery:         { label: 'Stick-Up', icon: '🔫', blurb: 'Walk in, take the till. Quick and dumb.', planDays: 0, minCrew: 0, maxCrew: 2, needs: { muscle: 5 }, difficulty: 30, payout: [400, 1800], heat: 8, target: 'business', tier: 0 },
  insurance_fraud: { label: 'Insurance Fraud', icon: '🔥', blurb: 'Torch your own insured place, collect the policy.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { tech: 5, brains: 4 }, difficulty: 40, payout: [0, 0], heat: 10, target: 'business', ownBusiness: true, tier: 1, requires: { businessOwned: true } },
  check_kiting:    { label: 'Check Kiting', icon: '📋', blurb: 'Float bad paper between banks through a front you own.', planDays: 3, minCrew: 1, maxCrew: 2, needs: { brains: 10 }, difficulty: 50, payout: [5000, 15000], heat: 8, target: 'business', ownBusiness: true, tier: 1, requires: { businessOwned: true } },
  smuggle_run:     { label: 'Smuggle Run', icon: '🚐', blurb: 'Drive a load in from out of town. Product at cost.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { wheels: 8 }, difficulty: 40, payout: [0, 0], lootKind: 'booze', heat: 8, target: 'none', cost: 1500, tier: 1, requires: { crewCount: 1 } },
  frame:           { label: 'Frame', icon: '🗂️', blurb: 'Plant product and paper on a rival boss or lieutenant and let the cops do the rest. Quiet, if it works.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { brains: 8, tech: 6 }, difficulty: 55, payout: [0, 0], heat: 5, target: 'npc', cost: 500, tier: 1, requires: { crewCount: 1 } },
  hit:             { label: 'Hit', icon: '🎯', blurb: 'Someone stops being a problem. Permanently.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { muscle: 10, wheels: 4 }, difficulty: 55, payout: [0, 0], heat: 25, target: 'npc', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  intimidate:      { label: 'Send a Message', icon: '🔨', blurb: 'Bats and broken windows. Fear without a body.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 6 }, difficulty: 25, payout: [0, 0], heat: 6, target: 'business', tier: 0 },
  // ---- armed work: the same jobs with something in your hand. Heavier payout, heavier heat,
  // and the kit you carry does the talking through the usual opChance pipeline.
  armed_robbery:   { label: 'Armed Robbery', icon: '🔫', blurb: 'Not a demand. An instruction. Everything in the drawer, and the safe.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 9 }, difficulty: 40, payout: [1600, 6000], heat: 18, target: 'business', tier: 1, requires: { weapon: true } },
  armed_intimidation: { label: 'Armed Message', icon: '😨', blurb: 'They see it. Nobody has to use it. Nobody argues afterwards.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 7 }, difficulty: 28, payout: [0, 0], heat: 10, target: 'business', tier: 1, requires: { weapon: true } },
  // ---- war work: only while somebody wants you dead ----
  ambush_soldiers: { label: 'Ambush Their Soldiers', icon: '👊', blurb: 'Catch a crew of theirs off their own turf and take the fight to them for once.', planDays: 1, minCrew: 1, maxCrew: 4, needs: { muscle: 12, wheels: 5 }, difficulty: 45, payout: [800, 3500], heat: 14, target: 'faction', tier: 2, requires: { stance: ['beef', 'war'] } },
  defend_racket:   { label: 'Dig In', icon: '💪', blurb: 'Put people on a racket they have marked, and be there when the muscle arrives.', planDays: 0, minCrew: 1, maxCrew: 3, needs: { muscle: 8, brains: 4 }, difficulty: 35, payout: [0, 0], heat: 5, target: 'business', ownRacket: true, tier: 1, requires: { stance: ['beef', 'war'] } },
  war_strike:      { label: 'War Strike', icon: '⚔️', blurb: 'Take one of their lieutenants off the board while the shooting is already started. An act of war, and read as one.', planDays: 2, minCrew: 2, maxCrew: 4, needs: { muscle: 12, wheels: 6, brains: 4 }, difficulty: 55, payout: [0, 0], heat: 20, target: 'npc', tier: 3, requires: { stance: ['war'], crewCount: 2 } },
  // ---- the wire ----
  mugging:         { label: 'Mugging', icon: '🌙', blurb: 'Follow somebody off a lit street and take what is on them. Cash, a watch, whatever is in the wallet.', planDays: 0, minCrew: 0, maxCrew: 2, needs: { muscle: 5, wheels: 3 }, difficulty: 28, payout: [120, 900], heat: 7, target: 'npc', tier: 0 },
  rat:             { label: 'Get Inside Their Business', icon: '🕳️', blurb: 'Their post, their calls, their standing arrangements. Learn what they are hiding — once, or for as long as you can keep it up.', family: 'wire', planDays: 1, minCrew: 0, maxCrew: 2, needs: { tech: 9, brains: 7 }, difficulty: 45, payout: [0, 0], heat: 4, target: 'npc', tier: 1,
    modes: [
      { id: 'read', label: 'One good look', icon: 'watching', blurb: 'Everything they are sitting on, once.', good: 'A secret you can use or sell', bad: 'One shot; nothing after it' },
      { id: 'tap', label: 'Leave it running', icon: 'rat', blurb: 'Keep listening, day after day.', good: 'They keep telling you things', bad: 'The longer it runs, the likelier they find it' },
    ] },
  wire_fraud:      { label: 'Wire Fraud', icon: '🏧', blurb: 'Their arrangements, in your name, moved somewhere quiet. Only possible against somebody whose business you have already been inside.', family: 'wire', planDays: 3, minCrew: 0, maxCrew: 2, needs: { tech: 14, brains: 12 }, difficulty: 65, payout: [9000, 30000], heat: 16, target: 'npc', tier: 3, requires: { rattedTarget: true } },
  digital_strike:  { label: 'Pull Their Wires', icon: '🔌', blurb: 'Their tills stop ringing and their book stops balancing. Nobody gets hurt and nobody sees you.', family: 'wire', planDays: 1, minCrew: 0, maxCrew: 2, needs: { tech: 11, brains: 8 }, difficulty: 50, payout: [200, 1200], heat: 6, target: 'business', tier: 2, requires: { stance: ['beef', 'war'] } },
  takeover:        { label: 'Take the Corner', icon: '🚩', blurb: 'Roll up on a street crew and take their block. Lighter than a faction raid.', planDays: 0, minCrew: 0, maxCrew: 3, needs: { muscle: 8 }, difficulty: 35, payout: [300, 1200], heat: 8, target: 'block', tier: 0 },
  steal_formula:   { label: 'Steal a Formula', icon: '📜', blurb: 'Break into a rival cook, a pharmacy or a print works and leave with something you can use.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { tech: 8, brains: 6 }, difficulty: 50, payout: [0, 0], heat: 10, target: 'none', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  scout_block:     { label: 'Scout the Edges', icon: '🔦', blurb: 'Walk the dead streets at the edge of a district and find out what is still standing. You may come back with nothing.', planDays: 1, minCrew: 0, maxCrew: 2, needs: { brains: 5, tech: 3, wheels: 3 }, difficulty: 30, payout: [0, 0], heat: 2, target: 'district', tier: 0 },
  claim_abandoned: { label: 'Take the Lot', icon: '🏚️', blurb: 'Move into a derelict block: clear whoever is sleeping there, or buy the paperwork. Nobody collects rent on a place that is not on anyone\'s books.', planDays: 1, minCrew: 0, maxCrew: 3, needs: { muscle: 5, brains: 4 }, difficulty: 35, payout: [0, 0], heat: 6, target: 'block', tier: 1, requires: { derelictTarget: true } },
  kidnap:          { label: 'Take Someone', icon: '🕳️', blurb: 'Put somebody in the back of a van and hold them somewhere quiet. You need a safehouse with room, and holding them is its own problem.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { muscle: 8, wheels: 6 }, difficulty: 50, payout: [0, 0], heat: 18, target: 'npc', tier: 2, requires: { crewCount: 1, safehouseTier: 1 } },
  // ---- the law, pushed back on. Until these existed an Authority only ever escalated: the
  // player could outrun heat but never reach into the building making the decisions.
  // All three read the target Authority's posture as difficulty, so pushing back on a
  // crackdown is a different job from leaning on a routine precinct.
  buy_down:        { label: 'Buy Down the Heat', icon: '💼', blurb: 'Sit down with somebody inside the building and pay for their attention to go elsewhere. What it costs depends entirely on how hard they are already looking.', planDays: 1, minCrew: 0, maxCrew: 2, needs: { charm: 8, brains: 6 }, difficulty: 45, payout: [0, 0], heat: 3, target: 'npc', tier: 2, costScales: 'authority', requires: { officialTarget: true, crewCount: 1 } },
  spring_crew:     { label: 'Spring Somebody', icon: '🔓', blurb: 'Get one of your own out before their sentence runs: a signature in the right place, a transfer that goes wrong, a door left unlocked.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { brains: 10, tech: 7, charm: 5 }, difficulty: 58, payout: [0, 0], heat: 14, target: 'npc', tier: 2, cost: 2500, requires: { jailedTarget: true, crewCount: 1 } },
  buy_case:        { label: 'Kill a File', icon: '🗄️', blurb: 'Reach into one specific open investigation and end it: paper misfiled, an exhibit lost, a detective reassigned. Not the same as frightening a witness — this is the file itself.', planDays: 3, minCrew: 0, maxCrew: 2, needs: { brains: 12, charm: 8 }, difficulty: 62, payout: [0, 0], heat: 6, target: 'case', tier: 3, costScales: 'authority', requires: { caseTarget: true, crewCount: 1 } },

  // ---- more ways into a vault ----
  heist_payroll:   { label: 'Payroll Snatch', icon: '💼', blurb: 'Somebody carries the week\'s wages across a yard once a week, at the same time, with the same two men.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { muscle: 10, wheels: 7 }, difficulty: 48, payout: [4000, 14000], heat: 16, target: 'business', tier: 2, requires: { weapon: true, crewCount: 1 } },
  heist_containers:{ label: 'Container Job', icon: '🚢', blurb: 'One box off a stack of thousands, and a manifest that never mentions it.', planDays: 3, minCrew: 2, maxCrew: 4, needs: { wheels: 9, brains: 7, tech: 5 }, difficulty: 55, payout: [9000, 26000], lootKind: 'hot_goods', heat: 14, target: 'business', targetTypes: ['warehouse'], tier: 2, requires: { crewCount: 2 } },
  heist_gallery:   { label: 'The Collection', icon: '🖼️', blurb: 'Things worth far more than anybody will openly pay for them. A fence takes the difference, and takes their time.', planDays: 4, minCrew: 2, maxCrew: 4, needs: { tech: 12, brains: 11, wheels: 6 }, difficulty: 68, payout: [20000, 55000], lootKind: 'hot_goods', heat: 22, target: 'business', targetTypes: ['jeweller', 'pawn'], tier: 3, requires: { safehouseTier: 2, priorOps: ['heist_jeweller'] } },
  heist_countroom: { label: 'The Count Room', icon: '🎲', blurb: 'The room behind the floor of a club that takes bets, on the night the week is counted. You need to have walked it first.', planDays: 5, minCrew: 3, maxCrew: 5, needs: { brains: 15, muscle: 11, tech: 10, charm: 6 }, difficulty: 78, payout: [35000, 95000], heat: 32, target: 'business', targetTypes: ['nightclub'], tier: 4, requires: { casedTarget: true, crewCount: 3, safehouseTier: 2 } },

  // ---- paper, patience and somebody else's signature. Abstracted on purpose: there is no
  // technique in any of these, the same way there is none in the card system.
  long_con:        { label: 'The Long Con', icon: '🎩', blurb: 'Weeks of being somebody else to one person who has money and wants to believe you.', planDays: 5, minCrew: 0, maxCrew: 2, needs: { charm: 14, brains: 10 }, difficulty: 60, payout: [8000, 26000], heat: 5, target: 'npc', tier: 2, requires: { crewCount: 1 } },
  staged_accident: { label: 'Staged Accident', icon: '🚑', blurb: 'Somebody slips in a place that is insured, and a claim follows. Nobody is really hurt, which is the hard part.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { charm: 8, brains: 7 }, difficulty: 45, payout: [3000, 9000], heat: 6, target: 'business', tier: 2, requires: { crewCount: 1 } },
  shell_company:   { label: 'Shell Company', icon: '🏢', blurb: 'A company that exists only on paper, billing a company you own for work nobody did. Slow, dull, and it pays clean.', planDays: 4, minCrew: 0, maxCrew: 2, needs: { brains: 13, charm: 7 }, difficulty: 58, payout: [7000, 20000], heat: 4, target: 'business', ownBusiness: true, tier: 3, requires: { businessOwned: true, crewCount: 1 } },
  charity_front:   { label: 'Charity Front', icon: '🎗️', blurb: 'A collection for something nobody can argue with, run out of a place you own. The city likes you more afterwards, too.', planDays: 3, minCrew: 0, maxCrew: 2, needs: { charm: 11, brains: 6 }, difficulty: 50, payout: [4000, 12000], heat: 3, target: 'business', ownBusiness: true, tier: 2, requires: { businessOwned: true } },
  counterfeit_run: { label: 'Counterfeit Run', icon: '🖨️', blurb: 'A print run of something that is not what it says it is, moved through a racket of your own.', planDays: 3, minCrew: 1, maxCrew: 3, needs: { tech: 11, brains: 8 }, difficulty: 55, payout: [0, 0], lootKind: 'counterfeit', heat: 12, target: 'none', cost: 2000, tier: 2, requires: { racketKinds: ['fencing', 'smuggling', 'laundering', 'no_show_jobs', 'carding'], crewCount: 1 } },

  // ---- moving things that should not be moving ----
  dockside_pickup: { label: 'Dockside Pickup', icon: '⚓', blurb: 'Meet a boat that is not on any schedule and be gone before the shift changes.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { wheels: 9, charm: 5 }, difficulty: 45, payout: [0, 0], lootKind: 'booze', heat: 9, target: 'none', cost: 2200, tier: 2, requires: { crewCount: 1, priorOps: ['smuggle_run'] } },
  hijack_load:     { label: 'Hijack a Load', icon: '🚛', blurb: 'Somebody else did the smuggling. You do the last mile, and keep it.', planDays: 1, minCrew: 2, maxCrew: 4, needs: { muscle: 12, wheels: 11 }, difficulty: 52, payout: [5000, 16000], lootKind: 'hot_goods', heat: 18, target: 'none', tier: 2, requires: { weapon: true, crewCount: 2 } },
  convoy_run:      { label: 'Run a Convoy', icon: '🚛', blurb: 'Not one van but four, on one night, through ground you have to already control. The whole quarter\'s product in one move.', planDays: 4, minCrew: 3, maxCrew: 5, needs: { wheels: 16, brains: 9, muscle: 8 }, difficulty: 66, payout: [0, 0], lootKind: 'green', heat: 20, target: 'none', cost: 6000, tier: 3, requires: { crewCount: 3, safehouseTier: 2, priorOps: ['dockside_pickup', 'smuggle_run'] } },

  raid_rival:      { label: 'Raid Rival Racket', icon: '⚔️', blurb: 'Hit a rival racket, take the cash box, wreck the place.', planDays: 1, minCrew: 2, maxCrew: 5, needs: { muscle: 12, wheels: 4 }, difficulty: 50, payout: [1500, 6000], heat: 12, target: 'business', tier: 2, requires: { crewCount: 2, racketKinds: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'laundering', 'smuggling', 'no_show_jobs'] } },
  // ================================================================ the crime pass
  // Everything below is deliberately abstract about method. The game is about who pays who, what
  // it costs and who finds out — never about how a thing is actually done. Blurbs describe the
  // shape of a crime and the people in it, and stop there.

  // ---- street: small, constant, and what somebody actually starts with ----
  porch_piracy:    { label: 'Doorstep Runs', icon: '📦', blurb: 'Follow the vans around the good streets and take what they leave on the step. Small, constant, and nobody calls it in twice.', planDays: 0, minCrew: 0, maxCrew: 2, needs: { wheels: 4, brains: 2 }, difficulty: 22, payout: [150, 600], lootKind: 'hot_goods', heat: 3, target: 'block', tier: 0 },
  bike_ring:       { label: 'Bike Ring', icon: '🚲', blurb: 'Two kids, a van and a set of bolt croppers, working a district a night. The good ones are worth what a car was ten years ago.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { wheels: 6, muscle: 3 }, difficulty: 28, payout: [400, 1400], lootKind: 'hot_goods', heat: 5, target: 'district', tier: 0, requires: { crewCount: 1 } },
  vape_bootleg:    { label: 'Bootleg Smokes', icon: '🚬', blurb: 'Cartons and cartridges off a lorry that was going somewhere else, sold out of a hundred counters at half the shop price.', planDays: 1, minCrew: 0, maxCrew: 2, needs: { charm: 5, wheels: 3 }, difficulty: 26, payout: [500, 1600], heat: 4, target: 'district', tier: 0 },
  copper_strip:    { label: 'Strip It for Copper', icon: '🔩', blurb: 'A building nobody is watching, and everything inside the walls that is worth money by the kilo.', planDays: 1, minCrew: 1, maxCrew: 3, needs: { muscle: 6, tech: 4 }, difficulty: 30, payout: [600, 2200], lootKind: 'hot_goods', heat: 6, target: 'block', tier: 0, requires: { derelictTarget: true } },
  squatter_scheme: { label: 'Rent What Is Not Yours', icon: '🏚️', blurb: 'Put people in an empty building and collect from them every week. The paperwork is somebody else\'s problem and so is the roof.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { charm: 6, brains: 5 }, difficulty: 34, payout: [900, 3000], heat: 5, target: 'block', tier: 1, requires: { derelictTarget: true } },
  sim_swap:        { label: 'Take Their Number', icon: '📵', blurb: 'Their phone stops working and everything tied to it answers to somebody else for an afternoon. Only against somebody you have already been inside.', family: 'wire', planDays: 1, minCrew: 0, maxCrew: 2, needs: { tech: 10, charm: 6 }, difficulty: 46, payout: [1200, 5000], heat: 6, target: 'npc', tier: 1, requires: { rattedTarget: true } },

  // ---- mid: paper, professionals, and people who sign things ----
  straw_purchase:  { label: 'Straw Buyers', icon: '📝', blurb: 'Other people\'s names on the paperwork for cars and goods that were never theirs and never will be. Consumer stock only; nobody in this outfit arms strangers.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { charm: 8, brains: 7 }, difficulty: 44, payout: [2500, 8000], heat: 8, target: 'none', tier: 2, requires: { crewCount: 2 } },
  resort_fraud:    { label: 'Timeshare Sell', icon: '🏝️', blurb: 'A room, a slideshow and a week in the sun that does not exist. They sign because everybody else in the room is signing.', planDays: 3, minCrew: 1, maxCrew: 3, needs: { charm: 10, brains: 6 }, difficulty: 48, payout: [4000, 14000], heat: 7, target: 'none', tier: 2, requires: { crewCount: 2, priorOps: ['long_con', 'shell_company'] } },
  match_fixing:    { label: 'Fix the Card', icon: '🏆', blurb: 'One professional who needs money more than they need the result. The gym, the book and the crowd do the rest.', planDays: 2, minCrew: 1, maxCrew: 2, needs: { charm: 8, muscle: 5 }, difficulty: 50, payout: [3000, 11000], heat: 9, target: 'npc', tier: 2, requires: { racketKinds: ['bookmaking', 'numbers', 'policy_bank'] } },
  stream_piracy:   { label: 'Pirate Feeds', icon: '📺', blurb: 'Somebody else\'s channels, resold by the month to half a district. Quiet money that arrives whether you get up or not.', planDays: 2, minCrew: 0, maxCrew: 2, needs: { tech: 9, brains: 6 }, difficulty: 40, payout: [2000, 7000], heat: 5, target: 'none', tier: 2, requires: { crewCount: 1 } },
  betting_app:     { label: 'Run a Book Online', icon: '📲', blurb: 'The same book, on everybody\'s phone, with no room to stand in and no door to raid.', planDays: 3, minCrew: 1, maxCrew: 3, needs: { tech: 10, brains: 8 }, difficulty: 52, payout: [4000, 13000], heat: 8, target: 'none', tier: 2, requires: { racketKinds: ['bookmaking', 'gambling_den', 'policy_bank'] } },
  synth_identity:  { label: 'Build a Person', icon: '📇', blurb: 'A name that belongs to nobody, with a history, a rating and a signature. Worth more the longer it sits untouched.', planDays: 3, minCrew: 0, maxCrew: 2, needs: { tech: 9, brains: 9 }, difficulty: 54, payout: [3500, 12000], heat: 7, target: 'none', tier: 2, requires: { crewCount: 2, priorOps: ['shell_company', 'wire_fraud'] } },

  // ---- organised: a commission, a client, or a permanent cost ----
  illegal_dumping: { label: 'Take the Contract', icon: '🏭', blurb: 'Somebody pays well to have barrels go away. Where they go is a district that will not find out for years.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { wheels: 8, muscle: 6 }, difficulty: 42, payout: [3000, 10000], heat: 10, target: 'district', tier: 2, requires: { crewCount: 2, racketKinds: ['union_dues', 'no_show_jobs', 'smuggling'] } },
  arson_hire:      { label: 'Fire for Hire', icon: '🔥', blurb: 'Not your building and not your insurance. Somebody else wants a place gone and will pay for it to look like bad luck.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { muscle: 6, tech: 7 }, difficulty: 52, payout: [6000, 18000], heat: 22, target: 'business', tier: 3, requires: { crewCount: 2, priorOps: ['intimidate', 'insurance_fraud'] } },
  bust_out:        { label: 'Bust-Out', icon: '📉', blurb: 'Take a real business, order everything its name will carry, sell it all, and walk away from the bill. What is left is not a business any more.', planDays: 4, minCrew: 2, maxCrew: 4, needs: { brains: 10, charm: 8 }, difficulty: 56, payout: [12000, 38000], heat: 16, target: 'business', tier: 3, ownBusiness: true, requires: { businessOwned: true, priorOps: ['shell_company'] } },
  boiler_room:     { label: 'Boiler Room', icon: '☎️', blurb: 'Twenty phones, twenty scripts and a company that is a filing cabinet. They are buying a feeling, and it is not coming back.', planDays: 3, minCrew: 2, maxCrew: 5, needs: { charm: 12, brains: 9 }, difficulty: 58, payout: [14000, 45000], heat: 14, target: 'none', tier: 3, requires: { crewCount: 3, priorOps: ['shell_company', 'long_con'] } },
  bid_rigging:     { label: 'Rig the Bidding', icon: '📋', blurb: 'The contract was always going to somebody. A councillor who takes your calls decides it goes to you.', planDays: 3, minCrew: 1, maxCrew: 3, needs: { brains: 10, charm: 9 }, difficulty: 55, payout: [15000, 50000], heat: 12, target: 'npc', tier: 3, requires: { officialTarget: true, crewCount: 2 } },
  campaign_wash:   { label: 'Fund a Friend', icon: '🗳️', blurb: 'Money into a campaign through a hundred names that are not yours, and a friend in the building afterwards.', planDays: 3, minCrew: 1, maxCrew: 3, needs: { charm: 10, brains: 10 }, difficulty: 57, payout: [0, 0], cost: 12000, heat: 10, target: 'npc', tier: 3, requires: { officialTarget: true, racketKinds: ['laundering'] } },
  prison_supply:   { label: 'Supply the Wing', icon: '🔒', blurb: 'One of yours is inside and everything in there costs ten times what it costs out here. Somebody has to carry it in.', planDays: 2, minCrew: 1, maxCrew: 3, needs: { charm: 8, muscle: 6 }, difficulty: 50, payout: [3000, 9000], heat: 9, target: 'npc', tier: 3, requires: { jailedTarget: true, priorOps: ['spring_crew'] } },
  corporate_extortion: { label: 'Lean on the Board', icon: '🏢', blurb: 'Not a shop and not a man behind a counter. A company, a quarterly number, and something they would rather nobody read.', planDays: 3, minCrew: 2, maxCrew: 4, needs: { brains: 11, charm: 9 }, difficulty: 60, payout: [10000, 32000], heat: 13, target: 'npc', tier: 3, requires: { rattedTarget: true, crewCount: 3 } },

  // ---- elite: the two that reach the whole city ----
  crypto_wash:     { label: 'Wash It Sideways', icon: '💱', blurb: 'Money in one shape, out in another, through enough hands that nobody is sure which were yours. The tech-flavoured cousin of an offshore account.', family: 'wire', planDays: 4, minCrew: 1, maxCrew: 3, needs: { tech: 13, brains: 11 }, difficulty: 64, payout: [0, 0], heat: 9, target: 'none', tier: 4, requires: { crewCount: 3, priorOps: ['wire_fraud', 'shell_company'], safehouseTier: 2 } },
  vote_buying:     { label: 'Buy the Ward', icon: '🗳️', blurb: 'Not a bribe to one man. A ward, paid for door by door, and a result that everybody can see and nobody can prove.', planDays: 4, minCrew: 2, maxCrew: 5, needs: { charm: 13, brains: 10 }, difficulty: 66, payout: [0, 0], cost: 20000, heat: 15, target: 'district', tier: 4, requires: { crewCount: 4, priorOps: ['campaign_wash'] } },
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
  // ---- the still: what you are actually pouring ----
  aged:         { label: 'Barrel-aged rye', kind: 'still', blurb: 'Slower, but people ask for it by name.', quality: 25, output: 0.8, heat: 1, risk: 1 },
  sugar_shine:  { label: 'Sugar shine', kind: 'still', blurb: 'Volume over taste. It burns going down and nobody minds.', quality: -10, output: 1.4, heat: 1, risk: 1.1 },
  copper_pot:   { label: 'Copper pot batch', kind: 'still', blurb: 'A small pot, run slow, vented properly. Half the smell of anything else.', quality: 14, output: 0.95, heat: 0.7, risk: 0.75 },
  overproof:    { label: 'Overproof white', kind: 'still', blurb: 'Straight off the still at strength. Quick money, and the fire risk is not theoretical.', quality: 5, output: 1.6, heat: 1.5, risk: 1.5 },
  bonded:       { label: 'Bonded label', kind: 'still', blurb: 'Real bottles, real labels, real revenue stamps that are not real. Sells like the genuine article.', quality: 32, output: 0.7, heat: 0.6, risk: 0.8 },

  // ---- the cut house: whose label, and how close to the real thing ----
  bootleg_tee:  { label: 'Bootleg tees', kind: 'cut_house', blurb: 'Blanks by the box and a heat press in the back. Nobody is fooled and nobody cares at that price.', quality: -12, output: 1.45, heat: 0.8, risk: 0.8 },
  mirror_run:   { label: 'Mirror run', kind: 'cut_house', blurb: 'The same pattern, the same stitch count, the same box. Told apart by people who do it for a living.', quality: 30, output: 0.75, heat: 1.2, risk: 1.2 },
  overrun:      { label: 'Factory overrun', kind: 'cut_house', blurb: 'A real line run on past its order. Genuinely the same cloth, which is exactly the problem.', quality: 38, output: 0.6, heat: 0.7, risk: 1.4 },
  seconds:      { label: 'Seconds and rejects', kind: 'cut_house', blurb: 'Crooked seams and the wrong shade, relabelled and sold anyway. Cheap, fast, and half of it comes back.', quality: -22, output: 1.65, heat: 1.1, risk: 1.3 },

  // ---- the grow op: what is actually in the bag ----
  hydro:        { label: 'Hydroponic', kind: 'grow_op', blurb: 'More lamps, more yield, more on the power bill — and the bill is what gets noticed.', quality: 5, output: 1.3, heat: 1.25, risk: 1 },
  import_cut:   { label: 'Import cut', kind: 'grow_op', blurb: 'A strain nobody else in town has. They pay for the name alone.', quality: 25, output: 0.9, heat: 1, risk: 1 },
  soil_cure:    { label: 'Soil-grown, slow cure', kind: 'grow_op', blurb: 'Dirt, patience and a long hang. No lamps to draw power, nothing to smell from the street.', quality: 18, output: 0.85, heat: 0.65, risk: 0.7 },
  sea_of_green: { label: 'Sea of green', kind: 'grow_op', blurb: 'Every inch under light, harvested fast and often. Everything about it is loud.', quality: -5, output: 1.7, heat: 1.4, risk: 1.35 },
  greenhouse:   { label: 'Back-lot greenhouse', kind: 'grow_op', blurb: 'Glass, sunlight and a fence nobody looks over twice.', quality: 8, output: 1.1, heat: 0.9, risk: 0.85 },

  // ---- the lab: what is actually in the pill ----
  clean_synth:  { label: 'Clean synthesis', kind: 'lab', blurb: 'Fewer fumes, fewer fires, a better product.', quality: 20, output: 1, heat: 0.8, risk: 0.7 },
  bulk_press:   { label: 'Bulk press', kind: 'lab', blurb: 'Press them fast and cut them hard.', quality: -10, output: 1.5, heat: 1.3, risk: 1.2 },
  micro_batch:  { label: 'Micro-batch', kind: 'lab', blurb: 'Small runs, weighed properly, nothing wasted and nothing vented. Expensive patience.', quality: 30, output: 0.7, heat: 0.55, risk: 0.6 },
  kitchen_run:  { label: 'Kitchen run', kind: 'lab', blurb: 'A stove, a bucket and no ventilation at all. The fastest money in the game and the likeliest to end in a fire.', quality: -18, output: 1.8, heat: 1.7, risk: 1.8 },
  binder_cut:   { label: 'Binder cut', kind: 'lab', blurb: 'Stretch it with filler nobody can taste. More of them, none of them special.', quality: 0, output: 1.25, heat: 1.05, risk: 1 },

  // ---- the print shop: what the paper actually is ----
  intaglio:     { label: 'Intaglio plates', kind: 'print_shop', blurb: 'Real plates, cut by somebody who used to do it legally. Passes at a bank.', quality: 30, output: 0.85, heat: 1, risk: 1 },
  bleach_wash:  { label: 'Bleached bills', kind: 'print_shop', blurb: 'Wash ones, print hundreds. Fast and ugly.', quality: -15, output: 1.4, heat: 1.2, risk: 1.1 },
  cotton_stock: { label: 'Cotton stock', kind: 'print_shop', blurb: 'The right paper first, everything else second. Slow, quiet, and it feels correct in a hand.', quality: 22, output: 0.8, heat: 0.7, risk: 0.75 },
  offset_run:   { label: 'Offset run', kind: 'print_shop', blurb: 'A commercial press doing a job it was not booked for. Good enough at a distance.', quality: 0, output: 1.3, heat: 1.15, risk: 1.1 },
  night_press:  { label: 'Night press', kind: 'print_shop', blurb: 'The machine runs all night and the ink is barely dry. Volume, and a lot of noise for whoever lives above.', quality: -8, output: 1.65, heat: 1.55, risk: 1.6 },
};

/** Every recipe for one production kind, for pickers and for the automation's "best known". */
export function recipesOfKind(kind: ProductionKind): string[] {
  return Object.keys(RECIPES).filter(id => RECIPES[id].kind === kind);
}
/** What a unit of product sells for relative to average quality (50). */
export const qualityMult = (q: number) => 0.7 + q / 200;

/**
 * Washing money. Your own laundering racket is the real answer and always the best one:
 * it cleans at LAUNDER_RATE up to a daily capacity you can grow. A fixer is the bridge
 * before you can afford one — no setup, nothing to own, a worse rate and a small daily
 * cap, both improving as they come to trust you, and neither ever reaching the racket.
 */
export const LAUNDER_RATE = 0.85;      // a laundering racket: 85 cents on the dollar
export const FIXER = {
  ap: 1,                 // a trip across town and an hour in a back room
  minRate: 0.55,         // at trust 0
  maxRate: 0.70,         // at full trust — deliberately short of LAUNDER_RATE, for ever
  capBase: 400,          // $/day they will take at trust 0
  capPerTrust: 15,       // + per point of trust, so about $1,300/day at a fully earned 60
  startTrust: 20,        // the one near your first block already knows your name
  trustPerUse: 3,        // for a full day's worth; a token amount earns less
  /**
   * Both the rate and the cap used to divide by 100, which assumed trust could get there. Since
   * the standing pass it cannot: ordinary dealing stops at `CONCESSION.ordinary` and only real
   * favours lift it, so a fixer you use every day tops out in the fifties. Scaling against that
   * band instead of a theoretical 100 keeps the curve the shape it was — a hard opening that
   * eases as the relationship earns it — rather than silently halving every fixer in the city.
   */
  trustBand: 60,
};

/**
 * The crime pass's three numbers that are not a racket and not an op payout.
 *
 * `CRYPTO_WASH` is the wire's answer to a laundering racket: one big wash in a single job
 * rather than a daily capacity, at a rate deliberately between a fixer's best and a racket's, so
 * it is the thing you reach for when you are sitting on a pile and have no front — never the
 * thing that makes a front pointless. `PRISON_WING` is the only income in the game that runs out
 * of a cell instead of a building, and it ends by itself. `WARD` is what buying a ward door by
 * door actually moves: influence across a whole district, which is what the Commission counts.
 */
export const CRYPTO_WASH = {
  base: 9000,        // what the job will touch at tech 0
  perTech: 900,      // + per point of tech
  rate: 0.78,        // between FIXER.maxRate and LAUNDER_RATE, for ever
};
export const PRISON_WING = {
  share: 1 / 12,     // of the job's payout, per day, while they are inside
  heatPerDay: 0.4,   // somebody carries it in every week and eventually somebody is searched
};
export const WARD = {
  perBlock: 9,       // influence on every block of the district
  respect: 8,
  councillor: 10,    // trust with the one man in the building who notices
};

/**
 * Fronting a street crew's racket: the third thing you can do with a corner, alongside putting
 * them on the payroll and folding them into your outfit. You pay for the shop, they own it and
 * run it, and you take a share of what it makes instead of all of it.
 *
 * It is deliberately the worst rate and the least work in the game: nobody of yours stands in
 * it, it needs no runner and no AP after the day you set it up, and in exchange the books are
 * theirs. Everything that can go wrong is somebody else's decision — which is the point.
 */
export const FUNDED = {
  setupMult: 1.2,      // you are paying for somebody else's shop, at somebody else's price
  kick: 0.45,          // your share of what it makes
  minMood: -20,        // nobody takes a stake from somebody they cannot stand
  skimChance: 0.09,    // per day: a light week that is not really a light week
  skimMin: 0.15, skimMax: 0.4,   // of your share, when they do
  noticeAt: 1200,      // skimmed before the numbers stop adding up and somebody tells you
  outgrowAt: 8,        // the strength at which they stop feeling like your investment...
  outgrowMood: 25,     // ...unless they actually like you
};

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

/** Casing a place: what it costs, how long the read lasts, and what it is worth on the job. */
export const CASE_JOINT = {
  ap: 2,
  days: 4,          // how long what you learned stays useful
  difficulty: -14,  // an op on a place you have walked is that much easier
};

export type OpApproach = 'loud' | 'quiet' | 'inside';
export interface OpApproachDef { label: string; icon: string; blurb: string; good: string; bad: string; skillWeight: Partial<Skills>; difficulty: number; payout: number; heat: number }
export const OP_APPROACHES: Record<OpApproach, OpApproachDef> = {
  loud:   { label: 'Go in loud', icon: 'crackdown', blurb: 'Muscle and wheels. Fast, brutal, unforgettable.', good: '+25% take', bad: 'Heat ×1.6; failure means bodies', skillWeight: { muscle: 1.3, wheels: 1.2, tech: 0.6, brains: 0.8 }, difficulty: -4, payout: 1.25, heat: 1.6 },
  quiet:  { label: 'Quiet job', icon: 'watching', blurb: 'Brains and tech. In and out with nobody the wiser.', good: 'Heat ×0.5', bad: 'Harder; a slip means arrests', skillWeight: { tech: 1.3, brains: 1.3, muscle: 0.6, wheels: 0.9 }, difficulty: 6, payout: 1, heat: 0.5 },
  inside: { label: 'Inside man', icon: 'lockpicks', blurb: 'Someone at the target who trusts you opens the door. They take a cut.', good: 'Much easier', bad: 'Fail and your contact is burned', skillWeight: { brains: 1.1 }, difficulty: -22, payout: 0.85, heat: 0.7 },
};
