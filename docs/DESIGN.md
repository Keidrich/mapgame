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

## 4. Player systems

- **Cash** (clean) and **dirty cash**. Dirty cash can buy from criminals; clean cash
  buys businesses and pays officials. Laundering converts at capacity per day.
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
  no fetch. Fully testable headless. Chunk geometry arrives as the payload of a
  `populate_chunk` action, so the sim never touches the network.
- `/geo` — pure geometry: chunk grid, Overpass query/parse, planar-face polygonisation
  of streets into blocks, hex fallback.
- `/content` — data: business type table, name pools, racket/production/op
  definitions, event cards, faction archetypes.
- `/ui` — React + MapLibre GL. Reads state, dispatches actions. Mobile-first, bottom
  sheets, thumb-reach nav. `ui/net` is the only network code (Overpass, Nominatim).
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
