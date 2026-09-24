/**
 * Fights: the numbers. Read by `sim/fights.ts`.
 *
 * A fight is three rounds. Each side's power is the sum of its people — muscle (with what they
 * carry), a gun if there are bullets for it — rolled up or down a quarter each round. The side that
 * wins a round puts somebody on the other side down; best of three wins the fight. Armour turns a
 * blow aside; guns make a blow likelier to kill.
 */
import type { ItemId } from './kit';

export const GUNS: ItemId[] = ['revolver', 'pistol', 'sawnoff', 'rifle', 'smg'];

export const FIGHT = {
  rounds: 3,
  /** Per person: a base, plus this much per point of muscle (kit included). */
  base: 20, perMuscle: 6,
  /** A gun with bullets behind it. */
  gun: 25,
  /** Bullets a gunman goes through in a round; without them the gun is something to swing. */
  bulletsPerRound: 3,
  /** Each round's roll: power × (1 ± swing). */
  swing: 0.25,
  /** A blow that lands: out this many days; killed at this chance when the other side has guns. */
  hurt: [3, 7] as [number, number], deadly: 0.12,
  /** You are never killed in a street fight; you are hurt, for longer. */
  youHurt: [4, 8] as [number, number],
};

/**
 * A rival's soldier, and how many of them stand on a block they hold: their soldiers spread over
 * their blocks, times `perBlock`. The first cut (42 each, ×2, up to 7) gave five of your hardest
 * people 1% against a full block; now five good fighters against a full, armed block is about even.
 */
export const SOLDIER = { power: 36, armed: 14, armedCash: 20000, perBlock: 1.2, minOnBlock: 2, maxOnBlock: 6 };

/** Taking it to them: two hours after dark, standing on their block. */
export const ATTACK = { ap: 2, maxCrew: 5, win: { influence: 12, theirInfluence: -15, fear: 4, respect: 2, standing: -15, heat: 6 }, lose: { fear: -2, respect: -2, standing: -8, heat: 4 }, gunHeat: 4 };

/** Bullets: sold wherever a gun is, and by the fixer. */
export const BULLETS = { price: 6, packs: [25, 100] };

/** Hurt: fewer hours while you mend, and a doctor who does not ask, through the fixer. */
export const HURT = { hoursLost: 3, minHours: 3, doctor: 1200 };
