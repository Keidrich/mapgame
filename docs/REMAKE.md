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
  waterfront, the buildings actually on each block (`mapgeo.blockLots`: one for every business, a
  landmark's own, and homes for the people who live there — one per 2 residents up the hill, per 7
  in the projects — the rest yards), trees in parks, bridges,
  avenue names along their curves at street zoom, business markers at street zoom, district names
  when zoomed out, and overlays for who holds it, your heat, money and police. Pan and pinch move
  the `viewBox` directly and commit only when the gesture ends.
- **People, Crew, Jobs, Empire, Rivals** tabs; sheets for a block, a place, a person, a job, an outfit.
- **The look ("night shift", since the second UI remake).** The arcade look it replaced read as a
  children's game; this one is built as a native iOS app, because the Remake is played saved to the
  home screen, standalone, one-thumbed.
  - **Palette.** Warm near-black ink, paper-white text, and one accent — streetlight amber — which
    always means *you*: your ground on the map, your pin, the button that does the thing. Clean
    money is green, dirty is copper, heat red-orange, the law blue. Outfit colours from the sim are
    drawn muted to one saturation (`components/tone.ts`), so rivals read as dyed ink, not poster
    paint; the sim's values are untouched and old saves get the same treatment.
  - **Type.** Big Shoulders Display (drawn for Chicago's signage) for titles, names and big
    figures; the system face (SF Pro on an iPhone) for everything read, and for the ledger's money
    (the display face's condensed $ reads as an S); Newsreader for the courier's headlines and
    city mottos. Linked at runtime from `App.tsx`; offline before the first load it falls back to
    condensed and serif system faces.
  - **Frame.** The map is full-bleed under two translucent material bars. The top is a **ledger
    bar**: the day set large, the city and your rank with a bar to the next, then clean, dirty,
    hours (the day's action points as ticks) and heat as one ruled line; a figure that changes
    shows by how much for a moment. The bottom is an iOS **tab bar** — six line icons, amber for
    where you are, red count badges. **End the day** is a capsule above it, lit amber once the
    hours are spent.
  - **Map.** A stack under the ledger bar: the courier's headline, then the **next step** card (the
    tutorial — see §13) with how far through the line you are and, when the step is waiting on
    something, what. A grouped control column on the right (overlay, where am I, the region), where
    you are bottom left.
  - **Sheets** rise from the bottom with a grabber; drag the head down to dismiss (`Sheet` in
    `kit.tsx`), or tap the dimmed map. Content is **inset grouped**, as in Settings: a section's
    heading sits above one rounded group, rows are 44pt+ with a chevron when they go somewhere.
    Every scene is a row — the verb in amber, its odds as a tinted figure, the cost — pressed whole.
  - **Cards.** Events and complications rise from the bottom within reach of a thumb (centred on
    wide screens), their choices a grouped list. The morning is a **night report**: a ledger page
    with the courier's headline, what came in and went out with the net under a rule, and what
    happened, each line marked by the kind of news. No stars, no bursts.
  - **Installed.** `index.html` carries `apple-touch-icon` (a PNG — iOS uses nothing else for the
    home screen, and without one the icon is a screenshot), the web-app title, and a dark
    background before the stylesheet arrives; the manifest has 192/512 PNGs and a maskable one.
    Inside the app: no text selection or callouts on chrome, no double-tap zoom, no rubber-banding
    the whole frame, fields at 16px so iOS never zooms on focus, safe areas on all four edges. In
    Safari on an iPhone, the start screen says once how to add it to the home screen.
  Motion (sheets rising, figures changing, the pin's pulse) is off under reduced motion.
- **The map in 3D** (`CityMap3D.tsx`, three.js; the **3D / 2D** button in the map's controls,
  remembered per device in `rackets.remake.map3d.v1`). The flat map stays the default and the
  fallback when a device has no WebGL. three.js is its own ~140 KB gzipped chunk, fetched only when
  3D is turned on.
  - **Geometry.** Every building the flat map draws (`mapgeo.blockLots`, shared, so both maps show
    the same buildings) is extruded. A shop rises with its tier, a home with its district (towers in
    the projects, houses up the hill), a landmark over both; ownership markers stand on the shop's
    own roof. The first cut filled every block with four to nine decorative lots whatever it held.
  - **Look.** Walls carry a tiled texture of lit windows, so the city reads by its own light. Roofs
    and the block slabs under them carry the overlay, so ownership reads from above. Your ground is
    amber, and an amber beam stands on the block you are on.
  - **Other features.** Water, bridges and park trees. District names are HTML over the canvas.
    One finger pans, two pinch and turn, and a two-finger drag tilts.
  - **Tapping.** A tap picks a block on the *click*, not on pointer-up. A touch is followed by a
    synthetic click, and opening the sheet on pointer-up put the sheet's scrim under it, which
    closed the sheet the instant it opened.
  - **Performance.** Buildings are two merged meshes, slabs are one mesh with a triangle→block table
    for picking, an overlay change rewrites two colour buffers, and it renders only when something
    moved.
  - **Options weighed.**
    - MapLibre extrusions (already a dependency of the original): free gestures, but flat boxes, no
      lit windows, and offline labels would need bundled glyphs.
    - deck.gl or Babylon: heavy for a phone.
    - PixiJS isometric: needs a sprite art pipeline.
    - Capacitor, to put this in the App Store with haptics: a distribution choice, open.

## 7. Testing and the soak

`remake/tests/`: city invariants on seven seeds, the populated world, `can()` never throwing for
every action the UI can build (fresh and thirty days in), refusals always carrying a reason, byte-
identical replays, a job's result equal to the purse delta, event hints equal to `describe(effects)`,
laundering only while switched on (mutation-tested), the spill cap, bot soaks, and every sheet and
tab rendered for every block, place, job and outfit.

`npm run sim2 -- 60 7` plays sixty days and prints the curve and a coverage table;
`npm run sim2 -- 60 7 medium grifter scenarios` plays every scenario and takes coverage across all
of them (§12). Baseline when the
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
player had to go and find. A step can be **blocked** (`Lead.blocked`, the game's own refusal —
"Costs $900. You have $571."); the strip shows `select.nextLead`, the first step not done that is not
blocked, so waiting for money on one step never stalls the whole line. See §13 for how it is tested.

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

## 11. The region: more than one city

Every save has a **region** of five or six cities on a map, joined by road and rail
(`sim/regionmap.ts` draws it, `sim/region.ts` runs it). The one you start in is `c0`; the others
each have a kind — a port, a mill town, a capital, a resort, a college town, a border town, a rail
junction — a size, and a price for everything you make (the home city pays the street's ordinary
price; a resort pays ×1.45 for pills, a college town ×1.5 for green).

- **Opening the road.** Hold a quarter of a city (`REGION.unlockAt`) and the cities linked to it
  open. You can then take the train there: a day's action points (4) and a fare by distance.
- **Starting up.** The first time you arrive, the city is generated in full — streets, people,
  outfits, precincts, street crews — from its own seed, into the same world as the first, every id
  it makes prefixed with its own (`c2.b14`, `c2.f0`). You arrive with everything you carry and
  whoever you bring, a foothold of 12 on the street you get off on (enough to take a back room
  there), and nobody knowing your name.
- **Crew belong to a city.** Each of your people lives in one city (`Crew.cityId`; a recruit starts
  where they live) and works only there: a racket, a lab, a guard post, a district or a job in
  another city is refused with where they are. You move them two ways: **bring** them on your own
  train (free, from the free people where you are — the region sheet picks them), or **send** one
  from their sheet (their fare, a day on the road as `travel`, off whatever post they had). Outfits
  reach your people only in their own city. A save from before is migrated: each goes to the city
  their work is in, else where you are.
- **Every city has its own Commission** (`commissionOf`): its own outfits at the table, its own
  meetings (the first ten days after you found the city), its own seat for you, and lobbying that
  moves only that table. The home city's is `w.commission`, where it always was.
- **Looking without going.** The region sheet's "Look at the map" draws another founded city from
  where you are, with a banner back to your own. Every system works per block and per district, so the
  second city's rackets, outfits, law and jobs run without knowing it is a second city.
- **One city at a time on screen.** The map draws the city you are in (`select.cityView`); walking
  is within a city, the train is between them. Back rooms are capped at four *per city*.
- **Trade.** Streets pay each city's own price. A **route** between two cities where you have a back
  room sells up to 12 lots a night from your stash in the far city, at its price less 20% freight;
  3% of nights a load is stopped (lots gone, heat where it was going). Routes are opened from the
  region sheet, from anywhere.
- **Work.** One board offer in five comes from another city you have been to. A job in another city
  can be run from where you are: your people there go without you (your skills do not count, −6),
  and it needs at least one of them — in that city.
- **Control and winning.** `controlShare` is per city; winning is still half of the home city.
- **Saves.** The home city's generation is byte-identical to before (a check hashed eighteen
  seed/size worlds before and after the refactor into `populateCity`), so no `WORLD_VERSION` bump;
  a save from before gains a region with only its own city founded. A second city adds about 1 MB
  to a save and roughly doubles the nightly tick; the bots and the scenario keep to one or two.

**The region scenario** (`npm run sim2 -- 60 7 medium grifter region`): the catalogue's mid-game
empire holding a third of its home city, so the road is open on day one; the bot takes the train,
takes a back room, opens routes and works the home city from a distance. Natural play reaches the
road late (steady opens it around day 60 on seed 7; ruthless reaches a second city on seed 1).

## 12. Testing tools and the scenario sweep

**Testing tools** (menu → Testing tools; `sim/cheats.ts`): cash, dirty, full energy, cool off, fear
and respect, three crew from this city, a back room here, guns and vests, a full stash, a war, every
road open. Each is an ordinary `cheat` action through `dispatch`, and each stamps the save
`cheated` so nothing built with them is mistaken for real play — the original's pattern.

**The scenario sweep** (`npm run sim2 -- 60 7 medium grifter scenarios`): the five temperaments,
the catalogue scenario and the region scenario on one seed, side by side, with coverage taken
across all of them. It is the Remake's `npm run sim -- 60 7 all`: after building anything, run it
and read the table. On seed 7 it reaches every system; the job kinds it misses there are held by
the catalogue test across seeds 7, 1 and 3.

**Landmarks remember** (`jobs.ts: SETPIECE_REST`, `SETPIECE_HARDEN`). A set-piece that comes off
shuts its landmark to you for thirty days, puts 15 on its district's police attention, and makes
its job 10 harder every time after; one that fails hardens it by 5 and shuts nothing. The block
sheet says when it was hit and how much harder it is.

Nothing listed as missing in earlier passes is still missing.

## 13. The tutorial run

The quest strip is the tutorial, and until it was played by something that does *only* what it
says, nobody knew whether it could be followed. `remake/scripts/tutorial.ts` is that player: a
rookie who reads `select.nextLead`, goes where the strip's tap goes (the person sheet's "Go to", the
business sheet's rackets, the Jobs tab's pre-picked crew), presses the buttons that sheet shows and
nothing else, takes the first answer on every card, and — while the strip waits on money or a
long-game step — keeps doing what it has already been taught (protect and lean on the places
around it, walking on when a block is spent). Every refusal it meets is logged in the game's words.

`npm run sim2 -- 40 7 medium grifter tutorial` prints the day each quest came up and was done for
a grifter, bruiser and brain rookie, then the day each soak temperament happened to finish each one.
`remake/tests/tutorial.test.ts` holds the line: the opening (`OPENING`: talk through hold) is done by
day 25 on seeds 7, 1 and 3, as a grifter and as a bruiser.

What the first run found, all fixed:
- **Step one never completed** if you introduced yourself on day one — the evening the strip tells
  you to. It checked `rel.met > 1`, and `met` is a day. `Player.introduced` counts it now, and the
  step points at somebody you have not met (it used to pick a neighbour you already knew, who can
  never be introduced).
- **The back-room step pointed at the block underfoot**, which seldom has the influence 10 a back
  room needs. It points at your best ground now and says when it is waiting on money or a foothold.
- **A bruiser starts with $250 and the cheapest racket is $400**, and the strip sat on "start a
  racket" for a week in silence. Blocked steps now say why and the strip moves on.
- **A greedy recruit asked for a raise every few nights**, 30% each time: a rookie who said yes had a
  level-one recruit on $282 a day against a $190 take. Now: after a week with you, at most every 21
  days, and never once they are paid half again what they are worth (`events.ts: wantsRaise`).
- **Dealing was the cheapest racket and earns nothing without product.** The business sheet says
  so on the button (`select.racketWarning`) until you have product or a lab making it.

**Through the screen.** `npm run tutorial:ui` (with a built preview on :4173) plays the same line in
a phone-sized browser: taps the strip, presses what the sheet it opens offers, reads the odds as a
person would, ends the day when nothing asked for can be done. It reached the mid-game by day 7-11
on seed 7 and found three more, fixed:
- **The protect step pointed at the softest owner, not the one you had just won over** — the step
  before had you build trust with somebody, and this one sent you to a stranger at 11%. It points
  at whichever owner you have warmed up most now, and names their place.
- **A job's crew list opened empty**, so "Take it on" was grey until you ticked people. It opens
  with the fewest it needs already picked, best at what the job leans on, free people first.
- **The wash step could never happen**: wages come out of dirty money first, and one racket and
  one recruit left it at $0 every morning while $2,961 sat clean. It is blocked with that reason.

The lieutenant step stays blocked for a rookie through sixty days — nobody reaches level 2 and
loyalty 55 by following the strip alone — and says so. That is the long game, not a break.

## 14. Day and night

Every day has two halves (`sim/clock.ts`; the rules are data in `content/clock.ts`).

- **Hours.** The day keeps its whole allowance (8 hours at the start, 11 at Kingpin). **Nightfall**
  is a button, not the end of the day: it closes the day's doors, opens the night's, and gives
  **3 more hours** (`splitHours`). **Sleep** runs the nightly tick as before. The night is extra
  rather than carved out of the day, because carving it out halved the daylight territory game:
  - Steady bot, over five seeds: control 23% before day and night.
  - Split 5/3: 15%.
  - Full day + 3 night hours: 24%.
- **Different people.** `clock.whereIs`:
  - By day, owners and workers are at work, and everybody else is at home.
  - By night, the regulars are out at their haunt (the first place that lists them as a patron), a
    corner crew's boss is on the corner, and owners have gone home.
  - A person's sheet says where they are now, and "Go to" goes there.
  - By day, a scene works at someone's home or at their work, as before. By night you have to be
    where they are.
- **Different talks.** `SCENE_HOURS`:
  - Day only: protection pitches, squeezing a till and buying a place.
  - Night only: recruiting (nobody signs on sober) and dealing with corner crews.
  - Either: talking, leaning and bribes. Leaning gets +6 after dark.
  - A shut scene shows greyed out, with when it opens. That is how the clock is learned.
- **Different opportunities.** `ACTION_HOURS`:
  - Day only: washing money with the fixer (banking hours), renting and upgrading back rooms, and
    the train.
  - Night only: selling on the street and sit-downs (dinner in a back room).
  - Shops sell by day. The fixer sells at any hour.
- **Jobs by the hour.** `jobHour`, `hourFactor`, `seenMult`:
  - Cons, frauds and hacks want business hours. Everything else wants the dark.
  - In a job's own hour: +8 to the odds, and 0.7× the chance a witness opens a file.
  - Out of it: −12 to the odds, and 1.35× the chance of a file.
  - Both show on the job sheet's odds list.
  - The bots wait for a job's hour unless it would expire first.
- **Tonight.** At nightfall, most nights (70%), one encounter comes from the night pool
  (`events.NIGHT`), built around the places open near you:
  - a card game at the back of a bar (play straight for trust, or deal from the bottom);
  - an off-duty official talking too much (trust, and maybe their secret);
  - a load off the back of a truck;
  - a rival crew drinking on your corner;
  - a stranger with work that will not wait (a **tonight-only** job, `Job.tonight`, expired by
    the nightly tick whether taken or not);
  - a witness drinking alone;
  - a bar fight you can step into;
  - a patrolman's tip about a raid.
- **Tutorial.** A step whose door is shut at this hour is blocked with the reason, and the strip
  moves on: it points at recruiting by night and at protection by day.
- **Screen.**
  - The ledger bar reads Day or Night, and its hour ticks are this half's hours.
  - The end button is **Nightfall** by day and **Sleep** by night.
  - Nightfall plays a short dusk card with the city's name before tonight's encounter.
  - By day the flat map lifts to an overcast grey, and the 3D city goes to daylight: sun, pale
    walls, windows dark. At night it lights up.
- **Old saves** wake in the morning with at most the day's hours (`migrate`). `end_day` pressed in
  daylight sleeps through the night without playing it, which is what idle play does.

**Balance (five seeds, 60 days, before → after):**

| Bot | Control | Worth | Convicted | Heat |
|---|---|---|---|---|
| Steady | 23% → 24% | $60k → $76k | 0 → 0 | 47 → 58 |
| Ruthless | 24% → 34% | — | 0 → 1 of 5 | — |
| Maniac | — | — | 4 → 4 of 5 | — |
| Timid, schemer | about the same | about the same | 0 → 0 | — |

Nights add work and add risk.

## 16. The family

Crew are a family now (`sim/family.ts`; the numbers are data in `content/family.ts`).

- **Ranks.** Everybody hired is an **associate**. A **making ceremony** (`make_member`) makes one a
  **soldier**. It needs:
  - the night, in a back room;
  - level 2 and loyalty 50;
  - $2,500 and 2 hours.
  They come out +15 loyalty with a fifth more on their cut. Made men never walk out: loyalty is held
  at a floor of 30. A made man over a district is a **capo**.
- **Posts.** `appoint` gives a made man one of two posts. One person holds one post, and taking a
  post leaves any other.
  - **Consigliere:**
    - sit-downs +8 plus their charm;
    - tribute buys a quarter more standing;
    - Commission envelopes cost a quarter less;
    - audits +3 per point of brains;
    - spots a rat 25% of nights (5% by luck without one).
  - **Underboss:**
    - a racket nobody runs earns 72% instead of 60%;
    - is the heir first (`legacy.heirOf`), whatever their level.
- **Rats.** An associate under 30 loyalty, with a file open on you or yours, can turn:
  - The chance is 3% a night, plus 0.1% per point under 30, and a quarter of that if made.
  - A rat adds 3 evidence to your worst file every night, or opens one.
  - Once found, a card (`rat_found`) offers three choices:
    - whack them (fear, heat);
    - put them on a bus;
    - feed them lies: the file drops 15 at once, then shrinks a point a night.
- **Coups.** A capo who is ambitious or greedy, under 25 loyalty, moves on 4% of nights. The card
  (`coup`) offers three choices:
  - buy him off (twelve days' cut, +30 loyalty);
  - face him down, at a chance from your fear and muscle against his;
  - let him go. He walks: the district's rackets go dark for 10 days, and your influence there falls 10.
- **Screen.** The Crew tab opens on the family tree: the two posts (or how to fill them), capos,
  soldiers and associates. A crew member's sheet shows their rank, what they still need to be made,
  the ceremony, and the posts.
- **Bots and coverage.**
  - The bots make whoever qualifies once they have three times the price, and keep both posts filled.
  - They also now go after the law: they lean on talking witnesses and take a lawyer once a file
    passes 40. The day-and-night build shipped without this, and the steady bot was being convicted
    in 3 cities of 5 on a single early burglary.
  - Rats and coups never happen to a well-run outfit in sixty days. The **family scenario**
    (`npm run sim2 -- 60 7 medium grifter family`) starts with a rat already talking and a sour
    capo, and holds those rows (`FAMILY_SYSTEMS`).

**Balance (five seeds, 60 days):**

| Bot | Control | Convicted |
|---|---|---|
| Steady | 22.4% | never |
| Ruthless | 23% | 1 of 5 |
| Maniac | — | 3 of 5 |

## 17. Fights

One resolver for every fight (`sim/fights.ts`; the numbers are data in `content/fights.ts`).

- **The fight.**
  - It is three rounds. Each side's power rolls up or down a quarter every round.
  - A person is worth a base of 20, plus 6 per point of muscle (kit included), plus 25 for a gun
    *with bullets behind it*. Each gunman spends 3 rounds a round, and an empty gun is something to
    swing.
  - The round's winner puts somebody on the other side down.
  - Armour (`armourOf`) can turn a blow aside.
  - Against guns, a blow kills 12% of the time. You are never killed in a street fight; you are hurt
    for 4–8 days.
  - Best of three wins. The odds on every button are `fightOdds`, the same model.
- **Their side.** A rival's soldiers on one of its blocks: soldiers ÷ blocks held × 1.2, between 2
  and 6. Each is worth 36, or 50 if the outfit has $20k to arm them. The first cut (42, ×2, up to 7)
  gave five of your hardest people 1% against a full block.
- **Taking it to them** (`attack`; block sheet → "Take it to them"):
  - The rules: after dark, standing on a block the outfit holds, never inside a truce, never against
    allies. It costs 2 hours, and you bring up to five of your people.
  - Win:
    - their soldiers there are down;
    - the block leans your way (+12 yours, −15 theirs);
    - fear +4, respect +2;
    - standing −15 with them;
    - heat +6 (+4 more with guns).
  - Lose: the people who went down are in hospital, and standing falls anyway.
- **Ambushes** (`night_ambush`). Most nights with an outfit at war or beef with you, the night
  encounter can be them, waiting. The card offers three choices:
  - stand and fight, at the odds, alongside whoever is guarding the block;
  - slip out the kitchen door;
  - pay them off.
- **Rounds** (`buy_bullets`) come in boxes of 25 or 100, at $6 each, wherever a gun is sold and from
  the fixer.
- **Hurt.** While `hurtDays` lasts, each morning has 3 fewer hours (never under 3). The fixer's
  doctor (`patch_up`, $1,200) halves it.
- **Screen.** A fight report card, round by round, shows until read (`World.fight`, `seen_fight`).
  The ledger bar shows "Hurt Nd". The kit view shows your rounds and the doctor.
- **Bots.** They buy rounds when armed. The ruthless and the maniac take it to an outfit at war or
  beef on a block next to them when the odds clear their bar (58%, or 45% for the maniac). Every bot
  answers ambushes by the odds.

**Balance (five seeds, 60 days):**

| Bot | Fights (won) | Control | Worth | Outcome |
|---|---|---|---|---|
| Ruthless | 17.8 (15.6) | 26.5% | $89k | never convicted |
| Maniac | 20 | 14% | — | convicted in 2 of 5, killed in 1 |
| Steady | — | 24.3% | — | never convicted |

## 18. Supply chains

Product has a second way out besides the corner (`sim/supply.ts`; the numbers are data in
`content/supply.ts`).

- **Outlets.** A bar, nightclub, restaurant, diner or casino that you protect or own can be told to
  take your product (`set_outlet`, free, any hour; business sheet → "Supply"). Each kind takes some
  products and not others (`OUTLETS`), in lots a night scaled by the block: ×(0.5 + wealth/100).
- **The price.** A protected place pays 1.4× the street price; one you own 1.7× (you keep the bar's
  margin too). At 1.15/1.3 it paid barely better than a dealing racket selling the same lots the
  next day, and the bots came out poorer for the night hours it cost them.
- **Heat.** A delivery through a back door puts a third of the heat that selling the same lots on
  the corner does.
- **Drivers.** A crew assignment, `{ kind: 'driver' }`. A driver carries 12 lots a night, +3 per
  point of wheels, +8 per point of the car's bonus, around the outlets in their own city.
  The rounds run at the end of the day after the labs, so tonight's batch goes out tonight
  (`tickSupply`, reported in `World.supply` and on Empire → Money → "Supply chain").
- **Driving it yourself** (`run_delivery`): two hours after dark, the same van, your wheels and your
  car, in the city you are in. Crew are bed-limited and usually all busy, so this is how most
  players (and the bots) first use it.
- **The road.** Every load can be taken: 2%, +6% with any outfit at war or beef with you, +0.06%
  per point of heat, halved if the driver carries a gun. A taken load is lost, puts 2 heat on the
  block, and 30% of the time the driver is hurt.
- **Trust.** The owner of a protected outlet gains +0.5 trust every night it is supplied.
- **Bots.** `supply()` sets every protected or owned outlet to take what the labs make or the stash
  holds; drives the round itself after dark when the orders are worth $400; and puts a driver in
  each city with outlets. The driver is a free hand, or the runner of the weakest racket when a
  night's orders are worth twice what that racket earns.

**Balance (five seeds, 60 days, with supply against without):**

| Bot | Control | Worth | Outcome |
|---|---|---|---|
| Steady | 24.6% (24.3%) | $88k ($69k) | never convicted |
| Ruthless | 23.3% (26.5%) | $75k ($89k) | never convicted |
| Maniac | 17.9% (14.4%) | $62k ($53k) | convicted in 3 of 5 (2, and 1 dead) |

The seeds diverge as soon as a hijack roll is made, so single runs move a lot; over ten further
seeds (100–109) the first price cut convicted the ruthless bot 2 times in 10 against 0 without
supply, and the price above brought it to 1.

## 19. Your character

Skills used to grow only by doing (`practise`): every threat was muscle, every job its skills.
`sim/character.ts` adds three things, with the numbers as data in `content/character.ts`.

- **Training** (`train {skill, at}`):
  - It costs 2 hours, once per skill per day. A session is worth 16 experience, +6 per tier of the
    place above the first. Each consecutive day you train adds +2, up to +10; miss a day and the
    streak starts over.
  - Where and when:
    - muscle: at a gym, after dark;
    - charm: at a nightclub, bar or casino, after dark ("work the room");
    - wheels: at a garage or cab company, by day;
    - tech: at an electronics shop or pawnbroker, by day;
    - brains: by day, with the books, anywhere.
  - Somebody else's place charges $60 × tier; your own or a protected one is free. You train from
    the place's sheet ("For yourself"), or from Empire → You, which points to the best place in the
    city.
- **Boosts** (`take_boost {kind, at}`). They are bought and taken on the spot: from the fixer at any
  hour, a pharmacy by day, or a nightclub at night.
  - Bennies ($120): two more hours now, or one once your habit is 50+. Habit +10.
  - A bump ($250): muscle and charm +2 for the rest of the day, through `skillOf`, so fights and jobs
    feel it. Every rolled conversation also gets +6. Habit +15.
- **Habit** (0–100):
  - It fades 4 on a day without a boost.
  - Past 25, a day without one is a bad morning: −1 hour per 25 above the line, up to −3. Your hands
    shake too (−5 on every conversation).
  - Drying out (`dry_out`, the fixer's doctor, $900, 3 hours) takes 50 off.
  - The ledger bar shows "Wired" or "Shaking".
- **Reputation** (`reputation(w)`). Never stored; read from fear and respect.
  - Feared: fear ≥ 50 and 15 more than respect. Threats +6, deals −2.
  - Respected: the mirror of feared. Threats −2, deals +6.
  - A man of honour: both at 50 or more. +4 on both.
  - Every rolled scene quote carries the line: the wrapper in `quote` adds it, so the button and the
    dice agree. "Threats" are intimidate, squeeze, lean and taking a corner crew; "deals" are
    protect, recruit, bribe, settle, buy, favours and paying a crew.
  - The penalties are small on purpose. At −6 on deals, the bots held 17% of the city at day 60
    instead of 24.6%, because their fear runs ahead of their respect.
- **Bots.** The timid and the schemer study brains; the steady bot works the room; the fighters
  train muscle. The ruthless take a bump on a night at war; the maniac takes bennies every other day
  and dries out at 60. The fighters train every other day and the rest every fourth, and **none of
  it before day 20**. One session on night 4 took two of three night hours from recruiting, and left
  the steady bot at 11% on day 60 instead of 25% (seed 7).

**Balance (five seeds, 60 days):**

| Bot | Control | Outcome |
|---|---|---|
| Steady | 24.4% | never convicted |
| Ruthless | 24.1% | never convicted; habit 41 at the end |
| Maniac | 13.2% | convicted in 2 of 5, killed in 1 (measured before a late fix; really 8.5% and 5 of 5 lost, corrected in §20) |
| Timid / schemer | — | study about 10 times |

## 20. The back rooms

Casino games as real minigames (`sim/backroom.ts`; the numbers are data in `content/backroom.ts`).
All the dealing happens inside `dispatch` from the world's seeded rng, and the table is state
(`World.table`) that the screen reads and answers one action at a time.

- **Where.** After dark at a bar, nightclub, restaurant or casino, or at any place with a gambling
  den behind it, whoever runs it. Place sheet → "The back room".
- **Five-card draw** (`table_sit`, `poker_draw`, `poker_bet`, `table_next`, `table_leave`):
  - Stakes are $100, $300 or $1,000 a hand; you need four antes to sit. Sitting costs an hour, and
    the hands after it are free, up to 8 a sitting or until dawn.
  - Two regulars sit with you (strangers if the place has none).
  - Everybody antes. You hold what you like and draw; the others hold pairs, four to a flush, or a
    high card.
  - Then you fold, call (a showdown for the pot) or raise twice the ante. On a raise:
    - each other player calls with two pair or better;
    - with a pair, they call if it is jacks or better, or on nerve;
    - with nothing, rarely.
  - If everybody folds, the pot is yours. The house takes 5% of a pot unless the house is yours.
  - **Reads.** After the draw each player may give themselves away: 20%, +5% per point of brains,
    +3% per point of charm, up to 80%. The read is true ("sitting on something big", "has
    nothing").
  - **Dealing from the bottom.** Your draw comes out of the bottom dozen, the best of them for what
    you kept. You are caught 35% of the time, −3% per point of tech and −2% per point of brains, never
    under 5%. Caught: the pot is gone, you are out, heat +2, respect −2, and the players at the
    table lose 15 trust and gain 5 fear.
  - A sitting played straight gives each regular +4 trust.
- **The night encounter.** "Cards at …" now offers "Take the chair and play it out" (a `table`
  effect seats you, with that regular in the first chair). The old one-hand option stays for a boss
  in a hurry.
- **Street dice** (`dice`): $50, $200 or $500, craps rules. 7 or 11 wins, 2, 3 or 12 loses, anything
  else is the point, rolled for until the point or a seven. Even money, 10 games a night.
- **The numbers** (`numbers`): three digits, by day, up to 3 slips of $10, $50 or $100. Drawn
  overnight at 600 to 1. You can play anywhere, except against your own book, where you run a
  numbers racket in that city. The draw comes from its own stream (seed and day), not the world's
  rng. Drawn from the world's rng, one number a night shifted every later roll, and the ruthless
  bot, which never plays, went from 0 convictions in five cities to 2.
- **Screen.** The table is a modal: bone-white cards, tap to hold, the players with their reads,
  the pot, and the hand's lines. Dice show the faces roll by roll. The numbers are on Empire → Money.
- **Bots.**
  - The schemer takes the chair when the night encounter offers it, and cheats when the chance of
    being seen is 20% or less. Only the schemer: taking the chair instead of the one-hand option
    cost the steady bot four points of the city.
  - The steady bot sits at $100 every fourth night after day 20.
  - The maniac rolls dice; the timid boss plays a slip a day.

**Balance (five seeds, 60 days):**

| Bot | Control | Back room | Outcome |
|---|---|---|---|
| Steady | 24.8% | — | never convicted; identical to before |
| Ruthless | 25.6% | — | never convicted |
| Schemer | — | 7.4 hands, 4 won | killed in 1 of 5 (day 38) |
| Maniac | 15.7% | 4 dice games | convicted in 2 of 5 |
| Timid | — | 20 numbers slips | — |

## 21. Cars

Cars on the street, a garage, and cars on the job (`sim/cars.ts`; the numbers are data in
`content/cars.ts`).

- **What is parked.** Every block has one car worth taking each night, chosen by a hash of the
  seed, the block and the day, not by the world's rng. The sheet can show it before you try, and
  looking changes nothing. Models run from a hatchback ($1,400, only on blocks of wealth 55 or
  less) to a sports car ($12,000, 75 or more).
- **Taking it** (`steal_car`): after dark, on the block, an hour.
  - The odds: 50, +5 per point of wheels, +3 per point of tech (kit counts), less the model's lock
    (0 to 28), less a quarter of the district's police attention. Between 5 and 95.
  - Success: the car is in your garage, hot for 5 days, and puts 2 heat on the block.
  - Failure: 4 heat, and a 15% chance of a robbery file (evidence 10).
  - One car per block per night.
- **The garage.** Room for one on the street and two per safehouse tier. Each hot car costs 0.3
  heat a day while it cools.
- **What to do with it** (`car {carId, what}`):
  - chop it for dirty money: 55% of the value at your own chop shop in the city, 30% through a
    scrapyard;
  - respray it at a garage you own or protect ($400, an hour): it cools at once and gets new
    plates;
  - then keep it: it becomes kit (hatch or pickup → beater, sedan, taxi or luxury → sedan, coupe →
    motorbike, sports → muscle car);
  - or sell it by day for 45% of the value, clean.
- **The getaway.** On a failed job, each crew member's arrest chance is multiplied by
  (1 − 0.12 × the best car bonus in the crew, yours included if you went), never under 0.4. A
  muscle car cuts it by about a third.
- **Deliveries.** A driver with car bonus 2 or more has loads taken 25% less often (`supply.ts`).
- **Screen.** "Parked tonight" on the block sheet, with value, odds and garage room. "The garage" on
  Empire → Holdings, with hot days and the four actions. A line in How to play.
- **Bots.** The ruthless and the maniac steal every other night after day 20, when the odds are 50%
  or better and an hour is left. Anybody with cars works the garage: resprays and keeps one if they
  have no car, sells what has new plates, and chops the rest.
  - Stealing for the steady bot too cost it three points of the city and 14 heat for one car a run.
  - The first theft consequences (5 heat and a 30% file on a miss) convicted the fighters more often.

**Balance (five seeds, 60 days):**

| Bot | Control | Cars stolen | Outcome |
|---|---|---|---|
| Steady | 24.8% | — | never convicted; identical |
| Ruthless | 25.1% | 3 | convicted in 1 of 5 (day 59); heat 82 |
| Maniac | 13.9% | 1 | convicted in 3 of 5 (was 2) |

Car theft is heat, and the fighters live on the edge of the law.

## 22. Stories

People whose business is you, for weeks at a time (`sim/stories.ts`; the numbers are data in
`content/stories.ts`; the turning points are schedule-only cards in `events.ts`). **Nothing is written
in: the game is a sandbox.** The first cut gave every game the same detective and heir; now each game
gets its own.

- **The catalogue.** Six kinds. Each has a meter that moves every night, cards at thresholds, and
  moves you can make from its panel:

  | Kind | What sets it off | Meter | What it does |
  |---|---|---|---|
  | Detective | heat past 30–55, or day 12–37 | the file | watching at 30, a turned witness at 60, a raid at 90 (half your dirty money, a racketeering file) |
  | Reporter | fear + respect past 50–90, from day 8 | the story | questions at 35, a draft at 65, the piece runs at 100 (heat +12, respect −4); two pieces and done |
  | Heir | an outfit's standing past −40 to −65 | the grudge | a weekly message or racket hit; a showdown at 90 (partner, face them, or kill) |
  | Avenger | somebody with a revenge agenda (the family of somebody killed on your word), 8% a night | their hate | hires a gun at 60; the attempt at 100 is stopped by a guard on your block or 25% luck, otherwise you are hurt |
  | Turncoat | somebody who left your crew in the last fortnight, 15% a night | what they have told | sells you to your worst rival at 35, goes to the police at 70 (a file with them as witness), signs a statement at 100 |
  | Old friend | a window in days 10–30 | the plan | grows only with your time and money; asks for more at 50; the payoff at 100 is $15–40k, or a con |

- **What makes it procedural:**
  - **The seed's appetite.** A hash of the seed decides whether a game has each kind at all
    (detective 75%, heir 70%, avenger and turncoat 60%, reporter 55%, friend 45%). It also decides
    where the trigger sits inside its range, whether a detective is honest (60%), whether the old
    friend's plan is a con (30%), and whether another of a kind comes after the first ends (35–50%,
    no sooner than 20 days later).
  - **The world's cause.** Nothing starts without the thing that sets it off. A cold, quiet boss
    has no detective; a boss who never kills has no avenger.
  - **Two at a time, one new a night,** in an order the seed and the day shuffle.
  - **People.** The detective, the reporter and the old friend are new people, each made from
    their own rng stream so the city does not move. The heir, the avenger and the turncoat are
    people already in the city.
  - **No world rng.** Every chance that decides whether a story exists is a hash, never the
    world's rng, so looking at the city never changes which stories it will have.
- **Moves** (`story {arcId, move}`), each with its cost and odds on the button (`movesFor`):
  - detective: dig then blackmail, bribe (clean; an honest one writes it down), lean, have them
    moved (a councillor on the payroll and $3,000 clean), make them disappear;
  - reporter: feed them a rival's story (−35), buy the editor ($6,000 clean, ends it), lean,
    silence;
  - heir: a gift, a sit-down;
  - avenger: make amends (money and charm), frighten them off, silence;
  - turncoat: buy their silence, frighten them off, silence;
  - old friend: put in time and money (+25 a go), walk away.
  - Silencing anybody is a killing: heat, a murder file, and it ends the story.
- **Screen.** "People with your name in their mouth" on Rivals: each live story with its person,
  meter, what happens at which point, and its moves; a line for each one that ended. Their person
  sheets say who they are.
- **Save migration.** A save from before (one detective and one heir in `World.stories`) becomes
  arcs (`migrateStories`).
- **Bots.** One routine for every kind (`stories()` in the bot), plus card scoring. "Stories" is one
  coverage row. Across 10 seeds × 3 temperaments, seeds 2 and 8 had no stories at all in 60 days,
  and no two seeds had the same set.

## 23. Seasons

A week at a time when the whole city is different (`sim/seasons.ts`; the numbers are data in
`content/seasons.ts`).

- **The calendar.** The first season comes on day 10, and each next one 8 ± 2 days after the last
  ends, so sixty days see about four.
  - The order is a per-seed shuffle of the four kinds, cycled, so every sixty-day game sees each
    kind once.
  - The spacing and the election's result come from hashes of the seed and the day, never from the
    world's rng.
  - The papers carry it three days ahead: a headline in the news and a line in the log.
  - The season opens with a card, drawn the night before so it waits in the morning.
- **The four seasons:**

  | Season | Days | While it lasts | Opening card |
  |---|---|---|---|
  | Election | 8 | — | back the machine or the reformers ($3,000), or stay out |
  | Crackdown | 7 | heat ×1.3; every precinct's attention +25 | buy the captain's patience ($4,000, halves the attention), or ride it out |
  | Festival | 5 | heat ×0.9; takings ×1.3 (rackets and protection); street prices ×1.2 | sponsor the fireworks ($1,500, respect +4), work the crowds ($1,200 dirty, heat +3), or enjoy it |
  | Dock strike | 6 | street prices ×1.4; lab supplies ×1.5 | let it run, pay the union ($3,000, ends it, respect +3), or cross the picket line (ends it, heat +8, fear +3) |

- **The election.**
  - The machine's chance is 50%, ±5 points per $1,000 of backing either way, +8 points per
    councillor on your payroll, between 10% and 90%.
  - You can keep backing a side by day, $3,000 at a time (`back_candidate`, Rivals → "This week in
    the city").
  - What the winner leaves for 20 days (`World.aftermath`): if the machine wins, officials cost 30%
    less; if reform wins, every precinct's attention is +15.
- **Hooks.**
  - Heat: `addHeat`, read straight from the data, because everything imports `util`.
  - Attention: `law.ts`, through `attentionAdd`.
  - Takings: `racketIncome`, and protection in `endDay`.
  - Prices: `streetPrice`. Supplies: `restockCost`. Bribes: the `bribe` quote, through `bribeMult`.
- **Screen.** A season chip in the ledger bar ("Festival 3d"), a "This week in the city" panel on
  Rivals (the season, the papers' warning, the election's odds and buttons, the aftermath), and a
  line in How to play.
- **Bots.**
  - They answer the opening cards by scoring: a softened crackdown is worth more the hotter they
    are, and the machine is worth about its $3,000.
  - The schemer keeps backing the machine while its odds are under 80%.

**Balance.** Ten fresh seeds (100–109), with seasons against without:

| Bot | Control | Runs lost |
|---|---|---|
| Steady | 22.5% (23.9%) | 1 (0) |
| Ruthless | 26.4% (20.9%) | 1 (4) |
| Maniac | 20.3% (20%) | 5 (5) |

In short, seasons move the dice but not the outcomes.

## 15. The road: the whole game

The Remake is heading toward the full game its inspirations add up to: City of Gangsters (a
business empire under the crime), Torn (a character you build, timers, a world to be in), and the
old-school browser mafia games (ranks earned through crimes, a family with a hierarchy, the
casino, cars, travel with contraband). Everything stays phone-first, one thumb, offline, a city
generated from a seed.

What exists: territory, protection and rackets; labs and product; crew with levels, loyalty and
kit; seventy-two kinds of job with complications and set-piece heists; heat, case files, the law
and officials; rival outfits with diplomacy, war and a Commission; hostages; a region of cities
with trains and trade routes; day and night.

All eight pillars below are built (§16–§23). They were done in the order recommended:
1. **The family.** Crew become a family with ranks — soldier, capo, consigliere, underboss —
   each with duties (a capo runs a crew of soldiers; the consigliere improves sit-downs; the
   underboss keeps things running when you are jailed), a making ceremony, and betrayal: rats,
   coups, a successor who is not the one you chose.
2. **Fights.** A real confrontation system: street fights, shootouts inside jobs and wars,
   ambushes at night, injuries as hospital time, and a bullet economy (the old games' currency of
   violence).
3. **Supply chains** (City of Gangsters). Product has to be carried: stills and labs feed a
   distribution network of the bars and clubs you own or protect, each with its own demand, and a
   speakeasy is a business, not a number.
4. **Your character** (Torn). Training at the gym by night and study by day raise skills; boosts
   with an addiction cost; a reputation that opens doors (and closes them).
5. **The back rooms.** Casino games as real minigames at night: poker at the card table the
   night encounter already seats you at, dice, the numbers draw.
6. **Cars.** Stealing and chopping cars; a garage; cars as kit for getaways and hijacks.
7. **Stories.** A nemesis per city — a detective who is building a case on you by name, a rival
   heir — with arcs across weeks rather than one-card events.
8. **Seasons.** City-wide events: elections, a crackdown, a festival, a strike at the docks.

Two larger decisions are deliberately left open:
- **Multiplayer**, in the Torn sense of other real players in the same city. It needs a server,
  which the game does not have.
- **An App Store build** through Capacitor, which would add haptics and notifications.
