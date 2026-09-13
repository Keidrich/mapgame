/**
 * RACKETS — simulation state contract.
 * Pure data. No classes, no functions, JSON-serialisable, so the whole game can
 * be saved as one object and replayed deterministically from a seed.
 */

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
}

export interface BlockMemory { day: number; kind: string; text: string }

// ---------- businesses ----------
export type BusinessType =
  | 'bar' | 'diner' | 'restaurant' | 'laundromat' | 'pawn' | 'garage'
  | 'nightclub' | 'corner_store' | 'barbershop' | 'gym' | 'cab_company'
  | 'construction' | 'warehouse' | 'motel' | 'bank' | 'jeweller' | 'armored_depot';

export interface Protection {
  factionId: FactionId;
  rate: number; // 0..1 share of income taken
  since: number; // day
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
  flags: string[];      // free-form markers ('torched', 'raided', ...)
}

// ---------- people ----------
export type Role =
  | 'owner' | 'patron' | 'crew' | 'boss' | 'lieutenant' | 'soldier'
  | 'cop' | 'official' | 'fixer';

export type Trait =
  | 'greedy' | 'loyal' | 'coward' | 'hothead' | 'connected'
  | 'honest' | 'ambitious' | 'junkie' | 'gambler' | 'quiet';

export interface Skills { muscle: number; brains: number; charm: number; wheels: number; tech: number }

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
}

export type Assignment =
  | { kind: 'racket'; racketId: Id }
  | { kind: 'production'; productionId: Id }
  | { kind: 'op'; opId: Id }
  | { kind: 'guard'; blockId: Id }
  | { kind: 'collect' };

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
  official?: { kind: OfficialKind; corruption: number; retainerDay?: number; boughtBy?: FactionId };
  agenda?: Agenda;            // a want that advances daily whether or not you show up
  grudge?: { since: number; reason: string; spread: number }; // holds it against you and tells people
  known: boolean;             // traits and nerve revealed (Read action, a scene, or enough trust)
  notes: string[];
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
  | 'fencing' | 'chop_shop' | 'dealing' | 'laundering' | 'smuggling' | 'no_show_jobs';

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
}

// ---------- safehouses & production ----------
export type ProductionKind = 'still' | 'grow_op' | 'lab' | 'print_shop';

export interface Production {
  id: Id;
  kind: ProductionKind;
  safehouseId: Id;
  level: number;
  workerId?: Id;
  stock: number;         // ingredients on hand (days)
  lastOutput: number;
  disrupted: number;
}

export interface Safehouse {
  id: Id;
  blockId: Id;
  name: string;
  tier: number;          // 1..3
  owner: FactionId;
  stash: Stash;
  cash: number;          // hidden dirty cash
  productionIds: Id[];
  capacity: number;      // product units
}

// ---------- ops (one-off) ----------
export type OpKind =
  | 'heist_bank' | 'heist_jeweller' | 'heist_armored' | 'heist_warehouse'
  | 'robbery' | 'insurance_fraud' | 'check_kiting' | 'smuggle_run'
  | 'hit' | 'intimidate' | 'raid_rival';

export type OpStatus = 'planning' | 'ready' | 'done' | 'failed' | 'aborted';

export interface Op {
  id: Id;
  kind: OpKind;
  targetBusinessId?: Id;
  targetNpcId?: Id;
  targetFactionId?: FactionId;
  targetBlockId?: Id;
  crewIds: Id[];
  approach?: 'loud' | 'quiet' | 'inside';
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
}

// ---------- player ----------
export interface Player {
  name: string;
  background: 'muscle' | 'brains' | 'charm';
  skills: Skills;
  cash: number;
  dirty: number;
  heat: number;       // 0..100
  respect: number;    // 0..100
  fear: number;       // 0..100
  ap: number;
  apMax: number;
  stash: Stash;       // product carried / at the front
  crewIds: Id[];
  safehouseIds: Id[];
  businessIds: Id[];
  racketIds: Id[];
  opIds: Id[];
  lawyer: boolean;
  jailedDays: number;
  busts: number;
  launderedToday: number;
  homeBlockId: Id;
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
  factions: Record<FactionId, Faction>;
  player: Player;
  pendingEvents: GameEvent[]; // must be resolved before End Day
  log: LogEntry[];
  gameOver?: { reason: string; text: string };
  victory?: boolean;
  nextId: number;
}
