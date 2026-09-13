/**
 * What every number and label in the UI actually means. Pure data: the UI looks a term
 * up by id and shows it on tap (phone) or hover (desktop).
 *
 * House rule: these describe the real mechanics in `sim/`. If a formula changes, the
 * text changes with it. Two or three sentences, plain words, no numbers the player
 * cannot act on.
 */
export interface GlossaryEntry {
  title: string;
  body: string;
  /** One extra line of advice. Shown dimmer, underneath. */
  note?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ---------------------------------------------------------------- you
  cash: {
    title: 'Clean cash',
    body: 'Money you can explain. Buys businesses and safehouses, pays officials, funds ops and racket setup. Most rackets do not produce it.',
    note: 'Short on clean money? Run a laundering racket, or own a business that earns honestly.',
  },
  dirty: {
    title: 'Dirty cash',
    body: 'Money from rackets, shakedowns and street sales. It covers wages, rent and tribute, but officials and sellers want clean.',
    note: 'A laundering racket turns it clean at 85 cents on the dollar, up to a daily limit.',
  },
  heat: {
    title: 'Heat',
    body: 'How hard the police are looking at you, 0 to 100. At 45 they notice. Above 60 a raid can hit a racket or safehouse any night. At 100 the task force takes everything.',
    note: 'Falls about 4 a day on its own, faster with the captain on your payroll. Violence, drugs and schools nearby raise it fastest.',
  },
  ap: {
    title: 'Action points',
    body: 'What you can do today. Eight a day. Visits, threats, shakedowns and scenes cost one; a sit-down or brokering peace costs two.',
    note: 'End Day gives them all back. Unspent points do not carry over.',
  },
  legwork: {
    title: 'Legwork',
    body: 'How far you can walk today, in blocks. Separate from AP: walking never costs an action and actions never cost legwork. It comes from your wheels skill and refills every day.',
    note: 'A hop between two blocks that both have one of your safehouses costs half, so a chain of safehouses is a cheap corridor across your turf.',
  },
  presence: {
    title: 'You have to be there',
    body: 'Visits, threats, shakedowns, recruiting, reading someone and parleys are face to face: you have to be standing on the block. Walk over first.',
    note: 'Paperwork is not: assigning and firing crew, auditing a lieutenant, bribing an official and buying a business all work from anywhere.',
  },
  respect: {
    title: 'Respect',
    body: 'What the street thinks you are worth. Earned by wins, generosity, favours and brokering peace. Raises the odds on every charm approach, sit-downs, and your chances of a chair at the Commission.',
  },
  fear: {
    title: 'Fear',
    body: 'What the street thinks you will do. Earned by violence. Raises the odds on threats and strongarm approaches, and makes owners sell cheaper.',
    note: 'It also suppresses trust. A city that only fears you turns snitch the moment you look weak.',
  },
  control: {
    title: 'City control',
    body: 'The share of mapped blocks where you hold more influence than anyone else. Own 60% to take the city.',
  },
  lawyer: {
    title: 'Lawyer on retainer',
    body: 'Your people spend fewer days in jail, you lose less in a bust, and cold cases build evidence more slowly.',
  },
  busts: {
    title: 'Busts',
    body: 'Times the task force has taken you down. Each one costs most of your dirty cash and product, jails crew, and darkens every racket for days.',
  },

  // ---------------------------------------------------------------- a person
  trust: {
    title: 'Trust',
    body: 'How much this person will do for you, from −100 to 100. Drives visits, talking an owner into paying, and recruiting.',
    note: 'At 20 you have their number: traits and nerve show. At 35 they will open a door for an inside job.',
  },
  npcfear: {
    title: 'Fear (of you)',
    body: 'How much they think you will hurt them, 0 to 100. Drives every strongarm approach, and keeps a witness off the stand at 40 or more.',
    note: 'Fades by 1 every other day. Fear without trust makes people call the police the moment they can.',
  },
  npcrespect: {
    title: 'Respect (for you)',
    body: 'Whether they rate you as somebody. Raises what they will risk for you and how well a straight offer lands.',
  },
  nerve: {
    title: 'Nerve',
    body: 'How hard they are to frighten, 0 to 100. Every threat and strongarm approach subtracts it. Cowards start low; hotheads start high.',
    note: 'Hidden until you size someone up, or they trust you enough to show it.',
  },
  known: {
    title: 'Traits unknown',
    body: 'You have not read this person yet. Size them up (1 AP), spend a scene with them, or get their trust to 20.',
    note: 'Going in blind means you cannot tell a coward from a hothead until it is too late.',
  },
  grudge: {
    title: 'Holds a grudge',
    body: 'You humiliated them and they have not let it go. Every approach against them is 10 points harder, and they tell their block about it, cooling everyone nearby.',
    note: 'Fear or time shuts it up. So does a gift.',
  },
  homeTurf: {
    title: 'Home turf',
    body: 'The block where you started. People here begin warmer, gain extra trust from visits, and your noise draws a fifth less heat.',
  },
  agenda: {
    title: 'What they want',
    body: 'People have their own business and it advances whether or not you show up. At the halfway mark and at the end it surfaces as an event or a quiet change.',
    note: 'Somebody in debt is a cheap recruit. Somebody wanting out will sell you their business.',
  },
  witness: {
    title: 'Witness',
    body: 'They saw something and the detectives on that case know it. A talking witness roughly triples how fast evidence builds.',
    note: 'Scare them past fear 40, pay them $500 or more if they trust you, or make them disappear.',
  },
  recipeKnown: {
    title: 'Knows a recipe',
    body: 'Recruit them and you learn this recipe permanently. It changes what the matching production makes: better quality, more output, or less heat.',
  },
  corruption: {
    title: 'Corruption',
    body: 'How cheaply this official sells. High corruption means smaller bribes buy more trust, and they stay bought.',
  },
  boughtBy: {
    title: 'Bought by',
    body: 'A faction already pays this official. They will still take your money, but the other side hears about it.',
  },
  findAt: {
    title: 'Find at',
    body: 'Where this person spends their time. Open the place from the map to catch them there.',
  },

  // ---------------------------------------------------------------- skills
  muscle: {
    title: 'Muscle',
    body: 'Violence and the threat of it. Drives threats, strongarm shakedowns, protection collections, guarding a block, and loud ops.',
  },
  brains: {
    title: 'Brains',
    body: 'Numbers and planning. Runs numbers, bookmaking and laundering; drives quiet ops, check kiting, and spotting a skimming lieutenant at an audit.',
  },
  charm: {
    title: 'Charm',
    body: 'Talking people around. Drives visits, recruiting, gambling dens, sit-downs, brokering peace, and what you get for product on the street.',
  },
  wheels: {
    title: 'Wheels',
    body: 'Driving and moving things. Sets your daily legwork, so a driver covers more of the city in a day. Runs chop shops and smuggling, gets a crew out of a loud job, and pushes product into the next district.',
  },
  tech: {
    title: 'Tech',
    body: 'Hands and machines. Runs stills, labs and print shops, and beats alarms and safes on a quiet job.',
  },

  // ---------------------------------------------------------------- traits
  'trait:greedy': {
    title: 'Greedy',
    body: 'Money talks to them. Easier to reason with in a shakedown, easier to recruit for a cut, and they take a payoff to forget what they saw.',
    note: 'As a lieutenant they skim far more, and a rival can buy them.',
  },
  'trait:loyal': {
    title: 'Loyal',
    body: 'Hard to buy and impossible to lean into your crew. Slower to recruit, but as a lieutenant they gain loyalty over time and bring a rival offer to you instead of taking it.',
  },
  'trait:coward': {
    title: 'Coward',
    body: 'Folds. Every threat and strongarm approach against them is far easier, and they can be scared into your crew outright.',
    note: 'Low nerve. The softest first target on any block.',
  },
  'trait:hothead': {
    title: 'Hothead',
    body: 'Fights back. Strongarm approaches are harder, a failed threat earns a lasting grudge, and high nerve makes them slow to break.',
    note: 'As a lieutenant they draw extra heat. As a losing succession candidate they walk out with soldiers.',
  },
  'trait:connected': {
    title: 'Connected',
    body: 'They know people. A visit about business goes well, but humiliate them and the grudge spreads through the whole block.',
  },
  'trait:honest': {
    title: 'Honest',
    body: 'Will not be reasoned into paying, resists a threat against their family, and calls the police when you lean too hard. They will not sell to you while your heat is high.',
    note: 'As a worker or lieutenant they skim less and turn out better product.',
  },
  'trait:ambitious': {
    title: 'Ambitious',
    body: 'Wants to be somebody. Easy to recruit with a promise or a cut, and a street boss with ambition will fold their crew into yours.',
    note: 'As a lieutenant they drift disloyal and take a rival offer. In a succession fight they push hardest.',
  },
  'trait:junkie': {
    title: 'Junkie',
    body: 'Happy to drink with you, so a social visit lands easily. Put them on a production and the quality drops and stock walks out the door.',
  },
  'trait:gambler': {
    title: 'Gambler',
    body: 'A social visit lands easily. They tend to end up owing the wrong people, which makes them cheap to buy when it happens.',
  },
  'trait:quiet': {
    title: 'Quiet',
    body: 'Bad at small talk, good at listening. Drinks go nowhere, but sitting and listening gets you what they know.',
    note: 'Steady on a production line.',
  },

  // ---------------------------------------------------------------- your crew
  loyalty: {
    title: 'Loyalty',
    body: 'How solid this crew member is, 0 to 100. Below 50 they start skimming. Below 30 they talk to a detective. Below 15 they walk out in the night.',
    note: 'Pay them on time, back them in a fight, give the raise when they ask.',
  },
  cut: {
    title: 'Cut',
    body: 'Their wage, paid every day out of cash or dirty money. Miss a payment and loyalty drops 10.',
  },
  crewStatus: {
    title: 'Status',
    body: 'Idle means free for work. Assigned means on a job. Injured and jailed count down to zero, then they come back. Dead is dead.',
    note: 'Only idle crew can join an op or take a new assignment.',
  },
  assignment: {
    title: 'Assignment',
    body: 'What this person does all day. Running a racket earns full income and halves the risk of an incident. Working a production sets its quality and output. Guarding a block pushes rival muscle off it. Collecting raises what every protection racket brings in.',
  },
  lieutenant: {
    title: 'Lieutenant',
    body: 'Runs a whole district for you. Rackets there earn without a runner, rival hits get turned away, and your grip on the blocks firms up daily.',
    note: 'Their cut goes up by half, and the books are theirs to keep honestly or not. Audit them.',
  },
  audit: {
    title: 'Going over the books',
    body: 'A brains check against your lieutenant. Find a skim and you claw back most of it, but they know you are watching and lose a little loyalty.',
  },
  beds: {
    title: 'Beds',
    body: 'How many crew you can house. Two to start, plus three for a back room, six for an apartment, twelve for a compound.',
    note: 'No bed, no recruit.',
  },

  // ---------------------------------------------------------------- a block
  influence: {
    title: 'Influence',
    body: 'Who holds this block, 0 to 100 each. Whoever is highest controls it. Rackets, protected businesses and a safehouse build yours.',
    note: 'Yours decays by 2 a day on any block where you have nothing running.',
  },
  wealth: {
    title: 'Wealth',
    body: 'How much money moves through this block. Raises what block-scale rackets earn, what businesses are worth, and what product sells for.',
  },
  police: {
    title: 'Police',
    body: 'Baseline patrol here. Multiplies the chance that any racket on this block has an incident, and how often production gets interrupted.',
    note: 'A police station on the block or next door raises it sharply.',
  },
  blockHeat: {
    title: 'Block heat',
    body: 'Local attention, separate from your own. Everything noisy you do here raises it and it falls 3 a day. High block heat means the raid, when it comes, comes here.',
  },
  population: {
    title: 'People',
    body: 'How many live and drink here. Drives daily demand for product and how many patrons each business has.',
  },
  demand: {
    title: 'Demand per day',
    body: 'How many units of each product this block will absorb daily. A street sale can move about three days of it at once; past that the price collapses.',
  },
  memory: {
    title: 'What people remember',
    body: 'Blocks remember raids, killings, busts and takeovers for a long time, and people bring them up when you talk to them.',
  },
  schoolTag: {
    title: 'School nearby',
    body: 'Everything you do on this block draws half again as much heat. People call things in here.',
  },
  policeTag: {
    title: 'Police station',
    body: 'Patrol is much higher here and on the neighbouring blocks, and when a raid comes it is aimed at whatever you own closest to the station.',
  },
  streetCrew: {
    title: 'Street crew',
    body: 'A small independent gang holding one corner. Left alone they grow, take a cut of any racket you run here, start extorting businesses, and eventually get swallowed by a faction.',
    note: 'Parley with the boss to put them on your payroll or fold them in, or take the corner by force.',
  },

  // ---------------------------------------------------------------- a business
  bizIncome: {
    title: 'Income',
    body: 'What this place honestly takes in each day. Protection is a cut of it, and it scales what rackets running here earn.',
  },
  bizValue: {
    title: 'Value',
    body: 'The asking price. An owner who trusts you takes 10% off, one who fears you 20%, and a bought councillor another 15%. A stranger pays over the odds.',
  },
  condition: {
    title: 'Condition',
    body: 'Wear, fire and vandalism, 0 to 100. Damaged places earn less and their rackets earn less with them. Repair costs money; insurance covers the disasters.',
  },
  protection: {
    title: 'Protection',
    body: 'The daily cut you take for making sure nothing happens. Ten to fifteen percent keeps the owner warm. Higher breeds resentment, then snitches, then a rival they run to.',
  },
  insured: {
    title: 'Insured',
    body: 'Covers damage, and it is the requirement for an insurance fraud op: torch your own place and collect.',
  },

  // ---------------------------------------------------------------- rackets
  racketLevel: {
    title: 'Racket level',
    body: 'One to three. Each level adds about 60% income, and raises heat and the chance of an incident with it.',
  },
  runner: {
    title: 'Runner',
    body: 'A crew member on a racket earns full income scaled by their skill, and cuts the risk of a raid almost in half. Unmanned rackets earn half and get hit more.',
    note: 'A lieutenant running the district covers unmanned rackets, though not as well as a real runner.',
  },
  float: {
    title: 'Float',
    body: 'The capital your loansharking has on the street. It earns 3% a day. Now and then a borrower skips town with a tenth of it.',
  },
  disrupted: {
    title: 'Disrupted',
    body: 'Days this earns nothing, after a police raid, a rival hit or sabotage. It restarts on its own.',
  },
  dirtyRacket: {
    title: 'Dirty or clean',
    body: 'Most rackets pay in dirty cash. Laundering and no-show jobs pay clean. Orange numbers are dirty, green are clean.',
  },

  // ---------------------------------------------------------------- production
  quality: {
    title: 'Quality',
    body: 'What the next batch will be worth, 5 to 100. Set by the worker\'s skill and traits, the production level, and the recipe.',
    note: 'Street price runs from 0.7× at the bottom to 1.2× at the top. Stashes keep a weighted average as you mix batches.',
  },
  stock: {
    title: 'Stock',
    body: 'Days of ingredients left. At zero the production makes nothing until you restock.',
  },
  prodLevel: {
    title: 'Production level',
    body: 'One to three. Each level adds output and quality, and raises heat and the chance of a fire, a leak or a complaint.',
  },
  recipe: {
    title: 'Recipe',
    body: 'Changes what this production makes: trade output for quality, or the reverse, and shift how much heat it draws.',
    note: 'Learn one from the Steal a Formula op, or by recruiting somebody who already knows it.',
  },
  shortage: {
    title: 'Shortage',
    body: 'Your supplier got pinched. Restocking this kind of production costs double until it clears.',
  },
  saturation: {
    title: 'Street flooded',
    body: 'Too much of this product is around, yours included. Everything sells 30% under for a few days.',
  },
  stash: {
    title: 'Stash',
    body: 'Product on hand. What you carry can be sold on any block or fed to a dealing racket. What sits in a safehouse is safer from a bust but cannot be sold from there.',
  },
  hiddenCash: {
    title: 'Hidden cash',
    body: 'Dirty money kept out of the house. Partly shielded when the police come through.',
  },

  // ---------------------------------------------------------------- factions
  standing: {
    title: 'Standing',
    body: 'How a faction feels about you, −100 to 100. Pushed down by your rackets on their turf and attacks on their people; pushed up by tribute, favours and brokered peace.',
    note: 'Break a truce and the best standing you can ever reach with them drops 35, permanently.',
  },
  stance: {
    title: 'Stance',
    body: 'Alliance, peace, tension, beef, war. Tension is a warning. Beef means your rackets get wrecked. War means they come for your crew and safehouses.',
    note: 'It follows standing, but a truce holds them at tension no matter how they feel.',
  },
  soldiers: {
    title: 'Soldiers',
    body: 'How many people a faction can put on the street. Drives what they can do to you and how hard they are to lean on.',
    note: 'A faction that cannot make payroll starts losing them.',
  },
  truce: {
    title: 'Truce',
    body: 'Nobody touches anybody until the day it ends, whatever the standing says.',
  },
  tribute: {
    title: 'Tribute',
    body: 'A daily payment for being left alone. It comes out automatically; miss it and they take it badly.',
  },
  owed: {
    title: 'Owes you',
    body: 'A favour from backing this boss into the chair. It is spent automatically to swing your next sit-down.',
  },
  grudges: {
    title: 'Grudges',
    body: 'Specific things they hold against you: a raid, a hit, a frame, backing their rival. They keep the last few and they colour everything.',
  },
  crisis: {
    title: 'Succession crisis',
    body: 'The boss is gone and two lieutenants want the chair. For three days the faction neither expands nor attacks, and its soldiers drift away.',
    note: 'Back a candidate with cash and your name. The winner owes you; the loser\'s winner never forgets.',
  },
  broker: {
    title: 'Brokering peace',
    body: 'Sit two warring factions down through one of their lieutenants. A truce between them earns you standing on both sides and a fee.',
  },
  sitDown: {
    title: 'Sit-down',
    body: 'A formal offer: a truce, tribute, ceding a block, a joint racket, an alliance, or a demand. They accept on charm, respect, standing and temperament.',
  },
  commission: {
    title: 'The Commission',
    body: 'Once three factions share the city the bosses form a table that meets every ten days and rules on the city\'s business.',
    note: 'Blocks, respect or an ally get you a chair. With one your vote counts and the pot can pay you.',
  },
  temperament: {
    title: 'Temperament',
    body: 'Aggressive factions expand and attack hardest. Greedy ones take money over territory. Diplomatic ones accept offers. Paranoid ones sour fastest over incursions.',
  },

  // ---------------------------------------------------------------- cases
  evidence: {
    title: 'Evidence',
    body: 'How close the detectives are on this case, 0 to 100. It builds with your heat, and roughly triples while a witness is talking.',
    note: 'At 100 somebody is charged: a crew member from the job takes the fall, or you are indicted.',
  },
  coldCase: {
    title: 'Cold case',
    body: 'A hit, a big job, an arson or a suspected frame opens a police file. Bribing the captain buries paper; a lawyer slows the whole thing down.',
    note: 'A file under 60 evidence goes cold after 25 days and stops growing.',
  },

  // ---------------------------------------------------------------- scenes and ops
  odds: {
    title: 'The odds',
    body: 'The percentage on each approach is the real number the roll uses. It comes from your skills and reputation against their nerve, traits and feelings about you.',
    note: 'Nothing is hidden. If an approach reads badly, change the person before you change the plan.',
  },
  planDays: {
    title: 'Planning',
    body: 'Days before the op is ready to launch. The crew is tied up the whole time.',
  },
  opApproach: {
    title: 'Approach',
    body: 'Loud pays 25% more and draws heavy heat; a bad failure means bodies. Quiet halves the heat but is harder. An inside man makes it far easier and burns your contact if it fails.',
  },
  opChance: {
    title: 'Chance of success',
    body: 'Your crew\'s skills against the job\'s difficulty, weighted by the approach. Add more crew or better skills; an inside man is worth more than either.',
  },
};

/** A term id that definitely exists, for typo safety at call sites that want it. */
export type GlossaryId = keyof typeof GLOSSARY;
