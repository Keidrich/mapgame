/**
 * The remake's tables. Balance lives here and in the formulas in `remake/sim/economy.ts`, never
 * scattered through the reducer — the same house rule as the original.
 */
import type { Background, BusinessType, DistrictKind, FactionStyle, GearKind, JobKind, LabKind, OfficialKind, Product, RacketKind, Skill, Skills, Temperament, Tier, Trait } from '@r/sim/types';

// ------------------------------------------------------------------------------------ districts
export interface DistrictDef {
  label: string;
  blurb: string;
  wealth: [number, number];
  police: [number, number];
  /** People per cell, before the lottery. */
  population: number;
  /** Chance a cell grows into a bigger lot. Foundries and depots are not corner shops. */
  merge: number;
  /** What opens here, as weights. */
  business: Partial<Record<BusinessType, number>>;
}
export const DISTRICTS: Record<DistrictKind, DistrictDef> = {
  downtown: { label: 'Downtown', blurb: 'Banks, hotels and the people who own both.', wealth: [65, 90], police: [55, 75], population: 60, merge: 0.15,
    business: { bank: 3, jeweller: 2, restaurant: 3, bar: 2, nightclub: 1, pharmacy: 2, electronics: 2, boutique: 2, gallery: 1, casino: 1, corner_store: 1 } },
  docks: { label: 'Docks', blurb: 'Cranes, containers and nobody asking what is in them.', wealth: [25, 45], police: [20, 40], population: 30, merge: 0.55,
    business: { warehouse: 4, bar: 3, garage: 2, scrapyard: 2, cab_company: 1, diner: 2, motel: 1, armored_depot: 1 } },
  oldtown: { label: 'Old Quarter', blurb: 'Narrow streets, old families, long memories.', wealth: [40, 60], police: [35, 55], population: 55, merge: 0.1,
    business: { restaurant: 4, bar: 3, barbershop: 3, pawn: 2, corner_store: 2, diner: 2, laundromat: 2, jeweller: 1, pharmacy: 1 } },
  industrial: { label: 'Industrial', blurb: 'Foundries, yards and the night shift.', wealth: [20, 40], police: [15, 35], population: 25, merge: 0.6,
    business: { warehouse: 3, construction: 3, scrapyard: 3, garage: 3, diner: 2, bar: 1, armored_depot: 1 } },
  heights: { label: 'The Heights', blurb: 'Quiet money behind tall hedges.', wealth: [75, 95], police: [55, 80], population: 35, merge: 0.3,
    business: { restaurant: 3, boutique: 3, gallery: 2, jeweller: 2, pharmacy: 2, bank: 1, gym: 1 } },
  market: { label: 'Market', blurb: 'Everything for sale, and most of it legal.', wealth: [40, 60], police: [30, 50], population: 65, merge: 0.1,
    business: { corner_store: 4, pawn: 3, electronics: 3, diner: 2, barbershop: 2, laundromat: 2, boutique: 1, bar: 2 } },
  strip: { label: 'The Strip', blurb: 'Neon, noise and cash that never sleeps.', wealth: [45, 70], police: [40, 60], population: 50, merge: 0.15,
    business: { nightclub: 4, bar: 4, motel: 2, casino: 1, restaurant: 2, corner_store: 1, pawn: 1 } },
  projects: { label: 'Projects', blurb: 'Towers, corners and people nobody else is watching out for.', wealth: [10, 25], police: [15, 35], population: 80, merge: 0.25,
    business: { corner_store: 4, laundromat: 3, barbershop: 3, gym: 2, diner: 1, pharmacy: 1, pawn: 1 } },
  suburb: { label: 'Suburbs', blurb: 'Lawns, commuters, and a dealer nobody suspects.', wealth: [50, 70], police: [30, 50], population: 30, merge: 0.35,
    business: { diner: 3, corner_store: 2, gym: 2, garage: 2, pharmacy: 2, restaurant: 1, cab_company: 1, motel: 1 } },
};

// ----------------------------------------------------------------------------------- businesses
export interface BusinessDef {
  label: string;
  tier: Tier;
  /** Daily takings range, before the block's wealth moves it. */
  income: [number, number];
  /** Price to buy it, in days of takings. */
  valueDays: number;
  security: [number, number];
  patrons: [number, number];
  nerve: number;
  rackets: RacketKind[];
  /** Somewhere product can be made or kept. */
  safehouse?: boolean;
  /** A place a job can take real money out of. */
  vault?: [number, number];
}
export const BUSINESSES: Record<BusinessType, BusinessDef> = {
  bar:          { label: 'Bar', tier: 1, income: [140, 280], valueDays: 45, security: [10, 30], patrons: [3, 5], nerve: 45, rackets: ['numbers', 'bookmaking', 'gambling_den', 'loansharking', 'after_hours'] },
  diner:        { label: 'Diner', tier: 1, income: [90, 180], valueDays: 40, security: [5, 20], patrons: [2, 4], nerve: 35, rackets: ['numbers', 'laundering'] },
  restaurant:   { label: 'Restaurant', tier: 1, income: [180, 380], valueDays: 50, security: [10, 30], patrons: [2, 4], nerve: 50, rackets: ['numbers', 'laundering', 'gambling_den', 'after_hours'] },
  laundromat:   { label: 'Laundromat', tier: 1, income: [70, 140], valueDays: 45, security: [5, 15], patrons: [1, 3], nerve: 30, rackets: ['laundering', 'numbers'] },
  pawn:         { label: 'Pawn Shop', tier: 1, income: [110, 230], valueDays: 45, security: [25, 45], patrons: [1, 3], nerve: 55, rackets: ['fencing', 'loansharking'] },
  garage:       { label: 'Auto Garage', tier: 1, income: [120, 250], valueDays: 45, security: [15, 35], patrons: [1, 3], nerve: 50, rackets: ['chop_shop', 'smuggling'], safehouse: true },
  nightclub:    { label: 'Nightclub', tier: 2, income: [320, 720], valueDays: 55, security: [30, 55], patrons: [4, 6], nerve: 60, rackets: ['gambling_den', 'dealing', 'laundering', 'after_hours', 'bookmaking'] },
  corner_store: { label: 'Corner Store', tier: 1, income: [70, 150], valueDays: 35, security: [10, 25], patrons: [2, 4], nerve: 30, rackets: ['numbers', 'dealing', 'card_skimming'] },
  barbershop:   { label: 'Barbershop', tier: 1, income: [60, 130], valueDays: 35, security: [5, 15], patrons: [3, 5], nerve: 40, rackets: ['numbers', 'bookmaking'] },
  gym:          { label: 'Boxing Gym', tier: 1, income: [70, 140], valueDays: 40, security: [10, 25], patrons: [3, 5], nerve: 65, rackets: ['bookmaking', 'loansharking'] },
  cab_company:  { label: 'Cab Company', tier: 2, income: [160, 320], valueDays: 45, security: [15, 30], patrons: [1, 3], nerve: 45, rackets: ['smuggling', 'dealing', 'union_dues'] },
  construction: { label: 'Construction Co.', tier: 2, income: [260, 600], valueDays: 50, security: [20, 40], patrons: [1, 2], nerve: 55, rackets: ['no_show_jobs', 'union_dues', 'laundering'] },
  warehouse:    { label: 'Warehouse', tier: 2, income: [90, 210], valueDays: 50, security: [25, 50], patrons: [0, 1], nerve: 40, rackets: ['smuggling', 'fencing', 'counterfeiting'], safehouse: true, vault: [2000, 9000] },
  motel:        { label: 'Motel', tier: 1, income: [90, 200], valueDays: 45, security: [5, 20], patrons: [1, 3], nerve: 35, rackets: ['dealing', 'laundering'], safehouse: true },
  pharmacy:     { label: 'Pharmacy', tier: 2, income: [150, 320], valueDays: 50, security: [30, 50], patrons: [2, 4], nerve: 50, rackets: ['dealing', 'card_skimming'] },
  electronics:  { label: 'Phone Shop', tier: 1, income: [100, 230], valueDays: 40, security: [20, 35], patrons: [2, 4], nerve: 35, rackets: ['fencing', 'card_skimming', 'counterfeiting'] },
  scrapyard:    { label: 'Scrapyard', tier: 1, income: [90, 200], valueDays: 40, security: [15, 30], patrons: [1, 2], nerve: 55, rackets: ['chop_shop', 'fencing', 'smuggling'], safehouse: true },
  boutique:     { label: 'Boutique', tier: 2, income: [160, 360], valueDays: 45, security: [25, 45], patrons: [2, 3], nerve: 45, rackets: ['laundering', 'counterfeiting'] },
  // tier 3: institutions. Nothing runs out of a bank lobby: they are jobs, or a very large purchase.
  bank:          { label: 'Bank', tier: 3, income: [500, 900], valueDays: 90, security: [65, 85], patrons: [0, 1], nerve: 90, rackets: [], vault: [30000, 90000] },
  jeweller:      { label: 'Jeweller', tier: 3, income: [260, 480], valueDays: 70, security: [55, 75], patrons: [0, 2], nerve: 75, rackets: [], vault: [15000, 45000] },
  armored_depot: { label: 'Armored Depot', tier: 3, income: [300, 500], valueDays: 80, security: [70, 90], patrons: [0, 0], nerve: 95, rackets: [], vault: [40000, 120000] },
  casino:        { label: 'Casino', tier: 3, income: [900, 1600], valueDays: 80, security: [60, 80], patrons: [4, 6], nerve: 85, rackets: [], vault: [25000, 80000] },
  gallery:       { label: 'Gallery', tier: 3, income: [220, 420], valueDays: 70, security: [50, 70], patrons: [1, 2], nerve: 70, rackets: [], vault: [12000, 40000] },
};

/** Racket slots a place has by tier. Institutions carry none. */
export const SLOTS: Record<Tier, number> = { 1: 1, 2: 2, 3: 0 };

// ---------------------------------------------------------------------------------------- traits
export interface TraitDef { label: string; blurb: string }
/** Every trait has a mechanical meaning, and the blurb says what it is — no flavour-only traits. */
export const TRAITS: Record<Trait, TraitDef> = {
  greedy:    { label: 'Greedy', blurb: 'Money moves them. Cheaper to bribe and to buy out; skims when they work for you.' },
  loyal:     { label: 'Loyal', blurb: 'Hard to turn and slow to cool on you. Hard to lean on too — they will not sell out their own.' },
  coward:    { label: 'Coward', blurb: 'Fear builds fast. Folds to a threat, and runs from a fight.' },
  hothead:   { label: 'Hothead', blurb: 'Pushes back. A threat can turn into a fight; good muscle if they are yours.' },
  honest:    { label: 'Honest', blurb: 'Will not take a bribe, and may go to the police about what they see.' },
  ambitious: { label: 'Ambitious', blurb: 'Wants to rise. Works harder for you, and resents being passed over.' },
  gambler:   { label: 'Gambler', blurb: 'Always owes somebody. Easy to put in your debt.' },
  junkie:    { label: 'Junkie', blurb: 'Cheap to recruit, and unreliable when it matters.' },
  quiet:     { label: 'Quiet', blurb: 'Keeps secrets — yours and their own. A bad witness against you.' },
  connected: { label: 'Connected', blurb: 'Knows people. Brings you tips and introductions once they trust you.' },
  tough:     { label: 'Tough', blurb: 'Takes a lot of pressure before it shows.' },
  sly:       { label: 'Sly', blurb: 'Sharp and hard to read. Good at the clever jobs, and at lying to you.' },
};

// ---------------------------------------------------------------------------------------- rackets
export interface RacketDef {
  label: string;
  blurb: string;
  setup: number;
  /** Daily take before the block, the runner, saturation and synergy move it. */
  base: number;
  skill: Skill;
  heat: number;
  /** Daily chance it draws a raid, at average police. */
  risk: number;
  /** Pays clean rather than dirty. */
  clean?: boolean;
  /** Sells from the stash rather than earning from nothing. */
  sells?: Product[];
  /** Laundering: how much dirty money it can turn clean a day, and at what rate. */
  wash?: { cap: number; rate: number };
}
export const RACKETS: Record<RacketKind, RacketDef> = {
  numbers:        { label: 'Numbers', blurb: 'A daily lottery the neighbourhood plays. Steady, quiet money.', setup: 400, base: 110, skill: 'brains', heat: 1, risk: 0.02 },
  bookmaking:     { label: 'Bookmaking', blurb: 'Bets on the fights and the horses.', setup: 800, base: 180, skill: 'brains', heat: 1.5, risk: 0.03 },
  gambling_den:   { label: 'Gambling Den', blurb: 'Card games in the back room. Big money, big noise.', setup: 2400, base: 420, skill: 'charm', heat: 3.5, risk: 0.06 },
  loansharking:   { label: 'Loansharking', blurb: 'Money lent at a price, collected however it takes.', setup: 1500, base: 240, skill: 'muscle', heat: 2, risk: 0.04 },
  fencing:        { label: 'Fencing', blurb: 'Turns stolen goods into cash at a fair-ish price.', setup: 700, base: 60, skill: 'charm', heat: 1.5, risk: 0.03, sells: ['goods'] },
  dealing:        { label: 'Dealing', blurb: 'Moves your product to the people who want it.', setup: 500, base: 50, skill: 'charm', heat: 3, risk: 0.06, sells: ['booze', 'green', 'pills'] },
  chop_shop:      { label: 'Chop Shop', blurb: 'Cars in whole, out in pieces.', setup: 1800, base: 300, skill: 'wheels', heat: 2.5, risk: 0.05 },
  smuggling:      { label: 'Smuggling', blurb: 'A route in. Earns, and keeps your labs supplied cheaply.', setup: 2000, base: 240, skill: 'wheels', heat: 2.5, risk: 0.05 },
  laundering:     { label: 'Laundering', blurb: 'Dirty money in, clean money out, minus a cut. It only washes while it is switched on.', setup: 1500, base: 0, skill: 'brains', heat: 0.8, risk: 0.02, clean: true, wash: { cap: 1800, rate: 0.85 } },
  counterfeiting: { label: 'Counterfeiting', blurb: 'A press in the back. Paper that passes, mostly.', setup: 1800, base: 320, skill: 'tech', heat: 3, risk: 0.05 },
  after_hours:    { label: 'After Hours', blurb: 'The place never closes. Four-in-the-morning prices.', setup: 1300, base: 300, skill: 'charm', heat: 2.5, risk: 0.05 },
  no_show_jobs:   { label: 'No-Show Jobs', blurb: 'Your people on the payroll. They never show. Pays clean.', setup: 1600, base: 300, skill: 'charm', heat: 1.5, risk: 0.03, clean: true },
  card_skimming:  { label: 'Card Skimming', blurb: 'A reader in the machine and a laptop in the back.', setup: 1100, base: 260, skill: 'tech', heat: 2, risk: 0.04 },
  union_dues:     { label: 'Union Dues', blurb: 'The local is yours. Dues come in clean, every week.', setup: 2200, base: 280, skill: 'charm', heat: 1, risk: 0.02, clean: true },
};
export const RACKET_LEVEL = { mult: [1, 1.6, 2.3], upgrade: [0, 1.5, 3] } as const;

/**
 * One kind, spread thin, pays less; different kinds stacked feed each other. Carried over from the
 * original's territory pass because it was the change that made anything but the cheapest racket
 * worth running.
 */
export const SATURATION = { free: 3, decay: 0.8, floor: 0.3 };
export const SYNERGY: Partial<Record<RacketKind, { needs: RacketKind; bonus: number; why: string }>> = {
  loansharking: { needs: 'gambling_den', bonus: 0.35, why: 'a room full of people who just lost' },
  bookmaking: { needs: 'numbers', bonus: 0.25, why: 'the same runners carry both' },
  fencing: { needs: 'chop_shop', bonus: 0.3, why: 'the parts need a buyer too' },
  dealing: { needs: 'smuggling', bonus: 0.3, why: 'product arriving cheap on your own route' },
  union_dues: { needs: 'no_show_jobs', bonus: 0.3, why: 'you are writing the payroll' },
  counterfeiting: { needs: 'laundering', bonus: 0.25, why: 'somewhere the paper can hide' },
  after_hours: { needs: 'dealing', bonus: 0.3, why: 'the crowd comes for more than drinks' },
  card_skimming: { needs: 'fencing', bonus: 0.3, why: 'a fence who takes cards as readily as goods' },
};

// ------------------------------------------------------------------------------------- products
export const PRODUCTS: Record<Product, { label: string; price: number; heat: number }> = {
  booze: { label: 'Booze', price: 30, heat: 0.4 },
  green: { label: 'Green', price: 55, heat: 0.7 },
  pills: { label: 'Pills', price: 110, heat: 1.4 },
  goods: { label: 'Hot goods', price: 80, heat: 0.5 },
};
export interface LabDef { label: string; blurb: string; product: Product; setup: number; supplyCost: number; output: number; skill: Skill; heat: number; risk: number }
export const LABS: Record<LabKind, LabDef> = {
  still: { label: 'Still', blurb: 'Bathtub booze. Cheap, sells everywhere.', product: 'booze', setup: 1200, supplyCost: 60, output: 14, skill: 'tech', heat: 0.8, risk: 0.02 },
  grow: { label: 'Grow Room', blurb: 'Lamps and patience.', product: 'green', setup: 2600, supplyCost: 90, output: 10, skill: 'brains', heat: 1.4, risk: 0.03 },
  lab: { label: 'Lab', blurb: 'High margin, high heat, and it stinks.', product: 'pills', setup: 6000, supplyCost: 200, output: 8, skill: 'tech', heat: 3, risk: 0.05 },
};
export const SAFEHOUSE_TIERS = [
  { label: 'Back room', rent: 30, buy: 900, capacity: 80, labs: 1, beds: 3 },
  { label: 'Apartment', rent: 90, buy: 3500, capacity: 220, labs: 2, beds: 6 },
  { label: 'Compound', rent: 250, buy: 12000, capacity: 600, labs: 3, beds: 12 },
];

// ------------------------------------------------------------------------------------------ gear
export const GEAR: Record<GearKind, { label: string; skill: Skill; levels: { label: string; price: number }[]; blurb: string }> = {
  weapons: { label: 'Weapons', skill: 'muscle', blurb: 'What your people carry. Every loud job and every fight.', levels: [{ label: 'Bare hands', price: 0 }, { label: 'Bats and knives', price: 800 }, { label: 'Handguns', price: 4000 }, { label: 'Heavy iron', price: 15000 }] },
  tools: { label: 'Tools', skill: 'brains', blurb: 'Picks, drills, a man who knows safes. Quiet jobs.', levels: [{ label: 'A crowbar', price: 0 }, { label: 'Lockpicks', price: 700 }, { label: 'Drills and torches', price: 3500 }, { label: 'Thermal lances', price: 13000 }] },
  wheels: { label: 'Wheels', skill: 'wheels', blurb: 'Getaway cars and vans. Every job that has to leave.', levels: [{ label: 'The bus', price: 0 }, { label: 'A clean sedan', price: 900 }, { label: 'Fast cars', price: 4500 }, { label: 'A garage full', price: 14000 }] },
  tech: { label: 'Tech', skill: 'tech', blurb: 'Scanners, jammers, laptops. Alarms, cameras and the wire.', levels: [{ label: 'A phone', price: 0 }, { label: 'Scanners', price: 900 }, { label: 'Jammers and a rig', price: 5000 }, { label: 'A proper crew of hackers', price: 16000 }] },
};

// ------------------------------------------------------------------------------------- officials
export const OFFICIALS: Record<OfficialKind, { label: string; blurb: string; weekly: number; effect: string }> = {
  captain: { label: 'Precinct Captain', blurb: 'Runs a station house.', weekly: 1400, effect: 'Your heat cools a point and a half faster every day, attention in the precinct falls, and you hear about raids first.' },
  judge: { label: 'Judge', blurb: 'Sits on the criminal bench.', weekly: 2200, effect: 'Your people get out of jail sooner, and a trial against you starts behind.' },
  prosecutor: { label: 'District Attorney', blurb: 'Decides what gets charged.', weekly: 2600, effect: 'Case files against you build a third slower.' },
  councillor: { label: 'Councillor', blurb: 'Signs the permits.', weekly: 1200, effect: 'Buying a business costs a fifth less.' },
};

// ----------------------------------------------------------------------------------- backgrounds
export interface BackgroundDef { label: string; blurb: string; skills: Skills; cash: number; perk: string }
export const BACKGROUNDS: Record<Background, BackgroundDef> = {
  bruiser: { label: 'Bruiser', blurb: 'You came up in the ring and the back alleys.', skills: { muscle: 7, brains: 3, charm: 4, wheels: 4, tech: 2 }, cash: 600, perk: 'Owners start a little afraid of you. Threats land harder.' },
  grifter: { label: 'Grifter', blurb: 'You have talked your way into and out of everything.', skills: { muscle: 3, brains: 5, charm: 7, wheels: 3, tech: 2 }, cash: 900, perk: 'People trust you faster, and cons pay more.' },
  brain: { label: 'Bookkeeper', blurb: 'You kept the ledgers for somebody who got sloppy.', skills: { muscle: 2, brains: 7, charm: 5, wheels: 3, tech: 3 }, cash: 1500, perk: 'Laundering and rackets you run yourself earn more.' },
  wheelman: { label: 'Wheelman', blurb: 'You drove for crews all over the county.', skills: { muscle: 4, brains: 4, charm: 4, wheels: 7, tech: 3 }, cash: 800, perk: 'Every job gets away cleaner; travel costs you nothing.' },
  hacker: { label: 'Hacker', blurb: 'Every lock is a computer now.', skills: { muscle: 2, brains: 5, charm: 3, wheels: 3, tech: 8 }, cash: 1100, perk: 'Tech jobs are easier, and wire work draws less heat.' },
  drifter: { label: 'Drifter', blurb: 'Nobody knows where you came from. Not even you.', skills: { muscle: 4, brains: 4, charm: 4, wheels: 4, tech: 4 }, cash: 700, perk: 'A life rolled at random: your skills and a starting trait are dealt from the seed.' },
};

// ------------------------------------------------------------------------------------- factions
export const STYLES: Record<FactionStyle, { label: string; temperaments: Temperament[]; colors: string[] }> = {
  family: { label: 'Family', temperaments: ['greedy', 'cunning', 'cautious'], colors: ['#c0392b', '#a93226', '#922b21'] },
  syndicate: { label: 'Syndicate', temperaments: ['cunning', 'greedy'], colors: ['#2e86de', '#1f6fb2', '#5f27cd'] },
  gang: { label: 'Street gang', temperaments: ['aggressive', 'greedy'], colors: ['#e84393', '#fd79a8', '#e17055'] },
  cartel: { label: 'Cartel', temperaments: ['aggressive', 'cunning'], colors: ['#e67e22', '#d35400', '#f39c12'] },
  crew: { label: 'Crew', temperaments: ['aggressive', 'cautious'], colors: ['#27ae60', '#16a085', '#7f8c8d'] },
};

// ------------------------------------------------------------------------------------ jobs
export interface JobDef {
  label: string;
  verb: string;
  blurb: string;
  leans: Skill[];
  crew: [number, number];
  tier: 1 | 2 | 3 | 4;
  planDays: number;
  heat: number;
  exposure: number;
  crime: 'violence' | 'robbery' | 'murder' | 'fraud' | 'arson' | 'kidnap';
  /** Which approaches make sense for it. */
  approaches: ('quiet' | 'loud' | 'clever')[];
}
export const JOBS: Record<JobKind, JobDef> = {
  burglary: { label: 'Burglary', verb: 'Break into', blurb: 'In after closing, out before anybody wakes.', leans: ['brains', 'tech', 'wheels'], crew: [1, 2], tier: 1, planDays: 1, heat: 4, exposure: 0.15, crime: 'robbery', approaches: ['quiet', 'clever'] },
  robbery: { label: 'Stick-up', verb: 'Stick up', blurb: 'Through the front door, masks on, till open.', leans: ['muscle', 'wheels'], crew: [1, 3], tier: 1, planDays: 0, heat: 8, exposure: 0.3, crime: 'robbery', approaches: ['loud', 'quiet'] },
  heist: { label: 'Heist', verb: 'Take the vault at', blurb: 'The big one. Plan it properly or do not do it.', leans: ['brains', 'tech', 'muscle', 'wheels'], crew: [3, 5], tier: 3, planDays: 4, heat: 18, exposure: 0.45, crime: 'robbery', approaches: ['quiet', 'loud', 'clever'] },
  hijack: { label: 'Hijack', verb: 'Hijack a load bound for', blurb: 'A truck, a quiet stretch of road, and nobody hurt if they are sensible.', leans: ['wheels', 'muscle'], crew: [2, 3], tier: 2, planDays: 1, heat: 7, exposure: 0.25, crime: 'robbery', approaches: ['loud', 'clever'] },
  hit: { label: 'Hit', verb: 'Put down', blurb: 'Somebody stops being a problem, permanently.', leans: ['muscle', 'wheels', 'brains'], crew: [1, 3], tier: 2, planDays: 2, heat: 15, exposure: 0.4, crime: 'murder', approaches: ['quiet', 'loud'] },
  kidnap: { label: 'Snatch', verb: 'Snatch', blurb: 'Somebody with rich relatives spends a week somewhere else.', leans: ['muscle', 'wheels', 'charm'], crew: [2, 3], tier: 3, planDays: 2, heat: 14, exposure: 0.35, crime: 'kidnap', approaches: ['quiet', 'loud'] },
  arson: { label: 'Torch', verb: 'Torch', blurb: 'Accidents happen. Somebody collects on the insurance.', leans: ['tech', 'wheels'], crew: [1, 2], tier: 1, planDays: 1, heat: 9, exposure: 0.25, crime: 'arson', approaches: ['quiet', 'loud'] },
  sabotage: { label: 'Sabotage', verb: 'Wreck', blurb: 'A rival\'s operation stops working for a while.', leans: ['tech', 'muscle'], crew: [1, 2], tier: 1, planDays: 1, heat: 6, exposure: 0.2, crime: 'violence', approaches: ['quiet', 'loud'] },
  con: { label: 'Con', verb: 'Take', blurb: 'A mark with money and a weakness. Nobody gets hurt but their pride.', leans: ['charm', 'brains'], crew: [1, 2], tier: 1, planDays: 2, heat: 2, exposure: 0.1, crime: 'fraud', approaches: ['clever'] },
  fraud: { label: 'Fraud', verb: 'Paper over', blurb: 'Forms, signatures and a transfer nobody checks. Pays clean.', leans: ['brains', 'tech', 'charm'], crew: [1, 2], tier: 2, planDays: 3, heat: 3, exposure: 0.15, crime: 'fraud', approaches: ['clever', 'quiet'] },
  hack: { label: 'Wire job', verb: 'Get inside the systems at', blurb: 'Accounts, cards, a back door. No masks needed.', leans: ['tech', 'brains'], crew: [1, 2], tier: 2, planDays: 2, heat: 3, exposure: 0.12, crime: 'fraud', approaches: ['quiet', 'clever'] },
  smuggle: { label: 'Run', verb: 'Run a load through', blurb: 'Product in the back of a van, past whoever is looking.', leans: ['wheels', 'charm'], crew: [1, 2], tier: 1, planDays: 1, heat: 4, exposure: 0.15, crime: 'robbery', approaches: ['quiet', 'clever'] },
  raid: { label: 'Raid', verb: 'Raid', blurb: 'Hit a rival\'s stash house and take what is inside.', leans: ['muscle', 'wheels'], crew: [2, 4], tier: 2, planDays: 1, heat: 10, exposure: 0.3, crime: 'violence', approaches: ['loud', 'quiet'] },
  frame: { label: 'Frame', verb: 'Frame', blurb: 'The police find exactly what you left for them.', leans: ['brains', 'charm', 'tech'], crew: [1, 2], tier: 2, planDays: 3, heat: -5, exposure: 0.1, crime: 'fraud', approaches: ['clever'] },
};

export const APPROACH_INFO: Record<'quiet' | 'loud' | 'clever', { label: string; blurb: string; heat: number; payout: number; injury: number }> = {
  quiet: { label: 'Quiet', blurb: 'Slow and careful. Less heat, fewer people hurt.', heat: 0.6, payout: 0.9, injury: 0.5 },
  loud: { label: 'Loud', blurb: 'Fast and frightening. More heat, more of the take, more blood.', heat: 1.5, payout: 1.15, injury: 1.6 },
  clever: { label: 'Clever', blurb: 'A story, a uniform, a man on the inside. Lives on what you know.', heat: 0.8, payout: 1, injury: 0.4 },
};

export const RANKS = [
  { at: 0, label: 'Nobody', ap: 8 },
  { at: 20, label: 'Hustler', ap: 8 },
  { at: 45, label: 'Earner', ap: 9 },
  { at: 75, label: 'Made', ap: 9 },
  { at: 110, label: 'Boss', ap: 10 },
  { at: 150, label: 'Kingpin', ap: 11 },
];

// ------------------------------------------------------------------------------------ specialists
/**
 * People the fixer can find for one job. Their skill joins the team's for that job only, at a
 * level none of your own people start at; the fee is paid up front, win or lose.
 */
export const SPECIALISTS: Record<'safecracker' | 'driver' | 'hacker' | 'face' | 'gunman', { label: string; skill: Skill; blurb: string; base: number }> = {
  safecracker: { label: 'Safecracker', skill: 'brains', blurb: 'Knows every lock made in the last forty years by the sound of it.', base: 500 },
  driver: { label: 'Driver', skill: 'wheels', blurb: 'Never been caught. Never been followed further than a block.', base: 400 },
  hacker: { label: 'Hacker', skill: 'tech', blurb: 'Alarms, cameras, doors with keypads. Brings a laptop and leaves nothing.', base: 500 },
  face: { label: 'Face', skill: 'charm', blurb: 'A uniform, a clipboard and a voice people do what they are told by.', base: 400 },
  gunman: { label: 'Gunman', skill: 'muscle', blurb: 'Makes sure nobody is brave. Costs extra because of what happens if they are.', base: 600 },
};
