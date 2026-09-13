# RACKETS — Design Document (alpha)

Working title: **RACKETS: Crime Empire**. Mobile-first, map-based crime empire sim in
the lineage of City of Gangsters, Plug: Build Your Empire, Cartel Simulator and Torn.
The map is the real world (OpenStreetMap tiles). You start anywhere — where you are
standing, a searched city, or a tapped point — and the game lays a hex turf grid over
that real place, fills it with businesses, people and rival factions, and lets you
build.

## 1. Pillars

1. **The map is the game.** Every decision is made by looking at real streets. Turf is
   visible: your hexes, their hexes, contested hexes.
2. **Relationships run the rackets.** Businesses have owners and patrons. Owners decide
   whether to pay, sell, partner or snitch based on how they feel about you (trust,
   fear, respect). Patrons are your intel, your recruits, your customers.
3. **Factions are players too.** Four AI factions run the same systems you run:
   they extort, expand, produce, negotiate and go to war. Politics escalates on a
   ladder: peace → tension → beef → war, with sit-downs, tribute and alliances as
   off-ramps.
4. **Sandbox, not a campaign.** No level cap. Lose by getting busted flat broke or by
   being wiped off the map; win by owning the city. Everything in between is play.
5. **Fun without the network.** All game logic is a pure, seeded simulation. Map
   tiles and place search are the only network calls, and both are optional.

## 2. Time and session shape

- A **turn is one day**. Actions on the map cost **Action Points (AP)**; you get 8 per
  day. Crew members take **assignments** that resolve at end of day.
- **End Day** resolves: racket income, production, ops progress, faction AI, heat and
  police, relationship drift, and 0–2 **events** (short choice cards).
- Sessions are 2–5 minutes: check the map, react to events, place crew, end day.
- Real-time idle play (AP regen while the app is closed) is a later feature; the day
  model keeps the sim deterministic for the alpha.

## 3. The world

### 3.1 Real streets, loaded as you go
The map is the real world (OpenStreetMap data rendered with MapLibre GL, the same
stack Plug uses). The playable world is divided into **chunks**, square cells of about
2.2 km. When a chunk scrolls into view its street network is fetched from OpenStreetMap
and polygonised: every face enclosed by streets becomes a **Block**. Slivers are merged
into their neighbours, water and giant faces (parks, rivers, airports) are dropped, and
each block is named after its two longest bounding streets ("Broadway & Wall St").

Unvisited chunks show as faint outlines. The first time the player taps into one, the
sim **populates** it: districts, businesses, people, and sometimes a new faction. Block
ids are stable hashes of their street ring, so a re-fetched chunk maps onto the saved
world. Blocks link to neighbours across chunk borders through shared street edges.

Where there are no streets (open country, no network) a hex grid stands in.

### 3.2 Blocks
- `wealth` 0–100, `police` 0–100 (baseline patrol), `heat` 0–100 (your notoriety
  here), `population` (drives patron count and product demand), `areaM2`.
- `influence: Record<FactionId, number>` — control is whoever has the most, above a
  threshold. `player` is a faction id too.
- `district` — real neighbourhood names from OpenStreetMap when available, with the
  district's character (Docks, Downtown, Old Quarter, Industrial, Heights, Market,
  Strip, Projects) inferred from what is actually there: banks and hotels say
  downtown, clubs and bars say strip, warehouses and industrial land say docks.

A district also carries two properties that are deliberately kept apart:

- `nameGroups` — which naming pools are common here, as weights (see §3.4). **Cosmetic
  and naming only.** It is what makes one district read as Little Italy and the next as a
  Chinatown-flavoured block. Nothing in `sim/` may read it when working out a number.
- `closeness` 0–1 — how networked the people who live here are. Old Quarter and the
  Projects lean high, Downtown and the Heights lean low. It is a property of the *place*,
  never derived from `nameGroups` and never a stand-in for who lives there. It drives one
  thing: how dense and how far-reaching the family/friend web is (§3.6).

### 3.3 Businesses
Real points of interest from OpenStreetMap become businesses with their real names
(bars, pubs, restaurants, cafés, clubs, banks, jewellers, pawn shops, garages, gyms,
laundromats, corner stores, motels, warehouses). Procedural businesses fill blocks the
data leaves thin. A business has a type, an **owner** NPC, a set of **patron** NPCs,
base income, a **protection** record (which faction, what rate), an `ownedBy` (npc /
player / faction) and a list of attached **rackets**.

Business types and what they're good for:

| Type | Rackets it hosts | Notes |
|---|---|---|
| bar | numbers, bookmaking, gambling den | patrons = recruits & rumours |
| diner / restaurant | numbers, laundering | quiet money |
| laundromat | laundering | the classic |
| pawn shop | fencing | turns loot into cash |
| garage | chop shop | needs wheels |
| nightclub | gambling den, dealing, laundering | high income, high heat |
| corner store | numbers, dealing | cheap first racket |
| barbershop | numbers, intel | patrons talk |
| gym | recruitment | muscle |
| cab company | smuggling, wheels | moves product |
| construction firm | fraud (no-show jobs), union racket | political ties |
| warehouse | storage, production, smuggling | safehouse candidate |
| motel | safehouse | crew housing |
| bank / jeweller / armoured depot | heist targets | not for rackets |

### 3.4 People (NPCs)
Roles: business owner, patron, crew, faction boss / lieutenant / soldier, cop,
official (police captain, councillor, judge), fixer. Every NPC has:
- skills: muscle, brains, charm, wheels, tech (1–10)
- traits (2): greedy, loyal, coward, hothead, connected, honest, ambitious, junkie,
  gambler, quiet
- **relationship to the player**: `trust` −100..100, `fear` 0..100, `respect` 0..100
- `nerve` 0..100: how much pressure it takes
- `faction` affiliation and `home` block
- `connections`: their own family and old friends among the other NPCs (§3.6)

**Names.** `content/names.ts` holds eight groups — Italian, Slavic, Black American, East
Asian, Latino, Irish, Middle Eastern, Anglo — each a pool of first and last names that
belong together. `mkNpc` picks a group first, weighted by the district's `nameGroups`,
then draws both halves of the name from that one group, so a street has a character and
nobody is called Tony Byrne. Big per-group pools (thirty to fifty first names each) are
what stops a city repeating itself; the faction archetypes keep their own surname list
(`STYLE_LAST`) layered on top, so the Marconi family are Marconis wherever they live.

A name group is a naming pool and **nothing else**. There is no ethnicity field on an NPC,
and no skill, trait, nerve or trust anywhere in the codebase reads a group.
`sim/no-ethnicity-mechanics.test.ts` enforces both, by behaviour and by scanning the source.

### 3.5 Scenes: how you deal with people
Face-to-face actions (Visit, Threaten, Shakedown, Recruit) are **scenes**. The person
opens with a line chosen by their most telling trait and how they feel about you. You
pick an **approach**; each shows its success chance, what you gain, what it costs when
it goes wrong, and its price in AP or cash. The odds come from one function that the
UI and the simulation share, so what you see is what the dice use.

| Scene | Approaches |
|---|---|
| Shakedown | Lean on them (muscle) · Talk business (charm) · Break something first (crew) |
| Threaten | Quiet word · Bring the crew · Mention what you know (brains; honest owners go to the cops) |
| Visit | Buy a round ($50) · Talk business (tips) · Just listen |
| Recruit | Offer a real cut (+40% wage, loyal) · Sell the dream (charm) · Lean on them (cowards fold) |

Ops have approaches too: **go in loud** (muscle, +25% take, heat ×1.6), **quiet job**
(brains and tech, heat ×0.5, harder), **inside man** (someone at the target who trusts
you at 35+ opens the door; if it fails they are burned).

### 3.6 The family and friend web

Nobody in a city knows nobody. At generation time every NPC ends up with people — mutual
ties stored on `Npc.connections`, nothing to do with the player — built in two passes:

1. **Households.** Most people (~85%) belong to a family: three to six relatives, *all*
   tied to each other, under one surname. The household name comes from an owner when the
   family has one, because business names hang off their owner's surname; a second owner or
   a relative out of another naming pool keeps their own name and married in.
2. **Friends.** Everybody is then topped up to at least three ties, with more where people
   are close, so the loners of the first pass still drink with somebody.

How dense the web is, how big the households are and how far they reach comes from the
district's `closeness`: a tight district is one web of cousins spanning the neighbourhood,
a cold one is households of three who keep to their own block. In practice a generated city
runs 3.5–5.5 ties a head, ~90% of people with living family, and a hundred-odd households of
three or more. Nobody carries more than eight ties.

What the web does today:

- **Backup.** Ties inside your own district *beyond the three everybody has* make you
  harder to frighten and slower to trust a stranger (+4 nerve and −2 starting trust each, up
  to three of them). Measuring from the baseline is what keeps a city where everyone knows
  people from being a city where everyone is hard to frighten: it is the people with more
  backup than their neighbours who are stiff. Identical for everybody: it reads the
  connection count and nothing else.
- **The family agenda** is only ever handed to somebody who actually has family, and names
  them: "went to the police to keep Rosa Esposito, their cousin, out of it."
- **Gossip** travels along real ties as well as the same-block, same-bar circle, so a
  humiliation reaches somebody's sister across the district instead of stopping at the bar.
- The NPC sheet lists who somebody has, and every name opens their own sheet.

**The Social tab** is where the web is legible: everybody the player has met (the same
"have we met" test a person's own sheet uses to decide whether to show traits), grouped by
whether they are connected to anyone else you know, by district, or by faction. Opening a
row lists their family and friends by kind; tapping one walks to that person's row, so a
family can be followed across a district. People you have not met still appear inside
somebody's tie list, marked *not met*, and tapping them opens their (mostly blank) sheet.

Alongside it, `Npc.playerNote` — the player's own memory aid, set through the `set_note`
action from either screen, capped at 240 characters and kept apart from `notes`, which is
the sim's own flavour ("Runs the Eastside Boys"). The two are never merged and neither
overwrites the other: one is what the game says about somebody, the other is what the player
says. A note is bookkeeping rather than a move, so it is free and can be written even while
an event is waiting.

Phase 2, not built: leverage plays on top of the graph (threatening a named relative,
friend-referral recruiting, turning a rival's brother into an inside man).

## 4. Player systems

- **Cash** (clean) and **dirty cash**. Dirty cash can buy from criminals; clean cash
  buys businesses and pays officials. Laundering converts at capacity per day — through a
  racket of your own, or early on through a fixer (§4.6).
- **Heat** (global) and per-block heat. Heat drives raids, arrests, busts.
- **Rep**: respect (from wins, generosity) and fear (from violence). Both spread to
  NPCs in nearby blocks.
- **Crew**: recruited NPCs. Each has skills, loyalty, cut, status (idle, assigned,
  injured, jailed, dead). Daily assignment: run a racket, work a production, join an
  op, guard a block, collect.
- **Lieutenants** (delegation): a crew member with loyalty 50+, five days in, and
  some muscle/brains/charm can be assigned to *run a district*. Rackets there earn
  without a runner (at the lieutenant's skill, capped below a real runner), rival
  hits get run off, and your influence on district blocks firms up. Their cut goes
  up by half. Low-loyalty or greedy lieutenants skim (hidden until you audit the
  books or the "book feels light" event fires); a hostile faction with a foothold
  in the district tries to flip them, and loyal ones bring the offer to you first.
- **Position and legwork**: you stand on exactly one block (`Player.currentBlockId`).
  Everything face to face (visit, read, threaten, shakedown, recruit, parley) requires you
  to be on that person's block; paperwork (assign, fire, audit, bribe, buy) does not.
  Walking spends **legwork**, a second daily pool separate from AP, sized by wheels
  (3 + wheels/2) and refilled at End Day. Routing is a cheapest path over `Block.neighborIds`
  where the price of a hop is set by territory, not by property: **free** between two blocks
  you run (influence highest and at least 30), **half** between two where you have a foothold
  (influence 15+), **full** otherwise. Totals round up, so one half-price hop still costs 1,
  but a walk entirely inside your own turf costs nothing. Taking ground is therefore its own
  reward: the city shrinks as you own more of it, and a safehouse helps only by building the
  influence that earns the block.
- **Safehouses**: rented/bought in a block. Store product and cash beyond police
  reach (partially), host production, house crew. Capacity by tier.
- **Product**: `booze`, `green`, `pills`, `hot goods` (loot), `counterfeit`.
  Produced at safehouse productions, sold via dealing rackets (demand per block).
- **Quality**: every batch gets a quality (worker skill and traits, production level,
  recipe). Stashes keep a running average per product and it follows the units
  when moved; street price scales 0.7×..1.2× with it. Productions upgrade to
  level 3 (more output, better quality, more heat and risk). **Recipes** change a
  production's profile (barrel-aged, hydroponics, clean synthesis, intaglio plates,
  and their fast-and-ugly counterparts); unlocked by the *Steal a Formula* op or by
  recruiting a specialist who knows one (Read reveals it). Production events: bad
  batch, worker skimming product, a jailed worker talking, sabotage by a hostile
  faction, a supplier shortage (restock ×2 for a week), and a flooded street
  (prices −30%).

### 4.1 Making the numbers legible

Every stat, chip and piece of jargon in the UI carries an explainer: a dotted-underlined
label, or a chip with a small `?`. Tap on a phone, hover on a desktop. The text lives in
`content/glossary.ts` and describes the real mechanics, including the thresholds that
change what the player should do (heat 45/60/100, loyalty 50/30/15, trust 20/35,
protection at 15%). It is a rule of the project that a balance change in `sim/` updates
the matching glossary entry. Onboarding also spells out what each background actually
changes rather than only its flavour.

### 4.2 Derelict ground

Some blocks are dead: no businesses, almost no police, almost nobody living there. They are
generated only where the map itself has nothing (a block carrying real OpenStreetMap
business data is never emptied) and only where the police band is in its bottom third,
which the industrial and dock districts hit most often. About 3% of blocks.

They carry no special heat or risk rule. The racket and production formulas already scale
with the block's `police`, and the witness pool for a cold case is drawn from a block's
businesses, so a derelict block is quieter and unprosecutable purely because of what it
already is. **Scout the Edges** searches a district and may turn up one unknown derelict
block, or nothing. **Take the Lot** claims a found one, loud (force), quiet (patience) or
inside (a councillor moves a file). A claimed block can be squatted: a safehouse there
costs nothing to take and nothing to keep, which is how it becomes production and storage
through the systems that already exist.

### 4.3 Hostages

**Take Someone** moves a person into one of your safehouses. They stay alive but out of
their own life: agendas stop, gossip stops, and they cannot be met on the street. They take
one of the safehouse's beds.

Holding carries a daily risk built from the same fields as everything else: the block's
police and population, multiplied by the days held, adjusted by their traits. Nothing says
"a derelict block is safer"; it simply is. When it breaks: somebody calls it in (heat, and
a case file opens), they get loose (a permanent grudge and the block remembers), or they
hurt one of your crew. Settle it by **ransom** (their faction pays what it can afford, and
resents it), **leverage** (a charm roll against their nerve, better the longer you have held
them, giving you a hold or a permanent enemy), or letting them go.

### 4.4 Op progression

`OpDef.requires` gates each op on crew ever recruited, safehouse tier, a racket running, a
business owned, or a prior op completed. `select.opsAvailable(w)` and `select.opLocked(w, k)`
report it, in the same shape as `availableRackets`. The Ops tab is a tree by tier with every
op visible, locked ones included: edges are drawn from `priorOps` and the other requirements
are badges. A locked node explains exactly what is missing through the same explainer
component the glossary uses. The street tier (stick-up, send a message, take the corner,
scout, take the lot) has `minCrew: 0` and is genuinely solo.

### 4.5 Who you are, and where you start

**Five backgrounds**, one per skill. Muscle, Brains and Charm open loud, patient and
social; **Wheels** gets two extra legwork a day on top of the skill (nine hops where most
people get three); **Tech** starts already knowing one still or grow-op recipe, worth days
of play. Definitions and numbers live in `content/backgrounds.ts`.

**Or build your own**: point-buy, nineteen points over the five skills, one to seven each,
plus one starting trait (connected, earner, local, feared). The budget is below every
preset's total and the ceiling below their spike of 8, so a hand-built character is broader
and brings an edge while a preset is sharper and comes with a perk. `legalCustomSkills()`
clamps whatever the UI sends, so the rule holds even if the screen is bypassed.

**Where you start.** A city is one coordinate, so picking a city twice used to mean the
same kerb twice. `sim/start.ts` moves a *city-level* pick 1–4 km into one eighth of the
compass first (area-weighted, so most starts land out in the neighbourhoods), and "Try a
different corner" rolls again without giving back the corner you are in. Whether a pick is
city-level comes from the geocoder; an address somebody typed, a pin tapped on the map and
the device's own position are exact and are never moved.

### 4.6 The fixer: money washed before you own a machine

Setup costs are clean-cash only, on purpose — dirty money must not buy its own way out. But
that rule has a dead end in it: a player with a pile of dirty money, no laundering racket and
no clean cash to start one has nothing left to do about it. Every world therefore seeds one
**fixer** on the starting block, alongside the other two starting guarantees (the soft-nerve
first mark and the old friend who already trusts you).

A fixer is a *person*, not a business: nothing to own, nothing to set up, no laundering-capable
business planted near the player. `launder_with_fixer` costs 1 AP and has to be done face to
face, like every other dealing with a person, and is entirely separate from `launder` — it
never touches the player's own racket capacity or `launderedToday`.

What they give is deliberately worse than the real thing, for ever:

- **Rate**: `FIXER.minRate` 0.55 at trust 0 rising linearly to `FIXER.maxRate` 0.70 at trust
  100, against a laundering racket's `LAUNDER_RATE` of 0.85. Trust-scaled the same way an
  owner's asking price is. The ceiling is below the racket by design, so owning capacity is a
  real upgrade rather than a faster version of the same thing.
- **Window**: `capBase` $400/day plus $8 per point of trust — $1,200/day at trust 100, against
  a level-1 racket's $1,500 base before its own multipliers. The window is *fixed when they
  first take money that day*, so trust earned today widens it tomorrow and "come back
  tomorrow" means it.
- **Payoff**: each use builds trust with `adjustRel`, scaled by how much of their day you
  filled, so leaning on them early genuinely improves the deal.

They start at trust `FIXER.startTrust` 20 and `known: true` — usable on day one, a long way
from the best deal.

### 4.7 Kit: what you carry

A layer alongside the product Stash, not a replacement for it. The stash is bulk goods sold
by the unit; **kit** is equipment you own (`player.items`) and carry (`player.equipped`, three
slots). Definitions live in `content/items.ts`; `sim/items.ts` reads them and nothing invents
per-item behaviour anywhere else.

An item is three numbers and never a flat upgrade:

- `skillBoost` folds into the crew's skill total in `opChance()`, as if somebody brought an
  extra pair of hands.
- `approachBias` scales the chosen approach's skill weights. A sawn-off is +0.5 on loud and
  −0.35 on quiet; lockpicks are +0.35 quiet and −0.15 loud. The same kit that makes one
  approach a good idea makes another a bad one.
- `heatMult` multiplies what a job leaves behind, the same way an approach's `heat` does, on
  success and on failure.

One limit worth knowing: `opChance` caps each skill's contribution at 1.3× what the job needs,
so kit cannot gild a job the crew is already over-qualified for — it closes gaps on the hard
jobs, and the penalty side always lands. That is the intended shape, and
`sim/items.test.ts` pins it.

The catalogue starts small and real: three weapon tiers (bat → pistol → sawn-off), a lockpick
set, a getaway car, a burner phone and a laptop. The last two are deliberately the groundwork
for a later cybercrime pass — the type can already represent them; nothing reads them yet.

**Markets.** Pawn shops sell what they can legally display; a **back room**
(`black_market`, one per ~15 blocks of a district, never where the police are thick) carries
the rest. Stock is derived from the business id, so a shop's shelf is its own, stable, and
costs nothing in the save. Buying takes clean cash and being there in person, like every other
purchase; selling pays **dirty**, like anything else out of a back room — there is no
laundering exception for used kit. Every generated city has at least one back room, because a
city without one would cap the weapon ladder at a baseball bat.

Items do not wear out, break or get lost in this phase. When something eventually takes a
piece of kit off the player, it removes one id and that is the whole of it.

## 5. Rackets, production, ops

**Rackets** (persistent, on a business): protection, numbers, bookmaking, gambling
den, loansharking, fencing, chop shop, dealing, laundering, smuggling, no-show jobs.
Each has: requirements (business type, crew skill), income formula, heat/day,
risk table. Assign a crew member to run it or it runs at half efficiency.

**Productions** (persistent, at a safehouse): still (booze), grow op (green),
lab (pills), print shop (counterfeit). Ingredients cost, output/day, heat/day,
crew skill needs.

**Ops** (one-off, multi-day): heist (bank, jeweller, armoured car, warehouse),
robbery, insurance fraud (torch an insured business you own), check-kiting fraud
(via a front), smuggle run, hit, intimidation. Plan phase in days, crew slots with
skill requirements, success roll from crew skills vs difficulty and heat, payout
as cash/loot, consequences as heat/injury/jail/faction anger.

## 6. Factions and politics

Four generated factions with a home district, temperament (aggressive, greedy,
diplomatic, paranoid), boss + lieutenants, soldiers (strength), cash, and territory.

Every day each faction AI:
1. Collects from its protected businesses.
2. Spends: recruits soldiers, or pushes influence into an adjacent block (prefers
   wealthy, low-police, weakly-held blocks).
3. Extorts unprotected businesses in blocks it controls.
4. Evaluates the player: incursions into its blocks, attacks on its assets, tributes
   paid, favours done → **standing** −100..100.
5. Moves on the ladder:
   `alliance ↔ peace ↔ tension ↔ beef ↔ war`
   Tension sends a warning event. Beef means sabotage of your rackets and
   shakedowns of your businesses. War means attacks on crew and safehouses, and you
   can raid theirs. Sit-downs (cost AP + a lieutenant's respect) open negotiation:
   tribute, cede a block, joint racket, truce, alliance.
6. Faction-vs-faction: they also feud with each other; wars create openings.

**Succession crises**: a boss who dies or goes away with two lieutenants left
starts a three-day contest. The faction neither expands nor attacks meanwhile,
soldiers drift, and the player can back a candidate with cash and their name.
Backing the winner earns standing, a truce and a favour the new boss repays at
sit-downs; backing the loser costs standing and a grudge. Bosses occasionally go
down on their own. The **Frame** op puts a boss or lieutenant away on a planted
case (and can trigger a crisis); **brokering** through a lieutenant ends a beef
or war between two factions for a truce, standing on both sides and a fee.

**The Commission**: once three factions share the city (day 15+), the bosses
form a table that meets every 10 days on a proposal: the peace (all beefs pause),
the pot (a tax to the biggest holder), a sanction (cut off whoever is at war with
too many), a claim (recognise a district), or a chair for the player. Factions
vote by temperament and self-interest. Without a chair the player can lean on an
ally for half a vote; with one (petition, or the table votes you in) their vote
counts, the pot can pay them, and members drift back toward peace with them.
Voting with a member warms them; against, cools them.

**Cold cases**: a hit, a bank or armored job, a sloppy jewel heist, an arson or a
suspected frame opens a police file with, usually, a witness from the block.
Evidence builds with heat and a talking witness, slower with the captain bought
and a lawyer retained. Scare the witness (fear 40+), pay them, or make them go
away; bribe the captain to bury paper. At 100 evidence somebody is charged: a
crew member from the job takes the fall, or the player is indicted (bail, seized
cash, rackets dark). Files go cold after 25 days under 60 evidence.

**City Hall**: police captain (bribe → heat decay, raid warnings), councillor
(donate → permits: cheaper business purchases, blocked rival development), judge
(retainer → crew released from jail faster). Each is an NPC with the same
relationship model; they can be flipped by rivals.

## 7. Events

End of day draws from a weighted table keyed by world state: raid warning, owner
asks a favour, patron offers a tip, rival muscle appears, crew member wants a raise,
cop wants a taste, opportunity (a truck with no escort), betrayal. Each event is a
card with 2–3 options. Options apply deterministic outcomes.

## 8. Failure and recovery

- **Busted**: heat ≥ 100 and a raid lands: lose dirty cash on hand, product outside
  safehouses, and some crew go to jail. Heat resets to 40. Not game over.
- **Wiped**: no crew, no businesses, cash < 0 during a war: game over with a summary.
- **Owning the city**: control ≥ 60% of blocks → victory card, sandbox continues.

## 9. Tech and architecture

- `/sim` — pure TypeScript. Seeded PRNG only. `(state, action) → state`. No React,
  no fetch. Fully testable headless. Chunk geometry arrives as the payload of a
  `populate_chunk` action, so the sim never touches the network.
- `/geo` — pure geometry: chunk grid, Overpass query/parse, planar-face polygonisation
  of streets into blocks, hex fallback.
- `/content` — data: business type table, name pools, racket/production/op
  definitions, event cards, faction archetypes.
- `/ui` — React + MapLibre GL. Reads state, dispatches actions. Mobile-first, bottom
  sheets, thumb-reach nav. `ui/net` is the only network code (Overpass, Nominatim).
- **`can()` runs during render.** Every button asks it whether it is enabled, so a throw in
  `can()` is not a bad button — it unmounts React and blanks the screen with the save out of
  reach. Two rules follow: `can()` answers for any action the UI can put on screen (never
  assume a shape — `factionOf` hands back street crew ids as readily as faction ids), and the
  UI keeps error boundaries around the tabs, the sheets and the game itself so a crash costs a
  panel rather than the session. `sim/affordances.test.ts` and `ui/sheets.test.tsx` hold both
  ends of that: every question the UI asks, and every sheet it can open.
- Persistence: autosave to IndexedDB (the world grows with every chunk). Export/import as JSON.
- PWA: installable, tiles cached.
- Later: Capacitor wrapper for stores; real POIs via Overpass; real-time AP regen;
  multiplayer factions via a server (Torn-style).

## 10. Alpha scope (tonight)

Everything in §3–§7 in a first playable form: generation, all racket/production/op
types with simple formulas, faction AI with the full ladder, sit-downs with four
offers, City Hall with three officials, 12+ event cards, save/load, onboarding.

## 11. Open questions for the owner

- Real-time idle (AP regen by wall clock) vs pure day-turns for the beta?
- Monetisation model (cosmetic only, or premium currency for AP/time)?
- Multiplayer: shared city with human factions (Torn) or single-player only?
- Real POIs from OpenStreetMap as business names/positions (needs Overpass and a
  fallback), or fully procedural?
