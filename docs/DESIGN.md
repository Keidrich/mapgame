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

### 3.1 Grid
A pointy-top hex grid of radius 6 (127 hexes, ~350 m across each) centred on the
start point, projected onto lat/lng with a local metric approximation. Each hex is a
**Block**.

### 3.2 Blocks
- `wealth` 0–100, `police` 0–100 (baseline patrol), `heat` 0–100 (your notoriety
  here), `population` (drives patron count and product demand).
- `influence: Record<FactionId, number>` — control is whoever has the most, above a
  threshold. `player` is a faction id too.
- `district` — blocks cluster into 6–8 named districts (Docks, Downtown, Old Quarter,
  Industrial, The Heights, Market, Nightlife Strip, The Projects) that set the mix
  of business types, wealth and police.

### 3.3 Businesses
Each block holds 1–5 businesses. A business has a type, an **owner** NPC, a set of
**patron** NPCs, base income, a **protection** record (which faction, what rate),
an `ownedBy` (npc / player / faction) and a list of attached **rackets**.

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
- traits (2): greedy, loyal, coward, hothead, connected, honest, ambitious, junkie
- **relationship to the player**: `trust` −100..100, `fear` 0..100, `respect` 0..100
- `faction` affiliation and `home` block
- owners know their patrons; patrons have favourite businesses (that is where you
  meet them).

**Relationships decide outcomes.** Examples:
- Shakedown: owner pays if `fear + respect` beats their nerve; a coward pays early,
  a hothead resists; failing raises heat and makes the owner call a rival.
- Buy business: needs trust ≥ 30 or an offer above value; honest owners won't sell
  to someone with high heat.
- Recruit patron: needs trust ≥ 20 (or fear ≥ 60 for a coward); the recruit brings
  their skills and their own loyalty.
- Tip-offs: patrons with trust ≥ 40 warn you about raids and rival moves.
- Snitching: owners with trust < −40 and low fear talk to the cops.

## 4. Player systems

- **Cash** (clean) and **dirty cash**. Dirty cash can buy from criminals; clean cash
  buys businesses and pays officials. Laundering converts at capacity per day.
- **Heat** (global) and per-block heat. Heat drives raids, arrests, busts.
- **Rep**: respect (from wins, generosity) and fear (from violence). Both spread to
  NPCs in nearby blocks.
- **Crew**: recruited NPCs. Each has skills, loyalty, cut, status (idle, assigned,
  injured, jailed, dead). Daily assignment: run a racket, work a production, join an
  op, guard a block, collect.
- **Safehouses**: rented/bought in a block. Store product and cash beyond police
  reach (partially), host production, house crew. Capacity by tier.
- **Product**: `booze`, `green`, `pills`, `hot goods` (loot), `counterfeit`.
  Produced at safehouse productions, sold via dealing rackets (demand per block).

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
  no fetch. Fully testable headless.
- `/content` — data: business type table, name pools, racket/production/op
  definitions, event cards, faction archetypes.
- `/ui` — React + Leaflet. Reads state, dispatches actions. Mobile-first, bottom
  sheets, thumb-reach nav.
- Persistence: autosave to localStorage (seed + state). Export/import as JSON.
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
