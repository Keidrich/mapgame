/**
 * Kit: what somebody carries. Owned by the outfit, carried by a person — you, or one of your crew —
 * one item a slot. Each item adds to one skill for whoever carries it, and armour takes the edge off
 * whatever a bad night does to them.
 *
 * Bought where it would really be bought: knuckles at a pawn shop, a scanner at a phone shop, a car
 * at a garage, a suit at a boutique — and the heavy things only through the fixer's back room.
 * The first release gave the whole outfit one "weapons level"; a gunman and the bookkeeper beside
 * him were equally armed, which is not a crime story.
 */
import type { BusinessType, Skill } from '@r/sim/types';

export type Slot = 'weapon' | 'armour' | 'tool' | 'tech' | 'car' | 'look';
export const SLOTS_ORDER: Slot[] = ['weapon', 'armour', 'tool', 'tech', 'car', 'look'];
export const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', armour: 'Armour', tool: 'Tools', tech: 'Tech', car: 'Car', look: 'Look' };

export interface ItemDef {
  label: string;
  slot: Slot;
  /** The skill it adds to, and by how much. */
  skill?: Skill;
  bonus: number;
  /** Share of injury (and a shot that would kill) it turns aside, 0..1. */
  armour?: number;
  price: number;
  tier: 1 | 2 | 3 | 4;
  icon: string;
  blurb: string;
  /** Business types that sell it. `fixer` means the fixer's back room. */
  sold: (BusinessType | 'fixer')[];
}

export type ItemId =
  | 'knuckles' | 'bat' | 'switchblade' | 'revolver' | 'pistol' | 'sawnoff' | 'rifle' | 'smg'
  | 'jacket' | 'stab_vest' | 'kevlar' | 'plates'
  | 'crowbar' | 'lockpicks' | 'drill' | 'stethoscope' | 'lance'
  | 'scanner' | 'burner' | 'jammer' | 'laptop' | 'relay'
  | 'beater' | 'sedan' | 'motorbike' | 'muscle_car' | 'armoured_van'
  | 'suit' | 'tailored' | 'uniform';

export const ITEMS: Record<ItemId, ItemDef> = {
  knuckles:     { label: 'Brass knuckles', slot: 'weapon', skill: 'muscle', bonus: 1, price: 150, tier: 1, icon: 'knuckles', blurb: 'Fits in a pocket, ends an argument.', sold: ['pawn', 'gym'] },
  bat:          { label: 'Baseball bat', slot: 'weapon', skill: 'muscle', bonus: 1, price: 90, tier: 1, icon: 'bat', blurb: 'Nobody asks why you are carrying a bat. That is the point of a bat.', sold: ['gym', 'corner_store'] },
  switchblade:  { label: 'Switchblade', slot: 'weapon', skill: 'muscle', bonus: 1, price: 220, tier: 1, icon: 'razor', blurb: 'Quiet, and quicker than it looks.', sold: ['pawn'] },
  revolver:     { label: 'Revolver', slot: 'weapon', skill: 'muscle', bonus: 2, price: 1100, tier: 2, icon: 'revolver', blurb: 'Six, and it never jams.', sold: ['pawn'] },
  pistol:       { label: 'Pistol', slot: 'weapon', skill: 'muscle', bonus: 2, price: 1500, tier: 2, icon: 'pistol', blurb: 'The working gun. Serial number already gone.', sold: ['pawn', 'fixer'] },
  sawnoff:      { label: 'Sawn-off shotgun', slot: 'weapon', skill: 'muscle', bonus: 3, price: 3200, tier: 3, icon: 'sawnoff', blurb: 'Everybody in the room stops arguing.', sold: ['fixer'] },
  rifle:        { label: 'Hunting rifle', slot: 'weapon', skill: 'muscle', bonus: 3, price: 3800, tier: 3, icon: 'rifle', blurb: 'For when the job is a long way off.', sold: ['fixer'] },
  smg:          { label: 'Submachine gun', slot: 'weapon', skill: 'muscle', bonus: 4, price: 9000, tier: 4, icon: 'pump', blurb: 'The loudest thing you can own. The police think so too.', sold: ['fixer'] },
  jacket:       { label: 'Leather jacket', slot: 'armour', bonus: 0, armour: 0.1, price: 350, tier: 1, icon: 'kevlar_jacket', blurb: 'Stops a little. Looks like it stops more.', sold: ['boutique'] },
  stab_vest:    { label: 'Stab vest', slot: 'armour', bonus: 0, armour: 0.25, price: 1300, tier: 2, icon: 'vest', blurb: 'Knives, broken bottles, a bad night outside a bar.', sold: ['pawn', 'warehouse'] },
  kevlar:       { label: 'Kevlar vest', slot: 'armour', bonus: 0, armour: 0.45, price: 4200, tier: 3, icon: 'vest', blurb: 'Under a coat, nobody knows.', sold: ['fixer'] },
  plates:       { label: 'Plate carrier', slot: 'armour', bonus: 0, armour: 0.6, price: 9500, tier: 4, icon: 'plate_carrier', blurb: 'Heavy, hot, and the reason you are still alive.', sold: ['fixer'] },
  crowbar:      { label: 'Crowbar', slot: 'tool', skill: 'brains', bonus: 1, price: 60, tier: 1, icon: 'tire_iron', blurb: 'Most doors are politer than they look.', sold: ['garage', 'scrapyard', 'corner_store'] },
  lockpicks:    { label: 'Lockpicks', slot: 'tool', skill: 'brains', bonus: 1, price: 300, tier: 1, icon: 'lockpicks', blurb: 'Quieter than the crowbar.', sold: ['pawn'] },
  drill:        { label: 'Drill and torch', slot: 'tool', skill: 'brains', bonus: 2, price: 1400, tier: 2, icon: 'wrench', blurb: 'A cheap safe is an afternoon.', sold: ['garage', 'scrapyard', 'construction'] },
  stethoscope:  { label: 'Safe kit', slot: 'tool', skill: 'brains', bonus: 3, price: 4200, tier: 3, icon: 'lock', blurb: 'A stethoscope, a notebook, and a lot of patience.', sold: ['fixer'] },
  lance:        { label: 'Thermal lance', slot: 'tool', skill: 'brains', bonus: 4, price: 9000, tier: 4, icon: 'gear', blurb: 'Through a vault door in the time it takes to boil a kettle.', sold: ['fixer'] },
  scanner:      { label: 'Police scanner', slot: 'tech', skill: 'tech', bonus: 1, price: 400, tier: 1, icon: 'relay_box', blurb: 'You hear them coming.', sold: ['electronics'] },
  burner:       { label: 'Burner phones', slot: 'tech', skill: 'tech', bonus: 1, price: 250, tier: 1, icon: 'burner', blurb: 'A drawer full. One a week.', sold: ['electronics', 'corner_store'] },
  jammer:       { label: 'Signal jammer', slot: 'tech', skill: 'tech', bonus: 2, price: 1900, tier: 2, icon: 'signal_fob', blurb: 'Alarms that cannot call anybody.', sold: ['electronics'] },
  laptop:       { label: 'Cloned laptop', slot: 'tech', skill: 'tech', bonus: 3, price: 4600, tier: 3, icon: 'laptop', blurb: 'Somebody else\'s login, somebody else\'s network.', sold: ['electronics', 'fixer'] },
  relay:        { label: 'Relay rig', slot: 'tech', skill: 'tech', bonus: 4, price: 10500, tier: 4, icon: 'hotspot', blurb: 'Opens cars, gates and anything with a fob.', sold: ['fixer'] },
  beater:       { label: 'A beater', slot: 'car', skill: 'wheels', bonus: 1, price: 900, tier: 1, icon: 'sedan', blurb: 'Nobody looks at it twice. Nobody would steal it either.', sold: ['scrapyard', 'garage'] },
  sedan:        { label: 'Clean sedan', slot: 'car', skill: 'wheels', bonus: 2, price: 3200, tier: 2, icon: 'sedan', blurb: 'Plates that match, papers that pass.', sold: ['garage', 'cab_company'] },
  motorbike:    { label: 'Motorbike', slot: 'car', skill: 'wheels', bonus: 2, price: 2600, tier: 2, icon: 'motorcycle', blurb: 'Through traffic, down alleys, gone.', sold: ['garage'] },
  muscle_car:   { label: 'Muscle car', slot: 'car', skill: 'wheels', bonus: 3, price: 8200, tier: 3, icon: 'muscle_car', blurb: 'Nothing the police drive catches it.', sold: ['garage', 'fixer'] },
  armoured_van: { label: 'Armoured van', slot: 'car', skill: 'wheels', bonus: 3, armour: 0.15, price: 14000, tier: 4, icon: 'van', blurb: 'For moving people and money past people with guns.', sold: ['fixer'] },
  suit:         { label: 'A good suit', slot: 'look', skill: 'charm', bonus: 1, price: 600, tier: 1, icon: 'person', blurb: 'People open doors for a good suit.', sold: ['boutique'] },
  tailored:     { label: 'Tailored three-piece', slot: 'look', skill: 'charm', bonus: 2, price: 2600, tier: 2, icon: 'crown', blurb: 'The kind of suit that gets you a table without asking.', sold: ['boutique'] },
  uniform:      { label: 'A uniform', slot: 'look', skill: 'charm', bonus: 3, price: 5200, tier: 3, icon: 'precinct', blurb: 'A courier\'s, a guard\'s, a police officer\'s. Whichever the night needs.', sold: ['fixer'] },
};

/** Old saves had one level per category; this is the item each level becomes, carried by the player. */
export const GEAR_TO_ITEM: Record<'weapons' | 'tools' | 'wheels' | 'tech', ItemId[]> = {
  weapons: ['bat', 'pistol', 'sawnoff'],
  tools: ['lockpicks', 'drill', 'lance'],
  wheels: ['sedan', 'muscle_car', 'armoured_van'],
  tech: ['scanner', 'jammer', 'relay'],
};
