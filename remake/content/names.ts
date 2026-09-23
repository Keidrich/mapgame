/**
 * Procedural naming. Nothing in the remake is named from a fixed list of whole names: every
 * city, district, street, business and outfit is assembled from parts, so two seeds never hand
 * you the same town.
 *
 * People are the one exception, and deliberately: invented syllable surnames read as fantasy,
 * and this is a crime story set in a city somebody could believe in. They are drawn from the
 * original game's name groups (`content/names.ts`), a first and last from the *same* group so
 * nobody is called Tony Byrne. A group is a naming pool and nothing else — no number anywhere in
 * the remake reads it, the same rule the original enforces.
 */
import { NAME_GROUPS, NAME_GROUP_IDS, type NameGroup } from '@content/names';
import type { Rng } from '@r/sim/rng';
import type { BusinessType, DistrictKind, FactionStyle } from '@r/sim/types';

export { NAME_GROUPS, NAME_GROUP_IDS, type NameGroup };

// ------------------------------------------------------------------------------ place syllables
/** Onsets and codas that sound like old English-speaking towns: Carrow, Ashby, Vellane. */
const ON = ['Ash', 'Bal', 'Bram', 'Car', 'Cor', 'Dun', 'Ed', 'Fal', 'Gal', 'Hal', 'Har', 'Kes', 'Lan', 'Mar', 'Nor', 'Pem', 'Rav', 'Sal', 'Stan', 'Thorn', 'Vel', 'Wes', 'Whit', 'Wick', 'Bel', 'Crag', 'Dray', 'Fen', 'Gar', 'Hol', 'Lor', 'Mer', 'Ost', 'Quar', 'Red', 'Sten', 'Tal', 'Wren'];
const MID = ['', '', '', 'a', 'e', 'i', 'o', 'en', 'er', 'ing', 'ley', 'ro'];
const END = ['by', 'ton', 'ford', 'mouth', 'wick', 'more', 'field', 'haven', 'port', 'bridge', 'bury', 'dale', 'gate', 'ham', 'holm', 'lane', 'mere', 'row', 'stead', 'well', 'worth', 'ridge', 'ley', 'croft'];

export function placeWord(rng: Rng): string {
  let w = rng.pick(ON) + rng.pick(MID) + rng.pick(END);
  w = w.replace(/(.)\1\1/g, '$1$1');
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

const CITY_FORMS = ['{P}', '{P}', 'Port {P}', 'New {P}', 'Saint {P}', '{P} City', 'East {P}', '{P} Harbor', 'Fort {P}'];
export function cityName(rng: Rng, coastal: boolean): string {
  const forms = coastal ? CITY_FORMS : CITY_FORMS.filter(f => !/Port|Harbor/.test(f));
  return rng.pick(forms).replace('{P}', placeWord(rng));
}

const MOTTOS = [
  'Nobody sleeps, nobody talks.', 'Built on the river, paid for in cash.', 'Everything here is for sale once.',
  'A good town for a bad idea.', 'Where the money goes to get clean.', 'The lights are on and nobody is home.',
  'Every corner belongs to somebody.', 'You can buy anything here except a way out.', 'Rain, rust and ready money.',
  'The saints left in the first winter.', 'Old stone, new money, same people.', 'Bring cash. Leave quietly.',
];
export const cityMotto = (rng: Rng) => rng.pick(MOTTOS);

// ----------------------------------------------------------------------------------- districts
/** What a district of each kind gets called. `{P}` is a generated place word. */
const DISTRICT_FORMS: Record<DistrictKind, string[]> = {
  downtown: ['Downtown', 'The Loop', 'Central {P}', '{P} Square', 'The Exchange'],
  docks: ['{P} Docks', 'The Wharves', '{P} Yards', 'Pier {N}', 'The Waterfront'],
  oldtown: ['Old {P}', 'The Old Quarter', '{P} Row', 'Saint {P}\'s', 'The Lanes'],
  industrial: ['{P} Works', 'The Foundry', 'Ironside', '{P} Mills', 'The Tanneries'],
  heights: ['{P} Heights', '{P} Hill', 'The Terraces', 'Upper {P}', '{P} Park'],
  market: ['{P} Market', 'The Bazaar', 'Fishmarket', '{P} Cross', 'Haymarket'],
  strip: ['The Strip', 'Neon Row', '{P} Boulevard', 'The Mile', 'Lantern Street'],
  projects: ['{P} Towers', 'The Estates', '{P} Houses', 'The Blocks', '{P} Gardens'],
  suburb: ['{P} Green', '{P} Village', 'West {P}', '{P} Common', '{P} Vale'],
};
export function districtName(rng: Rng, kind: DistrictKind, taken: Set<string>): string {
  for (let tries = 0; tries < 20; tries++) {
    const n = rng.pick(DISTRICT_FORMS[kind]).replace('{P}', placeWord(rng)).replace('{N}', String(rng.int(3, 19)));
    if (!taken.has(n)) { taken.add(n); return n; }
  }
  const n = `${placeWord(rng)} ${kind === 'docks' ? 'Quay' : 'Ward'}`; taken.add(n); return n;
}

// ------------------------------------------------------------------------------------- streets
const STREET_WORDS = ['Crane', 'Mercer', 'Ferris', 'Garnet', 'Hollis', 'Juniper', 'Kettle', 'Lamplight', 'Marlow', 'Nettle', 'Orchard', 'Pike', 'Quill', 'Rook', 'Saddler', 'Tanner', 'Union', 'Vesper', 'Wharf', 'Yarrow', 'Bishop', 'Cutler', 'Dover', 'Elm', 'Foundry', 'Grove', 'Harbor', 'Iron', 'Jasper', 'King', 'Lark', 'Mill', 'Norfolk', 'Oak', 'Pearl', 'Queen', 'Rope', 'Salt', 'Tallow', 'Vine', 'Water', 'Weaver', 'Canal', 'Chapel', 'Coal', 'Copper', 'Dock', 'Fleet', 'Glass', 'Hatter', 'Lantern', 'Market', 'Mint', 'Old Mill', 'Powder', 'Ship', 'Silver', 'Sparrow', 'Stone', 'Temple'];
const AVENUE_SUFFIX = ['Avenue', 'Boulevard', 'Parkway', 'Road'];
const STREET_SUFFIX = ['Street', 'Street', 'Street', 'Lane', 'Place', 'Way', 'Row', 'Court'];
const ORD = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** One axis gets numbers (5th Street), the other gets words — the way a lot of real grids do. */
export function streetName(rng: Rng, rank: 0 | 1 | 2, numbered: number | undefined, taken: Set<string>): { full: string; short: string } {
  if (numbered !== undefined) {
    const full = `${ORD(numbered)} ${rank === 0 ? 'Avenue' : 'Street'}`;
    taken.add(full); return { full, short: ORD(numbered) };
  }
  for (let tries = 0; tries < 30; tries++) {
    const word = rng.chance(0.25) ? placeWord(rng) : rng.pick(STREET_WORDS);
    const full = `${word} ${rank === 0 ? rng.pick(AVENUE_SUFFIX) : rng.pick(STREET_SUFFIX)}`;
    if (!taken.has(word)) { taken.add(word); return { full, short: word }; }
  }
  const w = placeWord(rng); taken.add(w); return { full: `${w} Street`, short: w };
}

// ----------------------------------------------------------------------------------------- people
export interface PersonName { first: string; last: string; pronoun: 'he' | 'she' | 'they'; group: NameGroup }
/**
 * Where each group's first-name list turns from men's names to women's, read off the original
 * tables (they list one then the other). Checked by `names.test.ts`, so a reordered table fails a
 * test instead of quietly calling Tony "she". Pronoun is kept so every generated line reads right.
 */
export const FEMALE_START: Record<NameGroup, number> = {
  italian: 30, slavic: 22, black_american: 24, east_asian: 22, latino: 22, irish: 18, middle_eastern: 18, anglo: 20,
};
export function personName(rng: Rng, group: NameGroup): PersonName {
  const pool = NAME_GROUPS[group];
  const i = rng.int(0, pool.first.length - 1);
  const pronoun = rng.chance(0.04) ? 'they' : i >= FEMALE_START[group] ? 'she' : 'he';
  return { first: pool.first[i], last: rng.pick(pool.last), pronoun, group };
}

const NICK_A = ['Big', 'Little', 'Fast', 'Sweet', 'Lucky', 'Crazy', 'Quiet', 'Cold', 'Dirty', 'Silk', 'Iron', 'Two-Tone', 'Red', 'Old', 'Pretty'];
const NICK_B = ['Knuckles', 'Nose', 'Books', 'Sticks', 'Ace', 'Fingers', 'Wrench', 'Deacon', 'Doc', 'Whispers', 'Hat', 'Moose', 'Ghost', 'Saint', 'Hooks', 'Sugar', 'Bones', 'Preacher', 'Ice', 'Duke', 'Grip', 'Judge', 'Needles', 'Smoke', 'Tick', 'Mouse', 'Nails', 'Pockets', 'Dice', 'Sparks'];
export function nickname(rng: Rng): string {
  const b = rng.pick(NICK_B);
  return rng.chance(0.45) ? `${rng.pick(NICK_A)} ${b}` : rng.chance(0.4) ? `the ${b}` : b;
}

// ----------------------------------------------------------------------------------- businesses
/** `{O}` is the owner's surname, `{F}` their first name, `{S}` a street word, `{P}` a place word. */
const BIZ: Record<BusinessType, string[]> = {
  bar: ['The {A} {N}', '{O}\'s', 'The {N} & {N2}', '{O}\'s Tap', 'The {S} Arms'],
  diner: ['{F}\'s Diner', '{S} Street Grill', 'The {A} Plate', '{O}\'s Lunch', 'Night Owl Diner'],
  restaurant: ['{O}\'s', 'Casa {O}', 'The {A} Table', '{S} Kitchen', 'Chez {F}'],
  laundromat: ['{S} Coin Laundry', 'Bright & Clean', '{O} Cleaners', 'Suds on {S}', 'Spin City'],
  pawn: ['{O} Loan & Pawn', 'Gold Standard Pawn', '{S} Pawnbrokers', 'Honest {F}\'s', 'Second Chance Pawn'],
  garage: ['{O} Auto', '{S} Body Shop', '{F}\'s Garage', 'Midnight Motors', '{P} Auto Repair'],
  nightclub: ['Club {N}', 'The {A} Room', '{N} Lounge', 'Velvet {N}', 'Studio {D}'],
  corner_store: ['{S} Deli', '{O} Grocery', '24/7 on {S}', 'Corner Mart', '{F}\'s Bodega'],
  barbershop: ['{F}\'s Barbers', 'Kings of {S}', 'The Sharp Edge', '{O} & Sons Barbers', 'Uptown Cuts'],
  gym: ['{O}\'s Boxing Club', 'Ringside Gym', 'The Iron Room', '{S} Athletic', 'Southpaw Gym'],
  cab_company: ['{P} Cab Co.', 'Checker {D}', '{O} Car Service', 'Night Line Taxi', 'Star Cabs'],
  construction: ['{O} Construction', '{P} Builders', 'Keystone & {O}', '{S} Concrete', 'Atlas Contracting'],
  warehouse: ['{P} Storage', '{O} Freight', '{S} Street Warehousing', 'Allied Logistics', 'Pier {D} Stores'],
  motel: ['The {A} Motel', '{P} Motor Lodge', '{S} Rooms', 'Starlite Inn', 'Sunset Motel'],
  pharmacy: ['{O} Chemists', '{S} Pharmacy', 'Standard Drug', '{P} Dispensary', 'Corner Rx'],
  electronics: ['{S} Wireless', '{O} Electronics', 'Dial Tone', 'Circuit City Repairs', '{P} Phones'],
  scrapyard: ['{O} Salvage', '{S} Scrap & Metal', 'Riverside Wrecking', '{P} Yard', 'Iron Heap'],
  boutique: ['Maison {O}', 'Atelier {F}', '{S} Couture', 'Rue {P}', 'The Ivory Rail'],
  bank: ['First {P} Bank', '{P} Savings & Loan', 'Merchants Trust of {P}', 'Union Bank', '{O} & {O2} Bank'],
  jeweller: ['{O} Jewelers', '{P} Gold & Gems', 'Crown Diamonds', '{O} Fine Watches', 'The Gem Vault'],
  armored_depot: ['{P} Armored', 'Titan Security Transport', '{O} Vault Services', 'Ironclad Depot', 'Brinkman Armored'],
  casino: ['The {A} Palace', '{P} Gaming Club', 'The Sovereign', '{N} Casino', 'The Emerald Rooms'],
  gallery: ['{O} Gallery', 'The White Room', '{P} Fine Art', '{O} Auction House', 'Meridian Collection'],
};
const ADJ = ['Blue', 'Red', 'Golden', 'Lucky', 'Broken', 'Silver', 'Crooked', 'Velvet', 'Black', 'Rusty', 'Gilded', 'Lonesome', 'Emerald', 'Midnight', 'Copper'];
const NOUN = ['Anchor', 'Lantern', 'Crown', 'Barrel', 'Horse', 'Rooster', 'Nickel', 'Dog', 'Fox', 'Raven', 'Moon', 'Harp', 'Key', 'Stag', 'Swan', 'Bell', 'Diamond', 'Eclipse', 'Mirage', 'Orchid'];

export function businessName(rng: Rng, type: BusinessType, owner: { first: string; last: string }, other: string, street: string): string {
  return rng.pick(BIZ[type])
    .replace('{O2}', other).replace(/\{O\}/g, owner.last).replace('{F}', owner.first)
    .replace('{S}', street).replace('{P}', placeWord(rng))
    .replace('{A}', rng.pick(ADJ)).replace('{N2}', rng.pick(NOUN)).replace(/\{N\}/g, rng.pick(NOUN))
    .replace('{D}', String(rng.int(2, 99)));
}

// --------------------------------------------------------------------------------------- outfits
const FACTION_FORMS: Record<FactionStyle, { name: string[]; short: string[] }> = {
  family: { name: ['The {L} Family', 'House of {L}', 'The {L}s'], short: ['{L}s'] },
  syndicate: { name: ['The {L} Syndicate', '{P} Combine', 'The {A} Hand'], short: ['Syndicate', 'Combine', 'Hand'] },
  gang: { name: ['{S} Kings', 'The {S} Boys', '{A} {Beast}s', '{S} Street Saints'], short: ['Kings', 'Boys', '{Beast}s', 'Saints'] },
  cartel: { name: ['Los {L}', 'The {L} Cartel', '{P} Cartel'], short: ['{L}s', 'Cartel'] },
  crew: { name: ['The {A} {Beast}s MC', '{P} Dock Union', 'The {S} Crew'], short: ['{Beast}s', 'Union', 'Crew'] },
};
const BEASTS = ['Wolf', 'Viper', 'Jackal', 'Raven', 'Hound', 'Cobra', 'Crow', 'Panther', 'Scorpion', 'Hornet', 'Lion', 'Shark'];
const FADJ = ['Black', 'Iron', 'Red', 'Silent', 'Golden', 'Grey', 'Crimson', 'White', 'Hollow'];

export function factionName(rng: Rng, style: FactionStyle, boss: { last: string }, street: string): { name: string; short: string } {
  const f = FACTION_FORMS[style];
  const beast = rng.pick(BEASTS), adj = rng.pick(FADJ), place = placeWord(rng);
  const fill = (s: string) => s.replace(/\{L\}/g, boss.last).replace('{P}', place).replace('{S}', street).replace('{A}', adj).replace(/\{Beast\}/g, beast);
  const i = rng.int(0, f.name.length - 1);
  return { name: fill(f.name[i]), short: fill(f.short[Math.min(i, f.short.length - 1)]) };
}

/** Which name group a style's boss is drawn from, so a family sounds like a family. */
export function styleGroup(rng: Rng, style: FactionStyle): NameGroup {
  const by: Record<FactionStyle, NameGroup[]> = {
    family: ['italian', 'irish', 'slavic'], syndicate: NAME_GROUP_IDS, gang: ['black_american', 'latino', 'anglo'],
    cartel: ['latino'], crew: ['anglo', 'irish', 'slavic'],
  };
  return rng.pick(by[style]);
}

// ---------------------------------------------------------------------------------- landmarks
const LANDMARKS = ['the old clock tower', 'the cathedral', 'the Grand Hotel', 'the rail terminal', 'the ferry pier', 'the courthouse', 'city hall', 'the stadium', 'the opera house', 'the fish market hall', 'the lighthouse', 'the gasworks', 'the old prison', 'the tram depot', 'the water tower', 'the racetrack'];
export const landmarkPool = () => LANDMARKS.slice();
export const parkName = (rng: Rng) => `${rng.pick(['', 'Old ', 'Saint '])}${placeWord(rng)} ${rng.pick(['Park', 'Gardens', 'Common', 'Green', 'Fields'])}`;
