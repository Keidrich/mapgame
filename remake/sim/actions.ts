/**
 * Every thing the player can do, as data. `can()` says whether and why not; `dispatch()` does it.
 * The UI never changes the world any other way.
 */
import type { SitDownOffer } from './factions';
import type { PLAYER } from './types';
import type { SceneKind } from './scenes';
import type { HostageChoice } from './hostages';
import type { CheatKind } from './cheats';
import type { Approach, Assignment, CityId, Id, ItemId, Slot, JobKind, LabKind, Owner, Product, RacketKind, Skill, SpecialistKind } from './types';

export type Action =
  | { type: 'travel'; blockId: Id }
  | { type: 'travel_city'; cityId: CityId; bring?: Id[] }
  | { type: 'move_crew'; npcId: Id; to: CityId }
  | { type: 'open_route'; from: CityId; to: CityId; product: Product }
  | { type: 'close_route'; id: Id }
  | { type: 'scene'; kind: SceneKind; npcId: Id; businessId?: Id; rate?: number }
  | { type: 'set_rate'; businessId: Id; rate: number }
  | { type: 'drop_protection'; businessId: Id }
  | { type: 'start_racket'; businessId: Id; kind: RacketKind }
  | { type: 'upgrade_racket'; racketId: Id }
  | { type: 'close_racket'; racketId: Id }
  | { type: 'toggle_wash'; racketId: Id }
  | { type: 'assign'; npcId: Id; assignment: Assignment | null }
  | { type: 'fire'; npcId: Id }
  | { type: 'rent_safehouse'; blockId: Id }
  | { type: 'upgrade_safehouse'; safehouseId: Id }
  | { type: 'build_lab'; safehouseId: Id; kind: LabKind }
  | { type: 'upgrade_lab'; safehouseId: Id; labId: Id }
  | { type: 'restock_lab'; safehouseId: Id; labId: Id; days: number }
  | { type: 'sell_street'; product: Product; n: number }
  | { type: 'buy_item'; item: ItemId; at: Id | 'fixer' }
  | { type: 'equip'; item: ItemId; to: typeof PLAYER | Id }
  | { type: 'unequip'; from: typeof PLAYER | Id; slot: Slot }
  | { type: 'hostage'; id: Id; choice: HostageChoice }
  | { type: 'lobby'; factionId: Owner; side: 'yes' | 'no' }
  | { type: 'commission_vote'; vote: 'yes' | 'no'; cityId?: CityId }
  | { type: 'fixer_wash'; amount: number }
  | { type: 'take_job'; jobId: Id; crewIds: Id[] }
  | { type: 'launch_job'; jobId: Id; approach: Approach }
  | { type: 'join_job'; jobId: Id; npcId: Id }
  | { type: 'answer'; jobId: Id; optionId: string }
  | { type: 'drop_job'; jobId: Id }
  | { type: 'hire_specialist'; jobId: Id; kind: SpecialistKind }
  | { type: 'audit'; npcId: Id }
  | { type: 'case'; kind: JobKind; businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }
  | { type: 'tribute'; factionId: Owner; amount: number }
  | { type: 'sit_down'; factionId: Owner; offer: SitDownOffer }
  | { type: 'declare_war'; factionId: Owner }
  | { type: 'drop_payroll'; npcId: Id }
  | { type: 'lawyer'; on: boolean }
  | { type: 'lay_low'; days: number }
  | { type: 'resolve_event'; eventId: Id; optionId: string }
  | { type: 'retire' }
  | { type: 'set_outlet'; businessId: Id; products: Product[] }
  | { type: 'run_delivery' }
  | { type: 'train'; skill: Skill; at: Id | 'books' }
  | { type: 'take_boost'; kind: 'pep' | 'nerve'; at: Id | 'fixer' }
  | { type: 'dry_out' }
  | { type: 'table_sit'; businessId: Id; stake: number }
  | { type: 'poker_draw'; hold: number[]; cheat?: boolean }
  | { type: 'poker_bet'; move: 'fold' | 'call' | 'raise' }
  | { type: 'table_next' }
  | { type: 'table_leave' }
  | { type: 'dice'; businessId: Id; stake: number }
  | { type: 'numbers'; pick: number; amount: number }
  | { type: 'steal_car'; blockId: Id }
  | { type: 'story'; arcId: Id; move: import('./stories').Move }
  | { type: 'back_candidate'; side: 'machine' | 'reform' }
  | { type: 'car'; carId: Id; what: 'chop' | 'respray' | 'keep' | 'sell' }
  | { type: 'attack'; factionId: Owner; blockId: Id; crewIds: Id[] }
  | { type: 'buy_bullets'; n: number; at: Id | 'fixer' }
  | { type: 'patch_up' }
  | { type: 'seen_fight' }
  | { type: 'make_member'; npcId: Id }
  | { type: 'appoint'; post: 'consigliere' | 'underboss'; npcId: Id | null }
  | { type: 'nightfall' }
  | { type: 'end_day' }
  | { type: 'seen_win' }
  // --- testing: stamps the save as tested (`cheats.ts`)
  | { type: 'cheat'; what: CheatKind };

export interface Affordance { ok: boolean; why?: string; ap?: number; cash?: number }
export const yes = (x: Omit<Affordance, 'ok'> = {}): Affordance => ({ ok: true, ...x });
export const no = (why: string): Affordance => ({ ok: false, why });
