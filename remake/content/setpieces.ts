/**
 * Landmark set-pieces: the jobs a city has exactly one of. Each is matched to a landmark by name,
 * runs in stages (a complication at every one), and some do something no ordinary job can — the
 * evidence locker under the courthouse is the only way to make paper on you disappear in bulk.
 * Offered only to somebody the street already takes seriously (rank Made and up).
 */
import type { Skill } from '@r/sim/types';

export type SetPieceEffect = 'none' | 'evidence' | 'sacrilege' | 'police' | 'records';
export interface SetPieceDef {
  id: string;
  match: RegExp;
  title: string;
  pitch: string;
  leans: Skill[];
  stages: 2 | 3;
  difficulty: number;
  payout: { dirty: [number, number]; clean: [number, number]; goods: [number, number] };
  heat: number;
  respect: number;
  fear: number;
  effect: SetPieceEffect;
}

export const SETPIECES: SetPieceDef[] = [
  { id: 'derby', match: /racetrack/i, title: 'Derby day at {L}', pitch: 'On derby day the count room at {L} holds a year of small bets in one night. Three doors, two guards, one armoured truck at midnight.', leans: ['brains', 'wheels', 'muscle', 'tech'], stages: 3, difficulty: 72, payout: { dirty: [60000, 110000], clean: [0, 0], goods: [0, 0] }, heat: 28, respect: 14, fear: 4, effect: 'none' },
  { id: 'mailcar', match: /terminal|tram depot/i, title: 'The mail car at {L}', pitch: 'The overnight train carries registered mail — bonds, cash, a jeweller\'s consignment — and it sits at {L} for forty minutes.', leans: ['wheels', 'brains', 'tech'], stages: 3, difficulty: 66, payout: { dirty: [25000, 45000], clean: [0, 0], goods: [40, 70] }, heat: 24, respect: 12, fear: 2, effect: 'none' },
  { id: 'penthouse', match: /hotel/i, title: 'The penthouse safe at {L}', pitch: 'A visiting financier keeps his wife\'s jewellery and a great deal of cash in the penthouse safe at {L}. The staff can be bought; the lift cannot.', leans: ['charm', 'brains', 'tech'], stages: 3, difficulty: 64, payout: { dirty: [30000, 55000], clean: [0, 0], goods: [25, 45] }, heat: 20, respect: 12, fear: 0, effect: 'none' },
  { id: 'payroll', match: /stadium/i, title: 'Payroll night at {L}', pitch: 'Every stall, gate and turnstile at {L} is paid in cash the night after a home game. It comes in one van.', leans: ['muscle', 'wheels', 'brains'], stages: 3, difficulty: 68, payout: { dirty: [55000, 90000], clean: [0, 0], goods: [0, 0] }, heat: 30, respect: 10, fear: 8, effect: 'none' },
  { id: 'gala', match: /opera/i, title: 'The gala at {L}', pitch: 'Half the money in the city wears it to the gala at {L}. The cloakroom is the vault nobody guards.', leans: ['charm', 'brains', 'tech'], stages: 3, difficulty: 62, payout: { dirty: [10000, 20000], clean: [0, 0], goods: [70, 110] }, heat: 18, respect: 16, fear: 0, effect: 'none' },
  { id: 'reliquary', match: /cathedral/i, title: 'The reliquary at {L}', pitch: 'Gold, stones and a saint\'s finger bone in the crypt at {L}. Worth a fortune to the right collector. Nobody on the street will forgive you.', leans: ['brains', 'tech', 'wheels'], stages: 2, difficulty: 55, payout: { dirty: [0, 0], clean: [0, 0], goods: [80, 130] }, heat: 22, respect: -8, fear: 10, effect: 'sacrilege' },
  { id: 'locker', match: /courthouse/i, title: 'The evidence locker under {L}', pitch: 'Every file the city has on you ends up in a cage in the basement of {L}. A fire in the right room and a lot of paper stops existing.', leans: ['brains', 'charm', 'tech'], stages: 2, difficulty: 70, payout: { dirty: [0, 0], clean: [0, 0], goods: [0, 0] }, heat: 20, respect: 10, fear: 6, effect: 'evidence' },
  { id: 'property', match: /station house/i, title: 'The property room at {L}', pitch: 'Everything the police ever took off anybody sits in the property room at {L}: cash, guns, product. Inventory is done once a year.', leans: ['charm', 'brains', 'muscle'], stages: 3, difficulty: 74, payout: { dirty: [20000, 40000], clean: [0, 0], goods: [40, 70] }, heat: 34, respect: 16, fear: 10, effect: 'police' },
  { id: 'records', match: /city hall/i, title: 'The records room at {L}', pitch: 'Deeds, bonds and a clerk who files what he is told to. Walk out of {L} owning things on paper that you never paid for.', leans: ['brains', 'charm', 'tech'], stages: 2, difficulty: 60, payout: { dirty: [0, 0], clean: [35000, 60000], goods: [0, 0] }, heat: 14, respect: 12, fear: 0, effect: 'records' },
  // the original's landmark jobs a Remake city has somewhere to put: its port manifest (the pier or
  // the fish market) and its observatory dome (the clock tower or the lighthouse — the original's
  // observatory is not a landmark the Remake generates)
  { id: 'manifest', match: /ferry pier|fish market/i, title: 'The manifest at {L}', pitch: 'Every crate through {L} is on one piece of paper, and the paper says which box is which. Change the paper and a container walks.', leans: ['brains', 'tech', 'wheels'], stages: 2, difficulty: 60, payout: { dirty: [0, 0], clean: [0, 0], goods: [60, 110] }, heat: 18, respect: 10, fear: 0, effect: 'none' },
  { id: 'dome', match: /clock tower|lighthouse/i, title: 'Under the dome at {L}', pitch: 'Nobody has climbed {L} in sixty years, and nobody has opened what somebody hid at the top of it either.', leans: ['tech', 'brains', 'muscle'], stages: 3, difficulty: 72, payout: { dirty: [0, 0], clean: [0, 0], goods: [80, 140] }, heat: 24, respect: 14, fear: 2, effect: 'none' },
  { id: 'strongroom', match: /./, title: 'The strongroom under {L}', pitch: 'There is a strongroom under {L} that has not been opened since the war. Somebody has been using it since.', leans: ['brains', 'tech', 'muscle'], stages: 2, difficulty: 58, payout: { dirty: [25000, 50000], clean: [0, 0], goods: [10, 30] }, heat: 18, respect: 8, fear: 2, effect: 'none' },
];

/** Which set-piece a landmark carries. Parks carry none. */
export function setpieceFor(landmark: string | undefined): SetPieceDef | undefined {
  if (!landmark || /Park|Gardens|Common|Green|Fields/.test(landmark)) return undefined;
  return SETPIECES.find(s => s.match.test(landmark));
}
export const SETPIECE_RANK = 75;
