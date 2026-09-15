/**
 * The op set: one glyph per job on the tree, 63 of them.
 *
 * Split from `paths.ts` only because it is half the set on its own. Same grid, same rules, and
 * three shared family marks so the tree reads as families rather than as sixty-three unrelated
 * drawings: `BAR` (a crowbar laid across the mark) on every heist, `CHEVRON` on the armed jobs,
 * and `SIGNAL` on everything that happens down a wire. A player should be able to tell what
 * *kind* of job a node is before they have read its name.
 */
import { BAR, CHEVRON, CRATE, DOC, FLAME, PHONE, SIGNAL, VAN, type IconPaths } from './paths';

const VAULT = 'M4.5 4.5h15v15h-15z';
const DIAL = 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7';
const FIGURE = 'M12 3.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M12 8.5v7M12 15.5l-2.5 5M12 15.5l2.5 5M8.5 11h7';
const BALLOT = 'M4 10.5h16v9.5H4z';
const TOWER = 'M6 20.5V4.5h8v16M14 20.5V9h4.5v11.5';

export const OP_ICON_PATHS: Record<string, IconPaths> = {
  // ---------------------------------------------------------------- the vault family
  heist_bank: [VAULT, DIAL, 'M12 3v2M12 19v2', BAR],
  heist_jeweller: ['M6 5h12l3 5-9 10.5L3 10z', 'M6 5l3 5h6l3-5', BAR],
  heist_armored: ['M2.5 15.5V7h10.5v8.5M13 10h3.5l3.5 3.5v2', 'M5 15.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15.5 15.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', BAR],
  heist_warehouse: ['M3 20.5V9.5l9-5 9 5v11', 'M8 20.5v-7h8v7', BAR],
  heist_payroll: ['M7 8.5h10l1.5 12H5.5z', 'M9.5 8.5V6.5a2.5 2.5 0 0 1 5 0v2', BAR],
  heist_containers: ['M2.5 10.5h19v8h-19z', 'M7 10.5v8M12 10.5v8M17 10.5v8', 'M12 6.5V2.5M9 5l3-2.5 3 2.5'],
  heist_gallery: ['M3.5 4.5h17v13h-17z', 'M6.5 14 10 10l3 3 2-2 2.5 3', 'M3.5 20.5 20.5 4.5'],
  heist_countroom: ['M4 6.5h12v11H4z', 'M4 10h12M4 13.5h12', 'M18.5 5.5v13a2 2 0 0 1-2.5 2', BAR],

  // ---------------------------------------------------------------- the street
  robbery: ['M4.5 9.5h15v9h-15z', 'M4.5 9.5 6 5.5h12l1.5 4', 'M9.5 14h5'],
  armed_robbery: ['M4.5 9.5h15v8h-15z', 'M4.5 9.5 6 5.5h12l1.5 4', CHEVRON],
  intimidate: ['M18.5 3.5 9.5 12.5', 'M9.5 12.5 6 16l2 2 3.5-3.5z', 'M4 20.5 8 16.5', 'M20.5 5.5 17 2'],
  armed_intimidation: ['M18.5 3.5 10 12', 'M10 12 6.5 15.5l2 2L12 14z', CHEVRON],
  mugging: [FIGURE.replace('M12 3.5', 'M9 3.5').replace('M12 8.5v7', 'M9 8.5v7').replace('M12 15.5l-2.5 5', 'M9 15.5l-2 5').replace('M12 15.5l2.5 5', 'M9 15.5l2 5').replace('M8.5 11h7', 'M5.5 11h7'), 'M17 9.5c2 1 2.5 3 1.5 4.5l-3-2'],
  takeover: ['M6 21V3', 'M6 4h12l-2.5 4L18 12H6', 'M3.5 21h5'],
  porch_piracy: [CRATE, 'M3.5 8.5 5.5 4h13l2 4.5', 'M12 4v4.5', 'M9 13.5h6'],
  bike_ring: ['M6 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M18 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M6 14l4.5-6h5l2.5 6', 'M9 8h4', 'M10.5 8 15 14'],
  vape_bootleg: ['M3.5 9.5h13v8h-13z', 'M3.5 13.5h13M8 9.5v8M12 9.5v8', 'M18 9.5h2.5v8H18z'],
  copper_strip: ['M4 6.5h9a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 0 0 7h10', 'M4 4.5v4M18 18.5v4'],
  squatter_scheme: ['M4 20.5V9.5l8-5 8 5v11', 'M9 20.5v-6h6v6', 'M12 4.5V2', 'M4 20.5 20 9.5'],
  scout_block: ['M6.5 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M17.5 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', 'M10 12h4', 'M5 5h3M16 5h3'],
  claim_abandoned: ['M4 20.5V10l8-5 8 5v10.5', 'M9 20.5v-6h6v6', 'M7 8.5 10 11M17 8.5 14 11'],

  // ---------------------------------------------------------------- paper, patience, signatures
  insurance_fraud: [FLAME, 'M3 20.5h18'],
  // a fire somebody else paid for: the same flame, with a fee beside it
  arson_hire: ['M10 2.5c2.6 3.5 4.4 4.9 4.4 8a4.4 4.4 0 0 1-8.8 0c0-1.8.9-3.1 2.2-4.4.3 1.3.9 1.8 1.3 1.8.7 0 1.3-.9.9-5.4z', 'M16.5 13.5h5v6h-5z', 'M19 15v3M17.8 16.5h2.4'],
  check_kiting: ['M2.5 6.5h19v11h-19z', 'M6 13.5h5', 'M14 13.5h4', 'M6 10h3'],
  shell_company: ['M3 3.5h10v10H3z', 'M7.5 8h10v10h-10z', 'M11.5 12.5h9v8h-9z'],
  long_con: ['M4 9.5a4 4 0 0 1 8 0 4 4 0 0 1 8 0c0 3-2 5-4 5s-3-1.5-4-3c-1 1.5-2 3-4 3s-4-2-4-5z', 'M7 9h.01M17 9h.01', 'M6 18.5h12'],
  staged_accident: ['M2.5 16V11l2.5-4.5h11L18.5 11v5', 'M5 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M13 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M20 4.5 16 9.5M16 4.5l4 5'],
  charity_front: ['M12 20.5C7 17 3.5 14 3.5 10.3A4.3 4.3 0 0 1 12 8.5a4.3 4.3 0 0 1 8.5 1.8c0 3.7-3.5 6.7-8.5 10.2z'],
  counterfeit_run: ['M6.5 3.5h11V8h-11z', 'M3.5 8h17v7h-17z', 'M6.5 13h11v8h-11z', 'M9 17h6'],
  straw_purchase: [DOC, 'M14 3v4h4', 'M8.5 12h7', 'M8.5 15.5h4', 'M13 20 20.5 12.5l1.5 1.5L14.5 21.5z'],
  resort_fraud: ['M12 11.5V21', 'M12 11.5c-4 0-7 2-8.5 4 3-5 6-6.5 8.5-6.5s5.5 1.5 8.5 6.5c-1.5-2-4.5-4-8.5-4z', 'M12 5V3', 'M3.5 21h17'],
  match_fixing: ['M7.5 3.5h9v6a4.5 4.5 0 0 1-9 0z', 'M7.5 5H4.5v2a3 3 0 0 0 3 3M16.5 5h3v2a3 3 0 0 1-3 3', 'M12 14v3.5M8.5 20.5h7'],
  synth_identity: ['M3 5.5h18v13H3z', 'M8.5 12a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4', 'M5 16.5c.7-2 2-3 3.5-3s2.8 1 3.5 3', 'M14.5 9.5h4M14.5 13h4'],
  bust_out: ['M3.5 4.5v16h17', 'M6.5 8 11 12.5l3-3 5.5 7', 'M19.5 12v4.5H15'],
  boiler_room: ['M4 6.5h6l1.5 4-2.5 2a11 11 0 0 0 5 5l2-2.5 4 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5C10 23.5 2.5 15 2.5 8A1.5 1.5 0 0 1 4 6.5z'],

  // ---------------------------------------------------------------- moving things
  smuggle_run: [VAN, 'M6 11h4'],
  dockside_pickup: ['M12 6.5V21', 'M12 3.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2', 'M8 9h8', 'M4 13c0 4.5 3.5 8 8 8s8-3.5 8-8', 'M4 13H1.5M20 13h2.5'],
  hijack_load: ['M2.5 15.5V8h10.5v7.5M13 10.5h3.5l3.5 3.5v1.5', 'M5 15.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15.5 15.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M4.5 3.5h7v3h-7z'],
  convoy_run: ['M2 11V6.5h7V11M9 8h2.5L13 10v1', 'M2 19.5V15h7v4.5M9 16.5h2.5L13 18.5v1', 'M16 8.5h6M16 12h6M16 17h6M16 20.5h6'],
  illegal_dumping: ['M7 4.5h10v16H7z', 'M7 8.5h10M7 16.5h10', 'M4 20.5h16', 'M11 11.5h2v3h-2z'],
  prison_supply: ['M3.5 4.5h17v15h-17z', 'M8 4.5v15M13 4.5v15M18 4.5v15', 'M3.5 12h17'],

  // ---------------------------------------------------------------- people, and taking them off the board
  hit: ['M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15', 'M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4', 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3'],
  frame: ['M4 10.5h16v10H4z', 'M4 10.5 12 3l8 7.5', 'M12 6.5v8', 'M9 11.5l3 3 3-3'],
  kidnap: ['M2.5 16V8.5h11V16M13.5 11h3.5l3 3v2', 'M5.5 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0M15 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0', 'M6.5 11.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0'],
  steal_formula: ['M6 3.5h12v17H6z', 'M9 7.5h6M9 11h6M9 14.5h3', 'M3.5 6h2.5M3.5 11h2.5M3.5 16h2.5'],
  corporate_extortion: [TOWER, 'M8.5 8h2M8.5 12h2M8.5 16h2M16 12.5h1M16 16h1', 'M2.5 20.5h19'],

  // ---------------------------------------------------------------- war
  ambush_soldiers: ['M4.5 4.5 19.5 19.5M19.5 4.5 4.5 19.5', 'M4.5 4.5v4h4M19.5 4.5v4h-4'],
  defend_racket: ['M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6z', 'M9 20.5V13h6v7.5', 'M12 8v3'],
  war_strike: ['M13.5 2.5 5 13.5h6l-1.5 8L18 10.5h-6z', 'M2.5 3.5 5.5 6.5M21.5 3.5 18.5 6.5'],
  raid_rival: ['M4 4.5 14 14.5M4 8.5V4.5h4', 'M20 4.5 10 14.5M20 8.5V4.5h-4', 'M6.5 17 9 19.5M17.5 17 15 19.5', 'M9 19.5l-2.5 2.5M15 19.5l2.5 2.5'],

  // ---------------------------------------------------------------- the wire
  rat: ['M8 4.5a5.5 5.5 0 0 1 5.5 5.5v4.5', 'M4.5 10a3.5 3.5 0 1 1 7 0v5a2.5 2.5 0 0 1-5 0', SIGNAL],
  wire_fraud: ['M3 7.5h12v9H3z', 'M3 11h12', 'M6 14h3', SIGNAL],
  digital_strike: ['M9 3.5v6M15 3.5v6', 'M6 9.5h12v3a6 6 0 0 1-12 0z', 'M12 18.5v3', 'M3 20.5 21 3.5'],
  sim_swap: ['M6 3.5h8l4 4v13H6z', 'M9 11h6v6H9z', 'M12 11v6M9 14h6'],
  crypto_wash: ['M12 3 18.5 7v9L12 20 5.5 16V7z', 'M12 3v17M5.5 7 18.5 16M18.5 7 5.5 16'],
  stream_piracy: ['M3 5.5h18v11H3z', 'M8 21h8', 'M12 16.5v4.5', 'M10 8.5 14.5 11 10 13.5z'],
  betting_app: [PHONE, 'M10.5 19h3', 'M9.5 7.5h5M9.5 11h5M9.5 14.5h3'],

  // ---------------------------------------------------------------- the law, leaned on
  buy_down: ['M12 3.5 19 6.5v5.5c0 4-2.8 6.3-7 7.5-4.2-1.2-7-3.5-7-7.5V6.5z', 'M12 8.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6'],
  spring_crew: ['M3 4h8v16H3z', 'M6 4v16M9 4v16', 'M13 20 16.5 4', 'M17.5 9.5a2.6 2.6 0 1 0 3.7 3.7 2.6 2.6 0 0 0-3.7-3.7', 'M17.8 13 15 15.8l1.4 1.4'],
  buy_case: [DOC, 'M14 3v4h4', 'M8.5 11.5h6M8.5 15h4', 'M16 16.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6'],
  bid_rigging: ['M6 3.5h12v17H6z', 'M9 3.5h6v2.5H9z', 'M9 10h6M9 13.5h6', 'M13.5 19.5 19 14l2.5 2.5-5.5 5.5z'],
  campaign_wash: [BALLOT, 'M9 14.5h6', 'M12 3.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2', 'M12 8.4v2.1', 'M6 5.5a2 2 0 1 0 0 4M18 5.5a2 2 0 1 1 0 4'],
  vote_buying: [BALLOT, 'M6.5 14 8 15.5l2-2.5M11.5 14 13 15.5l2-2.5M16.5 14 18 15.5l2-2.5', 'M8 10.5V6h8v4.5', 'M12 3v3'],
  // ---- the five landmarks: each one drawn as the building it is ----
  count_night: ['M4 6.5h16v11H4z', 'M7.5 10h3M7.5 13h3M13.5 10h3M13.5 13h3', 'M12 4v15'],
  records_room: ['M4 4.5h16v15H4z', 'M4 9.5h16M4 14.5h16', 'M9.5 7h5M9.5 12h5M9.5 17h5'],
  manifest_swap: ['M3 18.5h18', 'M5 18.5V9h6v9.5M13 18.5V12h6v6.5', 'M5 9 8 5.5 11 9', 'M15 15h2'],
  left_luggage: ['M4.5 8.5h15v11h-15z', 'M9 8.5V5.5a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.5v3', 'M4.5 13.5h15'],
  dome_job: ['M4 19.5h16', 'M4.5 19.5a7.5 7.5 0 0 1 15 0', 'M12 4v3', 'M8.5 12.5h7'],

  // ---- the lone-wolf lane: one figure, and nothing behind them ----
  // a single silhouette where the others in this file draw two or three, which is the lane
  ghost_job: ['M12 3.5a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8', 'M5.5 21v-1.5c0-3.2 2.9-5.2 6.5-5.2s6.5 2 6.5 5.2V21', 'M3 12.5h3M18 12.5h3'],
  // one thread, cut, with nothing left hanging off it
  no_loose_ends: ['M4 6.5c5 0 5 11 10 11 3 0 4-1.8 4-3.5', 'M16 4.5 20 8.5M20 4.5 16 8.5', 'M5.5 18.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6'],
};
