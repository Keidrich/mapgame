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
    note: 'A laundering racket turns it clean at 85 cents on the dollar, up to a daily limit. Before you can afford one, a fixer will wash a smaller amount for a bigger cut.',
  },
  laundering: {
    title: 'Laundering racket',
    body: 'Your own washing machine, installed on a business you protect or own: 85 cents on the dollar, up to a daily capacity that grows with the racket level, the runner and the takings of the place it sits in.',
    note: 'It costs clean cash to set up. Until you have that, a fixer is the way through — worse rate, smaller window.',
  },
  fixer: {
    title: 'Fixer',
    body: 'Somebody who washes money for a cut, with no racket and nothing to set up. They pay 55 to 70 cents on the dollar and will only handle a few hundred a day, both improving as they come to trust you.',
    note: 'Never as good as a laundering racket of your own, on purpose. Use them to get off the ground, then build the real thing.',
  },
  heat: {
    title: 'Heat',
    body: 'How hard the police are looking at you, 0 to 100. At 45 they notice. Above 60 a raid can hit a racket or safehouse any night. At 100 the task force takes everything.',
    note: 'Falls about 4 a day on its own, faster with the captain on your payroll. Violence, drugs and schools nearby raise it fastest.',
  },
  ap: {
    title: 'Action points',
    body: 'What you can do today. Eight a day. Most face-to-face moves cost one — a conversation, a threat, a shakedown, settling somebody\'s problem, turning them, asking for an introduction. A sit-down, brokering peace, or asking a lieutenant to walk out on their own people costs two.',
    note: 'Opening a conversation is free; the point goes on how you close it. End Day gives them all back, and unspent points do not carry over.',
  },
  legwork: {
    title: 'Legwork',
    body: 'How far you can walk today, in blocks. Separate from AP: walking never costs an action and actions never cost legwork. It comes from your wheels skill and refills every day.',
    note: 'A hop costs 1 on a stranger\'s block, half where you have a foothold, and nothing between two blocks you run. Take ground and the city gets smaller.',
  },
  turf: {
    title: 'Your turf',
    body: 'A block where you hold more influence than anyone else, and at least 30 of it. Rackets, protected businesses and a safehouse all build influence; nothing on its own hands you the block.',
    note: 'Moving between two blocks you run is free. Half price between blocks where you have a foothold (influence 15+). Full price everywhere else.',
  },
  presence: {
    title: 'You have to be there',
    body: 'Anything you do to somebody\'s face is face to face: a conversation, a threat, a shakedown, recruiting, reading them, a parley — and since they arrived, settling what they want, turning them into an informant, asking for an introduction, and asking somebody\'s lieutenant to walk. You have to be standing on the block. Walk over first.',
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
    body: 'How much this person will do for you, from −100 to 100. Drives visits, talking an owner into paying, and recruiting. Ordinary dealing — visits, drinks, small talk — takes somebody to friendly and stops there. Only a favour you actually settled for them takes it higher.',
    note: 'At 20 you have their number: traits and nerve show. At 35 they will open a door for an inside job. Past friendly you have to have done something.',
  },
  npcfear: {
    title: 'Fear (of you)',
    body: 'How much they think you will hurt them, 0 to 100. Drives every strongarm approach, and keeps a witness off the stand at 40 or more. How far it can go depends on what you actually did: talk buys wariness and stops, a threat with your crew behind it goes further, and something broken or somebody hurt goes furthest.',
    note: 'Fades by 1 every other day. A hard stare tells somebody nothing they did not already know once they have watched you put a man down.',
  },
  stakes: {
    title: 'What it cost you',
    body: 'Every act that frightens somebody is worth what it cost you to do. A stare is free, so it buys very little and hits a low ceiling fast. Wrecking a place, or hurting somebody, is expensive and cannot be undone — so it spikes fear hard and reaches much higher.',
    note: 'Repeating a cheap threat forever will not get you past its ceiling. To go further you have to escalate.',
  },
  familiarity: {
    title: 'How well you know them',
    body: 'Days since you first dealt with somebody, and how many separate occasions. Nothing deep registers before both are real: a stranger can be wary of you and can find you tolerable, and that is as far as either goes.',
    note: 'The same rule that stops you handing a district to somebody who joined your crew yesterday. Breaking something of theirs is the one exception — that introduces you.',
  },
  // `leverage` further down is the hostage-release mode, which had the id first.
  hold: {
    title: 'A hold over them',
    body: 'A reason to say yes that has nothing to do with liking you: you hold the street their door opens onto, you have been through their books, or somebody they are close to is in your cellar.',
    note: 'It layers on top of trust, it does not replace it. Somebody who does not trust you at all is not going to be talked round by either.',
  },
  favour: {
    title: 'What they owe you',
    body: 'Something real you settled for them — a debt covered, a problem sorted, a week they needed. Each one raises how far that relationship can go, and it is the only thing that does.',
    note: 'Money handed over is not a favour, except to an official, whose whole relationship with you is the money.',
  },
  npcrespect: {
    title: 'Respect (for you)',
    body: 'Whether they rate you as somebody. Raises what they will risk for you and how well a straight offer lands.',
  },
  nerve: {
    title: 'Nerve',
    body: 'How hard they are to frighten, 0 to 100. Every threat and strongarm approach subtracts it. Cowards start low; hotheads start high, and so does anyone with family and old friends on the same streets.',
    note: 'Hidden until you size someone up, or they trust you enough to show it.',
  },
  confrontation: {
    title: 'On your doorstep',
    body: 'A faction has come for a racket, a place or one of your people, and you are standing there. Stand and fight, call your crew in, or walk away — the odds shown are the odds rolled, and whatever you are carrying counts.',
    note: 'Ignore it until End Day and they do what they came to do, the same as if you had never been there.',
  },
  cased: {
    title: 'Cased',
    body: 'You have walked this place, counted the exits and read the room. Ops here are meaningfully easier for a few days, and you have a rough feel for everybody who was inside.',
    note: 'A proper size-up still tells you far more about one person than casing tells you about all of them.',
  },
  kit: {
    title: 'Kit',
    body: 'The equipment you personally own and carry: weapons, tools, tech, a car. You can have three things on you at once, and only what you are carrying counts on a job. Three kinds of place sell it: a pawn shop has a bit of everything, a computer store has tech and nothing else, and a back room has what neither of them will put on a shelf.',
    note: 'Every piece is a tradeoff. A sawn-off makes a loud job far better and a quiet one much worse; lockpicks do the reverse; a desktop tower is the most tech you can own and the last thing you want to be carrying through a door. Nothing here is a flat upgrade.',
  },
  connections: {
    title: 'Family and friends',
    body: 'Who this person actually has. Everybody in the city has people — a household of relatives, a couple of old friends, usually both. Anyone with more backup than their neighbours is harder to frighten and slower to trust a stranger, whoever they are.',
    note: 'Your name travels along these ties and nowhere else: the people who were there, then the people they know, then faintly one step further, then nothing. A reputation made on one side of town does not follow you to the other.',
  },
  closeness: {
    title: 'Closeness',
    body: 'How tightly a district is knitted together, 0 to 100%. Close districts have big families spread across the whole neighbourhood; a cold one has small households who keep to their own block.',
    note: 'Leaning on people in a close district is harder: everybody there has more behind them than a stranger would guess.',
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
  bizTier: {
    title: 'How far up the city it sits',
    body: 'Street places have a counter and somebody who has to open tomorrow — a raised voice can be enough. Established ones have books and a lawyer, and their owners have been leaned on before: talk will not move them, a broken window might. Institutions are not frightened of you at all. Chartered places — a casino, a merchant bank — are not leaned on at all; they are bought, and the room will not deal with you until you are somebody.',
    note: 'On the map each tier has its colour — slate, teal, terracotta, purple, going up — so you can read a street before you walk it. Gold always means yours. An institution never pays protection at any amount of fear: the way in is inside their books, or a real turn done for the owner.',
  },
  holdings: {
    title: 'The ledger',
    body: 'Every business, racket and production you have, in one place: what each takes a day, whether your own kind are crowding it out of its district, whether something next door is feeding it, and whether anybody is actually running it.',
    note: 'Sort by Crowding to find what to move, or by Trouble to find what to fix. "Needs a look" hides everything that is quietly working.',
  },
  asset: {
    title: 'A standing arrangement',
    body: 'Somebody who keeps their ears open for you, or turns up when it goes wrong. Not a favour — a favour is spent once. This keeps paying: word before a faction moves on you, or real odds on a job against their own people.',
    note: 'It costs what any big ask costs: they have to know you, and owe you something real or be somewhere you have a hold. Stop calling for a few weeks and they stop answering — each of them on their own clock, so a batch you turned in the same week will not all drift on the same morning.',
  },
  referral: {
    title: 'An introduction',
    body: 'Somebody who trusts you makes a call, and a stranger in their family or their circle will talk to you like somebody they have already met — because now they have.',
    note: 'It is the only thing that shortcuts the days and the meetings a real relationship otherwise takes. They have to know you properly first, and actually know the other person.',
  },
  nemesis: {
    title: 'Somebody who keeps turning up',
    body: 'A faction lieutenant who has met you enough times to be changed by it. Three things make one: beating you counts most, simply turning up again counts for something on its own, and every hiding you give them takes a little back. Enough of it and they are harder, better connected, and known by a name they earned against you.',
    note: 'Somebody who loses to you every single time stays a name on your sheet and never quite becomes this — but what the street has already learned about them never comes off. Settling whatever they are carrying is the other way out: a lieutenant who owes you something real can be asked to walk out on their own people.',
  },
  conversation: {
    title: 'A conversation',
    body: 'Their opening line, then what you can actually do right now. Some moves end it — the ones you came for. Others are openers: drop a name you both know, or bring up something out of your history, and whatever you ask next lands better.',
    note: 'An opener can go wrong and cost you. You get a few before they want you to get to the point. Opening a conversation is free; the time goes on how you close it.',
  },
  agendaMove: {
    title: 'Doing something about it',
    body: 'Once you know what somebody is carrying, you can settle it — clear the debt, get them out, square their score, put your name behind them, put somebody on whoever they are frightened for.',
    note: 'A settled problem is the one thing that makes somebody genuinely owe you, which is what protection, a place in the crew and a friendly price all need. Being liked is not enough on its own.',
  },
  ledger: {
    title: 'Your history with them',
    body: 'Everything that has actually passed between you: what you established about them, what you did, what they did, and what each of you owes the other. The same page for a shopkeeper and for a lieutenant.',
    note: 'A conversation can bring up anything on it. So can they.',
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
    note: 'It does not open an institution. No amount of it makes a bank or an accountant pay you — that door is leverage or a favour, never a threat.'
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
    body: 'Who holds this block, 0 to 100 each. Whoever is highest, with at least 30, runs it. Rackets, protected businesses and a safehouse all build yours.',
    note: 'It also sets what walking costs: free between blocks you run, half at 15 or more, full price where you have nothing. Yours decays by 2 a day on a block where you have nothing running.',
  },
  wealth: {
    title: 'Wealth',
    body: 'How much money moves through this block. Raises what block-scale rackets earn, what businesses are worth, and what product sells for.',
  },
  police: {
    title: 'Police',
    body: 'Patrol strength here: the block\'s own baseline plus whatever the precincts and city hall nearby are putting on it today. It multiplies the chance any racket here has an incident and how often production is interrupted.',
    note: 'The number on the block sheet is the live one. The Police map overlay shades the whole city by it.',
  },
  authority: {
    title: 'Precincts and city hall',
    body: 'The law is a building, not a gang. It sits on a block, watches outward from there, and decides for itself how hard to look at you. You cannot sit down with it, pay it tribute, ally with it or declare war on it — none of that means anything to a precinct.',
    note: 'Its radius grows as it escalates, so a block that was quiet can come under watch without anything on the block changing.',
  },
  posture: {
    title: 'How hard they are looking',
    body: 'Routine, watching, investigating, task force, crackdown. It climbs from how much heat you are carrying, how much of that came off the wire, and how many case files are open — and it climbs with a lag, so a bad week shows up for a while after the week ends.',
    note: 'A precinct answers to noise in the street. City hall reads reports, so wire trouble moves it faster than a brawl does.',
  },
  fog: {
    title: 'Unmapped ground',
    body: 'The city under cloud is city you have not been out to. It opens when you or somebody you have posted there walks to the edge of it — never by tapping it, and never by scrolling the map.',
    note: 'Post a crew member to guard a block out that way and they open it up without you making the walk.',
  },
  mapLayer: {
    title: 'Map overlays',
    body: 'Shading over what the sim already tracks per block: heat, wealth, police, one outfit\'s influence, or what a block would buy in a day. Nothing is simulated differently while an overlay is on — it is a way of looking, not a mode.',
    note: 'The chip names the overlay you are on. Tap it to pick another, and it folds away again so the map is a map.',
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
    note: 'Parley with the boss to put them on your payroll, fold them in or stake them, or take the corner by force.',
  },
  stakedCrew: {
    title: 'Staking a crew',
    body: 'You pay for a racket on their corner and they own it. They run it, you take 45% of what it makes, and you never have to stand in it or put anybody on it. The worst rate in the game and the least work.',
    note: 'The books are theirs, so some weeks are light and you are not told. A crew that gets strong enough — and does not like you enough — simply keeps it. Coming over to you or losing the corner to you hands it back; being swallowed by a faction hands it to them.',
  },

  // ---------------------------------------------------------------- derelict ground
  abandoned: {
    title: 'Derelict block',
    body: 'A block the city gave up on. No businesses, almost no police, almost nobody living there. Nothing to shake down, but nothing to go wrong either.',
    note: 'Nobody here can be a witness, because a witness has to be somebody who saw you. Scout the quiet districts to find them.',
  },
  claimed: {
    title: 'Claimed',
    body: 'You moved in and nobody argued. A safehouse here costs nothing to rent or keep, because the block is not on anybody\'s books.',
    note: 'The quietest place in the city to run a production, or to keep somebody nobody is supposed to find.',
  },
  hostage: {
    title: 'Held',
    body: 'They are alive and in one of your safehouses. Their own life stops: no agenda, no gossip, and nobody can reach them on the street.',
    note: 'Every day carries a risk that scales with the block\'s police and population, and with how long you have held them. Settle it: ransom, leverage, or let them go.',
  },
  holdRisk: {
    title: 'Risk of holding',
    body: 'The daily chance this goes wrong: somebody hears, they get loose, or they hurt one of yours. Built from the block\'s police and population and how many days it has been.',
    note: 'A derelict block has almost no police and almost nobody on it, which is why that is where this is done.',
  },
  ransom: {
    title: 'Ransom',
    body: 'Sell them back. Their faction pays what it can afford, up to what they are worth. Their people pay and hate you for it.',
  },
  leverage: {
    title: 'Leverage',
    body: 'Let them go owing you. A charm roll against their nerve, better the longer you have held them. It works and they do what you ask, or it fails and you have made a permanent enemy.',
  },
  opLocked: {
    title: 'Not yet',
    body: 'Ops open up as your operation does: people who have joined your crew, a safehouse of a certain size, a racket running, a business of your own, or a job of this kind already behind you.',
    note: 'Locked ops stay on the board so you can see what you are working toward.',
  },

  // ---------------------------------------------------------------- a business
  bizIncome: {
    title: 'Income',
    body: 'What this place honestly takes in each day. Protection is a cut of it where protection is possible at all, and it scales what rackets running here earn.',
    note: 'An institution takes in plenty and pays you none of it. What it is worth to you is what you can do with the owner, not a percentage.'
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
    body: 'The daily cut you take for making sure nothing happens. There are two ways in: fear, where their fear plus respect beats their nerve, or friendship, where an owner who trusts you (40+) agrees to 20% or less as a favour — you never have to hurt a friend to look after their place. Ten to fifteen percent keeps any owner warm. Higher breeds resentment, then snitches, then a rival they run to.',
  },
  partner: {
    title: 'Partner',
    body: 'A business owner you recruited brings their place in with them. You take a flat 20% — not a negotiation, and not something you lean on them for — and because they run it themselves it needs nobody assigned to it and carries the lower risk of a minded racket. Owners are much harder to recruit than regulars, and the better their place does the harder they are. The partnership ends the day they leave your crew, however they leave it.',
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
  racketSaturation: {
    title: 'Flooded with one kind',
    body: 'The same kind of racket, run over and over in one district, is worth less each time. The first few are untouched; past that each additional one earns a fraction of what the first did, and it never quite reaches zero.',
    note: 'Two ways out: run it in a different district, or run something different here. Saturation is per district and per kind.',
  },
  synergy: {
    title: 'Feeding each other',
    body: 'Some rackets make others better when you run both in the same district — the people moving product bring a fence everything else they lift, a wash needs paper to give it shape. The bonus goes to the one being fed.',
    note: 'It only pays while the feeder is actually running. Shut it down, or let it get raided, and the bonus goes with it.',
  },
  blockDepth: {
    title: 'Depth on a block',
    body: 'Influence builds faster on a block where you run several things than on one where you run one — each operation past the first adds half again, up to four. Holding a block for a while adds more on top.',
    note: 'A block you hold with real depth also bleeds influence into the streets around it. That is how territory actually grows: outward from somewhere you are strong, not one door at a time.',
  },
  dirtyRacket: {
    title: 'Dirty or clean',
    body: 'Most rackets pay in dirty cash. Laundering and no-show jobs pay clean. Orange numbers are dirty, green are clean.',
  },

  layLow: {
    title: 'Laying low',
    body: 'Going off the street on purpose. Heat falls fast while you are gone, because heat is people talking about you and nobody can find you to talk about. You get nothing done in the meantime: no action points, no legwork, and the street rates you a little lower for being nowhere.',
    note: 'Paid for in days, not in a percentage. A week under is most of a fortnight\'s earning — which is the point, because the alternative is a bust.',
  },
  cache: {
    title: 'The wall',
    body: 'Dirty cash put somewhere only you know about. A bust seizes most of what is on you and usually cannot reach this — usually.',
    note: 'How much fits falls with every person on your books, and by the fourth there is no hole at all. One person can hide money; an outfit cannot.',
  },
  loneWolf: {
    title: 'Working alone',
    body: 'With nobody on the books you draw about half the heat — one person to describe and nobody to describe them — jobs you run alone go better, the wall is at its biggest, and a short lane of work opens that only exists when there is nobody else involved.',
    note: 'It is a way of working, not a vow: take somebody on and it stops, and an outfit that gets taken apart is alone again.',
  },
  streetName: {
    title: 'What they call you',
    body: 'Once enough of the city is afraid of you or owes you, somebody says a name to your face and it sticks. Which name depends on which of the two got you there.',
    note: 'The same thing that happens to a lieutenant who keeps beating you, pointed the other way.',
  },

  lifestyle: {
    title: 'What it is all for',
    body: 'A home, a car, people who are paid to be awake. Not decoration: every step is permanent respect or fear, and both of those are what every scene in the game reads. People open conversations differently once the city can see how you live.',
    note: 'Security is worth something real on the night somebody comes for you personally, not just on the sheet.',
  },
  legitimacy: {
    title: 'Looking respectable',
    body: 'Money given away in public, which discounts every point of heat you draw afterwards. The only thing in the game you spend crime money on specifically to look less like a criminal.',
    note: 'It fades daily, so it is something you keep paying for. There is a floor on how invisible any of this can make you.',
  },
  trophies: {
    title: 'The record',
    body: 'Everything you did, read back off things the game was already writing down — the log, what people remember about you, the jobs, the outfits that are no longer there.',
    note: 'An empty line is part of the record too.',
  },
  timeOfDay: {
    title: 'When you go',
    body: 'Night is quieter and pays less — nobody is about, and nothing is in the tills. Daylight is worse odds and a bigger take, because that is when the money is in the building. A patrol at four in the morning has nothing else to look at.',
    note: 'The clock at launch is the clock that counts; changing it later will not move a job already out.',
  },
  specialist: {
    title: 'Hired for one job',
    body: 'Somebody who does one thing — a safecracker, a wheelman, somebody who works there. One fee, up front, and they are not on the payroll afterwards.',
    note: 'They are not reliable. A cheap one is cheap because they are a coin toss; what you see in the planner is what they are worth on average, and the night rolls each of them.',
  },
  loved: {
    title: 'Somebody outside it',
    body: 'A person with nothing to do with any of this. They are the only one a rival can use against you — crew know what they signed up for.',
    note: 'Keep the heat down and they never find out the half of it.',
  },
  goStraight: {
    title: 'Getting out',
    body: 'Clean money, nothing owing, nobody looking, and long enough at all of it at once that it is a decision rather than a good morning. The other way this ends.',
  },

  // ---------------------------------------------------------------- production
  quality: {
    title: 'Quality',
    body: 'What the next batch will be worth, 5 to 100. Set by whoever is working it — a crew member, or you — plus the production level and the recipe. A line nobody is near makes 22.',
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
  selfWorked: {
    title: 'You work it yourself',
    body: 'With nobody on it, you run one line personally — whichever your own skill does the most good on. Better than leaving it empty, and worse than a crew member who does nothing else, which is the reason to hire one.',
    note: 'You are one person, so it is one line. The second production is what sends you out to find somebody.',
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
  complication: {
    title: 'Mid-job',
    body: 'Big jobs do not always resolve in one roll. Something happens halfway — more people in the room than anybody counted, a door on a delay, a patrol car early — and the crew stop and look at you. The three answers are the same three you would use at your own door, and whatever you are carrying counts the same way.',
    note: 'Answer well and the job gets meaningfully easier; answer badly and it gets harder. Ignore it until End Day and the crew decide for themselves, which is worse than either.',
  },
  lawJob: {
    title: 'Working on the law',
    body: 'Buying an Authority\'s attention down, getting one of your own out of a cell, or killing an open file outright. All three get harder and more expensive the harder the building is already looking, so the cheap time to do them is before you need to.',
    note: 'Killing a file is not the same as frightening its witness: a silenced witness stops the file growing, this closes it.',
  },
  opChance: {
    title: 'Chance of success',
    body: 'The skills of everyone on the job against its difficulty, weighted by the approach. On a job you can do alone you are one of the hands, and what those jobs ask for is what one capable person brings — so your background decides which of them are yours. Add crew, better kit, or an inside man, who is worth more than either.',
    note: 'Each skill counts for at most 1.3× what the job asks, so a fourth pair of hands on the same skill adds nothing.',
  },

  // ---------------------------------------------------------------- the wire
  wire: {
    title: 'The wire',
    body: 'Stolen cards, taps on people, and whatever those two turn up. Everything on the wire pays dirty and makes its own kind of heat, which no bribe will touch.',
    note: 'Scrubbing your trail is the only thing that clears wire heat. Budget for it before you start.',
  },
  card: {
    title: 'A lifted card',
    body: 'A tier, a limit and a freshness clock that falls 9 a day. Fresh cards pay near the full slice of the limit; a cold one is worth almost nothing and stops working without telling you.',
    note: 'Run it or dump it within a week. After that you are carrying evidence, not money.',
  },
  cardRun: {
    title: 'Running a card',
    body: 'A quiet run takes a small slice and rarely kills the card. One big score takes most of what is left and usually ends it — and is far likelier to get it flagged. Running a flagged card again is how a police file gets opened.',
    note: 'Your tech skill lowers both bad outcomes. A stale card raises them.',
  },
  cardDump: {
    title: 'Dumping the pile',
    body: 'A carding racket of your own buys every live card wholesale at about a quarter of face value. Far less than running them, and it carries no exposure at all.',
    note: 'The right answer when heat is high or the cards have gone stale.',
  },
  tap: {
    title: 'A tap',
    body: 'Persistent listening on one person. It feeds you a line most days and compounds a discovery risk every day it runs. The risk is about them, not where they are: how closely they watch their own affairs, and whether somebody checks things for them.',
    note: 'Found out, they lose all trust in you and talk. Pull it before it is worth more than they are.',
  },
  ratted: {
    title: 'Been inside',
    body: 'You have had a proper look at this person\'s business, by a quick read or a tap. Some jobs — wire fraud above all — are only possible against somebody you have already been inside.',
    note: 'It is per person. Reading one of their people does nothing for the next.',
  },
  dirt: {
    title: 'Dirt',
    body: 'A secret you learned about somebody. A rival faction will buy it, and pays far more for a boss than a soldier, more again if they are already at war with that person\'s people.',
    note: 'Roughly one sale in three gets back to them. Selling dirt on a faction you still need is a choice, not an accident.',
  },
  scrub: {
    title: 'Scrub your trail',
    body: 'A day of quiet unpicking: paper burned, a name off two lists, a clerk looked after. It takes points off both your wire heat and your ordinary heat for cash, and needs no captain and no councillor.',
    note: 'Tech and brains buy more points per pass and a lower price per point. It is the only way wire heat comes down.',
  },
};

/** A term id that definitely exists, for typo safety at call sites that want it. */
export type GlossaryId = keyof typeof GLOSSARY;
