/**
 * RACKETS: Remake — the whole state of one game.
 *
 * One JSON object, saved as-is. Everything here is produced from `World.seed` by the generator
 * and then moved only by `dispatch` (see `reducer.ts`), so the same seed and the same actions give
 * the same city, the same people and the same outcome. Nothing in this folder may import React,
 * fetch anything, or call `Math.random` — the same hard walls the original game lives behind.
 */

export type Id = string;
/** `'player'` or a faction id. Territory, protection and rackets are all keyed by this. */
export type Owner = string;
export const PLAYER = 'player';

export interface Vec { x: number; y: number }

// ------------------------------------------------------------------------------------------ skills
export type Skill = 'muscle' | 'brains' | 'charm' | 'wheels' | 'tech';
export const SKILLS: Skill[] = ['muscle', 'brains', 'charm', 'wheels', 'tech'];
export type Skills = Record<Skill, number>;

// -------------------------------------------------------------------------------------------- city
export type DistrictKind = 'downtown' | 'docks' | 'oldtown' | 'industrial' | 'heights' | 'market' | 'strip' | 'projects' | 'suburb';

export interface Street {
  id: Id;
  name: string;
  /** 0 avenue, 1 street, 2 lane. Avenues are wider on the map and carry the bridges. */
  rank: 0 | 1 | 2;
  /** Along a grid line: `axis` 'x' lines run north–south. */
  axis: 'x' | 'y';
  index: number;
  points: Vec[];
}

export interface Bridge { id: Id; streetId: Id; from: Vec; to: Vec }

export interface City {
  name: string;
  motto: string;
  width: number;
  height: number;
  /** Grid lines, north–south then east–west. Block outlines are rings of these warped vertices. */
  cols: number;
  rows: number;
  /** Warped lattice vertex (i, j) is at `verts[j * (cols + 1) + i]`. */
  verts: Vec[];
  streets: Street[];
  sea?: Vec[];
  river?: { path: Vec[]; width: number };
  bridges: Bridge[];
  parks: { id: Id; name: string; poly: Vec[] }[];
}

export interface District {
  id: Id;
  /** Which city of the region it belongs to; absent means the home city (`c0`). */
  cityId?: CityId;
  name: string;
  kind: DistrictKind;
  center: Vec;
  /** 0..100: what the streets are worth. Drives income, prices, what a job can take. */
  wealth: number;
  /** 0..100: how hard the precinct looks here by default. Heat and payroll move it. */
  police: number;
  /** 0..100: live police attention on this district. Decays toward `police`. */
  attention: number;
  precinctId: Id;
  blockIds: Id[];
}

export interface Block {
  /** A landmark set-piece came off here on this day: it is closed to you for a month (`SETPIECE_REST`). */
  hitDay?: number;
  /** How much harder its set-piece is now, from every time somebody went at it. */
  hardened?: number;
  id: Id;
  name: string;
  districtId: Id;
  /** Cell rectangle in lattice space, inclusive: [i0, j0, i1, j1]. */
  cells: [number, number, number, number];
  poly: Vec[];
  center: Vec;
  neighborIds: Id[];
  waterfront: boolean;
  wealth: number;
  population: number;
  /** Your notoriety on this block, 0..100. */
  heat: number;
  influence: Record<Owner, number>;
  heldSince?: number;
  businessIds: Id[];
  safehouseId?: Id;
  landmark?: string;
}

// ------------------------------------------------------------------------------------------ people
export type Trait =
  | 'greedy' | 'loyal' | 'coward' | 'hothead' | 'honest' | 'ambitious'
  | 'gambler' | 'junkie' | 'quiet' | 'connected' | 'tough' | 'sly';

export type Role = 'owner' | 'patron' | 'boss' | 'lieutenant' | 'soldier' | 'official' | 'fixer' | 'crew';
export type OfficialKind = 'captain' | 'judge' | 'prosecutor' | 'councillor';

export interface Rel {
  /** −100..100: do they believe what you say. */
  trust: number;
  /** 0..100: what they think happens if they say no. */
  fear: number;
  /** 0..100: what they think you are. */
  respect: number;
  /** Day you first spoke. Absent means strangers. */
  met?: number;
  /** A favour they owe you (settled agenda, a kindness). Spent when called in. */
  owes: number;
}

export type MemoryKind = 'met' | 'helped' | 'threatened' | 'hurt' | 'paid' | 'squeezed' | 'robbed' | 'betrayed' | 'hired' | 'protected' | 'lied' | 'saved';
export interface Memory { day: number; kind: MemoryKind; text: string }

export type TieKind = 'family' | 'friend' | 'rival' | 'partner';
export interface Tie { id: Id; kind: TieKind }

export type AgendaKind = 'debt' | 'revenge' | 'sick' | 'escape' | 'rival' | 'kid';
export interface Agenda {
  kind: AgendaKind;
  /** Cash that settles it, for the ones money settles. */
  cost?: number;
  /** Somebody it is about, for revenge and rival. */
  targetId?: Id;
  known: boolean;
  since: number;
}

export type SecretKind = 'affair' | 'skimming' | 'debts' | 'past' | 'informant' | 'habit';
export interface Secret { kind: SecretKind; known: boolean }

export type CrewStatus = 'ready' | 'busy' | 'injured' | 'jailed' | 'held' | 'travel';
export type Assignment =
  | { kind: 'racket'; racketId: Id }
  | { kind: 'lab'; labId: Id }
  | { kind: 'guard'; blockId: Id }
  | { kind: 'district'; districtId: Id }
  | { kind: 'job'; jobId: Id }
  | { kind: 'driver' };

export interface Crew {
  loyalty: number;
  /** A lieutenant's hand in the till, accumulated since the last audit. Hidden from the player. */
  skimmed?: number;
  /** Day of the last audit, which is also what stops you auditing the same books every morning. */
  auditedDay?: number;
  /** Day they were last caught skimming: somebody just caught keeps their hands still for a while. */
  caughtDay?: number;
  /** Day they last asked for a raise: the ask comes once in a while, not every few nights. */
  askedDay?: number;
  /** Made in a ceremony (`family.ts`): they do not walk out, and they cost more. */
  made?: boolean;
  /** Talking to the police: `found` once you know, `fed` once you are feeding them lies. */
  rat?: { since: number; found?: boolean; fed?: boolean };
  /** Daily wage, paid dirty-first at end of day. */
  cut: number;
  joined: number;
  status: CrewStatus;
  statusDays: number;
  assignment?: Assignment;
  xp: number;
  level: number;
  /** What they carry. Owned by the outfit; see `content/kit.ts`. */
  kit?: Kit;
  /** The city they live and work in (absent: the home city). They work only there; move them to use them elsewhere. */
  cityId?: CityId;
}

export type Kit = Partial<Record<Slot, ItemId>>;

export interface Npc {
  id: Id;
  first: string;
  last: string;
  nick?: string;
  pronoun: 'he' | 'she' | 'they';
  age: number;
  /** Seed for the procedural face. */
  face: number;
  role: Role;
  official?: OfficialKind;
  /** A captain's station house. */
  precinctId?: Id;
  homeBlockId: Id;
  workId?: Id;
  faction?: Owner;
  skills: Skills;
  traits: Trait[];
  /** 0..100: how much pressure it takes before they fold. */
  nerve: number;
  wealth: number;
  rel: Rel;
  memory: Memory[];
  ties: Tie[];
  agenda?: Agenda;
  secret?: Secret;
  /** Sized up: traits, nerve and skills are shown. */
  known: boolean;
  crew?: Crew;
  /** On the player's payroll (officials), paid weekly. */
  payroll?: number;
  alive: boolean;
  jailedDays?: number;
  /** You have been inside their business (`rat`): the wire jobs against them are open. */
  inside?: boolean;
}

// ------------------------------------------------------------------------------------- businesses
export type BusinessType =
  | 'bar' | 'diner' | 'restaurant' | 'laundromat' | 'pawn' | 'garage' | 'nightclub' | 'corner_store'
  | 'barbershop' | 'gym' | 'cab_company' | 'construction' | 'warehouse' | 'motel' | 'pharmacy'
  | 'electronics' | 'scrapyard' | 'boutique' | 'bank' | 'jeweller' | 'armored_depot' | 'casino' | 'gallery';

export type Tier = 1 | 2 | 3;

export interface Business {
  id: Id;
  name: string;
  type: BusinessType;
  tier: Tier;
  blockId: Id;
  pos: Vec;
  ownerId: Id;
  patronIds: Id[];
  /** Daily takings before anybody's cut. */
  income: number;
  /** 0..100: locks, cameras, a guard who is awake. */
  security: number;
  /** Cash in the building on an ordinary day — what a stick-up finds. */
  till: number;
  protection?: { by: Owner; rate: number; since: number };
  ownedBy: 'npc' | Owner;
  racketIds: Id[];
  /** Shut for this many days (a raid, a fire). */
  closed: number;
  /** Your people are dug in here until this day: an outfit that comes for it is turned away. */
  dugIn?: number;
  /** The products this place takes from your drivers (`supply.ts`), and what it got tonight. */
  outlet?: Product[];
  supplied?: { day: number; n: number };
}

export type RacketKind =
  | 'numbers' | 'bookmaking' | 'gambling_den' | 'loansharking' | 'fencing' | 'dealing' | 'chop_shop'
  | 'smuggling' | 'laundering' | 'counterfeiting' | 'after_hours' | 'no_show_jobs' | 'card_skimming' | 'union_dues';

export interface Racket {
  id: Id;
  kind: RacketKind;
  businessId: Id;
  owner: Owner;
  level: 1 | 2 | 3;
  runnerId?: Id;
  started: number;
  lastIncome: number;
  /** Days it earns nothing after a raid or sabotage. */
  down: number;
  /** Laundering only: whether it takes your dirty money today. On unless you switch it off. */
  on?: boolean;
}

// ---------------------------------------------------------------------------------- the stash
export type Product = 'booze' | 'green' | 'pills' | 'goods';
export interface Lot { n: number; q: number }
export type LabKind = 'still' | 'grow' | 'lab';
export interface Lab {
  id: Id;
  kind: LabKind;
  level: 1 | 2 | 3;
  /** Days of supplies left. */
  supplies: number;
  workerId?: Id;
  lastOutput: number;
  down: number;
}
export interface Safehouse {
  id: Id;
  blockId: Id;
  name: string;
  tier: 1 | 2 | 3;
  labs: Lab[];
}

// -------------------------------------------------------------------------------------- hostages
/**
 * Somebody held against their will. `holder` is the player (in one of your safehouses) or an
 * outfit holding one of your crew.
 */
export interface Hostage {
  id: Id;
  npcId: Id;
  holder: Owner;
  safehouseId?: Id;
  since: number;
  /** What the other side is offering (or asking) today, and what they offered on the first day. */
  ransom: number;
  first: number;
  caseId?: Id;
}

// ------------------------------------------------------------------------------------ commission
export type ProposalKind = 'peace' | 'tax' | 'sanction' | 'claim' | 'seat';
export interface Proposal { kind: ProposalKind; target?: Owner; districtId?: Id; announced: number; /** The city whose table it is on (absent: the home city). */ city?: CityId }
/** The bosses at one table, every ten days, once there are three of them worth the name. */
export interface Commission {
  nextDay: number;
  proposal?: Proposal;
  seated: boolean;
  /** Lobbying for the coming vote, by outfit: + toward yes, − toward no. Cleared after each meeting. */
  pulls: Record<Owner, number>;
  /** How you will vote, if you have a seat. */
  vote?: 'yes' | 'no';
  history: { day: number; kind: ProposalKind; passed: boolean; text: string }[];
}

// ---------------------------------------------------------------------------------------- region
export type CityId = string;
export interface RegionCity {
  id: CityId;
  name: string;
  kind: string;
  blurb: string;
  motto?: string;
  size: 'small' | 'medium' | 'large';
  /** Where it sits on the region map, 1000 × 700. */
  x: number; y: number;
  links: CityId[];
  /** Its own seed: every save with this region gets the same city there. */
  seed: number;
  /** What it pays for each product against the street's ordinary price. */
  demand: Record<Product, number>;
  /** Generated and yours to walk. */
  founded: boolean;
  foundedDay?: number;
  arrivalBlockId?: Id;
  /** The road to it is open: a city beside it is a quarter yours. */
  open?: boolean;
  /** A quarter of it is yours (and its neighbours have heard). */
  reached?: boolean;
}
export interface Region { cities: RegionCity[] }
export interface Route { id: Id; from: CityId; to: CityId; product: Product; since: number; moved?: number }

// ---------------------------------------------------------------------------------- street crews
/**
 * A handful of kids on a corner, belonging to nobody. They skim what you take off their block,
 * and if nobody deals with them they grow — and a crew that gets big enough becomes an outfit.
 */
export interface StreetCrew {
  id: Id;
  name: string;
  bossId: Id;
  blockId: Id;
  members: number;
  since: number;
  /** Left alone, paid off (they leave your places be and hold the corner for you), or yours. */
  terms: 'none' | 'paid' | 'yours';
  /** Daily price of the arrangement. */
  wage: number;
}

// ---------------------------------------------------------------------------------------- factions
export type FactionStyle = 'family' | 'syndicate' | 'gang' | 'cartel' | 'crew';
export type Temperament = 'aggressive' | 'greedy' | 'cunning' | 'cautious';
export type Stance = 'allied' | 'peace' | 'tension' | 'beef' | 'war';

export interface Emblem { shape: number; charge: number; fg: string; bg: string }

export interface Faction {
  id: Owner;
  name: string;
  short: string;
  style: FactionStyle;
  temperament: Temperament;
  color: string;
  emblem: Emblem;
  bossId: Id;
  lieutenantIds: Id[];
  soldiers: number;
  cash: number;
  homeDistrictId: Id;
  alive: boolean;
  /** −100..100 toward the player. The stance is read off it. */
  standing: number;
  truceUntil?: number;
  /** Standing toward the other outfits, by id. */
  relations: Record<Owner, number>;
  /** The last few things the player did to them, which is what they remember at a sit-down. */
  grievances: string[];
}

// ------------------------------------------------------------------------------------------- jobs
/** The Remake's first fourteen kinds and the set-piece, plus the rest of the original's jobs (`content/catalogue.ts`). */
export type BaseJobKind =
  | 'burglary' | 'robbery' | 'heist' | 'hijack' | 'hit' | 'kidnap' | 'arson' | 'sabotage'
  | 'con' | 'fraud' | 'hack' | 'smuggle' | 'raid' | 'frame' | 'setpiece';
export type JobKind = BaseJobKind | CatalogueKind;
export type Approach = 'quiet' | 'loud' | 'clever';
export type SpecialistKind = 'safecracker' | 'driver' | 'hacker' | 'face' | 'gunman';

export interface JobPayout { dirty: number; clean: number; goods: number; respect: number; fear: number }

export interface Complication {
  id: string;
  title: string;
  text: string;
  options: { id: string; label: string; skill: Skill; difficulty: number; pass: string; fail: string; payout: number; heat: number; safe?: boolean }[];
}

export interface Job {
  id: Id;
  kind: JobKind;
  title: string;
  pitch: string;
  /** Who brought it to you, if anybody. */
  sourceId?: Id;
  tier: 1 | 2 | 3 | 4;
  blockId: Id;
  targetBusinessId?: Id;
  targetNpcId?: Id;
  targetFaction?: Owner;
  /** A file, for the jobs that go after one (`buy_case`). */
  targetCaseId?: Id;
  /** Paid when it is taken on, win or lose. */
  cost?: number;
  /** Crew you must send, and the skills the job leans on in this order. */
  crewMin: number;
  crewMax: number;
  leans: Skill[];
  /** 0..100 before your people are counted. */
  difficulty: number;
  planDays: number;
  expires: number;
  payout: JobPayout;
  heat: number;
  /** Chance per job that somebody sees something and a case file opens. */
  exposure: number;
  /** Offered at night for that night only (`clock.ts`): gone in the morning whether taken or not. */
  tonight?: boolean;
  status: 'offer' | 'planning' | 'ready' | 'paused' | 'done' | 'failed' | 'expired';
  approach?: Approach;
  crewIds: Id[];
  daysLeft: number;
  /** Planning time counts: every day planned adds to the odds, to a cap. */
  intel: number;
  complication?: Complication;
  /** A landmark set-piece: which one, how many stages, which stage it is on, and what has built up. */
  setpiece?: { id: string; landmark: string; stages: number; stage: number; mult: number; heat: number; messy: boolean };
  /** Somebody the fixer found for this one job: a specialist's skill joins the team's. */
  specialist?: { kind: SpecialistKind; name: string; face: number; skill: Skill; level: number; fee: number };
  /** The base roll, made at launch and held while a complication is answered. */
  rolled?: boolean;
  /** Once resolved: what actually happened, in the same numbers the purse moved by. */
  result?: { success: boolean; text: string; dirty: number; clean: number; goods: number; heat: number; injured: Id[]; jailed: Id[]; killed: Id[] };
}

// --------------------------------------------------------------------------------------------- law
export type CaseCrime = 'violence' | 'robbery' | 'murder' | 'fraud' | 'racketeering' | 'arson' | 'kidnap';
export interface Case {
  id: Id;
  crime: CaseCrime;
  opened: number;
  /** 0..100. At 100 somebody is charged. */
  evidence: number;
  suspectId: Id | 'player';
  witnessIds: Id[];
  status: 'open' | 'cold' | 'charged' | 'closed';
  trialDay?: number;
  summary: string;
}

// ---------------------------------------------------------------------------------------- events
export interface EventOption {
  id: string;
  label: string;
  /** Plain-language consequences, written from the effects so the card cannot lie. */
  hint: string;
  effects: Effect[];
  disabled?: string;
}
export interface GameEvent {
  id: Id;
  template: string;
  title: string;
  text: string;
  npcId?: Id;
  businessId?: Id;
  factionId?: Owner;
  options: EventOption[];
}

/** Everything an event can do, as data — so an option can describe itself before you press it. */
export type Effect =
  | { k: 'cash'; n: number }
  | { k: 'dirty'; n: number }
  | { k: 'heat'; n: number }
  | { k: 'fear'; n: number }
  | { k: 'respect'; n: number }
  | { k: 'trust'; npcId: Id; n: number }
  | { k: 'npcFear'; npcId: Id; n: number }
  | { k: 'loyalty'; npcId: Id; n: number }
  | { k: 'standing'; factionId: Owner; n: number }
  | { k: 'influence'; blockId: Id; n: number }
  | { k: 'goods'; n: number }
  | { k: 'product'; product: Product; n: number }
  | { k: 'injure'; npcId: Id; days: number }
  | { k: 'jail'; npcId: Id; days: number }
  | { k: 'kill'; npcId: Id }
  | { k: 'recruit'; npcId: Id }
  | { k: 'fire'; npcId: Id }
  | { k: 'caught'; npcId: Id }
  | { k: 'heal'; npcId: Id }
  | { k: 'payroll'; npcId: Id; n: number }
  | { k: 'cut'; npcId: Id; n: number }
  | { k: 'rate'; businessId: Id; n: number }
  | { k: 'owes'; npcId: Id; n: number }
  | { k: 'agendaKnown'; npcId: Id }
  | { k: 'secretKnown'; npcId: Id }
  | { k: 'evidence'; caseId: Id; n: number }
  | { k: 'openCase'; crime: CaseCrime; suspect: Id | 'player'; witnessId?: Id; summary: string }
  | { k: 'racketDown'; racketId: Id; days: number }
  | { k: 'jobOffer'; job: Omit<Job, 'id'>; /** Gone by morning: an offer that exists only tonight. */ tonight?: boolean }
  | { k: 'schedule'; template: string; days: number; npcId?: Id; businessId?: Id; factionId?: Owner }
  | { k: 'log'; text: string; tone: Tone }
  /** The family: feed a rat lies, a capo walks off with his district, or a showdown decided on the night. */
  | { k: 'ratFed'; npcId: Id }
  /** An ambush: a fight with an outfit's soldiers where you stand, resolved on the night. */
  | { k: 'fight'; factionId: Owner; odds: number }
  | { k: 'defect'; npcId: Id }
  | { k: 'showdown'; npcId: Id; chance: number };

import type { ItemId, Slot } from '@r/content/kit';
import type { CatalogueKind } from '@r/content/catalogue';
export type { ItemId, Slot };

export type Tone = 'info' | 'good' | 'bad' | 'money' | 'warn' | 'war' | 'law';
export interface LogEntry { day: number; text: string; tone: Tone; blockId?: Id; npcId?: Id; businessId?: Id }

export interface Headline { day: number; text: string; weight: number }

// ------------------------------------------------------------------------------------------ player
export type Background = 'bruiser' | 'grifter' | 'brain' | 'wheelman' | 'hacker' | 'drifter';

export interface Player {
  /** Jobs pulled off, by kind: some jobs are only offered to somebody who has done the one before. */
  done?: Partial<Record<JobKind, number>>;
  /** People you have introduced yourself to. The tutorial's first step reads it: `rel.met` is a day, and the two
   *  neighbours who know you from day one share day 1 with anybody you meet that first evening. */
  introduced?: number;
  /** Recipes stolen (`steal_formula`): each lifts every lab's quality, to three. */
  recipes?: number;
  name: string;
  nick?: string;
  background: Background;
  face: number;
  skills: Skills;
  xp: Skills;
  cash: number;
  dirty: number;
  heat: number;
  fear: number;
  respect: number;
  ap: number;
  apMax: number;
  blockId: Id;
  crewIds: Id[];
  businessIds: Id[];
  racketIds: Id[];
  safehouseIds: Id[];
  stash: Record<Product, Lot>;
  /** Kit the outfit owns that nobody is carrying. */
  armoury: ItemId[];
  /** What you carry yourself. */
  kit: Kit;
  lawyer: boolean;
  /** Laundered today, so the day's caps hold across rackets and the fixer. */
  washedToday: number;
  /** Days under — nothing gets done, and heat falls fast. */
  lowDays: number;
  /** Days in a row with every straight condition held. */
  straightDays: number;
  busts: number;
  /** Once the player has been taken off the board: an heir from the crew plays on. */
  generation: number;
  /** Rounds for the guns (`fights.ts`). */
  bullets: number;
  /** Days still mending from a fight: fewer hours each morning until it is zero. */
  hurtDays?: number;
  /** The posts at the top of the family (`family.ts`). */
  family?: { consigliere?: Id; underboss?: Id };
  /** Your character (`character.ts`): what you trained today, the days in a row you have trained,
   *  what you took today, and the habit it has left you with (0..100). */
  trained?: { day: number; skills: Skill[] };
  streak?: { last: number; n: number };
  boost?: { day: number; kinds: ('pep' | 'nerve')[] };
  habit?: number;
}

export interface DaySummary { day: number; clean: number; dirty: number; spent: number; heat: number; control: number; worth: number; washed?: number }

export type Ending = 'kingpin' | 'straight' | 'dead' | 'convicted' | 'broke';

/** A fight, as it is shown: a title, what happened each round, and who won. */
export interface FightReport { day: number; title: string; lines: string[]; won: boolean; seen?: boolean; down?: number }

export interface World {
  version: number;
  seed: number;
  rng: number;
  day: number;
  /** Last night's deliveries (`supply.ts`). */
  supply?: { day: number; delivered: number; earned: number; lost: number; short: number };
  /** The last fight, round by round, until you have read it (`fights.ts`). */
  fight?: FightReport;
  /** Which half of the day it is (`sim/clock.ts`). Absent in saves from before day and night: day. */
  phase?: 'day' | 'night';
  city: City;
  districts: Record<Id, District>;
  blocks: Record<Id, Block>;
  businesses: Record<Id, Business>;
  npcs: Record<Id, Npc>;
  factions: Record<Owner, Faction>;
  rackets: Record<Id, Racket>;
  safehouses: Record<Id, Safehouse>;
  jobs: Record<Id, Job>;
  cases: Record<Id, Case>;
  crews: Record<Id, StreetCrew>;
  hostages: Record<Id, Hostage>;
  commission: Commission;
  /** The Commission of every other city you have founded; the home city's stays in `commission`. */
  commissions?: Record<CityId, Commission>;
  /** The cities down the road (`region.ts`). Absent on a save from before the region; `migrate` adds it. */
  region?: Region;
  /** The streets and water of every city but the first, which stays in `city`. */
  cities?: Record<CityId, City>;
  /** Standing orders moving product from one of your cities to another. */
  routes?: Route[];
  events: GameEvent[];
  scheduled: { day: number; template: string; npcId?: Id; businessId?: Id; factionId?: Owner }[];
  log: LogEntry[];
  news: Headline[];
  history: DaySummary[];
  player: Player;
  nextId: number;
  /** The fixer who washes money before you own a machine: one person, found in the city. */
  fixerId?: Id;
  won?: boolean;
  wonSeen?: boolean;
  /** The testing tools were used on this save (`cheats.ts`): nothing in it is real play. */
  cheated?: true;
  over?: { ending: Ending; day: number; text: string };
  /** Straight ending reached: the sandbox can go on, but the record says so. */
  retired?: boolean;
}
