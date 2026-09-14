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
connections, then brains. Beating them takes it back. It also feeds `successionWeight`, which is
on the existing `f.crisis` scale and in `candidatesFor` — a lieutenant who has been beating you in
public is exactly who the soldiers would follow, and the shortlist used to be whoever happened to
be first in the array.

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
using one is what keeps it.

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

Scenarios:

| scenario | admin panel | ops/day | what it is for |
|---|---|---|---|
| `honest` | none | 0 | **frozen.** The economy curve, comparable across passes |
| `ambitious` | none | 2 | an honest player who takes risks |
| `boosted` / `law` / `wire` / `war` / `heists` | yes | 3 | one system, set up and hammered |
| `everything` | yes | 3 | the run that should reach every system |

`honest` is frozen deliberately: its day is ordered exactly as the original bot's was, because
moving a step changes the RNG stream and the curve with it for no gameplay reason. Coverage comes
from the other scenarios, never from changing this one.

**A boosted scenario gets a longer day.** `CORE` opens with `{ what: 'ap', amount: 14 }`, and
`cheat('ap', n)` raises `apMax` rather than only refilling. This is not flavour: every pass since
the standing rework added something the bot spends AP on, and against a fixed eight-AP day each one
quietly cost op coverage — the sixty-day sweep fell from 32 distinct op kinds to 27 across two
passes before this went in, and came back to 33 after. The honest scenario does not get it and must
never get it; its whole value is being comparable across passes.

**Coverage is the point.** Every run reports which of nineteen systems it touched, how many
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
