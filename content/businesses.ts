import type { NameGroup } from '@content/names';
import type { BusinessType, DistrictKind, RacketKind } from '@sim/types';

/**
 * How far up the city a place sits, and the single most important thing about it.
 *
 * Tier is not a label. It decides three things at once:
 *
 *   1. **Which rackets can live there.** `TIER_RACKETS` gates on top of a type's own list — the
 *      two are an intersection, never a replacement, so a bar is still a bar.
 *   2. **What it is worth and how hard its owner is.** Income, value and nerve all scale with it.
 *   3. **Whether fear is a way in at all**, which is the real mechanism, and it plugs straight
 *      into the standing system rather than inventing anything:
 *      - **1, street.** `protectReason` as it has always worked. A raised voice can be enough.
 *      - **2, established.** `protectReason` still applies, but `nerveFloor` sits above what
 *        `STAKES.words` and `STAKES.backed` can reach on their own, so talk essentially never
 *        clears it. A demonstrated act, or a real relationship, is the practical route. That is
 *        a consequence of the numbers rather than a rule, which is the point: the player can
 *        still get there with a wrecked window, and nothing refuses them by name.
 *      - **3, institutional.** No shakedown and no protection, ever, at any amount of fear.
 *        The only way in is the one banks and armoured depots already had: real leverage or a
 *        settled favour, through ratting, a tap, or an inside job. Never a threat.
 */
export type BusinessTier = 1 | 2 | 3 | 4;

export interface BusinessDef {
  label: string;
  icon: string;
  tier: BusinessTier;
  income: [number, number];   // base clean $/day range
  valueMult: number;          // value = income * valueMult
  patrons: [number, number];
  rackets: RacketKind[];
  heistTarget?: boolean;
  safehouse?: boolean;
  nerve: number;              // owner nerve bias
}

/**
 * What each tier multiplies, and the nerve its owners will not go below.
 *
 * `nerveFloor` at tier 2 is the load-bearing number. `PROTECT_NERVE` is 0.6, so a floor of 72
 * needs fear + respect of 43 to force a shakedown — above `STAKES.backed.ceiling` (50) only when
 * respect is low, and comfortably above `STAKES.words.ceiling` (35) always. Talk alone will not
 * do it; a broken window (`property`, ceiling 80) will.
 */
export const TIERS: Record<BusinessTier, { label: string; blurb: string; income: number; value: number; nerveFloor: number; extort: boolean; standingFloor: number }> = {
  1: { label: 'Street', blurb: 'A counter, a till, and somebody who has to open tomorrow.', income: 1, value: 1, nerveFloor: 0, extort: true, standingFloor: 0 },
  2: { label: 'Established', blurb: 'Books, a lawyer on call, and an owner who has been leaned on before.', income: 1.6, value: 1.25, nerveFloor: 72, extort: true, standingFloor: 0 },
  3: { label: 'Institutional', blurb: 'Nobody here is frightened of you. There is a way in, and it is not a threat.', income: 2.4, value: 1.5, nerveFloor: 90, extort: false, standingFloor: 0 },
  /**
   * Tier 4: the room money alone does not get you into.
   *
   * `standingFloor` is the tier-4 gate and it is deliberately the same *shape* as `nerveFloor`,
   * which is what tiers 2 and 3 are gated with — a number the situation must clear, compared
   * arithmetically, rather than a branch naming a business type. `nerveFloor` asks whether fear
   * can reach the owner; `standingFloor` asks whether the player is somebody the room will deal
   * with at all. Both are read by one comparison and neither knows what it is looking at.
   *
   * 55 against `respect + fear / 2`: a player with nothing but money cannot reach it, a feared
   * player gets halfway there on fear alone, and a respected one walks in. Paired with a `value`
   * of 3.2 it is the game's largest cash sink by a wide margin — which is the point, because by
   * the time a player can clear the standing floor money has stopped being the constraint.
   */
  4: { label: 'Chartered', blurb: 'A boardroom, a charter and a century of paperwork. Money is the cheap part of getting in here.', income: 3.4, value: 3.2, nerveFloor: 100, extort: false, standingFloor: 55 },
};

/** What `standingFloor` is measured against: what the city thinks of you, however you got it. */
export const standingOf = (respect: number, fear: number) => respect + fear / 2;

/**
 * Which rackets a tier will carry at all, intersected with the type's own list.
 *
 * Tier 3 is the point of this table: nothing runs out of a bank's lobby, and that was previously
 * two hand-written `rackets: []` entries. Generalising it means the six institutions added since
 * are covered without a third name in the check.
 *
 * Tier 2's list is a deliberate near-no-op today. An established place will not run a street
 * numbers game out of the front of house — but no tier-2 type asks to, so the gate binds on
 * nothing yet. It is here because the alternative was inventing restrictions the content had not
 * asked for: an early draft excluded `dealing` at tier 2 and quietly gutted the nightclub, the
 * cab company and the pharmacy, all three of which deal on purpose. The per-type list is the
 * authority on what a *kind of place* does; the tier is the authority on what a *level of place*
 * would never touch, and at tier 2 that is a short list.
 */
export const TIER_EXCLUDES: Record<BusinessTier, RacketKind[] | 'none' | 'all'> = {
  1: 'none',
  2: ['numbers', 'policy_bank'],
  3: 'all',
  // Tier 4 carries the one thing a chartered institution is actually *for*, from the player's
  // side: moving money. Not a street racket among several — the single racket whose whole
  // nature is paperwork, run at a scale nothing below this tier can reach.
  4: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'fencing', 'chop_shop', 'dealing', 'smuggling', 'carding', 'union_dues', 'counterfeiting', 'after_hours', 'policy_bank', 'parts_stripping', 'relay_export', 'card_supply', 'knockoffs', 'script_diversion'],
};

export const BUSINESS_DEFS: Record<BusinessType, BusinessDef> = {
  bar:           { label: 'Bar',            icon: '🍺', tier: 1, income: [120, 260], valueMult: 40, patrons: [3, 5], rackets: ['protection', 'numbers', 'bookmaking', 'gambling_den', 'loansharking', 'after_hours'], nerve: 45 },
  diner:         { label: 'Diner',          icon: '🍳', tier: 1, income: [90, 180],  valueMult: 35, patrons: [2, 4], rackets: ['protection', 'numbers', 'laundering'], nerve: 35 },
  restaurant:    { label: 'Restaurant',     icon: '🍝', tier: 1, income: [180, 380], valueMult: 45, patrons: [2, 4], rackets: ['protection', 'numbers', 'laundering', 'gambling_den', 'after_hours'], nerve: 50 },
  laundromat:    { label: 'Laundromat',     icon: '👕', tier: 1, income: [60, 120],  valueMult: 40, patrons: [1, 2], rackets: ['protection', 'laundering', 'counterfeiting'], nerve: 30 },
  pawn:          { label: 'Pawn Shop',      icon: '💍', tier: 1, income: [100, 220], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'fencing', 'loansharking', 'counterfeiting'], nerve: 55 },
  garage:        { label: 'Auto Garage',    icon: '🔧', tier: 1, income: [110, 240], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'chop_shop', 'smuggling', 'union_dues'], nerve: 50 },
  nightclub:     { label: 'Nightclub',      icon: '🎶', tier: 2, income: [300, 700], valueMult: 50, patrons: [4, 6], rackets: ['protection', 'gambling_den', 'dealing', 'laundering', 'bookmaking', 'after_hours'], nerve: 60 },
  corner_store:  { label: 'Corner Store',   icon: '🏪', tier: 1, income: [70, 150],  valueMult: 30, patrons: [2, 4], rackets: ['protection', 'numbers', 'dealing', 'policy_bank'], nerve: 30 },
  barbershop:    { label: 'Barbershop',     icon: '💈', tier: 1, income: [60, 130],  valueMult: 30, patrons: [3, 5], rackets: ['protection', 'numbers', 'bookmaking', 'policy_bank'], nerve: 40 },
  gym:           { label: 'Boxing Gym',     icon: '👊', tier: 1, income: [70, 140],  valueMult: 35, patrons: [3, 5], rackets: ['protection', 'bookmaking', 'loansharking', 'policy_bank'], nerve: 65 },
  cab_company:   { label: 'Cab Company',    icon: '🚕', tier: 2, income: [150, 300], valueMult: 40, patrons: [1, 3], rackets: ['protection', 'smuggling', 'dealing', 'union_dues'], nerve: 45 },
  construction:  { label: 'Construction Co.', icon: '🏗️', tier: 2, income: [250, 600], valueMult: 45, patrons: [1, 2], rackets: ['protection', 'no_show_jobs', 'laundering', 'union_dues'], nerve: 55 },
  warehouse:     { label: 'Warehouse',      icon: '📦', tier: 2, income: [80, 200],  valueMult: 45, patrons: [0, 1], rackets: ['protection', 'smuggling', 'fencing', 'counterfeiting', 'union_dues'], heistTarget: true, safehouse: true, nerve: 40 },
  motel:         { label: 'Motel',          icon: '🛏️', tier: 1, income: [90, 200],  valueMult: 45, patrons: [1, 3], rackets: ['protection', 'dealing', 'laundering'], safehouse: true, nerve: 35 },
  bank:          { label: 'Bank',           icon: '🏦', tier: 3, income: [0, 0],     valueMult: 0,  patrons: [0, 1], rackets: [], heistTarget: true, nerve: 90 },
  // tier 3, so the list is emptied by `TIER_RACKETS` anyway; kept empty here so the def reads true
  jeweller:      { label: 'Jeweller',       icon: '💎', tier: 3, income: [200, 400], valueMult: 60, patrons: [0, 2], rackets: [], heistTarget: true, nerve: 75 },
  armored_depot: { label: 'Armored Car Depot', icon: '🚚', tier: 3, income: [0, 0],  valueMult: 0,  patrons: [0, 0], rackets: [], heistTarget: true, nerve: 95 },
  // A back room behind a legitimate front: where kit is bought and sold (content/items.ts).
  // Rare, quiet districts, and the owner is nobody's idea of a soft touch.
  black_market:  { label: 'Back-Room Market', icon: '🚪', tier: 2, income: [120, 300], valueMult: 40, patrons: [1, 2], rackets: ['protection', 'fencing', 'smuggling'], nerve: 65 },

  // ---------------------------------------------------------------- tier 1: the street trades
  // Places with a yard or a counter and somebody who has to open tomorrow. Cheap to lean on,
  // cheap to hold, and the ones a player meets first.
  scrapyard:     { label: 'Scrapyard',       icon: '🔩', tier: 1, income: [90, 200],  valueMult: 35, patrons: [1, 2], rackets: ['protection', 'chop_shop', 'fencing', 'smuggling', 'union_dues', 'parts_stripping'], heistTarget: true, nerve: 55 },
  electronics:   { label: 'Phone Shop',      icon: '📱', tier: 1, income: [100, 230], valueMult: 35, patrons: [2, 4], rackets: ['protection', 'fencing', 'counterfeiting', 'numbers', 'card_supply'], nerve: 35 },
  tow_yard:      { label: 'Tow Yard',        icon: '🚛', tier: 1, income: [110, 240], valueMult: 35, patrons: [1, 2], rackets: ['protection', 'chop_shop', 'loansharking', 'union_dues', 'relay_export'], nerve: 60 },

  // ---------------------------------------------------------------- tier 2: the established ones
  // Books, a lawyer on call, and an owner who has been leaned on before and did not fold.
  boutique:      { label: 'Boutique',        icon: '👗', tier: 2, income: [180, 420], valueMult: 50, patrons: [2, 4], rackets: ['protection', 'laundering', 'fencing', 'counterfeiting', 'knockoffs'], nerve: 45 },
  pharmacy:      { label: 'Pharmacy',        icon: '💊', tier: 2, income: [220, 480], valueMult: 50, patrons: [2, 4], rackets: ['protection', 'laundering', 'dealing', 'script_diversion'], heistTarget: true, nerve: 55 },

  // ---------------------------------------------------------------- tier 3: the institutions
  // Nobody here is frightened of you. No racket runs out of these and no threat opens them; the
  // way in is the one the bank and the depot already had — inside their books, or a favour owed.
  gallery:       { label: 'Art Gallery',     icon: '🖼️', tier: 3, income: [300, 700],  valueMult: 65, patrons: [0, 2], rackets: [], heistTarget: true, nerve: 80 },
  accountant:    { label: "Accountant's Office", icon: '📇', tier: 3, income: [280, 620], valueMult: 60, patrons: [0, 1], rackets: [], nerve: 88 },
  importer:      { label: 'Import/Export',   icon: '🚢', tier: 3, income: [420, 900],  valueMult: 65, patrons: [0, 1], rackets: [], heistTarget: true, safehouse: true, nerve: 92 },
  // ---------------------------------------------------------------- tier 4: chartered
  // The top of the ladder, and the largest cash sink in the game. Each one is a real business
  // with real clean income — the point is not the racket you can run inside it (only laundering
  // survives `TIER_EXCLUDES[4]`) but that owning one is what a fortune is *for*.
  casino:         { label: 'Casino',              icon: '🃏', tier: 4, income: [1400, 3000], valueMult: 70, patrons: [3, 6], rackets: ['laundering'], heistTarget: true, nerve: 95 },
  merchant_bank:  { label: 'Merchant Bank',       icon: '🏛️', tier: 4, income: [1200, 2600], valueMult: 80, patrons: [1, 3], rackets: ['laundering'], heistTarget: true, nerve: 100 },
  shipping_line:  { label: 'Shipping Line',       icon: '⚓', tier: 4, income: [900, 2200],  valueMult: 65, patrons: [1, 3], rackets: ['laundering'], nerve: 90 },
  development_co: { label: 'Development Company', icon: '🏗️', tier: 4, income: [1100, 2400], valueMult: 70, patrons: [1, 2], rackets: ['laundering'], nerve: 92 },
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
    mix: { warehouse: 5, bar: 3, garage: 2, cab_company: 1, diner: 2, motel: 1, pawn: 1, black_market: 1, scrapyard: 3, importer: 3, tow_yard: 2 }, perBlock: [2, 4],
    nameGroups: { irish: 4, slavic: 3, east_asian: 2, black_american: 2, anglo: 2, middle_eastern: 1 }, closeness: [0.45, 0.65] },
  { kind: 'downtown', names: ['Downtown', 'Financial District', 'City Centre', 'The Core'], wealth: [65, 95], police: [55, 80], population: [60, 100],
    mix: { bank: 2, restaurant: 4, nightclub: 2, jeweller: 2, construction: 1, bar: 2, armored_depot: 1, cab_company: 1, black_market: 1, accountant: 3, gallery: 2, boutique: 2, importer: 1 }, perBlock: [3, 5],
    nameGroups: { anglo: 5, italian: 2, irish: 2, east_asian: 2, slavic: 1, latino: 1, black_american: 1, middle_eastern: 1 }, closeness: [0.05, 0.2] },
  { kind: 'old_quarter', names: ['Old Quarter', 'Little Italy', 'Old Town', 'The Village'], wealth: [40, 65], police: [30, 50], population: [50, 80],
    mix: { restaurant: 4, barbershop: 3, diner: 2, bar: 3, corner_store: 2, pawn: 1, laundromat: 2, black_market: 1, pharmacy: 2, electronics: 2, boutique: 1 }, perBlock: [3, 5],
    nameGroups: { italian: 6, irish: 3, middle_eastern: 2, slavic: 1, anglo: 1 }, closeness: [0.65, 0.9] },
  { kind: 'industrial', names: ['Ironworks', 'The Yards', 'Millside', 'Foundry Row'], wealth: [25, 45], police: [10, 30], population: [20, 40],
    mix: { warehouse: 5, garage: 4, construction: 3, diner: 1, bar: 1, cab_company: 1, black_market: 1, scrapyard: 6, tow_yard: 4, importer: 2 }, perBlock: [1, 3],
    nameGroups: { slavic: 4, latino: 3, black_american: 2, anglo: 2, irish: 2 }, closeness: [0.4, 0.6] },
  { kind: 'heights', names: ['The Heights', 'Hillcrest', 'Northside', 'Belle Park'], wealth: [70, 100], police: [50, 75], population: [40, 60],
    mix: { restaurant: 3, jeweller: 2, gym: 1, bank: 1, laundromat: 1, corner_store: 1, nightclub: 1, black_market: 1, gallery: 3, boutique: 3, pharmacy: 2, accountant: 2 }, perBlock: [1, 3],
    nameGroups: { anglo: 5, italian: 2, east_asian: 2, irish: 1, middle_eastern: 1 }, closeness: [0.08, 0.25] },
  { kind: 'market', names: ['Market Square', 'The Bazaar', 'Merchant Row', 'Fishmarket'], wealth: [35, 60], police: [30, 50], population: [60, 100],
    mix: { corner_store: 5, pawn: 3, diner: 2, laundromat: 2, barbershop: 2, cab_company: 1, gym: 1, black_market: 1, electronics: 3, scrapyard: 4, tow_yard: 3, pharmacy: 1 }, perBlock: [3, 5],
    nameGroups: { middle_eastern: 4, east_asian: 4, latino: 3, anglo: 1, italian: 1 }, closeness: [0.5, 0.72] },
  { kind: 'strip', names: ['The Strip', 'Neon Row', 'Club District', 'Lowlight'], wealth: [45, 70], police: [35, 60], population: [50, 90],
    mix: { nightclub: 5, bar: 4, motel: 2, restaurant: 1, cab_company: 1, pawn: 1, black_market: 1, electronics: 2, boutique: 2, pharmacy: 1 }, perBlock: [3, 5],
    nameGroups: { anglo: 2, italian: 2, latino: 2, black_american: 2, east_asian: 2, slavic: 2, irish: 2, middle_eastern: 2 }, closeness: [0.2, 0.4] },
  { kind: 'projects', names: ['The Projects', 'Southside', 'The Blocks', 'Lowtown'], wealth: [10, 30], police: [20, 45], population: [70, 100],
    mix: { corner_store: 5, barbershop: 3, gym: 2, laundromat: 2, bar: 2, motel: 1, garage: 1, black_market: 1, electronics: 2, pharmacy: 2, tow_yard: 1 }, perBlock: [2, 4],
    nameGroups: { black_american: 5, latino: 4, east_asian: 1, irish: 1, anglo: 1 }, closeness: [0.7, 0.95] },
];
