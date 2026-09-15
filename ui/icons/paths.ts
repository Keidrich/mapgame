/**
 * The icon set.
 *
 * Every glyph in the game used to be an emoji, which meant the look of the thing was whatever
 * the player's phone felt like drawing — three different art styles on one row, a tofu box on an
 * older Android, and nothing that read as one product. This is the replacement: one hand-drawn
 * line set on a 24×24 grid, stroked in `currentColor` so an icon inherits whatever the row it
 * sits in is doing (amber for yours, muted for theirs, red for trouble).
 *
 * Rules the set holds to, because a set that does not hold to them stops reading as a set:
 *  - 24×24 box, 1.5 stroke, mitred joins and butt caps. Angular, not rounded — it is a HUD.
 *  - Nothing smaller than about 2 units, or it disappears at the 18px the list rows use.
 *  - Families share a mark: every heist has the same crowbar bar, every armed job the same
 *    chevron, every wire job the same signal arc. Reading "this is one of those" at a glance is
 *    worth more than 63 unrelated drawings.
 *  - No text inside a glyph. A "$" or a "%" drawn in strokes reads as a smudge at 18px.
 *
 * The emoji in `/content` are untouched: they are data, they still feed the emoji-support test,
 * and they are what a share card or a log line falls back to. `ui/icons/resolve.ts` maps a
 * content id to a name here; a missing name falls back to the emoji rather than to nothing.
 */

/** One icon: the path `d` strings drawn in order, all stroked, none filled. */
export type IconPaths = readonly string[];

// Shapes reused often enough to name, and shared with the op set so a family really is one.
export const BUILDING = 'M4 20V9l8-4.5L20 9v11';
export const GROUND = 'M2.5 20.5h19';
export const SCREEN = 'M3 5h18v11H3z';
export const BOTTLE = 'M10 3h4v3.5l2 3.5v10H8V10l2-3.5z';
export const CRATE = 'M3.5 8.5h17v11h-17z';
export const CARD = 'M3 6h18v12H3z';
export const DOC = 'M6 3h8l4 4v14H6z';
export const PHONE = 'M7.5 3h9v18h-9z';
export const VAN = 'M2.5 16V8h11v8M13.5 10h3.5l3 3v3M5.5 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0';
export const FLAME = 'M12 3c3 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2.5-5 .3 1.5 1 2 1.5 2 .8 0 1.5-1 1-6z';
export const SHIELD = 'M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6z';
export const BAR = 'M4 12h16';                      // the heist family's crowbar
export const CHEVRON = 'M8 20l4-3 4 3';             // the armed family's chevron
export const SIGNAL = 'M15.5 6.5a7 7 0 0 1 0 11M18 4a10.5 10.5 0 0 1 0 16';  // the wire family's arc

export const ICON_PATHS: Record<string, IconPaths> = {
  // ---------------------------------------------------------------- chrome and nav
  map: ['M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z', 'M9 4v13.5M15 6.5V20'],
  crew: ['M9 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4', 'M2.5 20v-1.5C2.5 16 5 14.5 9 14.5s6.5 1.5 6.5 4V20', 'M16 5.2a3 3 0 0 1 0 5.6', 'M17.5 14.9c2.5.5 4 1.9 4 3.6V20'],
  ops: ['M5.5 3.5h13v17h-13z', 'M9 2h6v3H9z', 'M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', 'M12 11.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2', 'M12 6.5v2.5M12 16v2.5M7.5 12.5h2M14.5 12.5h2'],
  social: ['M12 3.5 20 8v8l-8 4.5L4 16V8z', 'M12 3.5v17M4 8l16 8M20 8 4 16'],
  factions: ['M4 20V9l6-3v14M14 20V4l6 3v13', GROUND, 'M6.5 12h1M6.5 15.5h1M16.5 9h1M16.5 12.5h1'],
  empire: ['M3 9 12 4l9 5', 'M5.5 9v9.5M9.5 9v9.5M14.5 9v9.5M18.5 9v9.5', GROUND],
  help: ['M9 9a3 3 0 1 1 3 3v2', 'M12 18.5h.01', 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 'M12 11v6', 'M12 7.5h.01'],
  lock: ['M5.5 11h13v9.5h-13z', 'M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11', 'M12 14.5v3'],
  check: ['M4 12.5 9.5 18 20 6.5'],
  cross: ['M5 5l14 14M19 5 5 19'],
  warn: ['M12 3.5 22 20.5H2z', 'M12 9.5v5', 'M12 17.5h.01'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 'M12 7v5.5l3.5 2'],
  search: ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M15.6 15.6 21 21'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  gear: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1'],

  // ---------------------------------------------------------------- HUD readouts
  day: ['M4.5 6h15v14.5h-15z', 'M4.5 10.5h15', 'M8.5 3.5v4M15.5 3.5v4'],
  cash: ['M2.5 6.5h19v11h-19z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6', 'M5.5 9.5h.01M18.5 14.5h.01'],
  dirty: ['M7 8.5h10l1.5 12H5.5z', 'M9.5 8.5V6a2.5 2.5 0 0 1 5 0v2.5', 'M10.5 13.5h3'],
  heat: [FLAME],
  respect: ['M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z'],
  fear: ['M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.6 1.2 4 2.5 5v4h10v-4c1.3-1 2.5-2.4 2.5-5 0-4-3.1-7-7.5-7z', 'M9 11h.01M15 11h.01', 'M9.5 15.5h5'],
  ap: ['M13.5 2.5 5 13.5h6l-1.5 8L18 10.5h-6z'],
  legwork: ['M13.5 3.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4', 'M12 8 9 12l-3 2.5', 'M12 8l3.5 1.5L17 14', 'M12 8v4.5l2.5 3.5.5 5', 'M10.5 14 8 17l-1 4'],
  lawyer: ['M12 4v16', 'M6 20h12', 'M4 8h16', 'M4 8 1.5 13.5h5zM20 8l2.5 5.5h-5z'],
  jail: ['M4.5 4.5h15v15h-15z', 'M9 4.5v15M15 4.5v15'],

  // ---------------------------------------------------------------- products
  booze: [BOTTLE, 'M8 13.5h8'],
  green: ['M12 20.5V11', 'M12 11c0-4 3-7 8-7 0 4-3.5 7-8 7z', 'M12 14c-3.5 0-6-2.5-6-6 3.5 0 6 2.5 6 6z'],
  pills: ['M9 3.5a5.5 5.5 0 0 0 0 11h6a5.5 5.5 0 0 0 0-11z', 'M12 3.5v11', 'M7 18.5h10'],
  hot_goods: [CRATE, 'M3.5 8.5 5.5 4h13l2 4.5', 'M9.5 12.5h5'],
  counterfeit: ['M2.5 7h19v10h-19z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', 'M6 3.5h15v2'],
  streetwear: ['M8.5 3.5 4 6l1.5 4 2-.7V20.5h9V9.3l2 .7L20 6l-4.5-2.5z', 'M8.5 3.5a3.5 3.5 0 0 0 7 0'],

  // ---------------------------------------------------------------- production lines
  still: ['M6 10.5h9v10H6z', 'M7.5 10.5V7h6v3.5', 'M15 13h3.5a2.5 2.5 0 0 1 0 5H17', 'M9 4.5h3'],
  grow_op: ['M7 3.5h10l-1.5 4h-7z', 'M12 7.5v13', 'M12 13c-3 0-5-2-5-5 3 0 5 2 5 5z', 'M12 16c3 0 5-2 5-5-3 0-5 2-5 5z'],
  lab: ['M10 3.5v6L4.5 19a1.8 1.8 0 0 0 1.6 2.5h11.8A1.8 1.8 0 0 0 19.5 19L14 9.5v-6', 'M8.5 3.5h7', 'M7.2 14.5h9.6'],
  print_shop: ['M7 3.5h10V8H7z', 'M4 8h16v7H4z', 'M7 13h10v7.5H7z', 'M9.5 16.5h5'],
  cut_house: ['M4.5 7h12l3 4-3 4h-12z', 'M8 11h9', 'M4.5 7v13'],

  // ---------------------------------------------------------------- businesses
  bar: ['M6 4h12l-5 8v7', 'M9 19h8', 'M8.2 7h7.6'],
  diner: ['M4 8.5h11v5.5a4.5 4.5 0 0 1-4.5 4.5H8.5A4.5 4.5 0 0 1 4 14z', 'M15 10h2.5a2.5 2.5 0 0 1 0 5H15', 'M3 21h14'],
  restaurant: ['M6.5 3v6a2 2 0 0 0 4 0V3', 'M8.5 11v10', 'M16.5 3c2 1.8 2 6.2 0 8v10'],
  laundromat: ['M4.5 4h15v16.5h-15z', 'M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M7 6.5h2.5'],
  pawn: ['M3.5 12.5 12.5 3.5H20v7.5l-9 9z', 'M16.5 7h.01', 'M6 12.5h4'],
  garage: ['M3 10 12 5l9 5', 'M4.5 20.5V16l1.5-3.5h12L19.5 16v4.5', 'M6.5 20.5v-2M17.5 20.5v-2', 'M7 16h10'],
  nightclub: ['M12 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11', 'M6.7 6.7 17.3 11.3M6.7 11.3 17.3 6.7M12 3.5v11', 'M12 14.5v6', 'M8 20.5h8'],
  corner_store: ['M3.5 9h17v11.5h-17z', 'M3.5 9 5.5 4h13l2 5', 'M9 20.5v-6.5h6v6.5'],
  barbershop: ['M7 3.5 17 16M17 3.5 7 16', 'M5.5 17.8a2.6 2.6 0 1 0 3.7 3.7 2.6 2.6 0 0 0-3.7-3.7', 'M14.8 17.8a2.6 2.6 0 1 1-3.7 3.7 2.6 2.6 0 0 1 3.7-3.7'],
  gym: ['M2.5 9v6M6 6.5v11M6 12h12M18 6.5v11M21.5 9v6'],
  cab_company: ['M8.5 3.5h7v2.5h-7z', VAN.replace('M2.5 16V8h11v8', 'M2.5 17V9h11v8')],
  construction: ['M3.5 18.5h17', 'M6 18.5a6 6 0 0 1 12 0', 'M9.5 8h5v4.5', 'M12 4v4'],
  warehouse: ['M3 20.5V9l9-5 9 5v11.5', 'M8 20.5v-8h8v8', 'M8 16h8'],
  motel: ['M2.5 19v-7h12a4.5 4.5 0 0 1 4.5 4.5V19', 'M2.5 12V6.5', 'M2.5 19h19', 'M6 12V9.5h5V12'],
  bank: ['M3 9 12 4l9 5', 'M5.5 9v9.5M9.5 9v9.5M14.5 9v9.5M18.5 9v9.5', GROUND],
  jeweller: ['M6 4h12l3 5.5-9 11-9-11z', 'M6 4 9 9.5h6L18 4', 'M9 9.5 12 20.5 15 9.5', 'M3 9.5h18'],
  armored_depot: ['M2.5 16.5V7.5h11v9M13.5 10h3.5l3.5 3.5v3', 'M5.5 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15.5 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M6 10.5h4v3H6z'],
  black_market: [CRATE, 'M3.5 8.5 5.5 4h13l2 4.5', 'M9 12.5a3 3 0 1 1 6 0c0 1.8-3 1.6-3 3.5', 'M12 18h.01'],
  scrapyard: ['M3 20.5h18', 'M4.5 20.5V16h15v4.5', 'M6 16l2-4.5h8l2 4.5', 'M9.5 11.5V8M14.5 11.5V8', 'M8 4.5h8'],
  electronics: [PHONE, 'M10 18.5h4', 'M10 6h4'],
  tow_yard: ['M2.5 17V9.5h9V17', 'M11.5 17h3l-1-6.5 5.5-4', 'M4.5 17a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M14.5 17a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M18.5 6.5a2 2 0 1 0 3 2.5'],
  boutique: ['M12 3.5a2 2 0 1 0 1.8 2.9L20.5 11H3.5l6.7-4.6', 'M5 11l-1 9.5h16L19 11'],
  pharmacy: ['M9.5 3.5h5V9h5.5v5H14.5v6.5h-5V14H4V9h5.5z'],
  gallery: ['M3.5 4.5h17v15h-17z', 'M6.5 15.5 10 11l3 3.5 2.5-2.5 2 4', 'M15.5 7.5h.01'],
  accountant: ['M5.5 3h13v18h-13z', 'M8.5 7h7', 'M8.5 11h2.5M13 11h2.5M8.5 14.5h2.5M13 14.5h2.5M8.5 18h2.5M13 18h2.5'],
  importer: ['M2.5 9.5h19v9h-19z', 'M6.5 9.5v9M10.5 9.5v9M14.5 9.5v9M18.5 9.5v9', 'M2.5 18.5 4 21.5h16l1.5-3', 'M9 6.5h6V4'],

  // ---------------------------------------------------------------- rackets
  protection: [SHIELD, 'M8.5 12l2.5 2.5 4.5-5'],
  numbers: ['M3 7.5h18v9H3z', 'M7 11h.01M11 11h.01M15 11h.01M7 14h.01M11 14h.01M15 14h.01', 'M18.5 4.5v15'],
  bookmaking: ['M4 4.5h16v15H4z', 'M4 9.5h16', 'M7 13h4M7 16h4', 'M14 12.5l2.5 2.5 2.5-4.5'],
  gambling_den: ['M4 4.5h10.5V15H4z', 'M7 8h.01M11.5 11.5h.01', 'M9.5 9.5h10V20H9.5', 'M13 13.5h.01M16.5 17h.01'],
  loansharking: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 'M8.5 15.5 15.5 8.5', 'M9 9.5h.01M15 14.5h.01'],
  fencing: [CRATE, 'M3.5 8.5 5.5 4h13l2 4.5', 'M12 11v6M9.5 14.5 12 17l2.5-2.5'],
  chop_shop: ['M2.5 16.5V11l2.5-5h11l2.5 5v5.5', 'M5 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15.5 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M21.5 3 13 21'],
  dealing: ['M8 8h8l2 12.5H6z', 'M9.5 8V6a2.5 2.5 0 0 1 5 0v2', 'M10.5 13h3M12 11.5v3'],
  laundering: ['M4.5 8a8 8 0 0 1 14-2.5', 'M19.5 16a8 8 0 0 1-14 2.5', 'M18.5 2.5v3.5H15M5.5 21.5V18H9', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
  smuggling: [VAN, 'M6 11h4'],
  carding: [CARD, 'M3 9.5h18', 'M6 14h4v2.5H6z'],
  no_show_jobs: ['M6 3h12v18H6z', 'M9 7.5h6M9 11h6', 'M9 15.5h2.5', 'M14 15 17 18M17 15l-3 3'],
  union_dues: ['M3 5.5h18v13H3z', 'M6.5 9.5h7M6.5 12.5h5M6.5 15.5h3', 'M16.5 13a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4', 'M14 16.5c.5-1.4 1.4-2 2.5-2s2 .6 2.5 2'],
  counterfeiting: ['M5 3.5h11v5H5z', 'M2.5 8.5h17v6h-17z', 'M6 14.5h10v6H6z', 'M8.5 17.5h5', 'M11 11a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2'],
  after_hours: ['M17.5 3.5a7 7 0 1 0 3 9 5.5 5.5 0 0 1-3-9z', 'M4 16.5h9l-4 4z', 'M4 16.5 7 12h6'],
  policy_bank: ['M4 5h16v14H4z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', 'M12 5v4M12 15v4'],
  parts_stripping: ['M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', 'M12 5.5V2M12 22v-3.5M5.5 12H2M22 12h-3.5'],
  relay_export: ['M2.5 15V10l2-4h9l2 4v5', 'M4.5 15a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M12.5 15a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0', 'M17 19.5h5M19.5 17l2.5 2.5-2.5 2.5'],
  card_supply: ['M2.5 9h13v9h-13z', 'M6 6h13v9', 'M2.5 12h13', 'M5 15h3'],
  knockoffs: ['M8.5 4 5 6l1.2 3.5 1.8-.6V20h8V8.9l1.8.6L19 6l-3.5-2z', 'M8.5 4a3.5 3.5 0 0 0 7 0', 'M17.5 14.5h4v4h-4z', 'M19.5 16.5h.01'],
  script_diversion: [DOC, 'M14 3v4h4', 'M8.5 11h3.5M8.5 14.5h2', 'M14 13.5a3 3 0 1 0 4.2 4.2 3 3 0 0 0-4.2-4.2', 'M14.5 17.5 17.8 14.2'],

  // ---------------------------------------------------------------- kit
  knuckles: ['M3.5 10.5h17v4.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z', 'M7.5 10.5V7.5M12 10.5v-3M16.5 10.5v-3', 'M6 7.5a1.7 1.7 0 1 1 3 0M10.5 7.5a1.7 1.7 0 1 1 3 0M15 7.5a1.7 1.7 0 1 1 3 0'],
  bat: ['M20.5 3.5 9 15', 'M9 15l-4.5 5.5-1-1L8 15z', 'M17 3.5 20.5 7'],
  machete: ['M3.5 20.5 14 10l6.5-6.5v6L10 20.5z', 'M3.5 20.5h6.5', 'M5.5 18.5 8 21'],
  pistol: ['M3.5 7.5h14v5h-3l-3 3H9l-1-3H3.5z', 'M8 15.5 6 20.5h4l1.5-5', 'M15 9.5h.01'],
  revolver: ['M3.5 7.5h13v5h-2.5l-3 3H9l-1-3H3.5z', 'M8 15.5 6 20.5h4l1.5-5', 'M9 8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'],
  suppressed: ['M3.5 8h11v4.5h-2.5l-2.5 3H7.5l-1-3H3.5z', 'M6.5 15.5 5 20.5h3.5l1.5-5', 'M14.5 8.5h6v3.5h-6z'],
  sawnoff: ['M3.5 9h11v4h-3l-2 2.5H7l-1-2.5h-2.5z', 'M6.5 15.5 5 20h3.5l1.5-4.5', 'M3.5 10.5h11M3.5 12h11'],
  pump: ['M2.5 9h18v3.5h-18z', 'M6 12.5 4.5 19h3.5L9.5 12.5', 'M9 12.5h5v2.5H9z'],
  rifle: ['M2 12.5 20.5 6.5', 'M5 13.5 6.5 19h3l-.5-6', 'M12 7.5h5v2.5', 'M9.5 11.5 20 8'],
  molotov: [BOTTLE, 'M12 1.5c2 1.5 1.5 3 0 3.5', 'M10 13.5h4'],
  pipebomb: ['M5.5 8.5h10v8h-10z', 'M4 8.5h13M4 16.5h13', 'M15.5 12.5h2.5c1.5 0 2-2 3.5-2.5'],
  lockpicks: ['M4.5 19.5 14 10', 'M14 10a3.2 3.2 0 1 0 4.5-4.5A3.2 3.2 0 0 0 14 10z', 'M4.5 19.5v-3h3', 'M8 16l2.5 2.5'],
  relay_box: ['M4.5 10.5h11v8h-11z', 'M7.5 14h5', SIGNAL.replace('M15.5 6.5', 'M17 8.5').replace('M18 4', 'M19.5 6')],
  burner: ['M7.5 4h9v16h-9z', 'M7.5 8h9M7.5 16h9', 'M10.5 18h3'],
  laptop: ['M5 5h14v10H5z', 'M2.5 15h19l-1.5 4h-16z', 'M10.5 17h3'],
  getaway: ['M3.5 16.5V11l2.5-5h11l2.5 5v5.5', 'M6 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15 16.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M6 11h12', 'M1 8h3M1 11h2'],

  // ---------------------------------------------------------------- crew assignments
  collect: ['M2.5 6h19v12h-19z', 'M2.5 6 12 13.5 21.5 6'],
  hack: ['M4 5h16v12H4z', 'M2.5 20.5h19', 'M7 9l2.5 2.5L7 14M12 14h4.5'],
  production: ['M3.5 20.5V11l5.5 3.5V11l5.5 3.5V11l5.5 3.5v6z', 'M9 4.5h6l-.5 6.5h-5z'],
  foreman: ['M7 4.5h10v16H7z', 'M9.5 3h5v3h-5z', 'M10 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0', 'M9.5 16h5'],
  guard: [SHIELD, 'M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4', 'M8.5 17c.7-1.8 2-2.6 3.5-2.6s2.8.8 3.5 2.6'],
  lieutenant: ['M5 6.5 12 4l7 2.5', 'M5 11.5 12 9l7 2.5', 'M5 16.5 12 14l7 2.5'],

  // ---------------------------------------------------------------- the law
  precinct: ['M12 3.5 19.5 7v5.5c0 4-3 6.5-7.5 8-4.5-1.5-7.5-4-7.5-8V7z', 'M12 8.5 13.4 11l2.8.4-2 2 .5 2.8-2.7-1.4-2.7 1.4.5-2.8-2-2 2.8-.4z'],
  city_hall: ['M7 9a5 5 0 0 1 10 0', 'M3.5 11h17', 'M6 11v8M10 11v8M14 11v8M18 11v8', GROUND, 'M12 2v2.5', 'M3.5 9h17v2h-17z'],
  routine: ['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7'],
  watching: ['M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'],
  investigating: ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M15.6 15.6 21 21', 'M7.5 10.5h6M10.5 7.5v6'],
  task_force: ['M12 3.5 19.5 7v5.5c0 4-3 6.5-7.5 8-4.5-1.5-7.5-4-7.5-8V7z', 'M8.5 9.5h7M8.5 12.5h7M8.5 15.5h7'],
  crackdown: ['M5 19.5h14', 'M7 19.5v-4a5 5 0 0 1 10 0v4', 'M12 6.5v-3M4 9 2 7.5M20 9l2-1.5', 'M9.5 15.5h5'],

  // ---------------------------------------------------------------- the verbs
  // Buttons, disclosures and the little inline marks. Drawn to the same rules; kept apart from
  // the content sets so it is obvious which ones a content table is allowed to reach for.
  kit: ['M7 7.5h10v13H7z', 'M9.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2', 'M7 12h10', 'M11 14.5h2v3h-2z'],
  note: ['M4.5 3.5h10L19.5 8v12.5h-15z', 'M14 3.5V8h5', 'M7.5 12h8M7.5 15.5h5'],
  gift: ['M3.5 8.5h17v4h-17z', 'M5 12.5h14v8H5z', 'M12 8.5v12', 'M12 8.5c-3.5 0-5-1-5-2.5S8.5 3 12 8.5zM12 8.5c3.5 0 5-1 5-2.5S15.5 3 12 8.5z'],
  seat: ['M6.5 3.5h11v9h-11z', 'M5 12.5h14v4H5z', 'M7 16.5v4M17 16.5v4'],
  peace: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 'M12 3.5v17', 'M12 12 6 18M12 12l6 6'],
  crown: ['M3.5 17.5h17', 'M3.5 17.5 5 6.5l4.5 4L12 4l2.5 6.5L19 6.5l1.5 11z'],
  link: ['M10 14a4 4 0 0 1 0-5.5l2.5-2.5a4 4 0 0 1 5.5 5.5L16.5 13', 'M14 10a4 4 0 0 1 0 5.5L11.5 18A4 4 0 0 1 6 12.5L7.5 11'],
  hand: ['M8 11V5.5a1.6 1.6 0 0 1 3.2 0V11M11.2 11V4.5a1.6 1.6 0 0 1 3.2 0V11M14.4 11V6a1.6 1.6 0 0 1 3.2 0v7.5c0 4-2.5 7-6.5 7-3.5 0-5.5-2-6.5-5L4 12.5a1.6 1.6 0 0 1 2.8-1.5L8 13'],
  person: ['M12 4a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 12 4', 'M4.5 20.5v-1c0-3 3-5 7.5-5s7.5 2 7.5 5v1'],
  scrub: ['M12 2.5v6', 'M5.5 8.5h13v3h-13z', 'M8 14.5v2M12 13.5v3M16 14.5v2', 'M8 19v1.5M12 19.5v1.5M16 19v1.5'],
  fist: ['M4.5 10.5h13v5a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4z', 'M7.5 10.5V8a2 2 0 0 1 4 0v2.5M11.5 10.5V7a2 2 0 0 1 4 0v3.5', 'M17.5 12h1.5a1.6 1.6 0 0 1 0 3.2h-1.5'],
  caret: ['M6 9.5 12 15.5l6-6'],
  // ---- tier 4: chartered institutions. Columns, cards, cranes and water ----
  casino: ['M4.5 5.5h11l4 13h-11z', 'M8 18.5 4 5.5', 'M11 10.5l1.5 2.5-1.5 2.5-1.5-2.5z'],
  merchant_bank: ['M3 9.5 12 4l9 5.5', 'M4.5 9.5v9M9 9.5v9M15 9.5v9M19.5 9.5v9', 'M3 20.5h18'],
  shipping_line: ['M12 3v9', 'M7.5 7h9', 'M12 12a4 4 0 0 0 4-4M12 12a4 4 0 0 1-4-4', 'M3 16.5c2 2 4 2 6 0s4-2 6 0 4 2 6 0', 'M3 20.5c2 2 4 2 6 0s4-2 6 0 4 2 6 0'],
  development_co: ['M5 20.5V7l10 4.5', 'M5 7 3 4.5', 'M15 11.5V20.5', 'M3 20.5h18', 'M15 4.5h5v4h-5z'],
  caret_up: ['M6 14.5 12 8.5l6 6'],
  casefile: ['M3 6.5h7l2 2.5h9v11H3z', 'M3 11.5h18', 'M8 15.5h8'],
  ticket: ['M3 7.5h18v3.5a1.6 1.6 0 0 0 0 2v3.5H3v-3.5a1.6 1.6 0 0 0 0-2z', 'M9 7.5v9M13 7.5v9'],
  moon: ['M18.5 14.5A8 8 0 0 1 9 5a8.5 8.5 0 1 0 9.5 9.5z'],
  wrench: ['M15.5 3.5a5.5 5.5 0 0 0-5 7.5L3.5 18v2.5H6l7-7a5.5 5.5 0 0 0 7.5-5l-3.5 3-2.5-2.5z'],
  trash: ['M4.5 6.5h15', 'M9 6.5V4h6v2.5', 'M6 6.5 7 20.5h10l1-14', 'M10 10v7M14 10v7'],
  download: ['M12 3.5v11', 'M7.5 10 12 14.5 16.5 10', 'M4 18.5h16'],
  upload: ['M12 14.5v-11', 'M7.5 8 12 3.5 16.5 8', 'M4 18.5h16'],
  copy: ['M8 3.5h12v12H8z', 'M4 8.5v12h12', 'M11 7.5h6M11 11.5h6'],
  down: ['M12 4v14', 'M6 12.5 12 18.5l6-6'],
  gavel: ['M3.5 20.5h9', 'M5.5 15.5 12 9l3 3-6.5 6.5z', 'M11.5 5.5 18.5 12.5', 'M13.5 3.5 20.5 10.5', 'M12.5 4.5 19.5 11.5'],

  // ---------------------------------------------------------------- map furniture
  safehouse: [BUILDING, 'M9.5 20v-6h5v6', 'M12 10.5v2'],
  you: ['M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 5 6.5 12 6.5 12s6.5-7 6.5-12A6.5 6.5 0 0 0 12 2.5z', 'M12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5'],
  start: ['M6 21V3', 'M6 4h12l-2.5 4L18 12H6'],
  flag: ['M6 21V3', 'M6 4h12l-2.5 4L18 12H6'],
  territory: ['M3.5 5.5h17v13h-17z', 'M3.5 10h17M3.5 14h17M9 5.5v13M15 5.5v13'],
};
