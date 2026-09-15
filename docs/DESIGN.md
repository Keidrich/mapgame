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
- `wealth` 0–100, `police` 0–100 (**baseline** patrol only — the number a risk roll wants is
  `effectivePolice()`, baseline plus what the Authorities nearby are projecting; see §6.1),
  `heat` 0–100 (your notoriety here), `population` (drives patron count and product demand),
  `areaM2`.
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

Every scene's positive effects run through the standing gates in §3.7: an approach buys what it
cost, not what its base number asked for.

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
- **Block memory** is told by whoever you are standing in front of — except its subject.
  `BlockMemory.about` names who or what a story happened to, and `openingLine` uses it so nobody
  reports their own mugging as street talk. Somebody whose *place* was hit talks about it as
  theirs; their family and friends still carry the story and now say whose tie it is, because that
  is why it reached them. A memory with no subject (an old save, or a story about nobody in
  particular) is told by everybody, as before.
- **Reputation** travels along the same ties and nowhere else — see §3.7.
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
friend-referral recruiting, turning a rival's brother into an inside man). A first piece of
it landed with §3.7: somebody you are holding counts as a hold over everyone they are tied to.

### 3.6b Business tiers: what a place is, and whether fear is a door

Every `BusinessDef` carries a `tier`, and it is not a label — it decides three things at once.

| tier | what it is | rackets | nerve floor | fear as a way in |
|---|---|---|---|---|
| 1 street | a counter and somebody who has to open tomorrow | its own list | none | ordinary rules |
| 2 established | books, a lawyer on call, an owner leaned on before | its own list | 72 | talk will not; a broken window will |
| 3 institutional | a bank, an accountant, an import firm | **none** | 90 | never, at any amount |

**Tier 2 is the interesting one, and it is arithmetic rather than a rule.** Nothing refuses an
established owner's shakedown by name. `PROTECT_NERVE` is 0.6, so a floor of 72 wants fear +
respect of 43 — above `STAKES.words.ceiling` (35) always, and above `STAKES.backed.ceiling` (50)
unless respect is doing work. Talk stops being enough because of where the number sits; a
`property` act (ceiling 80) opens the same `protectRoute` it always did, and so does a settled
favour. The rules did not change, the ground did.

**Tier 3 is `rackets: []` generalised.** The bank and the armoured depot already lived under
exactly this rule and it was written twice by hand; `TIER_EXCLUDES[3] = 'all'` means the six
institutions added since are covered without a third name in the check. `extortReason` refuses
both shakedown and protect outright and names the door that *is* open — get inside their books,
or do the owner a real turn — which is §3.7's leverage and reciprocity, unchanged.

`racketsAllowed` is the **intersection** of the type's own list and the tier's, never a
replacement: a bar is still a bar. `select.availableRackets` reads the same function `can` does,
so the block sheet can never offer a racket the reducer then refuses. `setupCost` scales with the
tier, because everything inside an established place costs more.

**Income and value are not multiplied at generation.** `TIERS[n].income` documents the shape and
the defs are written to it — a test asserts tier-2 income midpoints exceed tier-1's and tier-3's
exceed tier-2's. Stapling a multiplier on top of already-tuned ranges would have re-balanced the
whole economy silently; the real mechanical scaling is setup cost and the nerve floor.

### 3.7 Standing: fear, trust, familiarity and word of mouth

The four numbers every social system reads, and for a long time the four that were flat. One
rule now governs all of them: **a relationship can only become as deep as the thing that built
it.** `content/standing.ts` holds the numbers, `sim/standing.ts` the machinery, and everything
goes through two chokepoints in `sim/util.ts` — `adjustRel` for face to face, `bleedRel` for
word that merely reached somebody.

**Fear is a consequence, not a formula.** Every act that frightens somebody declares a `Stake`:
what it actually cost the player to do. A stake has a multiplier and, more importantly, a
**ceiling** it can never take anybody past.

| stake | what it is | ×  | ceiling |
|---|---|---|---|
| `words` | a stare, a raised voice, a name dropped | 0.45 | 35 |
| `backed` | the same words with crew in the doorway, or their family named | 0.70 | 50 |
| `property` | something of theirs broken, taken or burned | 1.30 | 80 |
| `violence` | somebody hurt, and they know who did it | 1.80 | 95 |
| `grave` | somebody taken, or worse | 2.40 | 100 |

At or above a stake's ceiling the gain is exactly zero, and that is the intended reading: once
somebody has watched you put a man in hospital, your hard stare tells them nothing new. The
default for a call site that does not say is `words`, so anything costlier has to declare it.
`threaten` reads its approach — a stare is `words`, bringing people or naming their family is
`backed` — which is where the old flat "approach base plus half your muscle" used to sit.

**Trust plateaus, and concessions need a reason on top.** Two separate checks, deliberately not
merged into one bigger threshold:

- Ordinary dealing — visits, drinks, small talk — stops at `CONCESSION.ordinary` (45), "we are
  friendly". Only a **favour actually settled** lifts it, +15 each to a hard 85. Nobody is
  bought outright.
- A **major concession** — protection, a place in the crew, a friendly price on a business —
  needs trust *and* one of: reciprocity (`rel.favours > 0`) or **leverage** (`leverageOver`):
  you hold their street at influence 55+, you have been inside their books within 30 days or
  are still listening, or somebody they are tied to is in your cellar.

Leverage layers on top of trust; it is never a door of its own. A version that let leverage in
by itself ran for an afternoon and had to come out — protecting one place tipped the block's
influence, which handed you every other place on it for free, which fed the influence again.
Honest income came out 1.8× a day and average owner fear fell from 26 to 1.

`doFavour(w, n)` is the reciprocity hook, and the seam the agenda-resolution pass plugs into.
Today it fires on the five places the player already settles something real: covering a debt,
sorting an owner's problem, hearing somebody's family out, paying them, giving a debtor a week
— and on **bribing an official**, whose entire relationship with the player is the money.

**A familiarity floor, generalised.** `promoteReason` has always refused to hand a district to
somebody who joined yesterday, however loyal: `w.day - c.joinedDay >= LIEUTENANT.minDays`. That
was the only place in the game that asked how long you had known anyone. The same shape now sits
under every deep relationship, on `rel.metDay` / `rel.contacts` (3 days **and** 2 separate
occasions): below it trust stops at 25 and fear at 30. The one exception is a demonstrated act —
`property` and up — which introduces you perfectly well. A contact is a meeting, not an
arithmetic operation: several nudges in one day count once.

**Reputation walks the graph.** `spreadRep` used to paint every face within a geographic radius,
so a name made in one district quietly worked in the next. It now seeds on whoever was actually
there and walks §3.6's connections outward — witnesses ×1, one degree ×0.45, two degrees ×0.18,
and nothing at three. Word reaches the five people closest to somebody, not their whole address
book. The old `radius` argument became `degrees`: how far *this* thing carries, so a killing
travels two and a raised voice one. Somebody with no path back to the scene hears nothing, which
is the whole point — expanding into new ground means starting cold there, socially, every time.

**Saves.** All four fields on `Relationship` are optional, so `WORLD_VERSION` did not move. An
existing save loads with everybody a stranger, which is the right answer for anyone the player
has not dealt with since.

### 3.8 Conversations, agendas, and the ledger

Three pieces that only work because §3.7 exists.

**Agenda resolution.** Every NPC worth watching carries an `Agenda` — a debt, a way out, a score
to settle, a name to make, somebody to keep safe — and it advanced daily whether or not the
player showed up. You could read it on their sheet and do nothing with it: milestones fired
events *at* the player, and there was no move to make *with* one. Now each kind has a real action
(`resolve_agenda`, moves in `content/agendas.ts`), gated on actually knowing the agenda — a
size-up, a look through their books, or a tap. Trust is not one of the three: people do not
volunteer this.

| kind | the move | what it costs |
|---|---|---|
| `debt` | pay off what they owe | cash, scaled by how far the debt has rotted |
| `leave` | help them get out — **or** shut every door so they cannot | $1,200, or nothing but nerve |
| `revenge` | go and settle it for them | noise |
| `ambition` | put your name behind them | your standing if they are no good |
| `family` | put somebody on whoever they are frightened for | noise, and word that you watch that house |

A trap resets the agenda's progress without closing it — they still want out, they just cannot —
so `TRAP_REWARD.again` holds a 20-day cooldown on shutting the same door twice. Without it the
move is a free-fear loop, which the soak found at 54 traps to 6 settlements in a single run.

Every `settle` ends in `doFavour(w, n, kind)` — the whole hook into §3.7, and the reason the
pass matters: before it, reciprocity could only arrive from the handful of events that happened
to offer it, so the concession gates had one sparse input. `trap` deliberately does **not** call
it: it takes fear and a person who cannot leave, and no friend. Both are real plays and neither
is the obvious one.

**Conversations.** A scene used to be one screen: opening line, three approaches, result — the
same three moves whoever you were talking to, whatever you knew about them, whatever had passed
between you. A conversation is now a queued `Confrontation` with `kind: 'talk'`, answered through
`resolve_confrontation` and rendered by the scene sheet. That is the same queue a fight at your
door uses, chosen over a second pending-action mechanism because the queue already owns the
End Day sweep, the "deal with what is in front of you" gate and the modal stacking; a parallel
system would have had to reimplement all three and stay in step with them for ever.

The menu is generated from world state, never authored per person:

- the scene's own approaches, which **close** the conversation (what the whole scene used to be);
- **their agenda**, if you have established it — the move above;
- **a name you both know**, from §3.6's graph;
- **something out of your history**, from the ledger below.

The last two are *openers*: they do not close the conversation, they buy a bonus on whatever you
close with, and each can be worked once. That is the tactical shape — spend a beat softening
somebody for better odds, or go straight in and risk the number you have. Openers can also land
badly and cost you trust. `TALK.maxBeats` caps how long you can warm somebody up before asking.

Opening a conversation is free; the AP goes on the closing move, and the closing move is gated by
its own scene's rules, so a conversation is never a way round a shakedown's cash cost.

**The ledger** (`sim/ledger.ts`) is one line per meaningful exchange, on `Npc.ledger`, and
`dossier()` assembles it with the established facts, favours in both directions and any current
hold into the one screen the UI renders. Deliberately one screen for everybody: a shopkeeper and
a lieutenant have the same *kind* of history with the player and only the contents differ, so the
crew rows simply do not appear for somebody who is not crew. `rel.owedToThem` is the other side
of `rel.favours` — things they did for you, which a later conversation can spend.

Outcomes route through what already exists: an agenda resolution advances or closes the agenda,
spreads reputation through `spreadFrom` exactly as §3.7 does, writes a ledger line, and logs
itself, so the next conversation opens differently. No new reputation or memory system.

**The reducer split.** Making a closing move run a real scene meant one action running another on
the same world, so `dispatch` is now clone-and-charge and `apply` is what-the-action-does; and
`can` is the modal gates plus `gate`, the action's own rules. A conversation asks `gate` about its
closing move, because asking `can` would have the conversation refuse itself for being in front
of the player.

### 3.9 The lieutenant who keeps turning up, and the people who work for you without being crew

Two pieces, both of which are almost entirely made of things that already existed.

**Nemesis.** Faction lieutenants were furniture: a name on a sit-down, a name in a succession
crisis, a name the faction tick never bothered to pick at all — attacks arrived from an anonymous
"they". You could beat the same person six times and the seventh was identical to the first.

A nemesis is not a new kind of person. It is the ledger (§3.8) doing for a lieutenant exactly what
it does for a shopkeeper, plus one number on `Npc.nemesis`: **notoriety**, scaled by `STAKES` the
same way fear is, because somebody who put your crew in hospital is made by it and somebody who
talked over you at a sit-down is not. `leaderFor` names who came — weighted toward whoever already
has history with the player, which is the whole of what makes a recurring antagonist rather than a
fresh name every week — and `scoreMeeting` writes the meeting to their page.

Notoriety buys `MILESTONES` in order, each paid once and each one legible change: a trait, then
muscle, then **a name** (`nemesisName` replaces the given name everywhere from then on), then
connections, then brains. It also feeds `successionWeight`, which is on the existing `f.crisis`
scale and in `candidatesFor` — a lieutenant who has been beating you in public is exactly who the
soldiers would follow, and the shortlist used to be whoever happened to be first in the array.

**Three things make one, and for a long time only two of them counted.** A win against the player
is worth `perWin` × the stake; a loss shaves `perLossFraction` of what they have; and *turning up
at all* is worth `perMeeting`, win or lose.

That last one is the fix for a system that was quietly unreachable. Notoriety floors at 0 and a
loss used to take a flat slab off it, so a lieutenant who came at the player and lost sat on the
floor for ever and no later win climbed off it — a sixty-day war soak had one lieutenant at the
player's door **84 times**, W7 L77, with a notoriety of **0.0**, and every scenario in the sweep
finished with zero nemeses. A system that only fires for a player who is losing is backwards for a
game whose whole arc is starting from nothing. The three terms now sit in tension on purpose:

- somebody who *only* ever loses plateaus at `perMeeting / perLossFraction`, which is deliberately
  **below `known`** — on your sheet with a record, not your nemesis;
- somebody who beats you occasionally crosses it, because a win is worth several meetings;
- and `earnedFloor` stops a later run of player wins walking an established nemesis back down past
  milestones they have already been paid. A name the street gave them does not come off.

Erosion is proportional rather than flat for the same reason it is not zero: "a nemesis who keeps
losing stops being one" is right, but a fixed subtraction against a floor of 0 is a deletion, not
a decline. `sim/nemesis-balance.test.ts` holds all of it.

**And the other direction: what the street calls you.** A lieutenant who kept turning up earned a
name that replaced theirs everywhere, and the player — the reason any of it happened — stayed
whatever they typed at the character screen. `playerName(w)` closes that, through the *same*
function (`withNickname`), so the two cannot drift apart. Which pool it draws from is the point:
fear and respect are two different ways of being somebody, the game has tracked both since the
standing rework, and nothing has ever read the difference out loud. Whichever is ahead by
`STREET_NAME.margin` when you cross `STREET_NAME.at` decides — so the name is a summary of how you
have actually been playing, not a level-up badge. Set once, never cleared, deterministic from the
name so a replay reads the same, and `select.factionName(w, PLAYER)` picks it up, which is how it
reaches the map legend, the holdings rows and the faction screens without any of them knowing.

**The name is a replacement, not an addition.** `populate.ts` gives every boss and lieutenant a
nickname at generation, and a nemesis is always a lieutenant — so `nemesisName` inserting an
earned nickname next to the given one produced `Cassandra "the Nail" "Moose" Booker` on *every*
nemesis that ever reached the `named` milestone. It strips whatever is already in quotes first.

**Defection** (`sim/defect.ts`) is the mirror of `flipLieutenant`, which had handled losing one of
yours since the lieutenant pass and had no opposite. It is explicitly *not* a loyalty number you
grind down: it goes through `concessionReason`, the same gate as protection or a place in the
crew, so the route in is settling **their own** agenda — a lieutenant's debt, their resentment of
their own boss — through `resolve_agenda`, which calls `doFavour`. A loyal one still refuses. It
costs 45 standing, two soldiers, a bed and two AP, and it is the worst thing the player can do to
an outfit.

**Scheming.** An `ambition` agenda on a lieutenant used to mean one thing, so every ambitious
lieutenant in the city wanted the same chair and none of them ever moved on each other. It now
sometimes names a peer instead — preferring one they are actually connected to, read off §3.6's
graph — and resolves inside the faction on the sim's own clock, pushing one of them out.

**Informants and assets** are the "phase 2 leverage" plays the connections graph was built for and
then deferred, because nothing existed underneath to hang them on. The distinction that carries
them: **a favour is spent, an asset is standing.** Turning somebody costs what any other major
concession costs — `concessionReason`, so leverage or a settled favour — and then keeps paying:

- **passive** — an informant placed to hear about a faction gets word out before it moves, and
  `Confrontation.warned` is worth `ASSET.warnedBonus` on the answer, because you are in the
  doorway rather than looking up from the till;
- **active** — a pair of hands close to the target adds to `opChance` on every job against their
  own people, through `assetBonus`, which reads the target the same way every other modifier does.

They go cold if you never call: `ASSET.goesCold` days of silence and they drift, which is why
using one is what keeps it — plus a fixed per-person offset up to `ASSET.coldSpread`, derived from
their id rather than rolled. Without it the threshold is one global clock: a batch turned in the
same week and left alone all becomes eligible on the same morning, and soak runs had several "is
not returning calls" lines land on one day. Deriving it from the id rather than a roll keeps
`/sim` pure and survives a save round trip, so one relationship has one clock for its whole life.

**Referrals** are the one thing in the game that shortcuts the familiarity floor. Somebody who
knows you well enough (`REFERRAL.minTrust`, and familiar themselves) makes a call, and the target's
`metDay` is dated back and their `contacts` topped up — so every existing familiarity check reads
it without knowing referrals exist at all. It does not make a stranger trust you; it makes you not
a stranger, which three days and two meetings were otherwise the only way to buy.

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

**What `minCrew: 0` has to mean.** `needs` is a *sum across the hands on the job*, and one person
is about a 4 in a skill and an 8 if it is the skill they came up on — the player's spread never
grows, so that is true on day 1 and on day 300. So an op marked solo must have `needs` written on
the one-person scale, or the tree says "solo ok" and the arithmetic says no: wire fraud asked for
tech 14 + brains 12 on an op whose `maxCrew` is 2, which is a three-hand job, and came out at 3%
for every background including the one whose whole pitch is the wire.

The rule, enforced by `sim/solo-play.test.ts`:

- **The primary need is reachable but not cappable by a specialist alone.** Above ~8 (so a
  specialist at 8 does not sit on the 1.3 ceiling with nobody on the job — that would leave no
  reason ever to bring a second pair of hands) and low enough that they land it: the floors are
  60% at tier 0 down to 30% at tier 4, for the best background, picking the best approach, on day
  one with no kit and no heat.
- **Secondary needs stay at what anybody has spare** (4–6). `ratio` is the *mean* across needs, so
  a second need on the crew scale sinks the whole job on its own regardless of the first.
- **The background whose skill the job names comes out on top.** Also a test: a rescale that went
  too far would make every solo op a shrug for everyone.

This raises the floor without moving the ceiling — `ratio` caps at 1.3 per skill either way — so a
crewed job is within a few points of what it always was. Charm jobs need the most room, because no
approach weights charm (`loud` is muscle/wheels, `quiet` is tech/brains, `inside` is brains), so a
charm player can only ever lose by picking one.

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

**Working alone, as a build.** The solo pass made one-person play *viable* — the op tree stopped
asking one person for a crew's worth of skill (§4.4). That left it correct and characterless:
everything a crew player does, minus the parts needing a crew. `LONE_WOLF` is the other half:
things that are true **because** you are on your own, and stop being true the moment somebody
else is involved. The condition is `activeCrewCount(w) === 0` — a way of working, not a vow, so an
outfit that gets taken apart is alone again in every way that matters here.

- **Heat ×`LONE_WOLF.heat`.** Heat is other people talking about you, and there is nobody to talk.
  The biggest of the three by far, which is why the number is 0.75 and not lower: at 0.55 the heat
  ladder simply stopped engaging (a sixty-day honest run went from two rackets to eight and never
  saw a raid), and switching off the game's main pressure system is not a build payoff.
- **Respect ×`LONE_WOLF.respectDrag`.** The counterweight, and what makes it a trade: the street
  rates an *outfit*, and one person is not one.
- **`LONE_WOLF.opBonus` on a job you run with nobody on it.** Reads `isLoneWolf`, not "how many
  are on this op" — so a crew player cannot pick it up by leaving everybody at home.

And a lane of its own. **`OpRequires.alone` is not `minCrew: 0`**, and the difference is the whole
point: a `minCrew: 0` job is one you *can* do alone, an `alone` job is one that stops existing the
moment there is a second person to be seen, remembered or leaned on. There is no version of
"nobody can describe you afterwards" with somebody standing next to you. If the lane were only a
relaxation of crew-gated content it would be a discount; because it is its own content, an outfit
cannot buy into it at any price. `alone` is the one addition to the gating vocabulary since it was
frozen, and it earns its place because no existing key expresses it: `crewCount` asks whether
anybody ever joined, this asks whether anybody is here *now*, and that answer has to be able to go
back to no.

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

### 4.8 When they come for you

A faction's tick used to resolve its attacks alone: you read in the morning that your numbers
racket had been wrecked. Now a **direct** attack — on a racket, a place you own, or one of your
people — queues a **confrontation** instead. Nothing else happens until you answer it: stand and
fight, call your crew in, or walk away, each with the odds it actually rolls.

The three answers are cut from the three op approaches — fight is loud, flee is quiet, backup is
an inside job — so `sim/items.ts` reads the carried kit unchanged: `kitSkillBoost` adds to your
side, `kitApproachBias` scales it, `kitHeatMult` scales what the night leaves behind. A
pump-action is worth having when you stand; it is worth nothing when you run.

Territorial pressure — soldiers leaning on a block you hold — stays automatic. Nobody is
standing in front of you for that one.

Ignore a confrontation and End Day lands it exactly as it would have before any of this
existed, which is also what keeps the headless soak honest.

**Every outcome line names where it happened, and that is not decoration.** In war a faction takes
*two acts a day*. Two genuinely different incidents — muscle in one of your rackets, one of your
people against a wall across town — both answered with a fight and both won printed the same fixed
sentence, which named the faction and nothing else. It read as one event logged twice and was
reported as a duplicate-processing bug from four separate soak runs. There was never a duplicate:
the log simply was not saying which of the two it meant. `what(w, c)` was already computed for the
ledger line; the log lines now use it too.

The one case where it really was a duplicate is `alreadyAtTheDoor`: two acts a day can pick the
same racket twice, and one door gets one crowd.

**Answering the heat yourself.** The heat-60 warning has told the player to "lay low" since the
game had a heat meter, and there was no such thing: the answers to a rising ladder were paying
somebody (an official who takes your calls, money you may not have) or scrubbing, which only
touches the wire. **`lay_low`** is the missing one, and it is paid for in the thing the player
actually has — their own turns. While you are under, the day arrives with no AP and no legwork,
heat falls by `LAY_LOW.heatPerDay` on top of the ordinary decay because nobody can find you to add
to it, and the street rates you a little lower for being nowhere. Money on top: rent and wages do
not stop for you. It needs nobody, which is the whole point of it existing alongside the bribe.

**The hole in the wall.** A bust seizes 80% of dirty cash. An outfit absorbs that — people carry,
rackets keep paying, somebody else has a float. One person has one pocket and watched all of it go
with no way to have hedged. **`cache`** is that hedge, and it is a *solo* mitigation by
construction rather than by a flag: `cacheCap` falls by `CACHE.perCrew` for every body alive and
out of a cell, and is zero by the fourth. That is the honest version of why a lone operator can
hide money and an outfit cannot, and it keeps a bust's stakes intact for everybody else. A bust
still finds it `CACHE.bustChance` of the time — a hedge, not immunity. People in a cell do not
count toward the cap, so a bust *widens* the hole afterwards, which is exactly when it matters.

**A bust never takes the last body standing.** Each of your people is rolled independently, so two
busts back to back could and did leave a player with 8 of 8 jailed, dead or injured and nobody to
assign to anything — a player who had already crushed every criminal rival in the city. That is
not a hard night, it is a state with no exit, and the exit was blocked twice over: `spring_crew`,
the one op whose entire purpose is getting your people out of a cell, required an *idle crew
member*, which is precisely the resource its own failure mode removes. So both halves changed —
`spring_crew` is `minCrew: 0` (you go yourself; see §4.4 for what a solo op's `needs` have to look
like), and `bust()` leaves whoever is left on their feet. Held by `sim/crew-wipeout.test.ts`.

### 4.9 War work, armed work, and casing a place

`OpRequires` gained two conditions rather than a parallel gate: `stance` (somebody must be at
beef or war with you) and `weapon` (you must be carrying one). Both report through `opLocked`
like every other requirement, so the ops tree explains them the same way.

- **Ambush Their Soldiers**, **Dig In** (defend a racket a faction has marked — rackets carry a
  `threatened` day for it) and **War Strike** (a lieutenant, framed as an act of war) appear only
  at beef or war, and a war strike only at war.
- **Armed Robbery** and **Armed Message** are the ordinary jobs done with something in your hand:
  more payout, more heat, and locked unless a weapon is equipped.

**Case the joint** (2 AP, in person) reads a whole room at once: every patron and owner who is
not already known gets a `hint` — a feel, with no trait names and no numbers — and the business
is `casedUntil` a few days out, which is worth a real difficulty cut on the next op there. It is
deliberately coarser than a size-up: casing tells you a little about everybody, `read` tells you
everything about one person.

### 4.10 The wire: cards, taps, dirt, and a tech answer to heat

The whole lane is fiction wearing a realistic skin. There is no technique in `content/cyber.ts`,
`sim/cyber.ts` or the UI, no exploit of any kind, and the card brand — **Bellwether** — is
invented. A card is a tier, a limit and a freshness clock; a tap is a risk that compounds per
day; "running it" is a roll against two thresholds. That is the entire model, on purpose.

**Getting in.** **Mugging** (tier 0, solo) is the doorway: somebody's pockets, and a card in the
wallet about half the time. Everything else on the wire needs something to start from.

**Cards.** Three tiers (classic / gold / black), weighted so a black card is rare. Freshness
starts 70–100 and falls 9 a day, and value scales with it, so a card is a perishable good, not a
bank balance. Two ways to work one: a **quiet run** (18% of the limit, small chance of killing or
flagging it) or **one big score** (70%, and usually the last thing it ever does). A flagged card
run again is how a police file gets opened. The third option is **dumping the pile** through a
carding racket of your own at 28% of face — much less money, zero exposure, and the right answer
when heat is high or the pile has gone stale.

**Ratting** (`rat`, tier 1) is the first op with **modes** rather than only approaches: *one good
look* hands back a **secret**; *leave it running* plants a **tap**. A tap feeds a line most days
and compounds a discovery risk shaped like `holdRisk()` in `hostages.ts` — but the inputs are the
*person*, not the block: their own `tech`, and whether they are `connected` or `quiet`. That is a
deliberate line, tested in `sim/ratting.test.ts` including a source scan: a tap is not a stakeout,
and no block field may ever enter `tapRisk`. Being found out costs 45 trust and can open a file.

**Wire fraud** (tier 3) carries `requires: { rattedTarget: true }` — the only **per-target**
requirement in the game. Getting inside A's business unlocks wire fraud against A and nobody
else, not even A's family. `opLocked(w, kind, target?)` takes the target for this; with no target
in hand (browsing the tree) it asks only whether you have any mark at all, and the real check
happens at `plan_op` with the npc id. Do not flatten this into a `priorOps` edge.

**Pull Their Wires** (`digital_strike`) is the war lane without muscle, gated by the *same*
`requires.stance` as **Ambush Their Soldiers**. It disrupts the target's rackets 3–6 days and
pays little; it is not a strictly better ambush, and it leaves their soldiers standing.

**Dirt-brokering.** A secret sells once, to a faction that is not the subject's own and is not at
war with you. Price scales with the subject's rank (boss 2.5×, lieutenant 1.6×) and the buyer's
existing stance toward the subject's people (war 2×, beef 1.5×). The buyer gains 8 standing; ~30%
of the time the subject's people work out where it came from and you lose 12 with them plus a
grudge.

**Wire heat is tracked separately.** `player.cyberHeat` rises alongside ordinary heat with every
card run, rat and strike, and **Scrub Your Trail** is the only thing that clears it — 1 AP and
cash per point, with tech and brains buying more points and a lower price per point. It routes
through no official at all: a captain's bribe cannot touch it, and that is the tradeoff the lane
is built on.

**Crew on the wire.** A `{ kind: 'hack' }` assignment works the pile passively: no action, no AP.
They run the freshest cards first and keep 20% of the take. They will not bother below three live
cards, because a day of somebody's time is worth more than that.

**A related fix, in the same pass.** `opChance` never counted the player, so an op with
`minCrew: 0` and no crew on it had a skill sum of zero and floored at the 3% minimum — while the
ops tree advertised it as "solo ok". Every solo-capable op now counts the player as one of the
hands; ops that *require* crew are untouched, because their balance is the crew you bring.

**The whole lane is one person's work.** `family: 'wire'` now covers eight jobs — get inside them,
take their number, pirate feeds, pull their wires, build a person, run a book online, wire fraud,
wash it sideways — and every one of them has `minCrew: 0` and no `crewCount` gate. That is the
lane's promise on the badge and it was false for five of the eight: three carried a headcount gate
(`crewCount` reads `player.crewEver`, so you had to have *hired* somebody before you could sit down
at a keyboard alone) and their `needs` were on the crew scale. Pacing now comes from `priorOps`,
`safehouseTier` and the per-target flags, which is where it belongs. Both halves are pinned by
`ui/clarity.test.tsx` and `sim/solo-play.test.ts`, so a ninth wire job added without them fails.

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

### 4.11 Complications: a big job that stops and asks

A tier-2+ op can interrupt itself partway and put a question to the player, and it does that
through the **existing** confrontation machinery rather than anything new: a complication *is* a
`Confrontation` with `kind: 'op'`, raised by `queueConfrontation`, answered through
`resolve_confrontation`, priced by the same `kitSkillBoost`/`kitApproachBias`, shown by the same
modal, and swept up by the same "unanswered lands at End Day" line in the tick. There is no
second pending-action system and there must never be one — `sim/complications.test.ts` asserts
that `sim/complications.ts` never touches `w.confrontations` directly and that the only
pending-answer queue on the world is that one.

The three answers stay `fight` / `flee` / `backup` so the kit layer reads them unchanged; what
changes per complication is what those three words *mean* on this job (`COMPLICATIONS[k].options`)
and how well each does (`bias`). Handling it well swings the op's own roll by +18, fumbling it by
−16, and never answering by −30 — never answering is deliberately the worst of the three, which
is what earns the modal the right to block the rest of the day. The answer also moves heat: going
through people is louder (×1.35) than talking your way out (×0.85).

**The tier gate is load-bearing.** Tier 0 and 1 stay one fast roll. The chance starts at 34% at
tier 2 and climbs 7 points per tier (measured: 0% / 37% / 45% / 51% for stick-up, warehouse,
jeweller, bank). If a street job ever raises one, the difference between a stick-up and a bank
job has been thrown away.

A complication queued during End Day's op resolution waits until the player is next at the
controls, so you wake up to the crew asking a question — and the op resolves a day late, which
is correct rather than a bug.

### 4.12 Working on the law

Three ops (`buy_down`, `spring_crew`, `buy_case`) exist because an `Authority` previously only
escalated: `bribe_official` moves an official's trust and buries paper, and never touches
`Authority.attention`, which is the number the building decides its posture from. A crackdown was
weather you waited out.

All three are ordinary entries in `OP_DEFS` with a `requires` and a `tier`, and all three read
`authorityDifficulty()` — the target building's rung (0 at routine, 36 at crackdown), the
`effectivePolice()` of the ground it stands on, and its current attention. The two that cost
money scale that cost the same way: `buyDownCost` multiplies ×2.35 per rung, `buyCaseCost` ×2.1
per rung and by how far the file has already got. Buying down a routine precinct is a few
thousand; buying down a crackdown is more than eight times that. **The cheap time to do this is
before you need to**, and that is the whole design.

`select.opCost()` is the single source of that number — `can()` checks against it and the
reducer charges it — so the planner's quote and the bill can never drift apart.

One existing guard needed narrowing: `plan_op` refused any npc-targeted op against an official.
Violence against one is still refused; an op that declares `requires.officialTarget` is exempt,
because sitting down and paying for their attention is the entire point of it.

### 4.12b One type, three populations: the crash that keeps coming back

`FactionId` is `Id`, and three different things wear it: `PLAYER`, a real faction in `w.factions`,
and a **street crew** in `w.crews`. Nothing in the compiler distinguishes them, and the third is
the dangerous one — factions are marked `alive = false` and left where they are, but crews are
genuinely `delete`d when their block goes or they get folded in. So `w.factions[someFactionId]` is
`undefined` for an id every signature says is fine.

Three crashes, all the same shape: `buy_business` reading `.standing` off a crew id, `patronTip`
reading `.name` off a dead lieutenant, and `offer_sale:buy` reading `.standing` off a crew that had
been deleted a fortnight earlier — reproducible on seed 33 by day 60, because a street crew takes
protection on a business exactly like anybody else and the business keeps the reference.

Two lines of defence, and either alone is a half-fix:

1. **`releaseGround(w, id)`** — nothing may still point at an outfit that is gone. A faction's death
   already did this inline; a crew's did not. One function now, called from both, because the next
   outfit that can stop existing will otherwise be the third.
2. **`outfit(w, id)` / `bumpStanding(w, id, by)`** — a read that finds nothing answers instead of
   throwing. The first line will be missed again one day, and this is what stops that being a
   crash rather than a no-op.

Write `bumpStanding`, not `w.factions[x].standing[PLAYER] += n`. `sim/stale-faction-refs.test.ts`
covers both, including sixty days of seed 33.

### 4.13 The per-target gating family

`rattedTarget` is now the template for four more, all asking about *this mark* rather than about
the empire, all taking the op's own target, and all falling back to "does any valid mark exist at
all" when the tree is being browsed with nothing selected:

| key | asks |
|---|---|
| `rattedTarget` | you have been inside this person's business |
| `officialTarget` | the mark is an official who answers to an Authority |
| `jailedTarget` | the mark is one of your own, in a cell right now |
| `casedTarget` | you have cased *this place* recently (`Business.casedUntil`) |
| `caseTarget` | the job is aimed at a specific open file |

Anything that should unlock against a specific mark rather than globally belongs here. Do not
invent a sixth gating mechanism.

### 4.14 The admin panel and the soak bot

**The admin panel** is the `cheat` action: a list of entries, each of which sets one system up so
it can be exercised. It is behind a fold in the help sheet for a person, and driven
programmatically by the soak bot, so there is no test-only path through the sim — the bot reaches
the late game exactly the way somebody poking at the build would. Every entry stamps
`w.cheated`, so a boosted world can never be mistaken for an economy curve.

Entries beyond the original money/skills/crew set exist because some systems have prerequisites
that take many days to assemble honestly: `attention` (an Authority actually looking at you),
`jail_crew`, `open_case`, `cards`, `ratted`, `war`, `kit`, `rackets`. `amount` parameterises the
ones where a number makes sense.

**The bot** lives in `scripts/bot/` — `policy.ts` (what it does with a day), `admin.ts`
(scenarios), `coverage.ts` (what got exercised), `run.ts` (one run). `headless.ts` is only a CLI.

`solo` is the shape to copy when a pass needs coverage the honest run cannot give it. The honest
scenario's numbers are frozen, and it never builds a production line or runs a job — so it could
say nothing at all about whether a player with nobody can play. `solo` uses no admin panel either,
so its numbers are honest too; it just plays a different game. Its three counters — `jobs run
alone`, `lines built`, `street sales` — are the ones to read: if the first is near zero the solo
tree is a lie, and if the last two are zero a player with nobody has no way to make a living.

`Scenario.stillAt` is the knob that made this possible without touching the frozen run: the bot
would not build a production line below $5,000 clean, the honest bot never has that much, and
lowering the threshold globally would have rewritten the one curve that is comparable across
passes. A production-first scenario also gets its line and its street sale at the *top* of the
day — on day one there is exactly enough for a back room and a still, and the bot otherwise
settles somebody's shark debt with it and does not get a line up until day 49 of 60.

Scenarios:

| scenario | admin panel | ops/day | what it is for |
|---|---|---|---|
| `honest` | none | 0 | **frozen.** The economy curve, comparable across passes |
| `solo` | none | 2 | one person, `crewCap: 0`: the opening, on its own |
| `ambitious` | none | 2 | an honest player who takes risks |
| `boosted` / `law` / `wire` / `war` / `heists` | yes | 3 | one system, set up and hammered |
| `everything` | yes | 3 | the run that should reach every system |

`honest` is frozen deliberately: its day is ordered exactly as the original bot's was, because
moving a step changes the RNG stream and the curve with it for no gameplay reason. Coverage comes
from the other scenarios, never from changing this one.

Frozen against *tuning*, not against bug fixes. `workTheStreet` ended its day by walking to a
random person and visiting them, and on a failed visit it `continue`d — so once a walk between two
adjacent blocks costs no legwork the bot oscillated between the same pair until the loop guard ran
out, logging a walk each time and doing nothing. That is the eight identical "You walk from J8 to
K7" lines at the end of a long honest run. Fixing it moves the honest curve, and that is correct:
the numbers were being produced by a bot that spent the end of every day in a loop. When a fix
moves this curve, say so in the changelog with the before and after — the value of the run is that
it is comparable, and a silently moved baseline is worse than a moved one.

**What the honest run actually says about the game, which is a separate thing.** Ninety days of
honest play still touches 7 of 25 systems and finishes with one crew member and no cash. Most of
that is the scenario's own constraint — it plans no ops at all by design, so nine of the rows it
misses are downstream of that. What is *not* the scenario's constraint is that the outfit shrinks:
wages outrun three rackets' income and the player cannot get out of it without doing something the
honest bot is not allowed to do. That is a real fact about ordinary play and it is written down
here rather than tuned away, because the honest run is a measuring stick and you do not fix a
measurement by moving the stick.

**A boosted scenario gets a longer day.** `CORE` opens with `{ what: 'ap', amount: 14 }`, and
`cheat('ap', n)` raises `apMax` rather than only refilling. This is not flavour: every pass since
the standing rework added something the bot spends AP on, and against a fixed eight-AP day each one
quietly cost op coverage — the sixty-day sweep fell from 32 distinct op kinds to 27 across two
passes before this went in, and came back to 33 after. The honest scenario does not get it and must
never get it; its whole value is being comparable across passes.

**Coverage is the point.** Every run reports which of twenty-five systems it touched, how many
distinct op kinds ran, which complications fired, and what never ran at all. A `✗` means that
system had no coverage and any conclusion drawn about it from the soak is worthless.
`scripts/bot.test.ts` fails when `everything` stops reaching every system — so a future pass that
ships something the bot cannot see breaks the build rather than passing quietly, which is what
happened three passes running before this existed. Shipping a system means adding a row here in
the same pass, or it is untested by construction. And when the op-roster threshold in
`scripts/bot.test.ts` starts failing, lengthen the bot's day before lowering the bar — cutting it
hides exactly the thing it exists to show.

**Assignment order in `runTheEmpire` is load-bearing.** The bot hands idle crew out in a fixed
order, and that order decides what gets coverage at all. Foreman first, then racket runner, then
the wire: with rackets first, forty-odd unmanned rackets always won the draw and no foreman was
ever posted in a sixty-day run — the automation system shipped and the bot could not reach it.
The justification is also the real one for a player: a production nobody runs wastes ingredients
every day and drifts onto the wrong recipe, while one more racket runner is worth a few hundred.

### 4.15 Why rackets diversify, and why territory finally moves

Two problems that had been diagnosed and left alone for a long time.

**Nothing diversified.** Protection costs nothing to set up and works on any business in the
city, so once it worked there was no reason to pay for anything else — every other kind was
flavour nobody had a reason to touch. Two forces now make the choice real:

- **Saturation** (`content/territory.ts`). Per district, per kind, per owner. The first
  `SATURATION.free` (3) of a kind are untouched; each one past that is worth `0.8×` the one
  before, floored at 25%. Ordered oldest-first, so opening a fifth numbers route dilutes the
  *new* one rather than retroactively punishing the four already running. The grace exists
  because the first cut had none, and saturation then punished exactly the player who could not
  yet afford to diversify: the early game is cash-starved, every racket it can afford is
  protection, and decaying the second one made the escape *harder*.
- **Synergy.** One-directional pairs: fencing is fed by dealing, laundering by carding, dealing
  by smuggling, loansharking by a gambling den, no-show jobs by union dues. The bonus pays to the
  dependent kind while the feeder is running, unshut, in the same district.

So the profitable shape stops being "protection everywhere" and becomes "a few blocks you
actually own, running several things each". Both are visible in the UI — the business sheet
quotes what a kind would really pay *here*, with the flooding and the synergy named — because an
invisible mechanic is a bad mechanic.

**Territory never moved.** Influence accrued at a flat +1/day per racket wherever it sat, so
three rackets on one block did exactly what three rackets on three blocks did. City control sat
near the same low percentage from this project's first soak onward.

Measuring rather than assuming found the real cause, and it was not what the diagnosis assumed.
Accrual speed was never the constraint: a bot sixty days in had **every block it ran anything on
already at influence 100 — and there were three of them, out of forty-five.** What was missing
was any way for holding ground to *spread*. So:

- **Depth compounds accrual.** Influence is now gathered per block and applied once, so
  `accrualMult` can see the whole of what you run there: each operation past the first adds half
  again, to a cap of four.
- **Tenure settles it.** Consecutive days held (`Block.heldSince`) add up to half again more.
- **Spill is the actual lever.** A block you *control* with depth ≥ 2 bleeds influence into its
  neighbours, the way `spreadRep` bleeds reputation. An empire grows outward from strongholds
  instead of stopping at the doors it owns.
- **Rivals get pushed**, not merely out-added, so a contested block resolves instead of both
  sides adding forever.

Measured across six seeds, honest bot, 60 days: **city control 9.3% → 19.3%**, up on every seed.

### 4.15b Beating somebody, and the husk that used to be left behind

An outfit crushed to nothing used to simply stand there. The only death was **bleeding out**
(`soldiers <= 0 && cash < 0`), and rebuilding needs `cash > 6000` — so anything sitting between
those two with nobody on the street could neither die nor recover, and stayed nominally at war for
ever with nothing anywhere marking that the player had won.

`checkDefeated` closes it with the *street* condition plus the one thing that can undo it: no
soldiers, no blocks, no lieutenant still walking around, **and not enough left to put anybody back
out there** (`f.cash < SOLDIER_COST`). That last clause is not bookkeeping — an outfit with money
and nobody is between hires, not beaten, and finishing it would be wrong. It came out of writing
the test: the first version asserted that a healthy bank balance should not save an outfit, and the
sim disagreed, correctly.

What they were holding goes somewhere real rather than evaporating: businesses they collected from
on ground **you** control come to you as influence, everything else simply opens up — a collapse is
an opportunity for whoever gets there, not an automatic gift — and their residual influence on
ground you were already contesting transfers at half. `defeatedBy` credits it to the player when
they were the ones at war, which is worth respect and fear on the street; an outfit that merely fell
apart is not credited to anybody. `defeatedDay` is set once and never cleared, so the resolution
and its log line fire exactly once. `sim/faction-defeat.test.ts`.

### 4.15c The web, as something you can look at

By late game the social layer is the deepest thing in the game — dozens of people met, assets
inside two outfits, a real nemesis, and the connections graph (§3.6) under all of it deciding how
word travels. It was only ever a list, and a list is the one shape that cannot show the thing that
matters most: that your informant inside the Delgados is somebody's cousin, and that cousin is the
lieutenant who keeps turning up.

`relationshipWeb(w)` is a fourth mode on the Social tab, and it **adds no data** — every field is
read off `Npc`, `n.connections`, `n.asset`, `n.nemesis`. Four rings: you, then yours (crew and
assets), then theirs (nemeses and the outfit people you have actually met — an unmet lieutenant is
not drawn, because the map is your web and not the city's roster), then the connective tissue:
anybody you have met tied to two or more of the above, which is the whole reason it is a picture.

Layout lives in `/sim`, not in the component, for the ordinary reason — a position that depends on
who is in the world is a derived value like any other — and it is deterministic, from a stable sort
on id rather than a roll or iteration order, so the same save draws the same web every time. That
is what makes it a map rather than a lava lamp, and it is what lets most of `ui/relationship-map.test.tsx`
test the picture without rendering anything.

### 4.16 Two rules the event deck and the ops tree had wrong

Both reported from real play, both the same shape of mistake — a gate asking the wrong question.

**An event about a system may only surface when that system is in play for this player.** The
deck already did this for money (`whale` needs a bookmaking racket, `debtor` needs a float) but
not for the police: `cops_sniffing` weighted purely on owning *any* racket, so a player's first
protection job on day one could summon a plainclothes cop who had supposedly been watching it for
two nights. It now needs `POLICE_NOTICE` heat, an Authority off `routine`, or an open file — and
a racket at least `RACKET_WATCHABLE_AFTER` days old, because nobody watched a racket that opened
this morning for two nights. `content/events.ts` holds those thresholds so the rule is a constant
rather than a habit.

**`claim_abandoned` asked about your history instead of the ground.** It required
`priorOps: ['scout_block']` — having scouted *anywhere*. But plenty of derelict blocks are
visibly derelict from generation, and walking onto one reveals it, so a player who had found a
ruin with their own eyes could not take it until they had scouted a different district entirely.
It uses `derelictTarget: true` now — the per-target family — and walking onto or through a
derelict block marks it found.

### 4.17 Every glyph has to render

Unicode 6.0 (2010) is the bar for any emoji in the game, enforced by
`sim/emoji-support.test.ts` walking the real source. Post-6.0 glyphs fall back to tofu on older
Android and Windows font packs, and a tofu box in a 28px icon slot beside text reads exactly like
a broken listing — which is how it was reported, three times, before the cause was spotted: Booze
showed a placeholder in the stash, and the Back-Room Market and several items were "fucked up on
phone and desktop". Booze was the only product whose icon came from Unicode 9.0. An audit found
24 across the codebase, the newest from Unicode 14.0 (2021).

### 4.17b The look: a tactical HUD, and an icon set that is ours

The emoji rule above solved the tofu but never solved the *look*: an emoji is drawn by the
platform, so one row of the app was Apple's art, another was Google's, and none of it was the
game's. Everything a player sees is now drawn here.

**The icon set.** ~180 glyphs on a 24×24 grid, stroked in `currentColor` at 1.5 with mitred joins
and square caps — angular, because it is an instrument panel. `ui/icons/paths.ts` holds the
chrome, content and verb sets; `ui/icons/paths-ops.ts` holds the 63 jobs. Four rules keep it a set
rather than a pile:

- families share a mark — a crowbar across every heist, a chevron on every armed job, a signal arc
  on everything that happens down a wire — so the tree reads as families before it is read at all;
- no text inside a glyph, because a drawn "$" is a smudge at 18px;
- nothing thinner than about 2 grid units, for the same reason;
- one drawing per id, resolved by id: `<Icon of="business" id={biz.type} />`. A new business type
  gets an icon by being named the same thing in both places, and `ui/icons.test.tsx` fails if any
  row of any content table resolves to the fallback.

The emoji in `/content` are untouched. They are data — a log line, a share card, the emoji-support
test — and nothing on screen depends on the device having them any more.

**The chrome.** Amber (`#f5c542`) on near-black navy (`#070a10`): at night on a phone a blue-black
reads as a screen you are looking *at*, where a neutral black reads as a screen that is off. Hard
corners everywhere (`--radius: 2px`); the only round things left are the ones that have to be round
to be read as controls. Panels carry four corner brackets, drawn as background gradients rather
than extra elements so no component had to grow a wrapper div, plus a one-pixel scanline far enough
under the text to read as material. The screens that are mostly instrument — the ops planner, the
racket list, the faction cards, the ledger — get `.brief`: the same panel with a titled header bar
across the top, which is the mission-document treatment.

**Typography.** A monospace, uppercased and tracked out, for every header, section title, chip,
stat label and number; the system sans stays for body copy, because tracked-out mono is unreadable
at paragraph length and this game has paragraphs.

**The top HUD** is three bands rather than two crowded rows, in the order you read them under
pressure: identity (day, place, and any flag that changes what the day means), then the readout
strip — the four numbers the whole game is played against, each in its own cell so they stop
jostling when one grows a digit — then today's budget: AP as pips, legwork, and the two reputation
numbers.

**The map** draws control as a *zone*, not a stain. Fill opacity is low and flat, the boundary does
the work, and a block somebody holds gets a second hairline set in from the first — two rules a few
pixels apart is what makes an edge read as a controlled zone rather than as a coloured shape.
Markers are the same icon set, through `iconMarkup()`, because MapLibre builds them from HTML and
they were the one place the old look would have survived.

**Two things share the field name `icon`, and they are different contracts.** On a content table
(a business type, a racket kind, an op) it is an emoji: data, used by a log line or a share card,
never drawn. On an *option* — an answer to a confrontation, an approach to a job, a move in a
conversation — it is the *name* of a drawing, because there is no id to resolve from. The second
kind has to be a real name or `<Icon>` falls back and every option on the screen draws the same
glyph; `ui/icons.test.tsx` asserts every option table resolves.

**Amber is the label layer, not an accent.** Section titles, `kv` keys, meter and HUD labels and
the icons inside rows are amber; prose is grey; trouble is red; money is green. Drawn the other way
round — structure in grey, amber saved for highlights — it reads as a grey app with a yellow button
on it, which is what the first cut of this pass did.

`ui/visual.test.tsx` holds the line: no emoji on any screen *or in anything the sim logs*, every
`data-icon` a real drawing, the HUD's three bands, briefing heads where they belong, map markers
drawn rather than printed, and skeleton snapshots (class structure with the text stripped) so a
screen that quietly loses its treatment fails rather than ships.

**Looking at it is part of the job.** `scripts/shot/walk.tsx` lets the soak bot play, then renders
every screen off that save for screenshots — an empty screen looks fine, and most of what was wrong
with the first cut only appeared with a played world in it. Its header lists the four ways the
headless harness lies (window clamped to 500px, `100dvh`/`env()` unresolved, fixed-position sheets
sizing to the window, screenshots landing mid-animation); check those before believing a bug it
shows you.

### 4.17c Markers: when they appear, and what their colour means

Two decisions about the map itself, both made because it was reading as a grey field with numbers
on it.

**When icons appear.** Below `MARKER_BLOCK_PX` of on-screen block width the businesses on a block
collapse to a count badge. That number was 96 — a block filling most of a phone's width — which
meant the icon set, the whole reason the map is worth looking at, only appeared once you were
practically standing on the street. It is 64 now: a little over half a zoom level further out,
still more than twice the 26–28px chip, so a marker cannot spill onto a neighbouring block and the
ring of them on a busy block does not overlap itself. `ui/map-markers.test.tsx` holds the
*relationship* rather than the literal number, so tuning it stays allowed and shrinking it until
the map is soup does not.

**What the colour means.** Every business marker is tinted by its **tier** — slate for street,
teal for established, terracotta for institutional, purple for chartered. This is the one thing
about a place the map could not otherwise tell you: the block fill already says who holds the
ground, but nothing said which of the forty shops on it was a bar and which was a merchant bank.

The two hues the map has already spent are off-limits to the ramp, and the test enforces it:
**gold is always "yours"** and **blue is always the law**, so a tier can never be misread as a
claim about ownership or about the police. For the same reason `.yours` and `.sel` override the
tier hue — whose it is beats what it is.

The legend gained a second key to match (**Ground** and **Places**), with the tier swatches drawn
as outlines rather than fills, because a business marker is a hairline chip with a coloured drawing
in it and a solid swatch would promise the wrong shape next to the solid territory swatches above.

### 4.17d A number in a log line is the number that happened

For most of this game's life the log printed the figure a caller *asked for*, and several systems
sit between that and the player's bar. The worst of them is `addHeat`, which is the only door heat
comes through and applies five multipliers on the way — working alone, bought legitimacy, the hour,
home turf, a school on the corner. A 16-heat job on a quiet night announced **"+16 heat"** and moved
the bar by 9. Every clamped stat had the same hole at its ceiling: "+25 loyalty" at 96 is +4,
"−15 heat" at 5 is −5.

**The rule.** Every mutator that can move a number by less than it was asked for **returns what
actually landed**, and a log line prints that return value — never its own argument.

| Mutator | Returns |
| --- | --- |
| `addHeat(w, n, blockId?)` | the applied delta, after multipliers and the 0–100 clamp |
| `loseHeat(w, n)` | the applied delta, negative |
| `gainFear` / `gainRespect` | the applied delta on the player's own standing |
| `bumpLoyalty(npc, n)` | the applied delta on one crew member |

`statNote(applied, label)` builds the parenthetical — `" (+9 heat)"` — and returns an **empty
string** when nothing moved, because "(+0 loyalty)" is noise and a figure the bar did not move is
worse. `heatNote`, `fearNote`, `respectNote` and `loyaltyNote` are the named forms.

**One copy of the arithmetic.** The multiplier stack came out of `addHeat` into `heatMult(w,
blockId)`, a pure function. `addHeat` applies it and `select.opHeat` predicts with it, so the
planner and the log cannot drift apart — which is how the planner ended up promising 16 next to
"Difficulty 60" while the resolver put on 9. `opHeat` deliberately leaves out only the clean-job
discount (a margin over 30 pays 0.6), because nobody knows before the night whether it went that
well; it is the honest upper end of an ordinary result.

**Where the numbers live afterwards.** `OpResult.heat` is overwritten with the applied figure
before the result is stored, so the card on the ops tab, the log line, and anything reading the
result later all say one number.

**The guard.** `sim/honest-numbers.test.ts` greps every non-test source file for a hardcoded
`(+N heat)`-shaped literal and fails on it. That is the part that matters: the mutators were easy
to fix once, and the failure mode is somebody adding a new line next year with a figure typed into
it. Two things are deliberately *not* printed as figures — a `spreadRep` fear number (capped per
person by what the act cost and by how well they know you, so there is no one number anybody got)
and an `adjustRel` trust number, for the same reason. Those lines say what happened instead.

### 4.18 Production: recipes, foremen and standing orders

**Recipes are things you make, not a quality slider.** Five per production kind (20 total), each
naming an actual style — barrel-aged rye, sea of green, micro-batch, cotton stock. Three axes, not
two: the existing quality/output tradeoff, plus **heat and risk**, so a slow quiet method is a real
choice when the police are already looking at you and a fast dangerous one is a real choice when
they are not.

A measured consequence worth knowing: **volume beats premium on raw revenue**, because output
multipliers reach 1.6× while `qualityMult` spans only 0.7–1.2. That is not a bug. Premium methods
win on the two axes the game actually models — heat, and *capacity*. `bestRecipeFor` blends value
per day with value per unit by how full the safehouse is (`qualityMult(q) × output^(1−fullness)`):
with room to spare, more units is more money; with the shelves full, every unit you make displaces
one you already have, so it had better be worth more. Without that term the careful recipes were
dead weight at every moment of the game.

**You are one of the hands here too.** `runnerFactor` gives an unmanned line 0.5 — an absentee's
half rate — and that was also what the player got while standing in their own back room. It made
the one opening a broke day-one player can actually afford (a back room, $600, and a still,
$1,200, out of $2,500) pay like a line nobody was running: 6 units a day at quality 22, unsellable
rubbish. The player now personally works **one** line, the unmanned one their own skill does the
most good on (`playerWorked`, ties broken on id so the ledger's estimate and the end-of-day tick
can never disagree about which room you were standing in). `PLAYER_HANDS` puts them at
`0.55 + skill/12` against a runner's `0.6 + skill/10` and quality `30 + skill×4` against
`35 + skill×5`: a tech player's first still goes from 6/day at q22 to 14.6/day at q62, and a
muscle player's to 8.6 at q38.

Two limits carry the design, and both are the point rather than a rough edge. **Below a dedicated
runner**, because somebody who does nothing else does it better and you are also running a city —
that gap is what makes hiring worth the wage. And **one line**, because you are one person: the
*second* still is what sends you out to meet somebody, which is the whole arc. Put a worker on
yours and you are freed up for the next one.

**A foreman** (`{ kind: 'foreman', productionId }`) is the production assignment with its head up:
it keeps the production on the best recipe currently known, buys ingredients when the tin runs dry,
and moves output to a safehouse with room. It counts as the worker too.

**Standing orders** generalise the same-block restock that shipped with the dealing fix. Every
product racket carries a `supply` rule — `block` (a safehouse on its own block, the default and
the old behaviour), `empire` (anywhere you own, at a little heat for the driving), or `manual`
(nothing arrives unless you carry it). Bounded per day, so it is people driving rather than
teleportation.

### 4.19 The empire ledger

Every business, racket and production in one table, at the top of the Empire tab. Each used to
live on its own card on its own tab showing whatever that tab happened to know — the racket card
knew its income, the block sheet knew saturation, the inventory knew whether a production had a
foreman — and nothing put them side by side. A player with twenty holdings could not answer "which
of these is being crowded out" or "which of these is running itself" without opening twenty sheets.

`select.holdings` is assembly, not simulation: saturation and synergy from `territory.ts`, the
foreman and the standing order from `automation.ts`, income from `economy.ts`, and nothing
recomputed a second way. Each row carries what it earns a day, whether your own kind are crowding
it out of its district, whether something next door is feeding it, who or what is running it, and
anything wrong right now — a disrupted racket, a production out of ingredients, a product racket
with a standing order pointing at stock that does not exist.

`sortHoldings` lives in the sim rather than the component, so the order a player sees is a thing a
test can assert; every sort falls back to income and then id, making it total and stable. Sorting
by crowding puts the most squeezed first, because that is the one to move; "Needs a look" hides
everything that is quietly working.

### 4.20 The inventory: identity, quantity, value and flow together

The rule, taken from City of Gangsters' warehouse view rather than its layout: **a quantity never
appears without the thing it counts, at any level of zoom.** Every number on the stash screen sits
beside the product it counts, what that product currently fetches on the street, and where it can
go next. Empty locations are collapsed behind a count rather than listed as dead lines. The move
controls are generated from what is actually present — somebody holding two units is offered "move
both", not a form with 5/10/25 presets that cannot be satisfied. Automation state is stated inline,
naming the foreman and what the production is making, so a self-running empire is legible rather
than invisible.

Identity comes from `styleOf`, which *reports* rather than stores: the stash stays a bare count by
design, and the named style is read off whichever production of yours is making that product.

### 4.21 The bank and the depot

Both ship `income: [0,0]`, `valueMult: 0`, `rackets: []` — pure heist targets, inert on every other
day. Nobody extorts a bank teller for protection money, so the fix is not a racket bolted onto
them: it is the wire. Getting inside an employee (the existing `Npc.ratted` per-target unlock, not
a new mechanism) opens one of two things:

- **A skim**, out of a bank: small, daily, dirty, growing with your tech, with a discovery risk
  that compounds and a 40-day life. Deliberately under a tenth of one wire fraud over ten days —
  it is the standing version of that job, not a replacement for it.
- **A route**, out of an armoured depot: pays nothing at all by itself, and takes 22 difficulty
  and a fifth of the heat off the next `heist_armored` against that depot. 25-day life, because a
  rota is perishable.

Both surface as event cards in the opportunity category as well as through a deliberate rat.

**And the three institutions the tier pass added use the same door.** `IntelKind` is five now, and
which kind a person carries is data: `INTEL[kind].from` names the business type, `intelSourceFor`
looks it up, and adding an institution is a row in a table rather than a branch.

- **A consignment window**, out of a gallery: hot goods a day rather than cash, scaling with
  charm, with a compounding discovery risk. Things arrive, hang for a season, and one of them
  each time is yours.
- **Accounts somewhere else**, out of an accountant's office: far more laundering capacity than
  anything you can build (2,600 + 180/brains a day at 0.72, against a racket's 0.85 and a fixer's
  ceiling of 0.70) — and every pound of it is written down. `intel.paper` grows with days and with
  volume, and past `OFFSHORE.filesAt` it opens a real `fraud` case file on you and closes the
  arrangement. The rate is not the trade; the receipt is.
- **A trade lane**, out of an import firm: the depot route's shape pointed at a list of jobs
  rather than one. `TRADE.helps` is content, so which ops a lane is worth something on is a data
  question and not a condition buried in `opChance`.

### 4.22 The crime pass: what each tier is actually for

The tier system decided *where* crime can happen; this is the content that fills it, and the split
is the tier rule rather than a theme.

**Tier 1 and 2 get racket kinds.** Parts stripping and relay export on a scrapyard or a tow yard,
card supply on a phone shop, script diversion on a pharmacy, knockoffs on a boutique. Every one has
a setup cost, an income, heat, a risk and an entry in `SYNERGIES` — a racket outside the
saturation/synergy tables is a number that does not argue with the district, which is the one thing
territory is for. The synergy pairs are reasons, not bonuses: the yard wants a supply arriving
overnight, the export wants somewhere to break what it cannot ship, the card supply is useless
without a wash, and the scripts want a corner already moving product.

**Tier 3 gets none, ever** — see §4.21. An institution pays out through somebody inside it.

**A fifth production line.** `cut_house` makes `streetwear`, with four recipes on the same three
axes as the others (quality, output, and how loud the method is), and `knockoffs` is a stash-scale
racket that draws on it. It is the same pipeline as the still and the corner: something is made
upstairs, standing orders carry it, the rail at the front sells it.

**Twenty-two jobs**, from doorstep runs at tier 0 to buying a ward at tier 4, every one of them
gated by the existing `OpRequires` family and resolved by a `case` in `resolveOp` — an op kind with
no case resolves to no money and an empty line, which is a silent no-op the tests now fail on.

Three of them are not payouts at all:

- **Fund a friend** buys a person. No money comes back; the councillor's trust goes up through
  `adjustRel` like everybody else's, so every existing read of `officialTrust` — buying down a
  case, jail time, the paperwork route into a derelict block — picks it up with no new wiring.
- **Buy the ward** buys ground: influence on every block of a district at once, which is what a
  chair at the Commission is counted in. That is the Commission tie, and it is the existing
  `seatReason` block count rather than a new eligibility rule.
- **Wash it sideways** turns dirty into clean in one job (9,000 + 900/tech at 0.78), deliberately
  between a fixer's best rate and a laundering racket's. It is what you reach for sitting on a pile
  with no front; it never makes a front pointless.

**The bust-out is the only job in the game that spends something you cannot buy back.** Everything
the name will carry is ordered, sold and never paid for, and `shutBusiness` then takes the place
off its block, off your books, out of everybody's habits and down to zero income and zero value.
The record stays in `w.businesses` because log lines, ledgers and case files point at it by id;
every read that enumerates the city filters on `shut`. It pays the most on the board because the
asset goes with it.

**One income in the game does not run out of a building.** Supplying the wing pays a daily trickle
while somebody of yours is inside, and ends by itself the day they walk out.

### 4.23 Staking a street crew

The third thing you can do with a corner, alongside putting them on the payroll and folding them
into your outfit. You pay for a shop on their block; the racket is **theirs** (`Racket.owner` is
the crew id — the same ownership-by-relationship the game already had), they run it, and 45% comes
back. No AP after the day you set it up, no runner, nobody of yours standing in it.

The trade is that the books are theirs, and everything that can go wrong is somebody else's
decision — the same shape as a lieutenant's skim, for the same reason:

- they **skim** (9% of days, 15–40% of your share), and past `FUNDED.noticeAt` somebody tells you;
- they **outgrow you**: at strength 8, a crew that does not actually like you simply keeps it;
- they get **swallowed** by a neighbouring faction, and the racket goes with them.

Coming over to you, or losing the corner to you, hands it back — you did pay for it. All four
outcomes run through `dissolveCrew`, which is where ownership is settled in one place.

### 4.24 What a fortune is for

For four passes the late game had nothing to spend on. Rackets pay, laundering washes, and then
the number goes up for ever. Five sinks fix that, and the rule they all share is that each one
buys something **permanent and already in the game** rather than a new currency:

**Tier 4 — chartered.** A fourth rung on the ladder that already had three (`content/businesses.ts`):
casino, merchant bank, shipping line, development company. Real clean income, `valueMult` 65–80,
and `TIER_EXCLUDES[4]` leaves only laundering — the point is not the racket you run inside one,
it is that owning one is what the money is for. Entry is gated **arithmetically**, the same shape
tier 2 and 3 already used: `standingOf(respect, fear) = respect + fear / 2` against the tier's
`standingFloor` (55). Adding a tier 5 would need no new branch in `sim/tiers.ts`, which is the
test of whether a gate is really arithmetic or a hardcoded check wearing a formula's clothes.

**Buying a favour.** Cash to a Commission boss or a city official, and they owe you one. It plugs
into `personalPull()` and `owedToThem` — the machinery the whole standing layer already runs on —
so a bought favour is indistinguishable from an earned one at the point of use, and *more*
expensive each time (`escalator` 3.2). You cannot buy your way in cold: `minTrust` 15 means
somebody has to know you first, and a grudge cannot be bought off at any price.

**Lifestyle.** Three ladders of three rungs — home, car, security — each a real purchase with
permanent `respect`/`fear`. It is not a vanity screen: `securityCover` and the home rung feed
`personalCover`, which is subtracted on the specific night somebody comes for you (4.25). It also
changes how NPCs open with you, through `standingShow`.

**Legitimacy.** Philanthropy and public image, bought in visible chunks, decaying `0.9`/day so it
is a standing cost rather than a purchase. It buys a **real mechanical discount on heat** —
`legitimacyHeatMult` multiplies inside `addHeat`, down to `heatAtCap` 0.55 — and that is in
deliberate tension with the rest of the game: the money that buys it is the money you made doing
things that generate heat. The `heatFloor` (0.4 of the raw figure, applied *last*) is what stops
this and `LONE_WOLF.heat` together removing the police.

**Ceilings.** Late money buys permanent increases to caps that already exist — crew capacity and
safehouse count — rather than adding new caps. Escalating price, hard maximum, and the extra beds
fold into the arithmetic `assign` already enforced (`bedsTotal`).

### 4.25 Stakes: what you can actually lose

**They come for you.** Once a nemesis passes the `named` or `connected` milestone they stop
waiting for you to come to them. `comeForThePlayer` queues an ordinary confrontation of kind
`'you'`, resolved through the machinery every other doorstep uses, and a loss runs `landOnPlayer`:
`rng.int(0,100) + severity*30 - personalCover(w)`. Under 45 you are walking and everybody saw;
45–78 puts you in a room for days and takes 30% of your dirty money; over 78 is a killing.

This is where the lifestyle ladder stops being a respect vending machine. `personalCover` is men
who are awake, people who would get in the way, and a house with a gate — and it is subtracted
**on that night**, not displayed on a screen.

> A note for whoever changes `actAgainstPlayer` next: the personal move must stay at the **front**
> of that chain. Written as its last arm it was dead code for anybody with a crew, because the
> racket/business/crew arms between them cover every roll a player with an outfit can produce.

**Somebody to protect.** One person outside all of it, generated with the world and connected into
the neighbourhood web like anybody else. They are not a game piece: they hold no racket, take no
assignment and have no stat line you spend. What they are is the softer target — `PERSONAL_ODDS.lovedShare`
sends a hunter at them first when there is one — and the thing `GO_STRAIGHT` requires you to have.

**Succession — and the decision behind it.** *Control genuinely passes.* Same save, same world, new
protagonist. This was decided before a line of it was written, because it falls out of a first
implementation otherwise and then nobody knows whether it was chosen. `succeed()` turns the old
player into an ordinary dead NPC of the world (so old log lines and ledgers still resolve), and
the best heir by `heirs()` takes over: their skills replace yours, respect and fear are inherited
at `SUCCESSION.inherits` (0.45), the street name and the legitimacy are **lost** — those were
yours, not the outfit's — and the estate, the blocks and the rackets are all still there. With
nobody fit to take over, the game ends (`gameOver.reason = 'gone'`), because an outfit with
nobody left to run it is simply over.

**Getting out.** Four conditions at once for a fortnight: $750,000 clean sitting there, nothing
dirty on the books, heat under 15, and 45 of bought legitimacy — plus somebody to go straight
*for*. `tickGoStraight` resets the clock the moment any one of them lapses, which makes it a
fortnight of discipline rather than a lucky morning, and it ends in a real epilogue rather than a
stat moving.

### 4.26 A world that does not wait

**Factions acting on their own.** Standing between two outfits used to drift at random and never
*conclude*. Three things make it move, all written with the stance/standing machinery that was
already there rather than a second diplomacy layer: a **grievance** (the stronger side decides the
weaker is standing on something of theirs) pushes standing hard so wars start for a reason; a
**sit-down** ends one, so peace is something that happens rather than something that decays; and a
war with a clear winner **absorbs** the loser — ground, soldiers, earners and people change hands
— so the map consolidates over a long game. An outfit is only worth swallowing if it holds ground
or has living lieutenants; one man on one corner is beaten, not absorbed.

**The upstart.** One rival operation that starts genuinely small (one soldier, $2,200, day 12) and
grows on its own money: it takes blocks, buys soldiers, and promotes a lieutenant at strength 4.
It is meant to feel like a **race** rather than a siege — you are not defending against it, you
are watching somebody else do what you did, faster than is comfortable. Growth is deliberately
slow (`growth` 0.02, a `wageDays` 12 reserve, only positive cash compounds): the first version
reached eleven soldiers by day 22 and then starved.

**Time of day.** One number, `w.hour`, turning "when" into a decision that buys and costs
*different* things rather than being a flat bonus. Night is quiet work and empty tills (+9 chance,
×0.8 payout, ×0.7 heat) against a patrol with nothing else to look at (×1.25 police). Afternoon is
the opposite and the more interesting half: worse odds, bigger take, because that is when the
money is in the building. An op takes the hour it was **created** with, so the clock at planning
is the clock that counts.

### 4.27 Content: specialists, landmarks, headlines, encounters, the record

**Heist specialists.** One-off people hired for one job and one night — a safecracker, a wheelman,
a face — recruited through the recruit/trust/leverage machinery that already existed rather than a
parallel hiring system. Each has a price (discounted by trust, cut hard by `leverageOver`) and a
**reliability** under 1: a cheap specialist is cheap because they might not turn up. Your own crew
are not for hire; they already work for you.

**Landmarks.** Five named one-off places — The Grand, the County Courthouse, the Port Authority,
Union Station, the Old Observatory — each carrying a job that exists **only** there, gated through
the `landmarkTarget` member of the per-target gating family (4.13). They are made by **converting**
an existing generated business, consuming **zero RNG**, because adding one shifted every downstream
draw and broke five unrelated test files.

**The news ticker.** Headlines built entirely off `w.log` — no new tracking, no parallel record. If
a system stops logging something its headline stops appearing, which is correct rather than a bug
to route around. It is the *city's* view: late, slightly wrong, and about what got out.

**Street encounters.** Rare texture on the way somewhere (13% a move). Deliberately **not** a
second event deck: `sim/events.ts` asks you to decide something, these resolve themselves as you
pass, and the most any of them does is move a number you already have or leave a name in your
pocket. If one ever needs a modal it belongs in the event deck instead.

**The record.** A trophy screen aggregated entirely from data already tracked — the log, the
ledgers, the ops, the factions, the player's own counters. **No new state**, which is what makes
it worth having rather than a scoreboard: it can only report what the game actually recorded at
the time, so it reads like a file somebody kept on you. Empty rows are kept rather than hidden —
"First body — never" is part of a record, and arguably the most interesting line on the page.

## 5.5 The law, the map, and the edge of the map

### 5.5.1 Authority — not a faction

`Authority` is its own type and deliberately not a `Faction`. A Faction carries soldiers, cash,
tribute owed, a standing toward every other faction and the alliance → peace → tension → beef →
war ladder. Police have none of that, and forcing them into it would make "declare war on the
cops" a legal move: you could ally with them, be paid tribute by them, broker peace between them
and the Vitales. So the law gets a lighter type — anchored to a block, with officials, an
`attention` number and a posture — and there is no conversion between the two ladders in either
direction (`sim/authority.test.ts` asserts that, both ways).

**Anchoring.** One per police landmark from OSM (`populate.ts` already tags those blocks), plus a
`city_hall` at the same downtown block the officials live on. A city whose real map has no police
station at all gets one precinct on its busiest block, so the law is never only clerks.

**The monitoring radius.** A station used to write `police += 25` into its block and `+= 10` into
each neighbour, once, at generation, and then stop existing — an invisible number with nothing
behind it. That bump is now projected live by the entity: `reach: 25, falloff: 0.4` over a
`POSTURES[posture].radius` hop BFS on the same `neighborIds` graph movement walks. At the
`routine` rung that comes out as exactly +25 / +10, so a fresh world starts where the old one
did; unlike the old number it grows when the precinct starts paying attention, it vanishes if the
entity does, and the map can draw it. **Every risk roll reads `effectivePolice(w, blockId)`**, not
`b.police` — racket incidents, production interruptions, where a faction expands, hostage risk,
the street line on a block sheet. Generation-time placement (derelicts, back rooms) still reads
the raw baseline, because it runs before the buildings are all in place.

**The ladder.** `routine → watching → investigating → task_force → crackdown`, on `attention`,
which chases `pressureOn()` at +6/−3 a day so escalation builds and decays rather than flipping.
Pressure is `street × streetWeight + wire × wireWeight + openCases × caseWeight`, where *street*
is `heat − cyberHeat` and *wire* is `cyberHeat`. The two kinds weight them opposite ways: a
precinct is boots on the ground (street 1.0, wire 0.45), city hall reads reports and the wire is
all report (street 0.55, wire 1.2). That is the reason `cyberHeat` is a separate tracked share
rather than just more heat — the same 60 heat escalates a different building depending on how you
earned it. An official of yours inside the building takes up to 45% off what it notices, never
100%. Posture multiplies the nightly raid chance (1.0 → 2.2), so the rung costs something.

### 5.5.2 Map layer modes

Toggleable overlays — heat, wealth, police (baseline + the live monitoring field), one outfit's
influence, one product's demand — over fields the sim already keeps. **Visualisation only:** an
overlay reads, never writes, and no overlay may motivate a new per-block stat. If a wanted
overlay has no field behind it, that is a simulation change and belongs in `/sim` first.
`ui/map-layers.test.tsx` pins both halves: the readings, and that switching layers leaves the
world object byte-identical.

### 5.5.3 Fog over unmapped ground

Cloud covers every chunk in view that is not populated — ground whose streets were never
downloaded and ground that was downloaded but never visited look the same, because to the player
there is no difference. Cached-but-unvisited streets draw faintly underneath it.

**Clearing is tied to movement, not to the camera.** `sim/fog.ts` decides: a chunk opens when a
*presence* is within `REVEAL_M` (500 m, about a block and a half) of its bounds. A presence is
the player, or a crew member posted somewhere — guarding a block, running a racket, working a
production, lieutenant over a district. Idle, jailed and dead crew are worth nothing. The rule is
pure; the UI does the fetching, because `/sim` does no network work.

**This is a real behaviour change.** Tapping empty map space used to call `populateAndOpen` and
fill a district with people on the spot; it now refuses and explains. Panning warms the geometry
cache and nothing more. The single place a chunk becomes a real place is `revealNear()`, called
after a move, a posting and each End Day — `ui/fog-delivery.test.ts` asserts that it is the only
one, because the obvious future regression is somebody restoring instant-populate as a
quality-of-life fix.

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

**And the man, not only the outfit.** `factionLean` is still most of the vote, but on the three
proposals that are *about the player* — a chair, a sanction on them, a claim in their favour —
`personalPull` reads the boss himself: favours he owes and favours owed to him, a grudge, a hold
over him, whether he is quietly an asset, and what beating the player made of him. All of it is
data §3.7–§3.9 already keep about everybody; nothing new is recorded for this. A pull only flips a
vote once it clears `PERSONAL.flip`, and favours are capped at two, so a boss is moved rather than
bought, and the ones who cross the floor are the ones the player can point at a reason for.
Proposals about the table's own business — the peace, the pot, a claim between members — are
untouched: none of that is personal.

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
