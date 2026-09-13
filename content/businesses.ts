import type { NameGroup } from '@content/names';
import type { BusinessType, DistrictKind, RacketKind } from '@sim/types';

export interface BusinessDef {
  label: string;
  icon: string;
  income: [number, number];   // base clean $/day range
  valueMult: number;          // value = income * valueMult
  patrons: [number, number];
  rackets: RacketKind[];
  heistTarget?: boolean;
  safehouse?: boolean;
  nerve: number;              // owner nerve bias
}

export const BUSINESS_DEFS: Record<BusinessType, BusinessDef> = {
  bar:           { label: 'Bar',            icon: '🍺', income: [120, 260], valueMult: 40, patrons: [3, 5], rackets: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking'], nerve: 45 },
  diner:         { label: 'Diner',          icon: '🍳', income: [90, 180],  valueMult: 35, patrons: [2, 4], rackets: ['protection', 'numbers', 'laundering'], nerve: 35 },
  restaurant:    { label: 'Restaurant',     icon: '🍝', income: [180, 380], valueMult: 45, patrons: [2, 4], rackets: ['protection', 'numbers', 'laundering', 'gambling_den'], nerve: 50 },
  laundromat:    { label: 'Laundromat',     icon: '🧺', income: [60, 120],  valueMult: 40, patrons: [1, 2], rackets: ['protection', 'laundering'], nerve: 30 },
  pawn:          { label: 'Pawn Shop',      icon: '💍', income: [100, 220], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'fencing', 'loansharking'], nerve: 55 },
  garage:        { label: 'Auto Garage',    icon: '🔧', income: [110, 240], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'chop_shop', 'smuggling'], nerve: 50 },
  nightclub:     { label: 'Nightclub',      icon: '🪩', income: [300, 700], valueMult: 50, patrons: [4, 6], rackets: ['protection', 'gambling_den', 'dealing', 'laundering', 'bookmaking'], nerve: 60 },
  corner_store:  { label: 'Corner Store',   icon: '🏪', income: [70, 150],  valueMult: 30, patrons: [2, 4], rackets: ['protection', 'numbers', 'dealing'], nerve: 30 },
  barbershop:    { label: 'Barbershop',     icon: '💈', income: [60, 130],  valueMult: 30, patrons: [3, 5], rackets: ['protection', 'numbers', 'bookmaking'], nerve: 40 },
  gym:           { label: 'Boxing Gym',     icon: '🥊', income: [70, 140],  valueMult: 35, patrons: [3, 5], rackets: ['protection', 'bookmaking', 'loansharking'], nerve: 65 },
  cab_company:   { label: 'Cab Company',    icon: '🚕', income: [150, 300], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'smuggling', 'dealing'], nerve: 45 },
  construction:  { label: 'Construction Co.', icon: '🏗️', income: [250, 600], valueMult: 45, patrons: [1, 2], rackets: ['protection', 'no_show_jobs', 'laundering'], nerve: 55 },
  warehouse:     { label: 'Warehouse',      icon: '📦', income: [80, 200],  valueMult: 45, patrons: [0, 1], rackets: ['protection', 'smuggling', 'fencing'], heistTarget: true, safehouse: true, nerve: 40 },
  motel:         { label: 'Motel',          icon: '🛏️', income: [90, 200],  valueMult: 45, patrons: [1, 3], rackets: ['protection', 'dealing', 'laundering'], safehouse: true, nerve: 35 },
  bank:          { label: 'Bank',           icon: '🏦', income: [0, 0],     valueMult: 0,  patrons: [0, 1], rackets: [], heistTarget: true, nerve: 90 },
  jeweller:      { label: 'Jeweller',       icon: '💎', income: [200, 400], valueMult: 60, patrons: [0, 2], rackets: ['protection', 'fencing'], heistTarget: true, nerve: 60 },
  armored_depot: { label: 'Armored Car Depot', icon: '🚚', income: [0, 0],  valueMult: 0,  patrons: [0, 0], rackets: [], heistTarget: true, nerve: 95 },
  // A back room behind a legitimate front: where kit is bought and sold (content/items.ts).
  // Rare, quiet districts, and the owner is nobody's idea of a soft touch.
  black_market:  { label: 'Back-Room Market', icon: '🧰', income: [120, 300], valueMult: 40, patrons: [1, 2], rackets: ['protection', 'fencing', 'smuggling'], nerve: 65 },
};

export interface DistrictDef {
  kind: DistrictKind;
  names: string[];
  wealth: [number, number];
  police: [number, number];
  population: [number, number];
  mix: Partial<Record<BusinessType, number>>; // weights
  perBlock: [number, number];
  /**
   * Which naming pools are common here, as weights. COSMETIC ONLY: this decides what
   * the people on these streets are called and nothing else. Nothing in `sim/` may read
   * it when working out skills, traits, nerve or trust.
   */
  nameGroups: Partial<Record<NameGroup, number>>;
  /**
   * How networked the people who live here are, 0..1. Not derived from `nameGroups` and
   * nothing to do with who lives here: it is social density, the odds that two residents
   * are family or old friends, and how far across the district those ties reach.
   */
  closeness: [number, number];
}

export const DISTRICT_DEFS: DistrictDef[] = [
  { kind: 'docks', names: ['The Docks', 'Harbourside', 'Pier District', 'The Wharf'], wealth: [20, 45], police: [15, 35], population: [30, 60],
    mix: { warehouse: 5, bar: 3, garage: 2, cab_company: 1, diner: 2, motel: 1, pawn: 1, black_market: 1 }, perBlock: [2, 4],
    nameGroups: { irish: 4, slavic: 3, east_asian: 2, black_american: 2, anglo: 2, middle_eastern: 1 }, closeness: [0.45, 0.65] },
  { kind: 'downtown', names: ['Downtown', 'Financial District', 'City Centre', 'The Core'], wealth: [65, 95], police: [55, 80], population: [60, 100],
    mix: { bank: 2, restaurant: 4, nightclub: 2, jeweller: 2, construction: 1, bar: 2, armored_depot: 1, cab_company: 1 , black_market: 1}, perBlock: [3, 5],
    nameGroups: { anglo: 5, italian: 2, irish: 2, east_asian: 2, slavic: 1, latino: 1, black_american: 1, middle_eastern: 1 }, closeness: [0.05, 0.2] },
  { kind: 'old_quarter', names: ['Old Quarter', 'Little Italy', 'Old Town', 'The Village'], wealth: [40, 65], police: [30, 50], population: [50, 80],
    mix: { restaurant: 4, barbershop: 3, diner: 2, bar: 3, corner_store: 2, pawn: 1, laundromat: 2 , black_market: 1}, perBlock: [3, 5],
    nameGroups: { italian: 6, irish: 3, middle_eastern: 2, slavic: 1, anglo: 1 }, closeness: [0.65, 0.9] },
  { kind: 'industrial', names: ['Ironworks', 'The Yards', 'Millside', 'Foundry Row'], wealth: [25, 45], police: [10, 30], population: [20, 40],
    mix: { warehouse: 5, garage: 4, construction: 3, diner: 1, bar: 1, cab_company: 1, black_market: 1 }, perBlock: [1, 3],
    nameGroups: { slavic: 4, latino: 3, black_american: 2, anglo: 2, irish: 2 }, closeness: [0.4, 0.6] },
  { kind: 'heights', names: ['The Heights', 'Hillcrest', 'Northside', 'Belle Park'], wealth: [70, 100], police: [50, 75], population: [40, 60],
    mix: { restaurant: 3, jeweller: 2, gym: 1, bank: 1, laundromat: 1, corner_store: 1, nightclub: 1 , black_market: 1}, perBlock: [1, 3],
    nameGroups: { anglo: 5, italian: 2, east_asian: 2, irish: 1, middle_eastern: 1 }, closeness: [0.08, 0.25] },
  { kind: 'market', names: ['Market Square', 'The Bazaar', 'Merchant Row', 'Fishmarket'], wealth: [35, 60], police: [30, 50], population: [60, 100],
    mix: { corner_store: 5, pawn: 3, diner: 2, laundromat: 2, barbershop: 2, cab_company: 1, gym: 1, black_market: 1 }, perBlock: [3, 5],
    nameGroups: { middle_eastern: 4, east_asian: 4, latino: 3, anglo: 1, italian: 1 }, closeness: [0.5, 0.72] },
  { kind: 'strip', names: ['The Strip', 'Neon Row', 'Club District', 'Lowlight'], wealth: [45, 70], police: [35, 60], population: [50, 90],
    mix: { nightclub: 5, bar: 4, motel: 2, restaurant: 1, cab_company: 1, pawn: 1 , black_market: 1}, perBlock: [3, 5],
    nameGroups: { anglo: 2, italian: 2, latino: 2, black_american: 2, east_asian: 2, slavic: 2, irish: 2, middle_eastern: 2 }, closeness: [0.2, 0.4] },
  { kind: 'projects', names: ['The Projects', 'Southside', 'The Blocks', 'Lowtown'], wealth: [10, 30], police: [20, 45], population: [70, 100],
    mix: { corner_store: 5, barbershop: 3, gym: 2, laundromat: 2, bar: 2, motel: 1, garage: 1, black_market: 1 }, perBlock: [2, 4],
    nameGroups: { black_american: 5, latino: 4, east_asian: 1, irish: 1, anglo: 1 }, closeness: [0.7, 0.95] },
];
