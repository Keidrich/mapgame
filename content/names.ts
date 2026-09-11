export const FIRST_NAMES = ['Tony','Sal','Vinnie','Marco','Frankie','Eddie','Ray','Lou','Jimmy','Nicky','Danny','Carlo','Rocco','Paulie','Joey','Angelo','Dom','Mickey','Benny','Sonny',
  'Rosa','Gina','Maria','Carmela','Teresa','Lena','Vera','Ruth','Dolores','Angie','Connie','Sofia','Nina','Irene','Dot','Frances','Marlene','June','Bea','Lucy',
  'Ivan','Dmitri','Yuri','Sergei','Boris','Leon','Viktor','Anton','Pavel','Oleg','Katya','Olga','Irina','Nadia','Marta',
  'Kwame','Marcus','Darnell','Andre','Terrence','Reggie','Cedric','Jerome','Leroy','Curtis','Tasha','Keisha','Monique','Denise','Latoya','Bernice',
  'Wei','Jun','Ming','Tao','Chen','Hiro','Kenji','Mei','Lin','Hana',
  'Miguel','Javier','Rafael','Diego','Hector','Luis','Carlos','Ramon','Esteban','Pablo','Lupe','Carmen','Elena','Rosario','Pilar','Marisol',
  'Sean','Liam','Declan','Patrick','Brendan','Colm','Niall','Fergus','Maeve','Siobhan','Aoife','Bridget',
  'Ahmed','Omar','Tariq','Farid','Nasser','Layla','Samira','Yasmin'];

export const LAST_NAMES = ['Marconi','Russo','Esposito','Bianchi','Romano','Colombo','Ricci','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti','Ferrara','Vitale',
  'Petrov','Volkov','Sokolov','Kozlov','Novak','Morozov','Orlov','Lebedev','Kuznetsov','Popov',
  'Washington','Jackson','Robinson','Harris','Coleman','Brooks','Freeman','Hayes','Reed','Bell','Booker','Ward','Powell','Hunter','Fields',
  'Chen','Wong','Lee','Zhang','Liu','Huang','Tanaka','Sato','Nguyen','Tran',
  'Reyes','Ortega','Delgado','Vargas','Castillo','Mendoza','Fuentes','Salazar','Herrera','Cruz','Morales','Guerrero',
  'Murphy','Kelly','Sullivan','Walsh','Byrne','Doyle','Brennan','Flanagan','O\'Neill','Fitzgerald','Kavanagh',
  'Haddad','Nasser','Farouk','Rahman','Aziz','Khalil',
  'Miller','Baker','Cooper','Fisher','Mason','Carter','Turner','Walker','Wright','Hill','Cole','Price','Stone','Wood','Shaw'];

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
  { name: 'Eastside Kings', short: 'Kings', style: 'street', color: '#d4a017', temperament: 'aggressive' },
  { name: 'The Dock Union', short: 'Union', style: 'irish', color: '#27ae60', temperament: 'paranoid' },
  { name: 'Jade Circle', short: 'Circle', style: 'triad', color: '#16a085', temperament: 'diplomatic' },
  { name: 'Los {L}', short: '{L}', style: 'latin', color: '#e67e22', temperament: 'greedy' },
  { name: 'Iron Saints MC', short: 'Saints', style: 'biker', color: '#7f8c8d', temperament: 'aggressive' },
  { name: 'The {L} Syndicate', short: 'Syndicate', style: 'mixed', color: '#2980b9', temperament: 'diplomatic' },
] as const;

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
