# RACKETS: Remake — Design Document

The Remake is a second, separate game in this repository: the same idea as RACKETS — build a
crime empire block by block, against outfits building the same thing — rebuilt from nothing, and
generated. **Every city, person, face, outfit, emblem, business, job, event and headline comes from
a seed.** No map server, no tiles, no network: a new city is ready in a few milliseconds and is the
same city for anybody who types in the same seed.

It is reached from a tab on the start screen (`ui/components/TitleTabs.tsx`). The original game is
untouched behind the other tab, and the two never share a save. This document is the authority for
the Remake the way `docs/DESIGN.md` is for the original; where they differ, the difference is
deliberate and written down here.

## 1. Pillars

1. **The city is made for you.** Nothing is picked from a list of whole things. A place name is
   syllables, a business name is a template filled from its owner and its street, a face is built
   from parts and wears the person's feelings about you.
2. **Every number shows its working.** Every scene, job and complication shows its odds before you
   press it, and "why these odds" lists every term. The odds shown are the odds rolled — the same
   function feeds the button and the dice (`select.quote`, `select.jobOdds`, `select.complicationOdds`).
3. **What a card says is what happens.** Event options are data (`Effect[]`) and their hints are
   written *from* that data (`effects.ts`: `describe` and `apply` read one list). A job's result is
   written from the same numbers the purse moved by. Both are tested.
4. **Nothing happens to your money that you did not ask for.** A laundry washes only while it is
   switched on; without one, dirty money stays dirty. (This is the original's offshore bug, designed
   out rather than fixed.)
5. **Lose the boss, not the outfit.** Conviction or a bullet ends the game only when nobody in the
   crew has earned the chair. Otherwise the best of them takes over.

## 2. Architecture and the hard walls

| Dir | What |
|---|---|
| `remake/sim/` | The whole game. Pure TypeScript: no React, no fetch, no `Math.random`. Every change goes through `dispatch(world, action)`; `can()` says whether and why not. |
| `remake/content/` | Data: districts, businesses, rackets, labs, kit (`kit.ts`), landmark set-pieces (`setpieces.ts`), officials, backgrounds, job kinds, complication and pitch text, naming parts. Balance lives here and in `remake/sim/economy.ts`. |
| `remake/ui/` | React. Reads the world, asks `select.*`, dispatches. Never computes an outcome. Loaded lazily from the original's `App`, so neither bundle carries the other. |
| `remake/scripts/` | The soak bot (`bot.ts`) and `npm run sim2 -- <days> <seed> [size] [background]`. |
| `remake/tests/` | The Remake's tests; they run in `npm test` with everything else. |

The rng is the original's Mulberry32 (`sim/rng.ts`, re-exported), plus value noise for the city.
`World.rng` is read at the start of every dispatch and written back at the end, so a replay is
exact — `remake/tests/play.test.ts` runs the bot twice on one seed and compares the saves byte for
byte. Saves live in IndexedDB under `rackets.remake.save.v1`, versioned by `WORLD_VERSION` in
`remake/sim/generate.ts`. **Changing the order of generation changes every seed's city**: bump the
version when you do.

The original's own shared pieces are reused rather than copied: the rng, the name groups
(`content/names.ts` — people's names are the one thing not synthesised, because invented surnames
read as fantasy), the icon set (`ui/icons`) and the IndexedDB helper.

## 3. Generating a city (`remake/sim/city.ts`)

1. **A warped lattice.** Column and row spacings are drawn per line (120–190 units), then every
   lattice vertex is displaced by two scales of fractal noise — a broad bend so avenues curve across
   town, a local wobble so no two blocks match.
2. **Water.** Four cities in five get a coast on one side: a noisy shoreline, cells past it are sea.
   Seven in ten get a river that enters on a non-sea side and *steers toward a target* on the far
   side or the coast (the first draft held a heading, wandered out the side it came in on and
   clipped one corner of the map).
3. **Streets.** Every third or fourth grid line is an avenue, drawn wider. One axis is numbered
   (5th Avenue), the other named (Crane Street).
4. **Districts.** 5–12 seeds spread by farthest-point sampling; each gets a character by where it
   sits — nearest the middle is downtown, those by the water are docks, the farthest out are the
   heights and the suburbs. Cells go to the nearest seed with noise added, so borders follow streets
   but never look ruled.
5. **Blocks.** Cells merge into 2×1 or 2×2 lots where the district wants big lots (a foundry is not
   a row of corner shops). A block's outline is its ring of lattice vertices, inset **side by side**
   by the half-width of the street on that side (`geom.ts: insetSides`) — offsetting and meeting at
   the corners, because intersecting the nearly collinear vertices within a side explodes.
6. **Bridges.** Every avenue that meets the river crosses it, but only where the span meets the
   river at a real angle (the first draft laid bridges along the bank). Anything still cut off gets
   the shortest crossing that joins it to the main city; land that still cannot be reached is dropped.
   `city.test.ts` holds every seed to one connected city with symmetric neighbours.
7. **Parks** are blocks with no businesses: nothing to protect, reachable only by holding the
   ground around them. **Landmarks:** a station house per precinct, city hall, the courthouse, and
   a few named places.

Sizes: small 13×12 cells, city 17×15, metropolis 21×18 — roughly 100, 170 and 250 blocks.

## 4. Populating it (`remake/sim/generate.ts`)

- **Businesses** by district weights (`content/world.ts: DISTRICTS`). Institutions (banks,
  jewellers, depots, casinos, galleries) are capped at one per district. Every business has an owner
  who lives on the block, 0–6 regulars (a quarter of them family), takings scaled by block wealth,
  security, and a till — or a vault, for the places a heist can take real money out of.
- **People** get a name from one name group (cosmetic, weighted by district, never read by a number),
  a pronoun read off the name tables (`FEMALE_START`, tested), two non-contradictory traits, skills,
  nerve, wealth, and a face seed. Then the web: family under one roof, friends across the district,
  the odd feud. **28% want something** (an agenda: a debt, a sick relative, a way out, revenge, a
  rival gone) and **30% are hiding something** (an affair, skimming, debts, a past, a detective's
  number, a habit).
- **Outfits**: 3/4/5 by city size, homes spread apart, each with a style, temperament, colour,
  procedural emblem, a boss, 2–3 lieutenants and soldiers. Their ground is a **core** of 7–11 blocks
  around the headquarters, the rest of the home district leaning their way, and nothing much past
  it — the first draft gave each its whole district plus a ring and two-thirds of the city was held
  on day one.
- **Officials**: a captain per precinct, a judge and a DA at the courthouse, a councillor at city
  hall. **A fixer** somewhere unglamorous.
- **You** start on a block with doors, away from every outfit's home, with 12 influence and two
  neighbours who know your face.

## 5. Playing

**Time.** A day is a turn. Action points: 8, rising with rank to 11. Moving is free next door and
through any ground you hold; anywhere else is a cab, 1 AP. A wheelman never pays.

**Scenes** (`scenes.ts`): Talk (trust, and sizes them up; may reveal what they need or hide), Lean on
them (fear; a hothead may swing, an honest one may go to the police), Offer protection (at a rate
you choose; over 15% they resent it daily), Squeeze (a one-off from the till), Recruit (trust 15+),
Put on the payroll (officials), Settle (pay what they need, or take on their grudge as a job), Use
what you know (a known secret: a favour owed, or an official for free for a month), Buy (clean money;
institutions want respect 60), Call in a favour.

**Rackets** run out of places you protect (tier slots: street 1, established 2) or own (+1). Take =
base × level × block wealth × who minds it (nobody 0.6, a lieutenant over the district 0.85, a runner
0.8 + 4%/skill point) × saturation (the fourth of a kind in a district earns less) × synergy
(dealing next to smuggling, loansharking next to a gambling den…). Laundering washes up to its cap at
85¢ while switched on. Dealing and fencing sell from the stash.

**Product.** Safehouses (back room, apartment, compound) give beds, stash room and lab slots. A
still, a grow room and a lab turn supplies into booze, green and pills; quality comes from the worker
and the level; a smuggling racket makes supplies cheaper.

**Crew** get paid daily (dirty first), gain XP running rackets, working labs, guarding and on jobs,
level up (a skill point a level), and leave below 15 loyalty. At level 2 and loyalty 55 one can run a
district as a lieutenant — and inherit the outfit.

**Jobs** (`jobs.ts`): fourteen kinds — burglary, stick-up, heist, hijack, hit, snatch, torch,
sabotage, con, fraud, wire job, run, raid, frame — plus the set-pieces (§9) and the rest of the
original's seventy (§10), each built from a real target: its security, its
till or vault, its owner's nerve, its outfit. The board fills daily from people who trust you, known
grudges, wars and the fixer; you can also **case** any place, person, street or file. Each approach (quiet, loud,
clever) reorders the skills the job leans on and changes heat, take and injuries. Odds: team skill
(the best of you plus a third of the rest, each counted with the kit they carry — §9) against `difficulty/10 + 1.5`, ±8 a point,
plus planning days, extra hands, an insider who trusts you, heat and police attention. Tier 2+ jobs
can stop halfway with a **complication** — a silent alarm, a witness, another crew, a time lock —
whose answers are skill checks with their own odds, take and heat on the button.

**Heat and the law** (`law.ts`). Heat is attention now: it falls by itself, faster the higher it
is; past 60 raids take rackets down and seize dirty money; at 100 they come through the door. A
**case file** is paper: it grows from talking witnesses and heat, slower with a DA on the payroll or
a lawyer, and goes cold after 25 days of little growth. At 100 evidence somebody is charged; a trial
four days later shows its conviction odds (witnesses who will still talk, a lawyer, a judge). A file
with no witness starts at 12% — juries want a face.

**Outfits** (`factions.ts`) earn from protection, rackets and the street itself (70 a held block),
pay their soldiers, push onto border ground when they can afford it, and remember what you did to
them (standing −100..100: allied ≥50, peace ≥−10, tension ≥−30, beef ≥−55, war below). Beef wrecks
rackets and takes places off you; war hurts crew and, eventually, somebody comes for you — guards on
your block and weapons are the defence. They fight each other too, and die when their boss, their
lieutenants and their soldiers are gone. Tribute, sit-downs (truce, split the difference, alliance)
and declaring war are yours.

**Ground** (`territory.ts`) carries the original's fixed rules whole: accrual compounds with depth
and settles with tenure, deep blocks push rivals off, and a held block of depth 2+ bleeds half its
day into its neighbours — capped at 45, above control so parks and empty streets can be taken, below
what a holding outfit has. Ground with nothing of yours on it slips back 2 a day.

**Rank** is fear + respect: Nobody, Hustler, Earner, Made, Boss, Kingpin — each rank adds hours to
the day. **You** learn by doing: every threat is muscle, every conversation charm.

**Endings.** Hold half the city (or outlast every outfit) and the paper runs a special edition; the
sandbox goes on. Hold $150k clean, heat under 15 and no open files for ten days and you may walk
away. Convicted or killed with an heir: the heir takes over. Without one, or broke with nothing left
after day 10: the end.

## 6. The screen

- **Start**: the game picker, a masthead, and a live preview of tonight's city — map, name, motto,
  districts, rivals with emblems — rerolled by one button or pinned by a seed you can share.
- **City**: the generated map (`CityMap.tsx`, SVG): water drawn over land so the river clips its
  waterfront, building lots cut deterministically from each block's cells, trees in parks, bridges,
  avenue names along their curves at street zoom, business markers at street zoom, district names
  when zoomed out, and overlays for who holds it, your heat, money and police. Pan and pinch move
  the `viewBox` directly and commit only when the gesture ends.
- **People, Crew, Jobs, Empire, Rivals** tabs; sheets for a block, a place, a person, a job, an outfit.
- **The paper.** The one loud design choice: headlines, events and the morning recap print on paper,
  in a serif. The city reports on itself.

## 7. Testing and the soak

`remake/tests/`: city invariants on seven seeds, the populated world, `can()` never throwing for
every action the UI can build (fresh and thirty days in), refusals always carrying a reason, byte-
identical replays, a job's result equal to the purse delta, event hints equal to `describe(effects)`,
laundering only while switched on (mutation-tested), the spill cap, bot soaks, and every sheet and
tab rendered for every block, place, job and outfit.

`npm run sim2 -- 60 7` plays sixty days and prints the curve and a coverage table. Baseline when the
first version shipped (seed 7, city, grifter): worth $5k → $20k (day 20) → $56k (day 30) → $101k (day 60), control
17.4%, crew 8, 22 rackets, heat peaking in the 60s; 19 of 20 systems reached (squeezing a till is
rare by the bot's own caution). After the second pass (street crews skimming, cooler rackets):
seed 7 $59k and 10.8% on day 60, seed 1 $162k and 24.9%, seed 2 $132k and 24.2%.

## 8. The second pass: the corners, the books, the specialists, and coming back

**Street crews** (`streetcrews.ts`). Two to five crews stand on corners nobody holds, in the poorer
districts. Left alone they skim a quarter of whatever you take off their block and grow a member
about once a week; at **14** a crew stops being a crew — its boss names it, colours it and it
becomes an outfit with a home and ground. The city grows a new rival on its own, out of a corner you
ignored. Their boss answers three new scenes: put them on a wage (they stop skimming and hold the
corner for you), take them in (their corner builds your ground every day and they grow for you), or
run them off (a muscle check against the crew's size). They are generated from their **own** rng
stream after everything else, so adding them moved nothing in any seed's city, and a city saved by
the first release gains exactly the crews a new game with its seed has (`migrate`, tested).

**Lieutenants skim** (`tick.ts: skimmer`). A greedy lieutenant takes 18% of the district's racket
take from day one; anybody does once loyalty slips under 50. Nothing says so until an event notices
the books are light — or you **audit** them (brains against theirs, sly ones harder; once a week).
Caught, they give 70% back and keep their hands still for three weeks. Checking costs a little
loyalty either way.

**Specialists** (`content/world.ts: SPECIALISTS`). Through the fixer, for one job: a safecracker,
driver, hacker, face or gunman at skill 8–10, whose skill joins the team's for that job only and who
counts as a pair of hands. Paid up front — a flat fee by tier plus 6% of the take — win or lose.

**Every city has a fixer.** A city generated without a market, old quarter, strip or docks had none
(no washing before your own laundry, no specialists); `ensureFixer` finds one anywhere, from its own
stream.

**Leads** (`select.leads`). Twelve steps from "introduce yourself" to "hold half the city", read off
the world every render, each pointing at a real person, place or tab. The next one sits on the map
under the headline; the whole list is a tap away. The original taught its opening in a sheet the
player had to go and find.

**Three cities** can be kept at once; the start screen lists them with continue and delete. Slot 0 is
the key the first release saved under, so a city started then is still there.

**Days pass while the app is closed** — one every six hours, up to three — with whatever comes up
answered the careful way (the last option, written to be the one that risks nothing; a paused job
takes its safe answer), and a recap of all of it before anything else.

**Fixed on the way**: the fixer's daily window was never reset, so after a day or two of washing the
fixer refused for the rest of the game. It resets every morning now, and the day's summary counts
what the fixer washed alongside what the laundries did (tested, and mutation-tested).

## 9. The third pass: kit, hostages, the Commission, set-pieces, and bots with a temperament

**Kit is carried by people** (`content/kit.ts`, `sim/kit.ts`). The outfit-wide gear levels are gone.
Thirty items in six slots — weapon, armour, tools, tech, car, look — each adding to one skill (a
pistol +2 muscle, a safe kit +3 brains, a uniform +3 charm) or stopping a share of harm (a stab vest
25%, a plate carrier 60%). **Everything that reads a person's skill reads it through `skillOf`**, so a
gun counts on the job its carrier goes on and nowhere else; team skill is the best person plus a
third of the rest, each with their own kit. Armour stacks as 1 − Π(1 − a) and scales down both the
injury and the death roll on a job, a shooting in a war, and the attempt on your life. Items are sold
by real businesses — a pawnshop, gym, garage, scrapyard, boutique or electronics shop — while you
stand on the block, and by the fixer (the tier 3–4 things) from anywhere once you have met. What you
buy goes on you if the slot is empty, otherwise into the **armoury**, from which you hand things out;
anything replaced comes back to it, and so does the kit of anybody you let go (the dead keep theirs).
A save from the gear days is migrated: each gear level becomes the matching item on the boss.

**Hostages** (`sim/hostages.ts`). A successful snatch with a free back room (one per safehouse tier)
no longer pays on the spot: the person is held, the family's offer climbs 12% of the first a day to
160%, a kidnap file thickens by 4 a day, and with nobody of yours guarding the block they may get
out (6% a day, rising, and they talk). You choose: take the money, let them go (the file thins, the
street hears you kept your word), trade an outfit's person back for twenty days of truce and a block
you both want, or kill them (fear, and the file becomes a murder file). Without a back room the snatch
takes what the family had in the house — half. It runs the other way: an outfit at war with you takes
one of yours one time in four instead of hurting them, asks 2,000 + 1,500 a level (a tenth more a day),
and on the fifth unpaid day kills them, which every other member of your crew notices.

**The Commission** (`sim/commission.ts`). From day 20, every ten days, while three outfits stand, the
bosses meet. The proposal is chosen from the city: two wars or more and it is a peace; somebody past a
fifth of the blocks and it is a sanction on them (which can be you); a player with respect 40 and no
seat is offered one; otherwise the pot (a tenth of every outfit's cash to the biggest) or a claim on a
district. It is announced three days ahead. Every boss's vote is the sign of `leanOf` —
temperament, self-interest, standing with you, a favour they owe you — and the Rivals tab shows each
lean before the meeting, so a vote you lose is one you watched coming. You can lean on a boss once
per meeting: an envelope (1,500 plus 60 per point of standing below zero) or the favour they owe you,
moving their lean 30 either way. With a seat, your own vote counts, and the boss a proposal names
remembers which way you voted (±5 standing).

**Landmark set-pieces** (`content/setpieces.ts`). Every landmark but a park carries one job the city
has exactly one of: derby day at the racetrack, the mail car at the terminal, the penthouse safe, the
stadium payroll, the gala cloakroom, the cathedral reliquary, the courthouse **evidence locker** (the
only way to burn paper in bulk: −70 on every open or charged file on you and your crew, charges
dropped back to open), the station-house property room (its precinct takes it personally: +10 heat),
the city hall records room (clean money on paper), and a strongroom anywhere else. Difficulty 55–74,
three to five hands, five days of planning, heat 14–34. They come only to somebody at rank **Made**
(fear + respect 75) — offered now and then, or cased from the landmark's block sheet. Launching one
stops at **every stage** (two or three) with a complication, never the same twice running; each answer
multiplies the take and adds its heat, and a walked-away or blown stage ends it there. A crew member
who lands in hospital or a cell during the planning leaves a gap; **`join_job`** sends somebody else.

**Bots with a temperament** (`remake/scripts/bot.ts: STYLES`). The same bot plays five ways, every
threshold it had pulled out into a `Style`: *timid* (takes only 75%+ jobs, pays corner crews off, lays
low at heat 55, never starts a war, takes the first ransom offered), *steady* (the bot as it was — the
default, so `npm run sim2 -- 60` still means what it meant), *schemer* (clever over loud, officials at
heat 15, lobbies every vote, trades hostages for truces), *ruthless* (45%+ jobs, runs crews off, a war
on the weakest outfit once it has six crew, holds hostages to the ceiling) and *maniac* (anything over
30%, always loud, war on somebody new every five days from day ten, never a truce or a bribe, no hostage
comes home). `npm run sim2 -- 60 7 medium grifter all` plays one seed all five ways and prints a table
— worth, control, heat, crew, jobs, wars, hostages, kit bought, heirs, ending — and coverage taken
across all five. What the sweep found and what changed because of it is in the changelog entry for
this pass.

## 10. Every job the original had

The user liked the variety of jobs and asked for all of them. `content/catalogue.ts` carries the
original's other fifty-seven ops as data, in the Remake's shape; `sim/catalogue.ts` answers what
differs between them. A test checks that every id in the original's `OP_DEFS` is a Remake job kind,
or (heist_bank, smuggle_run, long_con, raid_rival, arson_hire, hijack_load) the Remake kind that
already was that job, or (records_room, manifest_swap, dome_job) the landmark set-piece that carries
it.

- **What each is pointed at.** A target kind rather than a target: somebody else's place of the right
  types, a place you own, a place an enemy runs something out of, a place of yours an enemy has
  marked, a civilian with money, anybody, an official, somebody whose business you have been
  inside, one of yours in a cell, an enemy lieutenant, enemy ground, a rich street, a derelict block
  (the Remake has no abandoned blocks, so: wealth under 35 and nobody holding it), a corner with a
  street crew, a district, the water, a landmark, a file, or nothing at all (set up from where you
  stand). Where the original named a landmark a Remake city never generates, the job points at the
  nearest thing it does: its casino count at a casino, its manifest at the ferry pier or the fish
  market, its observatory at the clock tower or the lighthouse.
- **What it needs** (`needsMet`, the one place): a weapon carried by somebody on your side, a crew
  size, a safehouse tier, a racket of the right kind, a job before it that came off (the chains: get
  inside → wire fraud, take their number, lean on the board; shell company → bust-out, boiler room,
  build a person; run → dockside pickup → convoy; spring somebody → supply the wing; fund a friend →
  buy the ward; jewel heist → the collection; nobody saw anybody → no loose ends), or a reputation.
  Every refusal says which.
- **What it pays**, from the original's range, scaled by the wealth of what it is pointed at. Hot
  goods come at the street's $80 a lot, to 80 lots; the rest of a big take goes to a fence on the
  night at 60%. Some cost money up front (a print run, a convoy, a campaign, a file), charged when
  the job is taken.
- **What it does** — one named consequence each: an owner frightened, a place shut, soldiers lost, a
  place dug in for two weeks against a takeover, a lieutenant dead, somebody's secrets and wants
  known, a corner cleared, a recipe that lifts every lab's quality, a district walked and four people
  met, a derelict block claimed, somebody out of a cell, heat bought down, a file closed, product at
  cost, a district a little poorer, a councillor on the payroll for nothing, a ward bought, money
  washed at 85¢.
- **Where you find them.** A third of the daily board comes from the catalogue, sized to your
  reputation (a nobody hears about muggings, not count rooms). Every sheet has a *Case it* list:
  places, people (including officials and your own people in cells), streets (their own jobs and
  their district's), and each file in the Law view. Jobs that need no door are under *Set something
  up* on the Jobs tab. Kinds you are not ready for fold away with their reasons.
- **Complications** come from the first-fourteen kind each most resembles (`likeOf`): wire jobs get
  somebody watching the wire, heists get the time lock. The background perks follow the same map.

**The catalogue scenario** (`npm run sim2 -- 60 7 medium grifter catalogue`). Natural play reaches
40–50 of the 72 kinds in sixty days; the rest want an empire the bots rarely build that fast. The
scenario starts one on day one (money, eight crew with two in a cell, two tier-2 back rooms, three
places of your own running the rackets the paper jobs need, a gun, a war, a file) and a *collector*
who cases the least-tried kind it can find anywhere and takes everything it can staff. Seeds 7, 1
and 3 between them run every kind to a result, and a test holds that. It is not an economy curve.

## 11. Deliberately not carried over (yet)

Not in the Remake: an admin panel and scenario sweep for the bot (the temperament sweep covers what
the scenarios were for), and set-pieces that change the landmark afterwards (a looted cathedral stays a
cathedral). Neither is half-built in the code.
