/**
 * Every way the player can change the world. The UI only ever dispatches these.
 * `sim/reducer.ts` validates and applies them; `sim/affordances.ts` tells the UI
 * which are currently possible and why not.
 */
import type { Id, FactionId, RacketKind, ProductionKind, OpKind, ProductKind, Assignment } from './types';
import type { GeoChunk } from '@geo/chunks';

export type Action =
  // --- people ---
  | { type: 'visit'; npcId: Id; approach?: string }       // 1 AP: a scene; approaches in content/lines.ts
  | { type: 'gift'; npcId: Id; amount: number }           // cash: +trust
  | { type: 'read'; npcId: Id }                           // 1 AP: size someone up (reveals traits, nerve, agenda)
  | { type: 'threaten'; npcId: Id; approach?: string }    // 1 AP: +fear, -trust, +heat
  | { type: 'recruit'; npcId: Id; approach?: string }     // 1 AP: patron -> crew
  | { type: 'parley'; npcId: Id; approach?: string }      // 1 AP: deal with a street crew's boss
  | { type: 'broker'; npcId: Id; otherFactionId: FactionId; approach?: string } // 2 AP: mediate between this NPC's faction and another at beef/war
  | { type: 'back_candidate'; factionId: FactionId; npcId: Id; amount: number } // cash: back a lieutenant in a succession crisis
  | { type: 'petition_seat' }                             // 2 AP: ask the Commission for a chair
  // --- hostages ---
  | { type: 'resolve_hostage'; npcId: Id; mode: 'ransom' | 'leverage' | 'release' }
  | { type: 'fire'; npcId: Id }
  | { type: 'assign'; npcId: Id; assignment?: Assignment }   // a 'lieutenant' assignment promotes them to run a district (1 AP)
  | { type: 'audit'; npcId: Id }                          // 1 AP: go over a lieutenant's books
  | { type: 'bribe_official'; npcId: Id; amount: number } // cash
  // --- businesses ---
  | { type: 'shakedown'; businessId: Id; approach?: string } // 1 AP: demand protection money now
  | { type: 'protect'; businessId: Id; rate: number }     // 1 AP: install a protection racket
  | { type: 'buy_business'; businessId: Id; offer: number }
  | { type: 'sell_business'; businessId: Id }
  | { type: 'insure'; businessId: Id }
  | { type: 'repair'; businessId: Id }
  // --- kit (content/items.ts) ---
  | { type: 'buy_item'; businessId: Id; itemId: string }    // clean cash, at a market, face to face
  | { type: 'sell_item'; businessId: Id; itemId: string }   // dirty cash back, like anything else sold out of a back room
  | { type: 'equip'; itemId: string; on: boolean }          // carry it or leave it at home; free
  // --- rackets ---
  | { type: 'start_racket'; businessId: Id; kind: RacketKind; product?: ProductKind }
  | { type: 'upgrade_racket'; racketId: Id }
  | { type: 'close_racket'; racketId: Id }
  | { type: 'fund_racket'; racketId: Id; amount: number } // loansharking float
  // --- safehouses & production ---
  | { type: 'rent_safehouse'; blockId: Id }
  | { type: 'upgrade_safehouse'; safehouseId: Id }
  | { type: 'start_production'; safehouseId: Id; kind: ProductionKind }
  | { type: 'restock_production'; productionId: Id; days: number }
  | { type: 'close_production'; productionId: Id }
  | { type: 'upgrade_production'; productionId: Id }              // cash: level 1→3, more output and quality, more heat
  | { type: 'set_recipe'; productionId: Id; recipe?: string }     // switch a production to a recipe you know
  | { type: 'move_stash'; from: 'player' | Id; to: 'player' | Id; product: ProductKind; amount: number }
  | { type: 'sell_product'; product: ProductKind; amount: number; blockId: Id } // 1 AP street sale
  | { type: 'launder'; amount: number } // via laundering rackets capacity (auto at tick too)
  | { type: 'launder_with_fixer'; npcId: Id; amount: number } // 1 AP: a fixer washes it at their own worse rate, up to their daily cap
  // --- ops ---
  | { type: 'plan_op'; kind: OpKind; crewIds: Id[]; approach?: 'loud' | 'quiet' | 'inside'; targetBusinessId?: Id; targetNpcId?: Id; targetFactionId?: FactionId; targetBlockId?: Id; targetDistrictId?: Id; safehouseId?: Id }
  | { type: 'launch_op'; opId: Id }
  | { type: 'abort_op'; opId: Id }
  // --- factions / politics ---
  | { type: 'sit_down'; factionId: FactionId; offer: SitDownOffer }
  | { type: 'pay_tribute'; factionId: FactionId; amount: number }
  | { type: 'declare'; factionId: FactionId; stance: 'beef' | 'war' | 'peace' }
  | { type: 'hire_lawyer' }
  // --- movement ---
  | { type: 'move'; toBlockId: Id }                        // legwork: walk the block graph to another block
  // --- turn ---
  | { type: 'resolve_event'; eventId: Id; optionId: string }
  | { type: 'end_day' }
  // --- world streaming ---
  | { type: 'populate_chunk'; chunk: GeoChunk }   // the UI fetched geometry for a new area; the sim fills it with people
  // --- meta ---
  | { type: 'rename'; name: string }
  | { type: 'set_note'; npcId: Id; text: string }   // the player's own note on somebody; free, no AP, never touches notes[]
  // --- testing ---
  | { type: 'cheat'; what: CheatKind };          // debug only; stamps the save as cheated so nothing is mistaken for real play

/** The testing tools in the help sheet. Every one of them is an ordinary reducer case, so a cheated world
 *  is still a world the rest of the sim understands. */
export type CheatKind = 'cash' | 'dirty' | 'ap' | 'legwork' | 'heat' | 'skills' | 'crew' | 'unlock' | 'safehouse' | 'own_block' | 'turf' | 'reveal' | 'stash';

export type SitDownOffer =
  | { kind: 'truce'; days: number }
  | { kind: 'tribute'; amountPerDay: number }
  | { kind: 'cede_block'; blockId: Id }
  | { kind: 'joint_racket'; businessId: Id }
  | { kind: 'alliance' }
  | { kind: 'demand_block'; blockId: Id };

export interface Refusal { ok: false; reason: string }
export interface Allowed { ok: true; cost?: { ap?: number; cash?: number } }
export type Affordance = Allowed | Refusal;
