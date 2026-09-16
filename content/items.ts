/**
 * Kit: what the player personally carries. A layer alongside the product Stash, not a
 * replacement for it — the stash is bulk goods you sell by the unit, this is equipment you
 * own, carry, and take on a job.
 *
 * Every item is a tradeoff, never a flat upgrade. A sawn-off makes a loud job far better and
 * a quiet one much worse; lockpicks do the opposite; a car gets you away from both. The
 * numbers below are the whole of an item's effect — `sim/items.ts` reads them and nothing
 * else invents behaviour per item.
 */
import type { OpApproach } from './rackets';
import type { Skills } from '@sim/types';

export type ItemCategory = 'weapon' | 'tool' | 'tech' | 'vehicle' | 'armor';

export interface ItemMods {
  /** Added to the crew's skill total on an op, as if somebody brought an extra pair of hands. */
  skillBoost?: Partial<Skills>;
  /** Per approach: how much it scales that approach's skill weights. +0.3 is a third better, −0.2 a fifth worse. */
  approachBias?: Partial<Record<OpApproach, number>>;
  /** Multiplies the heat an op leaves behind, the same way an approach does. */
  heatMult?: number;
  /**
   * How much harder this makes you to reach **personally** — added to `personalCover`, which is
   * the one place the game subtracts a defence before deciding what a man who came for you got.
   *
   * Read by `sim/legacy.ts` and by nothing else. A job has no use for it: armour does not make a
   * shakedown go better or a burglary quieter, and it must never be given an `approachBias` or a
   * `heatMult` to sneak that in. What it costs is a carry slot, and on the heavy end a real
   * `skillBoost` penalty — see the plate carrier.
   */
  cover?: number;
}

/** Weapons group into families that climb their own ladder. Cosmetic: it groups the shelf. */
export type ItemFamily = 'melee' | 'pistol' | 'revolver' | 'shotgun' | 'rifle' | 'explosive' | 'vest';

export interface ItemDef {
  id: string;
  label: string;
  icon: string;
  category: ItemCategory;
  family?: ItemFamily;
  cost: number;          // what a market asks, in clean cash
  blurb: string;         // one line, on the row
  detail: string;        // what it actually does, for the explainer
  mods: ItemMods;
  /** Only the back rooms will touch it; a pawn shop will not have it on the shelf. */
  underCounter?: boolean;
}

/** How much of your kit you can carry at once. Everything else is at home. */
export const EQUIP_MAX = 3;
/** What a market pays for a used one, before the haggling your charm does. */
export const RESALE = 0.5;

export const ITEM_DEFS: Record<string, ItemDef> = {
  // ---- melee: cheap, deniable, and nobody can prove what it was for ----
  // The spread inside this family is the *approach* it suits, not how hard it hits. Two of these
  // help a quiet job, which no gun in the catalogue does at any price.
  knuckles: {
    id: 'knuckles', label: 'Knuckledusters', icon: '👊', category: 'weapon', family: 'melee', cost: 40,
    blurb: 'Fits in a coat pocket.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.08, quiet: -0.04 } },
    detail: 'Muscle +1 and almost no extra heat. The cheapest way to stop being the smaller man in the room.',
  },
  tire_iron: {
    id: 'tire_iron', label: 'Tire Iron', icon: '🔧', category: 'weapon', family: 'melee', cost: 55,
    blurb: 'It came with the car. That is the point of it.',
    mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.1, quiet: 0.04 }, heatMult: 0.95 },
    detail: 'Muscle +1, and the only thing in the weapon rack that helps a quiet job: it opens a door as readily as a head, and a man carrying one is a man with a flat tyre. Leaves slightly less behind than going empty-handed.',
  },
  bat: {
    id: 'bat', label: 'Louisville Slugger', icon: '🏏', category: 'weapon', family: 'melee', cost: 90,
    blurb: 'Nobody can prove what it is for.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.12, quiet: -0.08 }, heatMult: 1.05 },
    detail: 'Muscle +1. Loud jobs go a little better, quiet ones a little worse. Barely raises heat — it is a bat until you swing it.',
  },
  razor: {
    id: 'razor', label: 'Straight Razor', icon: '✂️', category: 'weapon', family: 'melee', cost: 140,
    blurb: 'Folds into nothing. Frightens out of all proportion.',
    mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.05, quiet: 0.18, inside: 0.1 }, heatMult: 0.9 },
    detail: 'Muscle +1, and the best quiet-work weapon there is — it makes no noise, takes no room, and nobody searching you finds it. Useless for clearing a room, which is what the rest of this rack is for.',
  },
  machete: {
    id: 'machete', label: 'Machete', icon: '🔪', category: 'weapon', family: 'melee', cost: 260, underCounter: true,
    blurb: 'Ends a conversation without a bang.', mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.2, quiet: -0.12 }, heatMult: 1.15 },
    detail: 'Muscle +2 and the top of what you can carry without it being a firearm. Frightening out of all proportion to the price.',
  },

  // ---- pistols: the same job at four prices, and each pays for itself somewhere different ----
  beretta92: {
    id: 'beretta92', label: 'Beretta 92', icon: '🔫', category: 'weapon', family: 'pistol', cost: 640, underCounter: true,
    blurb: 'Cheap, everywhere, and the size of a house brick.',
    mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.26, quiet: -0.3 }, heatMult: 1.28 },
    detail: 'Muscle +2 for less than anything else that shoots. The trade is the size of it: there is no carrying this quietly, and a quiet job with one under your coat goes worse than with any other pistol.',
  },
  glock19: {
    id: 'glock19', label: 'Glock 19', icon: '🔫', category: 'weapon', family: 'pistol', cost: 820, underCounter: true,
    blurb: 'The one everybody has, for the reason everybody has it.',
    mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.28, quiet: -0.18 }, heatMult: 1.2 },
    detail: 'Muscle +2 and the lightest penalty of any pistol on a careful job. Nothing about it is the best; nothing about it is a problem either.',
  },
  sig226: {
    id: 'sig226', label: 'SIG P226', icon: '🔫', category: 'weapon', family: 'pistol', cost: 1400, underCounter: true,
    blurb: 'Heavier, steadier, and it shows.',
    mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.34, quiet: -0.24 }, heatMult: 1.34 },
    detail: 'Muscle +3 — the hardest-hitting thing in the family — and the most expensive to be seen with: every job leaves a third more heat. A serious weapon that looks like one in an evidence photograph.',
  },
  ruger_mk: {
    id: 'ruger_mk', label: 'Suppressed .22', icon: '🔇', category: 'weapon', family: 'pistol', cost: 3200, underCounter: true,
    blurb: 'The only gun worth taking on a quiet job.', mods: { skillBoost: { muscle: 2, tech: 1 }, approachBias: { loud: 0.15, quiet: 0.2, inside: 0.1 }, heatMult: 0.8 },
    detail: 'Muscle +2, tech +1, and the exception to the rule: it helps a quiet job as much as a loud one, and cuts the heat a job leaves by a fifth. Expensive for the reason you would expect.',
  },

  // ---- revolvers: nothing to leave behind at the scene, and everybody knows it ----
  snubnose: {
    id: 'snubnose', label: 'Snubnose .38', icon: '🔫', category: 'weapon', family: 'revolver', cost: 700, underCounter: true,
    blurb: 'Five, and it disappears into a pocket.',
    mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.22, quiet: -0.1 }, heatMult: 1.1 },
    detail: 'Muscle +2. Weaker than any automatic and much easier to have on you: the smallest quiet-job penalty and the least heat of anything that shoots, because it leaves nothing on the floor to find.',
  },
  python: {
    id: 'python', label: 'Magnum Revolver', icon: '🔫', category: 'weapon', family: 'revolver', cost: 1500, underCounter: true,
    blurb: 'Six that go through a car door.', mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.36, quiet: -0.26 }, heatMult: 1.35 },
    detail: 'Muscle +3. Hits harder than any pistol in every way, including how loudly the police hear about it.',
  },

  // ---- shotguns: the loud lane, and how much you are willing to spend to be less obvious in it ----
  shockwave: {
    id: 'shockwave', label: 'Mossberg Shockwave', icon: '💥', category: 'weapon', family: 'shotgun', cost: 1900, underCounter: true,
    blurb: 'Barely a shotgun. Still a shotgun.',
    mods: { skillBoost: { muscle: 2 }, approachBias: { loud: 0.44, quiet: -0.28 }, heatMult: 1.35 },
    detail: 'Muscle +2 and most of a sawn-off\'s effect on a loud job for two-thirds of the price and noticeably less heat. The cheapest way into this lane.',
  },
  sawnoff: {
    id: 'sawnoff', label: 'Sawn-Off', icon: '💥', category: 'weapon', family: 'shotgun', cost: 2600, underCounter: true,
    blurb: 'For when the point needs making once.', mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.5, quiet: -0.35 }, heatMult: 1.5 },
    detail: 'Muscle +3 and one of the best there is on a loud job. A quiet job with this under your coat is barely worth attempting, and the police remember the ones that go wrong.',
  },
  rem870: {
    id: 'rem870', label: 'Remington 870', icon: '🔫', category: 'weapon', family: 'shotgun', cost: 3600, underCounter: true,
    blurb: 'The sound alone clears a room.', mods: { skillBoost: { muscle: 4 }, approachBias: { loud: 0.6, quiet: -0.45 }, heatMult: 1.65 },
    detail: 'Muscle +4 and the best loud weapon in the catalogue. Also the surest way to turn a quiet plan into a disaster and a job into a manhunt.',
  },
  benelli: {
    id: 'benelli', label: 'Benelli M4', icon: '💥', category: 'weapon', family: 'shotgun', cost: 5200, underCounter: true,
    blurb: 'A serious weapon rather than a statement.',
    mods: { skillBoost: { muscle: 4, wheels: 1 }, approachBias: { loud: 0.58, quiet: -0.34 }, heatMult: 1.45 },
    detail: 'Muscle +4 and wheels +1. Nearly the 870\'s effect on a loud job while leaving a fifth less heat and doing far less damage to a careful one — you are paying the difference to be a professional rather than a headline.',
  },

  // ---- rifles: reach. The bolt gun is the only one that buys you not being in the room ----
  sks: {
    id: 'sks', label: 'SKS', icon: '🎯', category: 'weapon', family: 'rifle', cost: 1700, underCounter: true,
    blurb: 'Surplus. Wood, steel, and no questions.',
    mods: { skillBoost: { muscle: 3 }, approachBias: { loud: 0.4, quiet: -0.3 }, heatMult: 1.5 },
    detail: 'Muscle +3 for a third of a hunting rifle\'s price, and none of its finesse: no help at all on an inside job, a worse quiet penalty, and more heat. What you buy when you need reach this week.',
  },
  rem700: {
    id: 'rem700', label: 'Hunting Rifle', icon: '🎯', category: 'weapon', family: 'rifle', cost: 4400, underCounter: true,
    blurb: 'Reach. You do not have to be close.', mods: { skillBoost: { muscle: 3, brains: 1 }, approachBias: { loud: 0.42, quiet: -0.18, inside: 0.15 }, heatMult: 1.4 },
    detail: 'Muscle +3, brains +1. Nearly as good as a shotgun on a loud job and far less of a liability on a careful one, because the work happens from somewhere else.',
  },
  ar15: {
    id: 'ar15', label: 'AR-15', icon: '🎯', category: 'weapon', family: 'rifle', cost: 5600, underCounter: true,
    blurb: 'The loudest thing you can carry that is not a bomb.',
    mods: { skillBoost: { muscle: 4, brains: 1 }, approachBias: { loud: 0.52, quiet: -0.3 }, heatMult: 1.75 },
    detail: 'Muscle +4, brains +1, and the heaviest weapon here short of an explosive. Every job leaves three-quarters more heat: this is not a thing anybody mistakes for a robbery afterwards.',
  },

  // ---- explosives: cheap chaos, and the heat to match ----
  molotov: {
    id: 'molotov', label: 'Molotov', icon: '🔥', category: 'weapon', family: 'explosive', cost: 70,
    blurb: 'A bottle, a rag, and a decision.', mods: { skillBoost: { muscle: 1 }, approachBias: { loud: 0.28, quiet: -0.3 }, heatMult: 1.7 },
    detail: 'Loud jobs go a quarter better for almost nothing, but a fire is the loudest thing you can do: every job leaves 70% more heat.',
  },
  pipebomb: {
    id: 'pipebomb', label: 'Pipe Bomb', icon: '💣', category: 'weapon', family: 'explosive', cost: 1300, underCounter: true,
    blurb: 'Somebody has to build it. Carefully.', mods: { skillBoost: { muscle: 2, tech: 1 }, approachBias: { loud: 0.45, quiet: -0.38 }, heatMult: 1.9 },
    detail: 'Muscle +2, tech +1, and a loud job goes far better. It also doubles what the job leaves behind: the police treat a bomb as a different kind of crime, because it is.',
  },

  // ---- armour: the only thing here that does nothing for a job ----
  // `cover` is read by `personalCover` and by nothing else. These do not help you rob anywhere;
  // they are what is between you and a man who has decided to come for you at home.
  vest: {
    id: 'vest', label: 'Concealable Vest', icon: '🎽', category: 'armor', family: 'vest', cost: 1100,
    blurb: 'Under a shirt. Nobody knows you are wearing it.',
    mods: { cover: 14 },
    detail: 'Makes you meaningfully harder to reach on the night somebody tries, and costs you nothing else at all except one of the three things you can carry. It does not help you on a single job, ever.',
  },
  kevlar_jacket: {
    id: 'kevlar_jacket', label: 'Armoured Jacket', icon: '👕', category: 'armor', family: 'vest', cost: 2200,
    blurb: 'Heavier than it looks, and it looks heavy.',
    mods: { cover: 20, skillBoost: { wheels: -1 } },
    detail: 'More between you and them than a vest, at the price of moving like a man wearing one: wheels −1 on every job you take it on. Leave it at home for the work and put it on for the walk to the car.',
  },
  plate_carrier: {
    id: 'plate_carrier', label: 'Plate Carrier', icon: '⛑️', category: 'armor', family: 'vest', cost: 3400, underCounter: true,
    blurb: 'Rifle plates. You will not be running anywhere.',
    mods: { cover: 30, skillBoost: { wheels: -3, muscle: 1 } },
    detail: 'The most protection there is, and it is not subtle: wheels −3, so every job that involves getting away goes worse for having it on. Muscle +1, for whatever that is worth to a man who cannot run.',
  },

  // ---- the two things you can only buy in one building ----
  // Not a tier above the catalogue, and deliberately not the best of anything: what they are is
  // *only there*. A landmark had one reason to exist — its op — and an op you can pull once every
  // few weeks is a thin reason to know a building. These give two of the five a counter.
  port_pass: {
    id: 'port_pass', label: 'Dock Gate Pass', icon: '📋', category: 'tech', cost: 2600, underCounter: true,
    blurb: 'Somebody else’s photograph, and nobody has ever looked at it.',
    mods: { skillBoost: { charm: 1 }, approachBias: { inside: 0.4, loud: -0.3 }, heatMult: 0.85 },
    detail: 'The best inside-job item in the game that is not a person: +40% on going in as somebody who belongs, and it takes heat off because a man who walked through the gate was never seen climbing a fence. Useless in a fight, and worse than useless going in loud. Sold at the Port Authority and nowhere else in the city.',
  },
  locker_key: {
    id: 'locker_key', label: 'Left-Luggage Key', icon: '🔑', category: 'tool', cost: 1400,
    blurb: 'It fits more lockers than it has any business fitting.',
    mods: { approachBias: { quiet: 0.3, loud: -0.2 }, heatMult: 0.75 },
    detail: 'The lowest heat of anything you can carry: a thing that never went home with you is a thing nobody found on you. +30% on a quiet job, and it makes every job leave a quarter less behind. It helps you carry nothing rather than helping you do anything. Sold at Union Station and nowhere else.',
  },

  // ---- tools ----
  lockpicks: {
    id: 'lockpicks', label: 'Lockpick Set', icon: '🗝️', category: 'tool', cost: 400,
    blurb: 'Doors stop being doors.', mods: { skillBoost: { tech: 1 }, approachBias: { quiet: 0.35, loud: -0.15 }, heatMult: 0.9 },
    detail: 'Tech +1. Quiet jobs go a third better and loud ones slightly worse, and a job done through the lock leaves less behind.',
  },
  relay_box: {
    id: 'relay_box', label: 'Relay Box', icon: '📻', category: 'tool', cost: 2200, underCounter: true,
    blurb: 'A grey case that makes a car think you are its owner.',
    mods: { skillBoost: { tech: 1, wheels: 2 }, approachBias: { quiet: 0.3, loud: -0.25 }, heatMult: 0.85 },
    detail: 'Wheels +2, tech +1. Quiet work goes far better and loud work worse, and a car taken this way leaves 15% less behind. The back rooms only.',
  },

  // ---- tech: also the groundwork for what comes after ----
  burner: {
    id: 'burner', label: 'Burner Phone', icon: '📱', category: 'tech', cost: 120,
    blurb: 'A number nobody has had before.', mods: { skillBoost: { brains: 1 }, approachBias: { quiet: 0.1, inside: 0.15 }, heatMult: 0.85 },
    detail: 'Brains +1, and an inside job runs smoother when nobody can tie the calls to you. Cuts the heat a job leaves by 15%.',
  },
  laptop: {
    id: 'laptop', label: 'Laptop', icon: '💻', category: 'tech', cost: 1800,
    blurb: 'Somebody else\'s books, open on your table.', mods: { skillBoost: { brains: 1, tech: 2 }, approachBias: { quiet: 0.2, inside: 0.1 }, heatMult: 0.95 },
    detail: 'Brains +1, tech +2. Quiet jobs go a fifth better. Worth having before you ever touch a keyboard in anger.',
  },
  signal_fob: {
    id: 'signal_fob', label: 'Signal Fob', icon: '🔑', category: 'tech', cost: 760,
    blurb: 'It has heard every fob on the street and remembers them.',
    mods: { skillBoost: { tech: 2 }, approachBias: { quiet: 0.28, inside: 0.18, loud: -0.14 }, heatMult: 0.88 },
    detail: 'Tech +2. Gates, tills, barriers and car fobs all talk to it, so a quiet job goes a quarter better and an inside one a fifth. Useless in a fight, and a job done this way leaves 12% less behind.',
  },
  hotspot: {
    id: 'hotspot', label: 'Rogue Hotspot', icon: '📡', category: 'tech', cost: 1450,
    blurb: 'A box that pretends to be the café\'s wifi.',
    mods: { skillBoost: { brains: 1, tech: 2 }, approachBias: { inside: 0.32, quiet: 0.12, loud: -0.2 }, heatMult: 0.9 },
    detail: 'Brains +1, tech +2, and the best thing in the catalogue for an inside job: people hand you their own credentials and never know they did. Carry it on a loud job and it is a box in your bag.',
  },
  tower: {
    id: 'tower', label: 'Desktop Tower', icon: '🖥️', category: 'tech', cost: 4200,
    blurb: 'Not portable. Not meant to be.',
    mods: { skillBoost: { brains: 2, tech: 4 }, approachBias: { loud: -0.3, quiet: -0.08, inside: 0.05 }, heatMult: 0.9 },
    detail: 'Brains +2, tech +4 — more raw tech than anything else you can own, and what the whole wire lane is measured against. The catch is that it is a tower: a job you walk to goes worse for carrying it, badly so if you go in loud. Work that happens at a desk does not care.',
  },
  skimmer: {
    id: 'skimmer', label: 'Card Skimmer', icon: '💳', category: 'tech', cost: 2400, underCounter: true,
    blurb: 'Sits over the real slot. Nobody looks twice.',
    mods: { skillBoost: { brains: 1, tech: 2 }, approachBias: { inside: 0.26, quiet: 0.14, loud: -0.18 }, heatMult: 1.2 },
    detail: 'Brains +1, tech +2 and strong on an inside job. The one piece of tech that makes things *worse* with the law: holding it is a charge on its own, so every job leaves a fifth more heat. Back rooms only — no shop with a sign over the door will sell you one.',
  },

  // ---- vehicles: four shapes of getting there and getting away ----
  motorcycle: {
    id: 'motorcycle', label: 'Motorcycle', icon: '🏍️', category: 'vehicle', cost: 1800,
    blurb: 'Through the gap the car cannot take.',
    mods: { skillBoost: { wheels: 3 }, approachBias: { loud: 0.22, quiet: 0.02 }, heatMult: 0.95 },
    detail: 'Wheels +3 — more raw speed than anything else here — and room for nobody and nothing. Good for arriving and better for leaving; no use at all to a job that needs a boot.',
  },
  sedan: {
    id: 'sedan', label: 'Grey Sedan', icon: '🚗', category: 'vehicle', cost: 2400,
    blurb: 'The car nobody can describe an hour later.',
    mods: { skillBoost: { wheels: 2 }, approachBias: { quiet: 0.15, loud: 0.1, inside: 0.05 }, heatMult: 0.85 },
    detail: 'Wheels +2 and the only vehicle that genuinely helps a careful job: it is four doors of nothing, and the witness who saw it cannot tell anybody what they saw. Leaves 15% less heat.',
  },
  van: {
    id: 'van', label: 'Panel Van', icon: '🚐', category: 'vehicle', cost: 3200,
    blurb: 'A room with wheels, and no windows in the back.',
    mods: { skillBoost: { wheels: 1, muscle: 1 }, approachBias: { inside: 0.2, quiet: 0.22, loud: 0.12 }, heatMult: 0.8 },
    detail: 'Wheels +1 only — it is slow and it corners like a shed — but it carries people and what you took, which is why it is the best vehicle in the catalogue for quiet and inside work, and the one that leaves the least behind.',
  },
  muscle_car: {
    id: 'muscle_car', label: 'Muscle Car', icon: '🚙', category: 'vehicle', cost: 5800,
    blurb: 'Everybody on the street hears you leave.',
    mods: { skillBoost: { wheels: 4 }, approachBias: { loud: 0.34, quiet: -0.12 }, heatMult: 1.15 },
    detail: 'Wheels +4 and the best loud getaway there is: nothing catches it. It is also the one car here that makes a careful job worse and raises the heat — three people will give the same description and all three will be right.',
  },
};

export const ITEM_IDS = Object.keys(ITEM_DEFS);
export const CATEGORY_LABELS: Record<ItemCategory, string> = { weapon: 'Weapon', tool: 'Tool', tech: 'Tech', vehicle: 'Vehicle', armor: 'Armour' };
export const FAMILY_LABELS: Record<ItemFamily, string> = {
  melee: 'Melee', pistol: 'Pistol', revolver: 'Revolver', shotgun: 'Shotgun',
  rifle: 'Rifle', explosive: 'Explosive', vest: 'Body armour',
};
