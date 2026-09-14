/**
 * RACKETS — simulation state contract.
 * Pure data. No classes, no functions, JSON-serialisable, so the whole game can
 * be saved as one object and replayed deterministically from a seed.
 */

import type { NameGroup } from '@content/names';
import type { AuthorityKind, AuthorityPosture } from '@content/authority';
import type { ComplicationKind } from '@content/complications';
import type { SupplyRule } from './automation';
import type { IntelKind } from '@content/intel';
export type { NameGroup };

export type Id = string;
export type FactionId = Id; // 'player' is a faction id too
export const PLAYER: FactionId = 'player';

// ---------- geometry ----------
export interface Hex { q: number; r: number }
export interface LatLng { lat: number; lng: number }

// ---------- districts & blocks ----------
export type DistrictKind =
  | 'docks' | 'downtown' | 'old_quarter' | 'industrial'
  | 'heights' | 'market' | 'strip' | 'projects';

export interface District {
  id: Id;
  kind: DistrictKind;
  name: string;
  blockIds: Id[];
  chunkKey: string;
  /**
   * How networked this district's community is, 0..1. Drives how many family and friend
   * ties the people here have and how far across the district those ties reach: an old
   * quarter is a web, a downtown is a crowd of strangers. Independent of `nameGroups`.
   */
  closeness: number;
  /** Naming pools common here, as weights. Cosmetic: it decides names and nothing else. */
  nameGroups: Partial<Record<NameGroup, number>>;
}

/** A loaded-and-populated map chunk (~2.2 km square). Geometry for unpopulated chunks lives in the UI cache, not here. */
export interface ChunkState {
  key: string;
  source: 'osm' | 'hex';
  populatedDay: number;
  districtIds: Id[];
}

export interface Block {
  id: Id;
  hex?: Hex;              // only for the hex fallback
  chunkKey: string;
  polygon: LatLng[];      // outline, closed implicitly
  center: LatLng;
  areaM2: number;
  neighborIds: Id[];      // blocks sharing a street edge (across chunks too, once both are loaded)
  edgeKeys: string[];     // boundary edges, for linking neighbours in chunks loaded later
  streetNames: string[];
  name: string;
  districtId: Id;
  wealth: number;      // 0..100
  police: number;      // 0..100 baseline patrol
  heat: number;        // 0..100 player notoriety here
  population: number;  // abstract, drives demand and patrons
  demand: Record<ProductKind, number>; // units/day the block would buy
  influence: Record<FactionId, number>; // 0..100 per faction
  businessIds: Id[];
  safehouseId?: Id;
  memory: BlockMemory[];        // what people here remember (capped)
  tags: ('school' | 'police' | 'home')[];
  abandoned?: Abandoned;        // derelict: no businesses, nobody watching, nobody to testify
  heldSince?: number;           // day the player took control; cleared when lost. Tenure feeds accrual.
}

export interface BlockMemory { day: number; kind: string; text: string }

/** A block nobody runs any more. `known` is whether the player has found it; scouting flips it. */
export interface Abandoned { known: boolean; claimedBy?: FactionId }

// ---------- businesses ----------
export type BusinessType =
  | 'bar' | 'diner' | 'restaurant' | 'laundromat' | 'pawn' | 'garage'
  | 'nightclub' | 'corner_store' | 'barbershop' | 'gym' | 'cab_company'
  | 'construction' | 'warehouse' | 'motel' | 'bank' | 'jeweller' | 'armored_depot'
  | 'black_market';   // a back room that trades in kit; see content/items.ts

export interface Protection {
  factionId: FactionId;
  rate: number; // 0..1 share of income taken
  since: number; // day
  partner?: true; // the owner is in your crew: a fixed cut, minded by them, ending when they leave
}

export interface Business {
  id: Id;
  name: string;
  type: BusinessType;
  blockId: Id;
  ownerId: Id;          // NPC id (even when player-owned, the manager stays)
  patronIds: Id[];
  baseIncome: number;   // clean $/day the business itself makes
  value: number;        // purchase price
  condition: number;    // 0..100 (fires, vandalism)
  ownedBy: 'npc' | 'player' | FactionId;
  protection?: Protection;
  racketIds: Id[];
  insured: boolean;
  lastShakedownDay?: number;
  casedUntil?: number;  // you walked it and know the layout: an op here is easier until this day

  flags: string[];      // free-form markers ('torched', 'raided', ...)
}

// ---------- people ----------
export type Role =
  | 'owner' | 'patron' | 'crew' | 'boss' | 'lieutenant' | 'soldier'
  | 'cop' | 'official' | 'fixer' | 'gang_boss' | 'gang';

export type Trait =
  | 'greedy' | 'loyal' | 'coward' | 'hothead' | 'connected'
  | 'honest' | 'ambitious' | 'junkie' | 'gambler' | 'quiet';

export interface Skills { muscle: number; brains: number; charm: number; wheels: number; tech: number }

/**
 * A tie between two people: they are family, or they go back a long way. Always mutual —
 * both NPCs carry the other. `label` is the flavour shown in the UI ('cousin', 'old friend').
 */
export interface Connection { npcId: Id; kind: 'family' | 'friend'; label: string }

export interface Relationship {
  trust: number;   // -100..100
  fear: number;    // 0..100
  respect: number; // 0..100
}

export type CrewStatus = 'idle' | 'assigned' | 'injured' | 'jailed' | 'dead';

export interface CrewInfo {
  loyalty: number;     // 0..100
  cut: number;         // $/day wage
  status: CrewStatus;
  statusDays: number;  // days remaining injured/jailed
  assignment?: Assignment;
  joinedDay: number;
  baseCut?: number;    // wage before a lieutenant's raise, restored on demotion
  skim?: number;       // cash a lieutenant has quietly taken and you have not found yet
}

export type Assignment =
  | { kind: 'racket'; racketId: Id }
  | { kind: 'production'; productionId: Id }
  | { kind: 'op'; opId: Id }
  | { kind: 'guard'; blockId: Id }
  | { kind: 'collect' }
  | { kind: 'hack' }                         // works the card pile without being asked
  | { kind: 'foreman'; productionId: Id }    // runs one production properly: recipe, ingredients, output
  | { kind: 'lieutenant'; districtId: Id };  // runs a district for you

export type OfficialKind = 'captain' | 'councillor' | 'judge';

export interface Npc {
  id: Id;
  name: string;
  role: Role;
  traits: Trait[];
  skills: Skills;
  homeBlockId: Id;
  faction?: FactionId;        // for boss/lieutenant/soldier, or an owner paying protection loyalty
  favouriteBusinessIds: Id[]; // for patrons: where you meet them
  rel: Relationship;          // toward the player
  nerve: number;              // 0..100 resistance to intimidation
  alive: boolean;
  crew?: CrewInfo;            // set when in the player's crew
  official?: { kind: OfficialKind; corruption: number; retainerDay?: number; boughtBy?: FactionId; authorityId?: Id }; // authorityId: the building they answer to, not a free-floating NPC
  agenda?: Agenda;            // a want that advances daily whether or not you show up
  grudge?: { since: number; reason: string; spread: number }; // holds it against you and tells people
  known: boolean;             // traits and nerve revealed (Read action, a scene, or enough trust)
  hint?: string;              // the coarse read you get from casing the place: a feel, not a file
  tap?: { since: number };    // you are listening to this one; risk compounds daily (sim/cyber.ts)
  ratted?: number;            // the day you last got inside their business; wire fraud needs this
  intel?: { kind: IntelKind; since: number; businessId: Id };  // a standing skim or a route, off a bank or depot employee
  recipe?: string;            // a specialist: recruiting them unlocks this RECIPES id
  hostage?: { safehouseId: Id; since: number }; // held by you: alive, but out of their own life
  fixer?: { day: number; amount: number; cap: number }; // role 'fixer': today's window, and what is left of it
  connections: Connection[]; // family and friends among the other NPCs; mutual, and nothing to do with the player
  notes: string[];            // the sim's own flavour ("Runs the Eastside Boys"). Never the player's words.
  playerNote?: string;        // the player's memory aid, set from the Social tab or their sheet. The sim never writes it.
}

export type AgendaKind = 'debt' | 'leave' | 'revenge' | 'ambition' | 'family';
export interface Agenda {
  kind: AgendaKind;
  progress: number;  // 0..100; milestones at 50 and 100
  rate: number;      // per day
  target?: Id;       // faction or npc it concerns
  milestone50?: boolean;
  done?: boolean;
}

// ---------- products ----------
export type ProductKind = 'booze' | 'green' | 'pills' | 'hot_goods' | 'counterfeit';
export type Stash = Record<ProductKind, number>;

// ---------- rackets ----------
export type RacketKind =
  | 'protection' | 'numbers' | 'bookmaking' | 'gambling_den' | 'loansharking'
  | 'fencing' | 'chop_shop' | 'dealing' | 'laundering' | 'smuggling' | 'no_show_jobs'
  | 'carding'          // moves stolen cards wholesale, the way fencing moves hot goods
  // kinds that only make sense once saturation and synergy give you a reason to pick between them
  | 'union_dues'       // the payroll is yours to write; feeds no-show jobs
  | 'counterfeiting'   // paper that is not what it says it is; needs a fence
  | 'after_hours'      // a bar that never closes and never buys legally
  | 'policy_bank';     // the numbers game run as a bank, not a route

export interface Racket {
  id: Id;
  kind: RacketKind;
  businessId: Id;
  owner: FactionId;
  startedDay: number;
  level: number;         // 1..3 upgrades
  runnerId?: Id;         // crew npc assigned
  float?: number;        // loansharking capital
  product?: ProductKind; // dealing
  lastIncome: number;
  disrupted: number;     // days remaining disrupted (raid/sabotage)
  threatened?: number;   // a faction has it in their sights until this day; 'defend_racket' answers that
  supply?: SupplyRule;   // where a product racket draws its stock from; defaults to its own block
}

// ---------- safehouses & production ----------
export type ProductionKind = 'still' | 'grow_op' | 'lab' | 'print_shop';

export interface Production {
  id: Id;
  kind: ProductionKind;
  safehouseId: Id;
  level: number;         // 1..3 upgrades
  workerId?: Id;
  stock: number;         // ingredients on hand (days)
  lastOutput: number;
  disrupted: number;
  quality?: number;      // 0..100, last batch (worker skill, level, recipe, traits)
  recipe?: string;       // a RECIPES id the player has unlocked
}

export interface Safehouse {
  id: Id;
  blockId: Id;
  name: string;
  tier: number;          // 1..3
  owner: FactionId;
  stash: Stash;
  quality?: Partial<Record<ProductKind, number>>; // running average quality of what is in the stash
  cash: number;          // hidden dirty cash
  productionIds: Id[];
  capacity: number;      // product units
  hostageIds: Id[];      // people you are holding here
  squatted?: boolean;    // taken on a claimed derelict block: no rent
}

// ---------- ops (one-off) ----------
export type OpKind =
  | 'heist_bank' | 'heist_jeweller' | 'heist_armored' | 'heist_warehouse'
  | 'robbery' | 'insurance_fraud' | 'check_kiting' | 'smuggle_run'
  | 'hit' | 'intimidate' | 'raid_rival' | 'takeover' | 'steal_formula' | 'frame'
  | 'scout_block' | 'claim_abandoned' | 'kidnap'
  // armed work: the same shapes, done with something in your hand
  | 'armed_robbery' | 'armed_intimidation'
  // the wire: pockets, listening, paper, and sabotage that leaves no bodies
  | 'mugging' | 'rat' | 'wire_fraud' | 'digital_strike'
  // only on the table while a faction is at beef or war with you
  | 'ambush_soldiers' | 'defend_racket' | 'war_strike'
  // pushing back on the law itself, rather than only outrunning it
  | 'buy_down' | 'spring_crew' | 'buy_case'
  // more ways into a vault
  | 'heist_gallery' | 'heist_countroom' | 'heist_payroll' | 'heist_containers'
  // paper, patience and somebody else's signature
  | 'long_con' | 'staged_accident' | 'shell_company' | 'charity_front' | 'counterfeit_run'
  // moving things that should not be moving
  | 'dockside_pickup' | 'hijack_load' | 'convoy_run';

export type OpStatus = 'planning' | 'ready' | 'done' | 'failed' | 'aborted';

export interface Op {
  id: Id;
  kind: OpKind;
  targetBusinessId?: Id;
  targetNpcId?: Id;
  targetFactionId?: FactionId;
  targetBlockId?: Id;
  targetDistrictId?: Id;
  safehouseId?: Id;      // kidnap: where they go
  crewIds: Id[];
  approach?: 'loud' | 'quiet' | 'inside';
  mode?: string;   // op-specific choice (OpDef.modes), e.g. one look vs. a standing tap
  targetCaseId?: Id;  // the open file a buy-off is aimed at
  /**
   * Something went sideways mid-job and the player was asked about it. Set when the
   * complication is queued, so resolution knows not to raise a second one, and carries the
   * answer back into the roll. See `sim/complications.ts`.
   */
  complication?: { kind: ComplicationKind; answered?: ConfrontApproach | 'absent'; won?: boolean };
  insideId?: Id;   // the contact used for an inside job
  planDays: number;
  daysLeft: number;
  status: OpStatus;
  createdDay: number;
  launched?: boolean;
  result?: OpResult;
}

export interface OpResult {
  success: boolean;
  cash: number;
  loot: Partial<Stash>;
  heat: number;
  text: string;
}

// ---------- factions ----------
export type Temperament = 'aggressive' | 'greedy' | 'diplomatic' | 'paranoid';
export type Stance = 'alliance' | 'peace' | 'tension' | 'beef' | 'war';

export interface Faction {
  id: FactionId;
  name: string;
  short: string;
  color: string;
  temperament: Temperament;
  homeDistrictId: Id;
  bossId: Id;
  lieutenantIds: Id[];
  soldiers: number;
  cash: number;
  standing: Record<FactionId, number>;  // -100..100 toward each other faction and 'player'
  stance: Record<FactionId, Stance>;
  truceUntil: Record<FactionId, number>; // day
  tributeFrom: Record<FactionId, number>; // $/day owed to this faction
  alive: boolean;
  grudges: string[];
  brokenTruces: number;   // by the player; each one lowers the best standing you can ever reach with them
  crisis?: SuccessionCrisis; // the boss is gone and two lieutenants want the chair
  owed?: number;          // favours the current boss owes the player (backing them in a crisis); spent at sit-downs
}

export interface SuccessionCrisis { since: number; resolvesDay: number; candidateIds: Id[]; backing?: Id; backedWith: number }

// ---------- the law: an entity, deliberately not a faction ----------
/**
 * A precinct or a city hall, anchored to one block. It has no soldiers, no cash, no tribute and
 * no standing toward anybody — none of which a Faction can do without — so it is its own type.
 * You cannot sit down with it, ally with it or declare war on it: it decides how hard to look at
 * you, on its own ladder, from how much trouble you are making. See `content/authority.ts`.
 */
export type { AuthorityKind, AuthorityPosture };
export type { SupplyRule };
export type { IntelKind };

export interface Authority {
  id: Id;
  kind: AuthorityKind;
  name: string;
  blockId: Id;              // where it sits; its monitoring radiates from here
  attention: number;        // 0..100 toward the player, chasing pressure with a lag
  posture: AuthorityPosture;
  postureSince: number;     // day the current rung started, for the log and the UI
  officialIds: Id[];        // the captain / councillor / judge who answer to this building
}

// ---------- street crews: small independent gangs holding one block ----------
export interface StreetCrew {
  id: Id;
  name: string;
  blockId: Id;
  bossId: Id;
  soldierIds: Id[];
  strength: number;      // 1..10; grows if ignored
  mood: number;          // -100..100 toward the player
  tribute?: FactionId;   // who they pay (the player, or a faction that absorbed them)
  since: number;
}

// ---------- cold cases: the police remember the big ones ----------
export interface CaseFile {
  id: Id;
  day: number;
  kind: 'hit' | 'heist' | 'arson' | 'frame';
  title: string;
  evidence: number;        // 0..100; charges at 100
  status: 'open' | 'cold' | 'charged';
  witnessId?: Id;          // somebody who saw something and has not been persuaded otherwise
  suspectIds: Id[];        // crew who were on it; one of them may take the fall
  refs: { blockId?: Id; businessId?: Id; npcId?: Id; opId?: Id };
  closedDay?: number;
}

// ---------- the Commission ----------
export type ProposalKind = 'peace' | 'tax' | 'sanction' | 'carve' | 'seat';
export interface Proposal { kind: ProposalKind; targetId?: Id; districtId?: Id; amount?: number; text: string }
export interface Commission {
  formedDay: number;
  memberIds: FactionId[];  // factions with a chair; 'player' once seated
  seat: boolean;           // the player has a chair
  nextMeeting: number;     // day
  rulings: { day: number; text: string; passed: boolean }[];
  pending?: Proposal;      // on the table until the meeting event is resolved
}

// ---------- player ----------
export type StartTraitId = 'connected' | 'earner' | 'local' | 'feared';

export interface Player {
  name: string;
  background: 'muscle' | 'brains' | 'charm' | 'wheels' | 'tech' | 'custom';
  startTrait?: StartTraitId;  // custom characters pick one edge to start with
  skills: Skills;
  cash: number;
  dirty: number;
  heat: number;       // 0..100
  respect: number;    // 0..100
  fear: number;       // 0..100
  ap: number;
  apMax: number;
  legwork: number;      // hops left today; spent by walking, never by actions
  legworkMax: number;   // from wheels, refilled at End Day
  currentBlockId: Id;   // where you are standing; face-to-face actions need you here
  stash: Stash;       // product carried / at the front
  /**
   * Kit: ids from `content/items.ts`, duplicates allowed. `items` is everything owned,
   * `equipped` what is on you now (EQUIP_MAX). Optional so a save made before kit existed
   * still loads; every read goes through `sim/items.ts`, which defaults them.
   */
  items?: Id[];
  equipped?: Id[];
  cards?: Card[];        // stolen cards waiting to be run or dumped
  secrets?: Secret[];    // what listening turned up; leverage, or a thing to sell
  cyberHeat?: number;    // the share of your heat that came off the wire, and the only part scrubbing can touch
  quality?: Partial<Record<ProductKind, number>>; // running average quality of the carried stash
  recipes?: string[]; // RECIPES ids unlocked (stolen formulas, specialists)
  crewIds: Id[];
  safehouseIds: Id[];
  businessIds: Id[];
  racketIds: Id[];
  opIds: Id[];
  lawyer: boolean;
  jailedDays: number;
  busts: number;
  launderedToday: number;
  crewEver: number;   // people who have ever joined your crew, for op requirements
  homeBlockId: Id;
}

// ---------- the wire ----------
export type CardTier = 'classic' | 'gold' | 'black';
/**
 * A stolen card. Abstract on purpose: a tier, what it is good for, and how long before it
 * stops working. No number, no issuer, nothing that resembles one.
 */
export interface Card {
  id: Id;
  tier: CardTier;
  limit: number;       // what is left on it
  freshness: number;   // 0..100, falls daily; dead at 0
  flagged?: boolean;   // somebody is already watching this one
  takenDay: number;
  fromNpcId?: Id;      // whose pocket it came out of
}

/** Something you learned by listening. Usable as leverage, or sellable to somebody who wants it. */
export interface Secret {
  id: Id;
  npcId: Id;
  kind: 'agenda' | 'connection';
  text: string;
  day: number;
  soldTo?: FactionId;
}

// ---------- confrontations: somebody came for you, and you are standing there ----------
export type ConfrontKind = 'racket' | 'business' | 'crew' | 'op';
export type { ComplicationKind };
/** How you meet it. Each maps onto an op approach, so carried kit reads the same way it does on a job. */
export type ConfrontApproach = 'fight' | 'flee' | 'backup';

export interface Confrontation {
  id: Id;
  day: number;
  factionId: FactionId;
  kind: ConfrontKind;
  war: boolean;
  text: string;              // what is happening as you arrive
  racketId?: Id;
  businessId?: Id;
  npcId?: Id;                // the crew member they came for
  blockId?: Id;
  opId?: Id;                 // kind 'op': the job this went wrong in the middle of
  complication?: ComplicationKind;
}

// ---------- events ----------
export interface EventOption {
  id: string;
  label: string;
  detail?: string;
  costAp?: number;
  costCash?: number;
}

export interface GameEvent {
  id: Id;
  day: number;
  kind: string;
  title: string;
  text: string;
  options: EventOption[];
  refs: { npcId?: Id; businessId?: Id; blockId?: Id; factionId?: FactionId; racketId?: Id; opId?: Id };
  resolved?: string; // option id chosen
}

export interface LogEntry {
  day: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn' | 'money';
  refs?: GameEvent['refs'];
}

// ---------- root ----------
export interface World {
  version: number;
  seed: number;
  rng: number;               // current PRNG state
  day: number;
  origin: LatLng;
  placeName: string;
  mapSource: 'osm' | 'hex';
  hexSizeM: number;
  chunks: Record<string, ChunkState>;
  districts: Record<Id, District>;
  blocks: Record<Id, Block>;
  businesses: Record<Id, Business>;
  npcs: Record<Id, Npc>;
  rackets: Record<Id, Racket>;
  safehouses: Record<Id, Safehouse>;
  productions: Record<Id, Production>;
  ops: Record<Id, Op>;
  crews: Record<Id, StreetCrew>;
  factions: Record<FactionId, Faction>;
  player: Player;
  authorities?: Record<Id, Authority>;  // precincts and city hall; optional so older saves still load
  cases?: CaseFile[];      // open police investigations into things you did
  commission?: Commission; // the bosses' table, once the city is big enough to need one
  market?: { shortage: Partial<Record<ProductionKind, number>>; saturation: Partial<Record<ProductKind, number>> }; // 'until day' markers
  pendingEvents: GameEvent[]; // must be resolved before End Day
  confrontations?: Confrontation[]; // somebody is on your doorstep right now; answered, or it lands anyway at End Day
  log: LogEntry[];
  cheated?: true;          // the testing tools were used on this save
  gameOver?: { reason: string; text: string };
  victory?: boolean;
  nextId: number;
}
