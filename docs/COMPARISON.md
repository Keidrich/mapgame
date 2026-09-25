# RACKETS and the Remake, side by side

What each game has, and what the Remake is still missing from the original. Written 2026-09-25,
after the eight-pillar roadmap and the procedural-stories pass. `docs/DESIGN.md` is the original's
design authority and `docs/REMAKE.md` the Remake's; this file compares them.

## In one paragraph each

**The original (RACKETS)** is set on the real world. It streams streets from OpenStreetMap, anywhere
on Earth, under fog of war, and starts you at your GPS position, a searched city or a random one.
It is deep in the economy:
- 19 kinds of racket and 31 kinds of business, up to chartered institutions;
- 5 kinds of production with named recipes and foremen;
- a cyber lane (the wire: cards, taps, dirt-brokering, its own heat);
- intel arrangements, and fortune sinks for late-game money.

It has 70 jobs in a tree, a legwork pool for walking, and a social web with its own moves: read,
gift, turn somebody, introduce, defect.

**The Remake** is set in a city generated from a seed: coast, river, bridges, districts, parks and
landmarks, in a region of five or six cities joined by train. It is deep in play:
- day and night;
- a family with ranks and betrayal, and fights with bullets;
- supply chains, and a character you train;
- playable poker, dice and the numbers;
- car theft;
- procedural stories and city-wide seasons;
- a 3D map, a step-by-step tutorial, and three save slots.

It carries all 70 of the original's jobs (72 kinds with its own).

## Side by side

| Area | Original | Remake |
|---|---|---|
| **The city** | Real streets from OpenStreetMap, any place on Earth, streamed in 2.2 km chunks | Generated from a seed: a warped grid, coast, river, 5–12 districts, parks, landmarks. Small, city or metropolis (about 100, 170 or 250 blocks) |
| **Where you start** | Your GPS position, a searched city, a tapped point, or a random world city | A seed you pick, roll or share |
| **More than one city** | One world that keeps growing | A region of 5–6 cities, trains, trade routes, remote work |
| **Fog of war** | Yes: cloud clears only where you or your crew have been | No: the whole city is visible |
| **The map** | MapLibre, 6 layers (control, heat, wealth, police, influence, demand) | SVG with the real buildings on every block, 4 overlays, and a 3D mode (three.js) with lit windows |
| **Getting around** | Legwork: a separate walking budget each day | Next door and your own ground are free; a cab costs an hour |
| **Time** | 8 action points a day; jobs pick an hour (night +9 odds) | A day half and a night half (8–11 hours plus 3 after dark); different people, talks and jobs at night |
| **Businesses** | 31 types, 4 tiers (up to chartered: merchant bank, shipping line, development co.) | 23 types, 3 tiers |
| **Rackets** | 19 kinds, upgrades, saturation, synergy, loansharking float | 14 kinds, upgrades, saturation, synergy, runners, lieutenants |
| **Production** | 5 kinds (still, grow, lab, print shop, cut house), 6 products, 20+ named recipes, foremen, supply orders | 3 labs (still, grow, lab), 4 products; supply chains through your bars and clubs, with drivers and hijacks |
| **Laundering** | Racket (85¢), fixer (55–70¢), "wash it sideways", offshore account (72¢), a cache for small outfits | Laundry racket (switched on and off), fixer by hand; cars sold clean |
| **The wire (cyber)** | Card pile, taps, dirt-brokering, scrubbing, its own heat, hack crew | Wire jobs are in the catalogue; no card pile or taps |
| **Jobs** | 70 kinds in a tree by tier with prerequisites; loud, quiet or inside man; modes | 72 kinds (all 70 of the original's, some merged); loud, quiet or clever; complications; 12 landmark set-pieces |
| **Crew** | 5 skills, 8 assignment kinds, lieutenants who skim and can be flipped, 37 items (3 each), 8 specialists | 5 skills, levels, loyalty; runner, lab, guard, lieutenant, driver; 30 items in 6 slots; specialists; **a family**: ranks, making ceremony, underboss, consigliere, rats, coups |
| **Fights** | Confrontations at your door: fight, flee, call backup | Three-round fights, bullets, attacks on rival blocks, ambushes at night, hospital time |
| **You** | Background or point-buy; a street name earned at 55; lifestyle ladders | Background; ranks (Nobody → Kingpin) that give hours; training and study; boosts and a habit; reputation (feared, respected, man of honour) |
| **People** | Visit, threaten, shake down, recruit, **read, gift, turn an asset, introduce, defect a rival lieutenant**, conversation openers, a ledger per person | Talk, lean, protect, squeeze, recruit, bribe, settle, use what you know, buy, favours; street-crew scenes |
| **Rivals** | 2–10 outfits (more appear as the map grows); a 5-step stance ladder; 6 sit-down offers; brokering; backing a succession; the upstart | Outfits per city; stances; 3 sit-down offers and tribute; war; truces; street crews that grow into outfits |
| **The Commission** | Proposals, votes, petition for a seat | Proposals, votes, lobbying, a seat; one per city |
| **The law** | Heat, raids, busts; precincts and City Hall with a 5-step posture; captain, councillor, judge; lawyer; case files | Heat, raids, busts; police attention per precinct; captain, councillor, judge, DA; lawyer; case files with witnesses; trials |
| **Hostages** | Ransom, leverage, release | Ransom, release, trade to an outfit, kill |
| **Stories** | Nemesis lieutenants who earn a name | **Procedural stories**: detective, reporter, heir, avenger, turncoat, old friend, set off by what you do and different every seed |
| **City-wide events** | Rival succession crises | **Seasons**: election, police crackdown, festival, dock strike |
| **Gambling** | A racket | A racket, plus **playable** five-card draw (reads, cheating), street dice, the numbers |
| **Cars** | Kit | Kit, plus stealing, a garage, chop, respray, keep or sell, getaways |
| **Fortune sinks** | Buy favours, lifestyle ladders, legitimacy, a bigger ceiling | None yet |
| **Winning** | 60% of the city (and play on); go straight at $750k | Half the home city or outlast every outfit; go straight at $150k |
| **Help** | How-to-play sheet, about 100 glossary explainers | How-to-play sheet, a step-by-step tutorial strip, "why these odds" on every button |
| **Saves** | One save, export and import (file or clipboard) | Three slots; no export or import |
| **Testing** | Admin panel (about 25 cheats), 9 bot scenarios | Admin panel, 5 bot temperaments plus catalogue, region and family scenarios, a coverage table |

## What the Remake is missing from the original

In order of what I would port first: most game for the least work, and most in keeping with a
generated city.

1. **Fortune sinks.** Late-game money has nowhere to go: no lifestyle ladders (home, car, security
   → permanent respect and fear), no buying legitimacy against heat, no favours for sale.
2. **The social moves.** No `read` (size somebody up), `gift`, `turn an asset` (informant or muscle),
   `introduce` (a referral), or pulling a rival's lieutenant over to you. Also missing: conversation
   openers and a per-person ledger. The Remake's people are rich; these would give the player more
   ways into them.
3. **Save export and import.** Moving a game between devices, or sending one to somebody, is not
   possible yet.
4. **The wire.** The card pile, taps on rivals, selling dirt, and cyber heat as its own track. The
   Remake has the wire jobs, but not the lane that feeds them.
5. **The rest of production.** A print shop (counterfeit) and a cut house (streetwear), named
   recipes, foremen, and supply orders. The supply chains would give these somewhere to go.
6. **Missing rackets:** policy bank, parts stripping (which would suit cars), relay & export,
   card supply, script diversion, knockoffs.
7. **Missing business types:** black market, computer store, tow yard, accountant, importer, and
   the chartered tier (merchant bank, shipping line, development co.). With them go the intel
   arrangements (bank skim, depot route, gallery consignment, offshore account, trade lane).
8. **Diplomacy's fuller menu:** sit-down offers of tribute a day, a joint racket, or demanding a
   block; brokering peace between two outfits; backing a candidate in a rival's succession;
   declaring beef or peace (not only war); the upstart outfit.
9. **Legwork and fog of war.** Deliberately left out. They belong to a real map you explore; a
   generated city is shown whole, and hours are the Remake's one budget.
10. **The real world.** Also deliberately left out. The Remake is the procedural game; the original
    is the one set on your own streets.

## What the Remake has that the original does not

- A region of cities, with trains, trade routes and crew who work in the city they are in
- Day and night as two halves, with different people, talks and opportunities
- A family: ranks, the making ceremony, underboss and consigliere, rats and coups
- Fights with rounds, bullets, attacks, ambushes and hospital time
- Supply chains through your own bars and clubs, with drivers and hijacks
- A character you build: training, study, boosts, a habit, reputation
- Playable five-card draw, street dice and the numbers
- Car theft, a garage, chop and respray, getaways
- Procedural stories, different every seed
- Seasons: elections, crackdowns, festivals, strikes
- 12 landmark set-pieces, a 3D map, a tutorial strip, and three save slots
