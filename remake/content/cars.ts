/**
 * Cars: what is parked on the street at night, what it takes to drive it away, and what a car is
 * worth once it is yours — in pieces, with new plates, or under one of your people. Data, read by
 * `sim/cars.ts`.
 *
 * Until this pass a car was a thing you bought at a garage and hung on somebody as kit. Now the
 * street is full of them: one worth taking on every block each night, a better one where the
 * money lives, and a garage to keep them in until they cool.
 */
import type { ItemId } from './kit';

export type CarModel = 'hatch' | 'pickup' | 'taxi' | 'sedan' | 'coupe' | 'luxury' | 'sports';

/**
 * Each model: what it is worth whole, how hard its locks are (off the odds), the block wealth it is
 * parked at, and the kit it becomes once it has new plates.
 */
export const MODELS: Record<CarModel, { label: string; value: number; lock: number; wealth: [number, number]; keep: ItemId }> = {
  hatch: { label: 'A tired hatchback', value: 1400, lock: 0, wealth: [0, 55], keep: 'beater' },
  pickup: { label: 'A contractor’s pickup', value: 2200, lock: 4, wealth: [0, 70], keep: 'beater' },
  taxi: { label: 'A cab on its break', value: 2600, lock: 6, wealth: [20, 80], keep: 'sedan' },
  sedan: { label: 'A family sedan', value: 3400, lock: 10, wealth: [30, 90], keep: 'sedan' },
  coupe: { label: 'A two-door coupe', value: 5200, lock: 15, wealth: [50, 100], keep: 'motorbike' },
  luxury: { label: 'A banker’s saloon', value: 9000, lock: 22, wealth: [65, 100], keep: 'sedan' },
  sports: { label: 'A sports car', value: 12000, lock: 28, wealth: [75, 100], keep: 'muscle_car' },
};

export const STEAL = {
  /** One hour after dark, on the block. */
  ap: 1,
  /** The odds: a base, plus wheels and tech (kit counts), less the lock and the precinct's eye. */
  base: 50, perWheels: 5, perTech: 3, perPolice: 0.25,
  /** Heat when it goes right, and when it does not; and the chance a failed try becomes a file. At
   *  5 heat and 30% a file, two or three cars a run convicted the ruthless bot and the maniac. */
  heatOk: 2, heatFail: 4, caseChance: 0.15, caseEvidence: 10,
  /** Days a stolen car stays hot: somebody is looking for it. Each hot car costs heat every day. */
  hotDays: 5, hotHeat: 0.3,
};

/** Room for cars: one on the street, two more per safehouse tier. */
export const GARAGE = { street: 1, perTier: 2 };

/**
 * What a car is worth once it is yours:
 * - chopped, for dirty money: at your own chop shop, or through a scrapyard that is not yours;
 * - resprayed at a garage you own or protect: the car cools, and can be kept as kit or sold clean.
 */
export const CHOP = { yours: 0.55, fence: 0.3 };
export const RESPRAY = { cost: 400, ap: 1 };
export const SELL = { clean: 0.45 };

/**
 * A car on the job: a failed job's arrest chance, per crew member, falls this much per point of
 * the best car bonus in the crew (yours included, if you went). Three points of car is about a third.
 */
export const GETAWAY = { perBonus: 0.12 };
/** A fast car on a delivery: loads are taken this much less often with car bonus 2 or more. */
export const FAST_DRIVER = 0.75;
