/**
 * Names. People are named from a *group* — a loose cultural pool of first and last
 * names that go together — so that Tony Marconi and Siobhan Byrne can share a street
 * without anyone being called Tony Byrne. A group is a naming pool and nothing else:
 * nothing in `sim/` may read it when working out skills, traits, nerve or trust.
 *
 * Repetition is fixed by making each group's pool big, not by flattening them into one
 * bucket: a district that reads as Little Italy still has forty Italian first names to
 * draw on before it starts repeating.
 */

export type NameGroup =
  | 'italian' | 'slavic' | 'black_american' | 'east_asian'
  | 'latino' | 'irish' | 'middle_eastern' | 'anglo';

export interface NameGroupDef {
  /** Shown nowhere in the game; it names the pool for us, in code and in tests. */
  label: string;
  first: string[];
  last: string[];
}

export const NAME_GROUPS: Record<NameGroup, NameGroupDef> = {
  italian: {
    label: 'Italian',
    first: ['Tony','Sal','Vinnie','Marco','Frankie','Eddie','Ray','Lou','Jimmy','Nicky','Danny','Carlo','Rocco','Paulie','Joey','Angelo','Dom','Mickey','Benny','Sonny','Gino','Aldo','Enzo','Franco','Silvio','Renzo','Mario','Bruno','Luca','Matteo',
      'Rosa','Gina','Maria','Carmela','Teresa','Lena','Angie','Connie','Sofia','Nina','Donatella','Lucia','Paola','Giulia','Concetta','Antonella','Rafaella','Serafina','Mirella','Valentina'],
    last: ['Marconi','Russo','Esposito','Bianchi','Romano','Colombo','Ricci','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti','Ferrara','Vitale','Barbieri','Fontana','Caruso','Sartori','Marino','Pellegrini','Gatti','Longo','Amato','Serra','Grasso','Battaglia','Palumbo','Rinaldi'],
  },
  slavic: {
    label: 'Slavic',
    first: ['Ivan','Dmitri','Yuri','Sergei','Boris','Viktor','Anton','Pavel','Oleg','Grigor','Mikhail','Lev','Stanislav','Bogdan','Tomasz','Jarek','Miron','Radek','Zoran','Vasily','Kazimir','Andrej',
      'Katya','Olga','Irina','Nadia','Marta','Zofia','Danica','Ludmila','Anya','Vera','Halina','Milena','Svetlana','Yelena','Bozena','Tatyana','Ivanka','Renata'],
    last: ['Petrov','Volkov','Sokolov','Kozlov','Novak','Morozov','Orlov','Lebedev','Kuznetsov','Popov','Zielinski','Wozniak','Kaminski','Dvorak','Bartos','Havel','Marek','Stefanik','Radic','Milanov','Tarasov','Gusev','Belov','Panek','Nowicki','Kovac','Jankowski','Suslov'],
  },
  black_american: {
    label: 'Black American',
    first: ['Kwame','Marcus','Darnell','Andre','Terrence','Reggie','Cedric','Jerome','Leroy','Curtis','Tyrell','Malik','Ezekiel','Otis','Rufus','Elijah','Clarence','Maceo','Willie','Dontae','Isaiah','Lamont','Booker','Solomon',
      'Tasha','Keisha','Monique','Denise','Latoya','Bernice','Ruby','Odessa','Althea','Cassandra','Lorraine','Yolanda','Shirley','Etta','Darlene','Rochelle','Mavis','Imani'],
    last: ['Washington','Jackson','Robinson','Harris','Coleman','Brooks','Freeman','Hayes','Reed','Bell','Booker','Ward','Powell','Hunter','Fields','Dupree','Whitaker','Hollins','Gaines','Mosley','Rivers','Dawson','Grier','Barnes','Sharp','Tillman','Prescott','Rollins','Vaughn','Lofton'],
  },
  east_asian: {
    label: 'East Asian',
    first: ['Wei','Jun','Ming','Tao','Chen','Hiro','Kenji','Bo','Shan','Feng','Kai','Renji','Daiki','Takeshi','Sung','Jae','Minho','Duc','Thanh','Quan','Xiang','Yun',
      'Mei','Lin','Hana','Suki','Yuki','Jia','Ying','Aiko','Soo','Mi-Ja','Lian','Bao','Huong','Kim','Noriko','Chun','Anh','Phuong'],
    last: ['Chen','Wong','Lee','Zhang','Liu','Huang','Tanaka','Sato','Nguyen','Tran','Yamada','Kobayashi','Watanabe','Park','Choi','Kang','Lam','Pham','Xu','Guo','Shen','Ito','Fujimoto','Cheung','Ng','Ho','Yao','Bui'],
  },
  latino: {
    label: 'Latino',
    first: ['Miguel','Javier','Rafael','Diego','Hector','Luis','Carlos','Ramon','Esteban','Pablo','Ignacio','Alejandro','Tomas','Emilio','Rodrigo','Santiago','Mateo','Julio','Cesar','Nestor','Fausto','Benito',
      'Lupe','Carmen','Elena','Rosario','Pilar','Marisol','Dolores','Ximena','Aurora','Beatriz','Marta','Ines','Consuelo','Alma','Gabriela','Yolanda','Paloma','Renata'],
    last: ['Reyes','Ortega','Delgado','Vargas','Castillo','Mendoza','Fuentes','Salazar','Herrera','Cruz','Morales','Guerrero','Navarro','Aguilar','Peralta','Cabrera','Ibarra','Rosales','Montoya','Quintero','Escobar','Santana','Valdez','Zamora','Trujillo','Nunez','Bautista','Carrillo'],
  },
  irish: {
    label: 'Irish',
    first: ['Sean','Liam','Declan','Patrick','Brendan','Colm','Niall','Fergus','Eamon','Cormac','Ronan','Padraig','Donal','Seamus','Rory','Cillian','Finbar','Oisin',
      'Maeve','Siobhan','Aoife','Bridget','Nuala','Roisin','Eileen','Deirdre','Clodagh','Orla','Sinead','Fiona','Mairead','Grainne'],
    last: ['Murphy','Kelly','Sullivan','Walsh','Byrne','Doyle','Brennan','Flanagan','O\'Neill','Fitzgerald','Kavanagh','Gallagher','Donnelly','Quinn','Lynch','Keane','Rafferty','Moran','Halloran','Mulligan','Devlin','Cassidy','Healy','Nolan','Boyle','Hennessy','Shanahan','Feeney'],
  },
  middle_eastern: {
    label: 'Middle Eastern',
    first: ['Ahmed','Omar','Tariq','Farid','Nasser','Rami','Hakim','Bashir','Yusuf','Karim','Sami','Jamal','Adnan','Ziad','Marwan','Idris','Hassan','Elias',
      'Layla','Samira','Yasmin','Nadia','Amira','Rania','Zahra','Farah','Hala','Dalia','Maysa','Noor','Salma','Leila'],
    last: ['Haddad','Nasser','Farouk','Rahman','Aziz','Khalil','Saab','Mansour','Bakri','Darwish','Tahan','Qureshi','Zaidan','Shammas','Hourani','Najjar','Kassab','Hamdan','Barakat','Sabbagh','Fahmy','Jabari','Sayegh','Antoun'],
  },
  anglo: {
    label: 'Anglo',
    first: ['Walter','Gene','Hank','Bill','Stan','Harold','Ernie','Clyde','Roy','Chester','Wallace','Norman','Vernon','Floyd','Arthur','Clifford','Russell','Leon','Warren','Gil',
      'Ruth','Dolores','Dot','Frances','Marlene','June','Bea','Lucy','Irene','Vera','Edith','Mabel','Gladys','Hazel','Wilma','Loretta','Joan','Peggy'],
    last: ['Miller','Baker','Cooper','Fisher','Mason','Carter','Turner','Walker','Wright','Hill','Cole','Price','Stone','Wood','Shaw','Gable','Whitfield','Lang','Pike','Crane','Marsh','Hodge','Sutton','Bracken','Ellery','Rand','Quigley','Vance','Ashby','Doran'],
  },
};

export const NAME_GROUP_IDS = Object.keys(NAME_GROUPS) as NameGroup[];

/** Flat pools, kept for anything that wants a name with no group at all. */
export const FIRST_NAMES: string[] = NAME_GROUP_IDS.flatMap(g => NAME_GROUPS[g].first);
export const LAST_NAMES: string[] = NAME_GROUP_IDS.flatMap(g => NAME_GROUPS[g].last);

const FIRST_INDEX = new Map<string, NameGroup[]>();
const LAST_INDEX = new Map<string, NameGroup[]>();
for (const g of NAME_GROUP_IDS) {
  for (const n of NAME_GROUPS[g].first) FIRST_INDEX.set(n, [...(FIRST_INDEX.get(n) ?? []), g]);
  for (const n of NAME_GROUPS[g].last) LAST_INDEX.set(n, [...(LAST_INDEX.get(n) ?? []), g]);
}
/** Which pools a given name belongs to. A few names sit in more than one, which is true to life. */
export function groupsOfFirstName(first: string): NameGroup[] { return FIRST_INDEX.get(first) ?? []; }
export function groupsOfLastName(last: string): NameGroup[] { return LAST_INDEX.get(last) ?? []; }
/** Do a first and last name come from a pool they share? */
export function namesAgree(first: string, last: string): boolean {
  const f = groupsOfFirstName(first);
  return groupsOfLastName(last).some(g => f.includes(g));
}

export const NICKNAMES = ['Knuckles','the Nose','Two-Times','Slim','Tiny','Books','Sticks','Ace','Lucky','Fingers','the Wrench','Fats','Deacon','Doc','Whispers','the Hat','Moose','Ghost','Cheeks','the Saint','Hooks','Sugar','Mack','Bones','Preacher','Ice','Duke','Sweets','Grip','the Judge'];

export const BUSINESS_NAME_PARTS = {
  bar: [['The','Old','Blue','Red','Golden','Last','Lucky','Broken'], ['Anchor','Lantern','Crown','Barrel','Horse','Rooster','Tap','Nickel','Corner','Dog']],
  diner: [['Mel\'s','Sunny','Eastside','Al\'s','Star','Mom\'s','Roadside','Nick\'s'], ['Diner','Grill','Lunch','Coffee Shop','Eats']],
  restaurant: [['Casa','Trattoria','Osteria','Chez','Villa','Little','Mama','Golden'], ['Roma','Napoli','Lucia','Bella','Sorrento','Dragon','Lotus','Marisol']],
  laundromat: [['Sudsy','Bubbles','Spin','Kwik','Bright','Fresh','Clean'], ['Laundromat','Wash','Coin Laundry','Cleaners']],
  pawn: [['Gold','Fast','Honest','Ace','Star','Empire','City'], ['Pawn','Loan & Pawn','Pawnbrokers','Jewelry & Loan']],
  garage: [['Vic\'s','Ray\'s','Precision','Eastside','Ace','Midnight','Speedy','Brothers'], ['Auto','Garage','Body Shop','Motors','Auto Repair']],
  nightclub: [['Club','The','Velvet','Neon','Midnight','Blue','Studio'], ['Aurora','Mirage','Eclipse','Room','Sapphire','Lounge','Paradise','Nine']],
  corner_store: [['Quick','Corner','24hr','Family','Lucky','City','Mini'], ['Mart','Market','Grocery','Deli','Bodega','Stop']],
  barbershop: [['Tony\'s','Classic','Kings','Sharp','Gentlemen\'s','Fade','Uptown'], ['Barbers','Barbershop','Cuts','Grooming']],
  gym: [['Iron','Southpaw','Champion\'s','Ringside','Heavy','Golden'], ['Gym','Boxing Club','Athletic Club','Fitness']],
  cab_company: [['Yellow','Checker','City','Star','Metro','Night','Diamond'], ['Cab Co.','Taxi','Car Service','Livery']],
  construction: [['Apex','Keystone','Solid','Northern','Union','Brothers','Atlas'], ['Construction','Builders','Contracting','Concrete','Demolition']],
  warehouse: [['Harbor','Bay','Central','United','Iron','Freight','Allied'], ['Storage','Warehouse','Freight','Logistics','Shipping']],
  motel: [['Starlite','Sunset','Royal','Palm','Riverside','Skyline','Budget'], ['Motel','Inn','Motor Lodge','Rooms']],
  bank: [['First','National','Merchants','Union','Federal','Commerce','Peoples'], ['Bank','Savings & Loan','Trust','Credit Union']],
  jeweller: [['Goldstein','Royal','Diamond','Crown','Fine','Antique'], ['Jewelers','Gold & Gems','Jewelry','Watches']],
  armored_depot: [['Iron','Titan','Secure','Brinkley','Fortress'], ['Armored','Security','Transport','Vault Services']],
} as const;

export const FACTION_ARCHETYPES = [
  { name: 'The {L} Family', short: '{L}s', style: 'italian', color: '#c0392b', temperament: 'greedy' },
  { name: '{L} Bratva', short: 'Bratva', style: 'russian', color: '#8e44ad', temperament: 'aggressive' },
  { name: 'Eastside Kings', short: 'Kings', style: 'street', color: '#e84393', temperament: 'aggressive' },
  { name: 'The Dock Union', short: 'Union', style: 'irish', color: '#27ae60', temperament: 'paranoid' },
  { name: 'Jade Circle', short: 'Circle', style: 'triad', color: '#16a085', temperament: 'diplomatic' },
  { name: 'Los {L}', short: '{L}', style: 'latin', color: '#e67e22', temperament: 'greedy' },
  { name: 'Iron Saints MC', short: 'Saints', style: 'biker', color: '#7f8c8d', temperament: 'aggressive' },
  { name: 'The {L} Syndicate', short: 'Syndicate', style: 'mixed', color: '#2980b9', temperament: 'diplomatic' },
] as const;

/** Faction houses keep their own surname list: an archetype's name is its brand. */
export const STYLE_LAST: Record<string, string[]> = {
  italian: ['Marconi','Russo','Esposito','Bianchi','Romano','Colombo','Ricci','Greco','Lombardi','Moretti','Ferrara','Vitale','Mancini'],
  russian: ['Petrov','Volkov','Sokolov','Kozlov','Morozov','Orlov','Kuznetsov'],
  street: ['Washington','Jackson','Coleman','Brooks','Freeman','Booker','Hunter'],
  irish: ['Murphy','Kelly','Sullivan','Walsh','Byrne','Doyle','Brennan','Flanagan','O\'Neill'],
  triad: ['Chen','Wong','Zhang','Liu','Huang','Lee'],
  latin: ['Reyes','Ortega','Delgado','Vargas','Castillo','Mendoza','Salazar','Herrera'],
  biker: ['Miller','Baker','Cooper','Mason','Stone','Wood','Shaw'],
  mixed: ['Carter','Turner','Walker','Cole','Price','Hill','Haddad','Nasser'],
};

/** Which first-name pool sounds right next to a faction style's surname. `mixed` stays open. */
export const STYLE_GROUP: Record<string, NameGroup | undefined> = {
  italian: 'italian', russian: 'slavic', street: 'black_american', irish: 'irish',
  triad: 'east_asian', latin: 'latino', biker: 'anglo', mixed: undefined,
};
