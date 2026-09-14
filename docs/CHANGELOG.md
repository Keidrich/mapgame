# Changelog

What changed, why, and how — for whoever works here next, session or person, starting
with no memory of the one before. Newest first.

House rules for an entry (see `CLAUDE.md` → *Leave a trail*):

- **What** in one or two sentences. **Why** — the problem it solves, not the feature name.
  **How** — the mechanism, the numbers, the tradeoff you chose and what you chose against.
- **Files** so the next session can find it without archaeology.
- **Watch out** for anything that bites: a `WORLD_VERSION` bump, a balance shift, a test
  that had to change, something deliberately left out of scope.
- Add your entry *before* you push. An entry written later is an entry not written.

---

## 2026-09-14 — The tactical HUD: a custom icon set, and chrome to match

**What.** The visual pass. Every emoji in the game is gone from every screen, replaced by a
hand-drawn line-icon set of our own; the chrome is amber on near-black navy with hard corners,
corner-bracketed panels and mono/uppercase labelling; the top HUD has a real hierarchy; the map
draws control as a zone rather than a stain. No mechanics changed — `npm run sim -- 60` comes back
byte-identical to the run before the pass, which is the check that says so.

**Why.** The look was the platform's, not the game's. An emoji is drawn by whoever made the phone,
so one row was Apple's art, the next was Google's, Crew and Factions were the same glyph, and an
older Android drew a tofu box. The tier and crime passes had also pushed a lot more state into a
HUD that had been cramped since the first time it was looked at live.

**How.**

*The icons.* ~180 glyphs on a 24×24 grid, stroked in `currentColor` at 1.5 with mitred joins and
square caps. Families share a mark — a crowbar across every heist, a chevron on the armed jobs, a
signal arc on everything down a wire — so the 63-node op tree reads as families before it is read
at all. Resolution is by id (`<Icon of="business" id={biz.type} />`), so a new content row gets an
icon by being named the same thing in both places, and `ui/icons.test.tsx` fails if any id in any
content table falls through to the fallback. The emoji stay in `/content` as data; nothing on
screen depends on the device having them.

*The chrome.* `--radius` 14px → 2px. Panels get four corner brackets drawn as background gradients
(no wrapper divs) and a one-pixel scanline. `.brief` is the mission-document treatment — a panel
with a titled header bar — and it is on the ops planner, the racket list, the faction cards and the
ledger. Chips, section titles, stat labels and every number moved to a monospace, tracked out; body
copy stayed in the system sans, because tracked-out mono is unreadable at paragraph length.

*The HUD.* Three bands instead of two crowded rows: identity (day, place, and the flags that change
what the day means), the readout strip (clean / dirty / heat / rep, each in its own cell so they
stop jostling when one grows a digit), and today's budget (AP pips, legwork).

*The map.* Fill opacity roughly halved, boundary width up, and a second hairline set in from the
first on any block somebody holds — two rules a few pixels apart is what makes an edge read as a
controlled zone instead of a coloured shape. Markers are the same icon set through `iconMarkup()`,
because MapLibre builds them from HTML and they would otherwise have been the one place the old
look survived.

**What the screenshots caught, which the tests could not.** The set was rendered to a contact sheet
and looked at: `bookmaking` and `script_diversion` were the same drawing, so were `counterfeit_run`
and `print_shop`, `campaign_wash` and `vote_buying` were near-identical, `task_force` was
`protection` with a different shield, and `garage` was the safehouse with a different door. Ten
glyphs were redrawn. Then the screens themselves: the holdings rows were drawing an envelope for
every racket (the row's `kind` is `'racket'`, not the racket's kind — `Holding` now carries a
`typeId`), the auto-state icon name was rendering as the literal text "warn", and uppercasing every
chip turned a sentence-carrying chip into shouting and pushed it off the card.

**Files.** New: `ui/icons/{paths,paths-ops,index}.tsx`, `ui/icons.test.tsx`, `ui/visual.test.tsx`,
`scripts/shot/render.tsx`. Touched: `ui/styles.css` (token layer rewritten, ~200 lines of tactical
chrome appended), `ui/components/*` (every emoji site), `ui/derive.ts`, `sim/select.ts` (one
read-only field: `Holding.typeId`).

**Fixed straight after shipping, from a screenshot on a real phone.** The map markers printed
their own SVG source as text across the whole map: `paintMarker` sets an icon with `innerHTML` and
anything else with `textContent`, and the marker code had been a bare `textContent` since the day
every marker was an emoji. Nothing in the suite renders MapLibre, so the check is on the one
function that makes the decision — including that a plain label still goes in escaped. The "mapping
new streets" chip also moved down 48px: it is centred at the top and the legend is top-left and up
to 60% wide, so on a phone they sat on top of each other.

**Watch out.**

- **`Act`, `Disclosure` and `SceneAct` take an icon *name* now, not a glyph.** `icon="👥"` became
  `icon="crew"`. A name that does not exist falls back rather than rendering nothing, so a typo is
  invisible at runtime — `ui/visual.test.tsx` is what catches it.
- **`bizIcon()` returns a name, not an emoji**, and `Holding.icon` is still the emoji while
  `Holding.typeId` is what the UI draws from.
- **Two inventory assertions changed shape.** They asserted a particular codepoint reached the
  screen, which was the right test when the bug was a tofu box and is the wrong test now that the
  glyph is ours; they assert the drawing instead. The emoji-support test in `/sim` is untouched and
  still guards the content tables.
- **The screenshot harness lies about the bottom nav.** It collapses to a ~20px band with no icons
  in headless Chrome here, because `100dvh` and `env(safe-area-inset-bottom)` do not resolve in
  that context — the *previous* stylesheet collapses identically, which is how it was ruled out.
  Do not fix the tab bar from one of those screenshots; check it in a browser.
- Nothing in `/sim` changed behaviour: the honest 60-day soak is identical to the run before this
  pass, down to the last dollar.

---

## 2026-09-14 — The crime pass: four rackets, a cut house, five institutions, twenty-two jobs and somebody else's corner

**What.** The content the tier system was built to hold. Four racket kinds for the tier 1–2
benches, a fifth production line (counterfeit streetwear) and the rail that sells it, three more
`IntelKind`s so the tier-3 institutions pay out through people rather than through rackets,
twenty-two new ops across all four tiers, and a third thing you can do with a street crew: front
them a racket and take a cut.

**Why.** After the tier pass a scrapyard, a phone shop, a pharmacy and a boutique existed and had
nothing to do; the gallery, the accountant and the importer were closed by `TIER_EXCLUDES[3]` with
no door opened in their place; and the op roster had not grown since the wire. The tiers were a
frame with nothing in it.

**How.**

*Rackets (tier 1–2).* `parts_stripping`, `relay_export`, `card_supply`, `script_diversion`, each
with setup cost, income, heat, risk **and an entry in `SYNERGIES`** — a racket outside the
saturation/synergy tables is a number that never argues with the district. The pairs are reasons
rather than bonuses (the yard wants cars arriving overnight; the card supply is useless without a
wash).

*Production.* `cut_house` → `streetwear`, four recipes on the existing quality/output/noise axes,
and `knockoffs`, a stash-scale racket on a boutique. Same pipeline as the still and the corner.

*Institutions (tier 3).* `IntelKind` is five. Which kind somebody carries is now **data** —
`INTEL[k].from` names a business type and `intelSourceFor` looks it up, where it used to be two
hand-written branches. A consignment window (gallery) pays in hot goods; an offshore arrangement
(accountant) washes 2,600 + 180/brains a day at 0.72 — far more than you can build — and
accumulates `intel.paper` until it opens a real `fraud` case file on you and closes itself; a trade
lane (importer) is the depot route's shape pointed at a list of ops via `TRADE.helps`.

*Ops.* Twenty-two, gated through the existing `OpRequires` family. Three buy something instead of
paying: **Fund a Friend** buys a councillor (trust through `adjustRel`, so every existing
`officialTrust` read picks it up with no new wiring), **Buy the Ward** buys influence across a whole
district — which is what `seatReason` counts for a chair, and the whole of the Commission tie —
and **Wash It Sideways** converts dirty to clean at 0.78, deliberately between a fixer's ceiling
and a laundering racket's.

**The bust-out is the one job that spends something you cannot buy back.** `shutBusiness` sets
`Business.shut`, zeroes income and value, closes its rackets, and takes it off its block, off your
books and out of everybody's favourites. The row stays in `w.businesses` because log lines, ledgers
and case files point at it by id; every enumeration filters on `shut`. It pays the most on the
board because the asset goes with it.

*Staked crews.* Front a crew's setup cost and the racket is **theirs** — `Racket.owner` is the crew
id, the ownership-by-relationship the game already had — and 45% comes back daily with no AP, no
runner and nobody of yours standing in it. The price is that the books are theirs: they skim 9% of
days, a crew at strength 8 that does not like you simply keeps it, and a faction that swallows them
takes it. Coming over to you or losing the corner to you hands it back. All four outcomes settle in
`dissolveCrew`.

**Everything stays abstract about method.** Blurbs say who pays who, what it costs and who finds
out. `sim/crime-ops.test.ts` fails on an instruction-shaped blurb, on digits that look like data, and
asserts straw purchasing is consumer stock only — in the content as well as in the comment.

**What the bot turned up, which was the real find of the pass.** Coverage fell to 20 of 63 op
kinds, and the cause was not the new content: `runTheEmpire` assigned every last idle body to an
unmanned racket, so `idleCrew` was empty for ever and the bot **had never once been able to plan an
op with a `minCrew`** — on some seeds every job it ran all month was one that needs nobody. Four
fixes: a crew reserve (`Ctx.reserve`, four people held back when a scenario plans ops; zero for
`honest`, whose day is unchanged); crew in the `everything` top-up to replace the ones the law
scenario keeps jailing; `reveal` now *creates* derelict ground where a generated city has none
(plenty have none, so `claim_abandoned` and the two derelict jobs were unreachable for ever); and
untried ops are now ranked by **how few people they tie up** before how big they are — preferring
the biggest untried job meant a five-hander took the whole outfit and every other untried kind that
day needed somebody who was already out.

The numbers: 20 → 22–29 distinct kinds across six seeds in sixteen days (against 16–20 of 41 before
the roster grew), and the sixty-day all-scenario sweep went **33 → 47 distinct op kinds**, which is
the recovery the last changelog asked for and then some. Two new coverage rows (street crews,
staked crews) and the table is 22/22.

**Three real bugs it found on the way.**

- **The bot was checking a price the game stopped charging.** `affordable` in the racket-choice
  policy read `RACKET_DEFS[kind].setupCost` — the *base* cost — which has not been what anything
  costs since the tier pass made setting up inside an established place dearer. It kept picking a
  kind it could not pay for and installing nothing. Reading `select.setupCost(biz, kind)` instead
  took a sixty-day honest run on seed 7 from 4 rackets and 13.3% of the map to 8 and 20.0%, and
  seed 9 from 7 and 17.8% to 18 and 22.2%.

- **Buying a business a street crew was collecting from threw.** `buy_business` read
  `b.protection.factionId` as a faction, and `tickCrews` gives a strong crew a place to collect
  from. Latent since crews shipped; it surfaced the moment the new `crews` cheat put one near the
  bot. Now a crew loses the corner and the mood instead.
- **Seed 5 generates no street crews at all**, so the canonical soak could never have covered the
  layer. New `crews` admin cheat (`makeCrew` split out of `spawnCrews`), and two new coverage rows.

**Files.** `content/rackets.ts` (4 racket defs, `cut_house`, 4 recipes, 22 `OP_DEFS`, `FUNDED`,
`CRYPTO_WASH`, `PRISON_WING`, `WARD`), `content/intel.ts`, `content/territory.ts`,
`content/businesses.ts`, `content/lines.ts`, `content/glossary.ts`, `sim/types.ts`
(`Business.shut`, `Player.wing`, `StreetCrew.funded`, 22 `OpKind`s, 5 `RacketKind`s),
`sim/ops.ts`, `sim/crews.ts`, `sim/intel.ts`, `sim/tick.ts`, `sim/reducer.ts` (`shutBusiness`,
`crews` cheat, `reveal`), `sim/scenes.ts`, `sim/select.ts`, `ui/components/BlockSheet.tsx`,
`ui/components/HelpSheet.tsx`, `scripts/bot/{policy,run,admin,coverage}.ts`, and five new test
files: `sim/new-rackets`, `sim/streetwear-production`, `sim/tier3-intel`, `sim/crime-ops`,
`sim/funded-crews`.

**Watch out.**

- **No `WORLD_VERSION` bump.** Every new field is optional (`Business.shut`, `Player.wing`,
  `StreetCrew.funded`, `Npc.intel.paper`), so old saves load with nothing shut, nobody inside and
  nobody staked.
- **Still never run in a sixty-day sweep (16 of 63):** most of the heist tree, and four of this
  pass's own — `copper_strip` and `squatter_scheme` want a derelict block that is *known and
  unclaimed*, and the bot claims every one it finds with `claim_abandoned`, so the two compete for
  the same target; `boiler_room` and `corporate_extortion` want three people free at once. Worth a
  look next pass, not worth more dial-turning this one.
- **The op-roster bar moved from 40% to 33%** in `scripts/bot.test.ts`, and that is the one place
  in this repo where cutting it is honest: absolute reach went **up** by six kinds in the same pass
  that cut the percentage, because the denominator grew 54% in one go. The comment says so at
  length, and says it should not happen twice. Lengthening the run no longer buys anything —
  thirty days measures the same 22–27 as sixteen.
- **A staked crew's racket does not appear in your empire ledger**, because it is not yours. It
  shows on the block sheet's crew card instead. Deliberate, and worth revisiting if the ledger ever
  grows a "money you do not run" section.
- **The only answer to a skimming crew is `warn` or taking the corner.** There is no confrontation
  scene about the books. Deliberately out of scope; the log tells you and the two existing answers
  work.
- **`prison_supply` pays while somebody is inside**, which is the only income in the game not tied
  to a building (`Player.wing`). It ends by itself when they walk out.
- **The honest curve moved, and here is the audit**, because a change this size in the content
  tables shifts every seeded stream downstream of it. Generation is provably untouched — the same
  126 businesses, 405 NPCs, same base incomes and the same mean protection income of 60.2 on seed
  7 in both trees — and so is the racket ranking on any given place. What differs is the bot's
  path from day one: half of ten seeds came out byte-identical, and the rest diverged at the first
  scene of day 1 and compounded. On the empire measures the new tree is equal or better on every
  seed measured (rackets and share of the map above); end-of-run *cash* is lower on some because
  the money is in rackets instead of in a pocket. The honest scenario's shape is untouched: it
  still plans no ops, holds nobody back (`reserve` is 0 for it), and uses no admin panel.
- Carried over and still out of scope: recruiting the city's only fixer deletes all laundering
  capacity, because `recruit` sets `role = 'crew'` and `fixersKnown` filters on `role === 'fixer'`.

---

## 2026-09-14 — Business tiers, eight new types, and a tooltip audit that found five unreachable entries

**What.** Every business type now carries a tier, and the tier decides what it can host, what
setting up inside it costs, and whether fear is a way in at all. Eight new types slotted across the
three. Plus the clarity work: the wire ops read as one lane, an institution's sheet points at the
owner instead of dead-ending, and the whole tooltip set got a real audit.

**Why.** Foundation for the crime pass. Everything in the city was equally leanable — a raised
voice worked on an accountant's office the same way it worked on a diner — and the only exceptions
were two hand-written `rackets: []` entries on the bank and the armoured depot.

**How.**

*Tiers.* Three, and the middle one is the interesting one because it is **arithmetic rather than a
rule**. Nothing refuses an established owner's shakedown by name: `PROTECT_NERVE` is 0.6, so a
nerve floor of 72 wants fear + respect of 43, which is above `STAKES.words.ceiling` (35) always and
above `STAKES.backed.ceiling` (50) unless respect is doing work. Talk stops being enough because of
where the number sits — and a `property` act (ceiling 80) opens the very same `protectRoute`, as
does a settled favour. The rules did not change, the ground did.

Tier 3 is `rackets: []` generalised: `TIER_EXCLUDES[3] = 'all'` covers the six institutions added
since without a third name in the check, and `extortReason` refuses outright while naming the door
that *is* open. `racketsAllowed` is an **intersection** with the type's own list, never a
replacement, and `select.availableRackets` reads the same function `can` does — so the block sheet
can never offer a racket the reducer then refuses.

*The eight.* Scrapyard, phone shop and tow yard at tier 1; boutique and pharmacy at tier 2;
gallery, accountant's office and import/export at tier 3, beside the banks. Name pools, district
mixes and rarity all wired; no crime-specific racket kinds, which is next prompt's job.

*Clarity.* `OpFamily` groups the three wire ops, which sit together in their tier with a heading
and a badge — the names alone never read as one lane. Tier-3 sheets get a card that names the owner
and changes its wording once the player actually has a hold, so the hint stops being advice and
becomes a prompt.

**Three real bugs the work turned up.**

- **`availableRackets` used the raw type list**, so once the tier gate went into `can`, the block
  sheet would have offered rackets the reducer refused. Now both read `racketsAllowed`.
- **A maxed nemesis was worth 8 points toward the chair against skills worth 20**, so a record
  against the player never actually moved the succession shortlist — the arc shipped last pass was
  decorative at the top end. `NEMESIS.successionWeight` 0.08 → 0.18. The test that asserts a
  nemesis becomes a candidate is what caught it.
- **Five glossary entries were unreachable from any screen**: `nemesis`, `presence`, `mapLayer`,
  `owed`, `lawJob` — all written, all accurate, none linked. Wired to the NPC sheet, the "you are
  not there" card, the layer bar, the faction row and the law-op price card. `ui/clarity.test.tsx`
  now fails on an orphan, so the audit is a standing rule rather than a one-off sweep.

Four tooltips also said things the tier pass made false — `bizIncome` claimed protection is a cut
of any business's income, `muscle` implied strongarm work opens anything, `ap` and `presence` had
not heard of the actions added over the last three passes. All rewritten.

**Numbers.** `npm run sim -- 60 <seed> honest` at day 61, and this one needs reading carefully:

| seed | before (cash / dirty / rackets) | after |
|---|---|---|
| 3 | 7,265 / 1,178 / 5 | 11,632 / 1,096 / **9** |
| 7 | 14,562 / 2,238 / 10 | 20 / 17,945 / **4** |
| 11 | −2,437 / 40,226 / 7 | 0 / 3,027 / **9** |
| 19 | −813 / 15,972 / 8 | 11 / 1,251 / **9** |

Rackets and control are up on three seeds of four and cash is down on three — **the bot is
reinvesting rather than earning less**, and seeds 11 and 19 in particular converted stuck dirty
piles into holdings. Seed 7 is a genuine loss: it went 10 rackets to 4, because that world's soft
targets were disproportionately types that are now tier 2 or 3. That is the pass working as
specified — a third of the city is no longer free protection income — but it is a real cost and
worth watching if the crime pass leans on early protection income.

`npm run sim -- 60 7 all` still reports **19/19 systems**, but distinct op kinds fell **33 → 27**
and ops-never-run went 8 → 14. That is downstream of the same thing: fewer extortable places means
fewer rackets, and several ops gate on `requires.racketKinds`. It is not the AP squeeze the last
two passes hit — the sixteen-day bot test still clears its 40% bar untouched — so the fix is not a
longer day. The crime pass adds racket kinds to the eight new types, which should put the target
pool back; **if it does not, this is the number to chase.**

**Watch out.**

- **The bot had to be taught the rule, and the diagnosis is worth keeping.** Before the policy fix
  it picked institutions as its "softest" targets, failed all three moves, and walked there anyway:
  honest income on seed 7 fell to **$63**. It now filters on `extortReason` and escalates to
  `wreck` / `threaten:crew` when the owner's nerve is above what talk can reach.
- **No `WORLD_VERSION` bump.** `tier` lives on the definition, not the save.
- **Seven existing tests picked "a business" at random** and assumed it was leanable. They pick
  tier 1 explicitly now — `softBiz` and `hostFor` in `sim/test-util.ts` are the shared way to do
  that. Two of them found real fragility while being fixed: one asserted a racket's income on the
  *last* day (zero for the several days a disrupted racket reads zero, however well the pipeline
  works) and one compared laundering capacity across *different* businesses, whose base incomes now
  differ enough to swamp the effect being measured.
- **`jeweller` moved to tier 3** and lost `protection` and `fencing`, per the spec. It is still
  buyable and still a heist target.
- **Income and value are not multiplied at generation.** `TIERS[n].income` documents the shape and
  the defs are written to it, with a test asserting the bands actually climb. Stapling a multiplier
  on already-tuned ranges would have re-balanced the whole economy silently; the real mechanical
  scaling is setup cost and the nerve floor. Called out because it is a deliberate reading of
  "scale up by tier", not an omission.

**Files.** New: `sim/tiers.ts`, `sim/business-tiers.test.ts`, `sim/new-business-types.test.ts`,
`ui/clarity.test.tsx`. Changed: `content/businesses.ts`, `content/names.ts`, `content/rackets.ts`
(`OpFamily`), `content/nemesis.ts`, `content/glossary.ts`, `sim/types.ts`, `sim/reducer.ts`,
`sim/select.ts`, `sim/populate.ts`, `sim/test-util.ts`, `ui/components/OpTree.tsx`,
`ui/components/BusinessSheet.tsx`, `ui/components/{Walk,MapLayers,FactionsTab,NpcSheet,OpsTab}.tsx`,
`ui/styles.css`, `scripts/bot/policy.ts`, `docs/DESIGN.md` §3.6b.

---

## 2026-09-14 — Nobody tells you their own mugging as neighbourhood gossip

**What.** Block memory now knows who each story is about, and the person it happened to stops
narrating it. Their family and friends carry on — and now say whose tie it is.

**Why.** Reported from play. `openingLine` took the block's latest memory and had whoever the
player was standing in front of repeat it, with no check on the subject. Since memories name
people, that meant the man who was mugged reporting his own mugging as street talk — *"Everybody is
still talking about it: Somebody put Dolores Fuentes against a wall and went through their
pockets,"* said by Dolores Fuentes — and the shopkeeper whose windows had just gone in telling you
somebody had smashed up his shop. Thirteen of the sim's memory writes name somebody.

**How.** `BlockMemory` gains an optional `about: { npcId?, businessId? }`, set at every call site
that names a person or a place. `gossipLine` then picks the newest memory that is *not* about the
person in front of you, and the two halves of the fix are deliberately different:

- **Nobody repeats a story about themselves as neighbourhood talk.** If it is about them
  personally they say nothing; if it is about their own business they tell it as theirs — *"They
  are still sweeping up: The cops raided Keane's Builders"* — because an owner talking about his
  own raid is not the bug, talking about it as though he heard it from somebody else is.
- **Their family and friends absolutely still do**, and it reads that way now: *"They will not let
  it go — that is their cousin: Somebody put Dolores Fuentes against a wall…"*. Word arriving along
  a real tie says which tie, because that is the reason it reached this person at all.

The block also moves on rather than going quiet: somebody skips past a story about themselves to an
older one, and only stays silent when there is nothing else to talk about.

**Numbers.** `npm run sim -- 60 <seed> honest` is **bit-identical on all four seeds** — this is
flavour text chosen at read time and touches no RNG and no state.

**Watch out.**

- **No `WORLD_VERSION` bump.** `about` is optional, and a memory without one is told by everybody
  exactly as before, so an old save's existing memories keep working and only new ones are tagged.
- `sim/gossip-subject.test.ts` ends with a structural guard: any memory whose text contains an NPC's
  name must carry `about.npcId`. A future `addMemory` that names somebody and forgets the subject
  fails there rather than showing up in play again.
- The same class of bug does not exist in `tickGossip`, which has always done `circle.delete(n.id)`,
  or in `spreadRep`, where the subject being a witness is correct — they were there.

**Files.** New: `sim/gossip-subject.test.ts`. Changed: `sim/scenes.ts` (`gossipLine`),
`sim/types.ts`, `sim/people.ts` (`addMemory`), and the call sites in `sim/ops.ts`, `sim/reducer.ts`,
`sim/agendas.ts`, `sim/defect.ts`, `sim/hostages.ts`, `sim/lieutenants.ts`, `sim/politics.ts`,
`sim/tick.ts`, `docs/DESIGN.md` §3.6.

---

## 2026-09-14 — The empire ledger, and the man in the chair

**What.** A holdings dashboard: every business, racket and production in one sortable table, with
what each earns, whether your own kind are crowding it out, whether something next door is feeding
it, and whether anything is actually running it. Plus one targeted change to Commission voting — a
boss's own history with the player can now pull his vote off his outfit's line.

**Why.** Each kind of holding lived on its own card on its own tab, showing whatever that tab
happened to know: the racket card knew its income, the block sheet knew saturation, the inventory
knew whether a production had a foreman. Nothing anywhere put the three side by side, so a player
with twenty holdings could not answer "which of these is being crowded out" or "which of these is
running itself" without opening twenty sheets. The saturation and synergy systems in particular
shipped a pass ago and were effectively invisible unless you went looking block by block.

And the Commission voted a spreadsheet. Five men sit at that table and the only thing that had ever
mattered was their outfits' balance sheets — while the game keeps a detailed record of what has
passed between the player and each of those men personally, and never once read it.

**How.**

*The ledger* is `select.holdings` plus `ui/components/Holdings.tsx`, and it is **assembly, not
simulation**: saturation and synergy from `territory.ts`, foreman and standing order from
`automation.ts`, income from `economy.ts`, nothing recomputed a second way. Rows carry their flags
too — a disrupted racket, a production out of ingredients, and the one that was genuinely hidden
before: a product racket whose standing order points at stock that does not exist, which earns
nothing and said so nowhere.

`sortHoldings` lives in the sim rather than the component, so the order a player sees is a thing a
test asserts rather than an emergent property of a render. Every sort falls back to income and then
id, making it total and stable — two holdings with the same name never swap places between renders.
Sorting by crowding puts the most squeezed first, because that is the one to move.

*The vote.* `vote()` splits into `factionLean` — the original function, unchanged — and
`personalPull`, which reads the boss himself: favours he owes and favours owed to him, a grudge, a
hold over him, whether he is quietly an asset, and what beating the player made of him. All of it
is data the standing, ledger and nemesis passes already keep; nothing new is recorded for this.

Three guards keep it a refinement rather than a rework. It applies only to the three proposals that
are *about the player* — a chair, a sanction on them, a claim in their favour — and the table's own
business votes exactly as it always did. A pull only flips a vote once it clears `PERSONAL.flip`.
And favours cap at two, so a boss is moved rather than bought.

**Numbers.** `npm run sim -- 60 <seed> honest` is **bit-identical on all four seeds** — the ledger
is read-only UI and the vote change only touches proposals about the player, which the honest
scenario never reaches. `npm run sim -- 60 7 all` is unchanged at 19/19 systems.

**Watch out.**

- **No `WORLD_VERSION` bump and no new state at all.** Both pieces read what is already there.
- **A test bug worth remembering.** `commission-vote.test.ts` reads the tally off the ruling line,
  and the first version anchored the regex to end-of-string. A ruling that *passes* appends what it
  did after the score, so the anchored match silently returned 0–0 for exactly the rulings worth
  checking, and the test failed claiming nobody had voted for the player. It returns `[-1, -1]` on
  no match now, so a future miss fails loudly instead of looking like a real result.
- **`§4.19`/`§4.20` in DESIGN renumbered.** The inventory section moved to 4.20 and the bank/depot
  section to 4.21 to make room; there were briefly two 4.20s.
- The Empire tab now leads with the ledger and keeps the existing per-kind lists below it. They
  overlap deliberately: the table is for deciding what to look at, the cards are for acting on it.

**Files.** New: `ui/components/Holdings.tsx`, `ui/empire-ledger.test.tsx`,
`sim/commission-vote.test.ts`. Changed: `sim/select.ts` (holdings, sortHoldings, holdingsTotals),
`sim/commission.ts` (`PERSONAL`, `personalPull`, `factionLean`/`vote` split),
`ui/components/EmpireTab.tsx`, `content/glossary.ts`, `docs/DESIGN.md` §4.19 and §6.

---

## 2026-09-14 — Nemesis, informants, and the introduction the connections graph was built for

**What.** Two pieces, both almost entirely assembled from things that already shipped. A faction
lieutenant who keeps meeting the player is changed by it, can be asked to walk out on their own
people, and can end up running the outfit. And two standing relationships that are not favours: an
informant or a pair of hands, and an introduction.

**Why.** Lieutenants were furniture — a name on a sit-down, a name in a succession crisis, and not
even that in an attack, which arrived from an anonymous "they". You could beat the same person six
times and the seventh was identical to the first. Meanwhile `flipLieutenant` had handled losing one
of *yours* since the lieutenant pass and had no opposite: there was no way to take somebody off a
faction short of killing them. And the connections graph shipped with "phase 2: leverage plays on
top of the graph" written in the design doc and deferred, because nothing existed underneath to
hang them on. Standing and the ledger are that thing.

**How.**

*Nemesis.* `Npc.nemesis` holds one number — **notoriety** — scaled by `STAKES` exactly as fear is,
because somebody who put your crew in hospital is made by it and somebody who talked over you at a
sit-down is not. The history is `remember()`, the same logger a shopkeeper gets; the dossier screen
reads it without knowing nemeses exist. `leaderFor` names who came and weights it toward whoever
already has history with the player, which is the whole of what makes a recurring antagonist rather
than a fresh name every week. `MILESTONES` pay out in order, once each, one legible change apiece:
a trait, then muscle, then **a name** (`nemesisName` replaces the given one everywhere), then
connections, then brains. Beating them takes it back.

*The chair.* `successionWeight` is on the existing `f.crisis` scale, and `candidatesFor` replaces
"whoever happened to be first in the array" as the shortlist. A lieutenant who has been beating you
in public is exactly who the soldiers would follow.

*Defection* (`sim/defect.ts`) is the mirror of `flipLieutenant` and explicitly **not** a loyalty
number you grind down: it goes through `concessionReason`, the same gate as protection, so the route
in is settling **their own** agenda through `resolve_agenda` → `doFavour`. A loyal one still refuses
whatever you did for them. It costs 45 standing, two soldiers, a bed and two AP.

*Scheming.* An `ambition` agenda on a lieutenant now sometimes names a peer instead of the chair —
preferring one they are actually connected to, read off the graph — and resolves inside the faction
on the sim's own clock.

*Informants and assets.* The distinction that carries them: **a favour is spent, an asset is
standing.** Turning somebody costs what any other major concession costs and then keeps paying —
passive (`Confrontation.warned`, worth `ASSET.warnedBonus` on the answer, because you are in the
doorway rather than looking up from the till) and active (`assetBonus` into `opChance`, reading the
target the same way every other modifier does). They go cold after `ASSET.goesCold` days of silence.

*Referrals* are the one thing in the game that shortcuts the familiarity floor. The target's
`metDay` is dated back and `contacts` topped up, so every existing familiarity check reads it
without knowing referrals exist. It does not make a stranger trust you; it makes you not a stranger.

**Numbers.** `npm run sim -- 60 <seed> honest`, cash / dirty at day 61:

| seed | before | after |
|---|---|---|
| 3 | 8,534 / 1,349 | 7,265 / 1,178 |
| 7 | 13,083 / 3,543 | 14,562 / 2,238 |
| 11 | −208 / 35,679 | −2,437 / 40,226 |
| 19 | −1,573 / 15,599 | −813 / 15,972 |

Within the band, no systematic shift: the honest scenario has no war and few lieutenants in reach,
so most of this pass is invisible to it. `npm run sim -- 60 7 all` reports **19/19 systems** (up
from 16), and **33 distinct op kinds**, up from 32 — see the AP note below.
New coverage rows: `a nemesis`, `informants and assets`, `introductions`.

**Watch out.**

- **No `WORLD_VERSION` bump.** `Npc.nemesis`, `Npc.asset`, `Confrontation.byNpcId` and
  `Confrontation.warned` are all optional.
- **The real find of this pass was in the soak, not the feature.** Every pass since the standing
  rework has added something the bot spends AP on — conversations, agendas, assets, introductions —
  and against a fixed eight-AP day each one quietly cost op coverage. The sixty-day sweep had fallen
  from **32 distinct op kinds to 27** across two passes, and I lowered the `scripts/bot.test.ts`
  threshold from 40% to 32% to accommodate it, which was treating the symptom. The fix is a longer
  day for the boosted scenarios only — `{ what: 'ap', amount: 14 }` in `admin.ts` CORE, via a
  `cheat('ap', n)` that now raises `apMax` rather than only refilling. The sweep came back to **33
  op kinds**, better than before the squeeze started, and the threshold is back at 40% with a note
  saying to lengthen the day rather than cut the bar next time. **The honest scenario does not get
  the longer day and must never get it** — its entire value is being comparable across passes.
- **The bot's social work is also on a rota** — a conversation every third day, standing
  arrangements every other — because each still spends AP an op would have used.
- **`workTheRoom` does one of each category, not one thing in total.** Returning after the first
  success turned the list into a priority order whose bottom never ran: introductions had zero
  coverage in a full sweep because a defection or an asset always came first.
- **A new `nemesis` admin-panel entry**, because a sixteen-day `everything` run cannot make one
  honestly — the bot mostly wins, and winning takes notoriety back. What it fabricates is the
  *history*; the milestones, traits and name all come out of the same `scoreMeeting` path a war run
  reaches on its own, so the coverage is of real code.
- **`OpTarget` gained `factionId`**, which the ops tab was already passing and `opChance` was
  silently dropping. The number shown and the number rolled now agree for faction-targeted ops.

**Files.** New: `content/nemesis.ts`, `content/informants.ts`, `sim/nemesis.ts`,
`sim/informants.ts`, `sim/defect.ts`, `sim/nemesis.test.ts`, `sim/informants.test.ts`. Changed:
`sim/types.ts`, `sim/actions.ts`, `sim/reducer.ts`, `sim/combat.ts`, `sim/factions.ts`,
`sim/politics.ts`, `sim/people.ts`, `sim/select.ts`, `sim/ops.ts`, `sim/tick.ts`,
`ui/components/NpcSheet.tsx`, `content/glossary.ts`, `scripts/bot/*`, `docs/DESIGN.md` §3.9.

---

## 2026-09-14 — Conversation depth, agenda resolution, and one history screen for everybody

**What.** Three pieces on top of the standing system: a real action for every kind of agenda an
NPC can carry, conversations with more than one move in them, and a single personal-history screen
that serves an ordinary shopkeeper and a crew lieutenant from the same component.

**Why.** Standing shipped the gates and left them with one sparse input. Concessions need
reciprocity or leverage, and reciprocity could only arrive from the handful of events that
happened to offer it — there was no move a player could *make* to earn one. Meanwhile agendas had
been advancing quietly since the people pass: you could read on somebody's sheet that they were
drowning in debt and do nothing about it. And every scene in the game was the same three buttons
whoever you were talking to, whatever you knew about them, and whatever had passed between you —
all of which the sim already knew and none of which was in the room.

**How.**

*1. Agenda resolution.* `content/agendas.ts` holds a move per `AgendaKind`; `sim/agendas.ts` runs
them through a new `resolve_agenda` action. Gated on actually knowing the agenda — a size-up, a
look through their books, or a tap. Trust is deliberately not one of the three: people do not
volunteer this. Every `settle` ends in `doFavour(w, n, kind)`, which is the entire hook into the
concession system; nothing else had to be built for the gating to work. `leave` has two routes —
help them get out, or shut every door so they cannot — and `trap` deliberately does *not* call
`doFavour`: it takes fear and somebody who cannot leave, and no friend.

*2. Conversations.* A conversation is a queued `Confrontation` with `kind: 'talk'`, answered
through `resolve_confrontation` and rendered by the scene sheet. **The same queue as a fight at
your door**, chosen over a second pending-action mechanism because the queue already owns the End
Day sweep, the "deal with what is in front of you" gate and the modal stacking. The menu is
generated from world state — the scene's own approaches (which close it), their agenda if known, a
name you both know from the connections graph, something out of your ledger. The last two are
*openers*: they buy a bonus on whatever you close with, can be worked once each, and can land
badly and cost you trust.

*3. The ledger.* `sim/ledger.ts` writes one line per meaningful exchange to `Npc.ledger`;
`dossier()` assembles it with the established facts, favours in both directions and any current
hold. One component (`ui/components/Ledger.tsx`) for everybody — the crew rows simply do not
appear for somebody who is not crew. `rel.owedToThem` is the other side of `rel.favours`, and a
conversation can spend it.

*4. Everything routes through what exists.* A resolved agenda closes the agenda, spreads
reputation through `spreadFrom` exactly as the standing pass does, writes a ledger line, and logs
itself — so the next conversation with that person opens differently. No new reputation or memory
system.

**The reducer had to be split, and that is the structural change here.** A closing move runs a
real scene, which means one action running another on the same world:

- `dispatch` is now clone-and-charge; `apply` is what-the-action-does. `end_day` still returns a
  replacement world and still writes the rng back before `endDay` reads it.
- `can` is the modal gates plus `gate`, the action's own rules. A conversation asks `gate` about
  its closing move, because asking `can` has the conversation refuse itself for being the thing in
  front of the player — which it did, for an afternoon.

**Three real bugs the new tests found, all mine, all fixed:**

- **Opening a conversation charged AP and closing charged it again.** `can('talk')` returned the
  scene's affordance including its cost, and `dispatch` deducted it; then the closing move
  deducted it a second time. The gate is now checked and the cost dropped.
- **The closing move refused itself.** The recursive gate check went through `can`, which is
  blocked by "somebody is in front of you" — and the conversation *is* that somebody.
- **A test that cloned a world 25 times rolled the same number 25 times.** `structuredClone`
  carries `w.rng`, so the retry loop was one attempt repeated. Worth remembering: vary `t.rng`,
  not just the clone.

**Numbers.** Before the bot was taught any of this the honest run was **bit-identical**,
confirming the direct-action path is untouched — both paths are real and both stay working. With
the bot taught, `npm run sim -- 60 <seed> honest` at day 61:

| seed | before | after |
|---|---|---|
| 3 | 7,584 / 1,258 | 8,534 / 1,349 |
| 7 | 7,714 / 1,092 | 13,083 / 3,543 |
| 11 | −388 / 50,182 | −208 / 35,679 |
| 19 | 125 / 2,774 | −1,573 / 15,599 |

It is up on three seeds and down on one: the bot now settles agendas, which earns reciprocity,
which opens concessions it could not reach — and spends AP doing it, which is what seed 19 paid.

`npm run sim -- 60 7 all` reports **16/16 systems** (up from 13) and 32 distinct op kinds. New
coverage rows: `conversations`, `settling an agenda`, `using one against them`. Across the eight
scenarios: 159 conversations, 386 openers worked, 113 agendas settled, 3 used against them, 105
people who now owe the player something.

**Watch out.**

- **No `WORLD_VERSION` bump.** `Npc.ledger`, `Relationship.owedToThem` and `Confrontation.talk`
  are all optional; an old save loads with a blank history, which is the honest answer since the
  game was not writing any of this down before.
- **`SceneAct` dispatches a real action now** instead of setting a UI-only store slot. The
  store's `scene`/`openScene`/`closeScene` are no longer used by it; a conversation is world
  state, so it survives a reload and the sim can see it.
- **The dark half of `leave` took four attempts to reach, and the last one found a real bug.**
  `using one against them` sat at 0 across a full sweep while three bot rules were tried: *trap
  anyone whose trust is negative* (people near the start sit at or above zero), *trap anyone whose
  place you already collect from* (the agenda is settled days before the protection is installed),
  and then a new `agendas` admin-panel entry — because **seed 7 generates no `leave` agenda within
  two blocks of the start at all**, so no policy could have reached it. The rule that works is
  *shut the door on anyone who runs a place*. That immediately exposed the real bug: a trap resets
  the agenda's progress without closing it, so it was farmable — **54 traps to 6 settlements in one
  run**, free fear on a loop. `TRAP_REWARD.again` is now a 20-day cooldown, and the ratio is 20:4.
- **The bot has a conversation every third day, not daily.** Daily cost two op kinds over the
  sixteen days `scripts/bot.test.ts` runs and bought no coverage the third day did not already
  have. The op-roster threshold in that test is unchanged.
- **`insureCost` / `repairCost` are now in `sim/economy.ts`.** The reducer extraction removed the
  `check` closure that `insure` and `repair` were reading their cash cost from, and the formula
  was written out twice; it is now written once and read by both.
- Two emoji had to be swapped for Unicode 6.0 equivalents (🤝 and 🛡 in `content/agendas.ts`, 🤲
  in the ledger). The guard caught all three.

**Files.** New: `content/agendas.ts`, `sim/agendas.ts`, `sim/conversation.ts`, `sim/ledger.ts`,
`ui/components/Ledger.tsx`, `sim/agenda-resolution.test.ts`, `sim/conversation-depth.test.ts`,
`ui/ledger.test.tsx`. Changed: `sim/reducer.ts` (the split), `sim/combat.ts`, `sim/types.ts`,
`sim/actions.ts`, `sim/scenes.ts`, `sim/select.ts`, `sim/economy.ts`, `sim/ops.ts`, `sim/cyber.ts`,
`ui/components/SceneSheet.tsx`, `ui/components/Act.tsx`, `ui/components/NpcSheet.tsx`,
`ui/components/ConfrontModal.tsx`, `scripts/bot/policy.ts`, `scripts/bot/run.ts`,
`scripts/bot/coverage.ts`, `scripts/bot/admin.ts` (a new `agendas` entry), `content/glossary.ts`
(`conversation`, `agendaMove`, `ledger`), `docs/DESIGN.md` §3.8.

---

## 2026-09-14 — Standing: fear costs what it cost you, trust plateaus, reputation walks the graph, and a familiarity floor under all of it

**What.** The four numbers every social system reads — fear, trust, familiarity, reputation —
reworked as one system, plus the full audit of everything that reads them. Shipped alone: no new
content rides with it.

**Why.** All four were flat, and each one had the same shape of bug behind it:

- **Fear was a formula.** `threaten` paid an approach base plus half your muscle whether you
  said a word or put somebody in hospital. A stare and a broken leg bought the same thing.
- **Trust was a counter.** Enough pleasant visits and anybody would hand over their business,
  their crew place, or a discount. Being liked *was* leverage.
- **Reputation was paint.** One notable act coloured every face within a geographic radius, so a
  name made on one side of town quietly worked on the other, and expanding into new ground was
  only ever socially cold once — at the start of a save.
- **Familiarity was checked in exactly one place.** `promoteReason` would not hand a district to
  somebody who joined yesterday. Nothing else in the game cared how long you had known anyone.

**How.** One rule, four applications: *a relationship can only become as deep as the thing that
built it.* Numbers in `content/standing.ts`, machinery in `sim/standing.ts`, and everything funnels
through two chokepoints in `sim/util.ts` — `adjustRel` (face to face, stamps a contact) and
`bleedRel` (word that merely reached somebody; no handshake). `adjustRel` now takes the world, so
all 83 call sites had to declare themselves; the default is the cheapest stake, so anything
costlier has to say so.

*1. Fear by stake.* Five stakes with a multiplier and a hard ceiling: `words` ×0.45/35,
`backed` ×0.70/50, `property` ×1.30/80, `violence` ×1.80/95, `grave` ×2.40/100. At or above the
ceiling the gain is exactly zero — a hard stare tells nobody anything new once they have watched
you hurt a man. Thirty-odd call sites across ops, combat, hostages, events and the reducer now
declare what they actually did. `threaten` reads its approach: a stare is `words`, crew in the
doorway or their family named is `backed`.

*2. Trust plateaus; concessions need a reason.* Ordinary dealing stops at 45. Each **favour
actually settled** lifts that by 15 to a hard 85. On top of that, a major concession needs
reciprocity or **leverage** — you hold their street (influence 55+), you have been inside their
books within 30 days or are still listening, or somebody they are tied to is in your cellar.
`doFavour(w, n)` is the hook the agenda-resolution pass plugs into; it fires today on the five
places the player already settles something real, and on bribing an official, whose whole
relationship with the player is the money.

*3. Reputation on the graph.* `spreadRep` seeds on the people who were actually there and walks
§3.6's connections: witnesses ×1, one degree ×0.45, two ×0.18, nothing at three, capped at the
five people closest to anybody. The old geographic `radius` became `degrees` — how far *this*
thing carries, so a killing travels two and a raised voice one.

*4. The familiarity floor.* `rel.metDay` / `rel.contacts`, needing 3 days **and** 2 separate
occasions — the `LIEUTENANT.minDays` pattern, generalised. Below it trust stops at 25 and fear at
30. A demonstrated act (`property` and up) is exempt from the fear half: breaking somebody's
window is its own introduction. Nothing is exempt from the trust half.

*5. The audit.* Every gate that read a raw number:

| what | before | after |
|---|---|---|
| `protectReason` friend route | trust ≥ 40 | + familiarity + (favour or leverage) |
| `recruit` | approach odds only | familiarity always; `promise` needs a favour or leverage; `lean` needs fear ≥ 38 |
| `buy_business` friendly price | trust ≥ 30 | + familiarity + (favour or leverage) |
| sit-down `alliance` | standing ≥ 40 | + `factionLeverage`: a favour owed, 2 of their blocks held, or dirt on their boss |
| sit-down `demand_block` | numbers only | + `factionLeverage` |
| `promoteReason` | `minDays` + loyalty | unchanged — confirmed, and now the pattern the rest copy |
| fixer rate and daily cap | scaled 0–100 trust | scaled over `FIXER.trustBand` (60), the band trust can now reach |
| `bribe_official` | trust only | also `doFavour`, so the money can still reach a judge at 40 and `boughtBy` at 45 |
| `offer_sale` event | weight at 45, picker at 45 | both 40, below the ordinary ceiling |

**Two real bugs this turned up, both fixed here.**

- **`can(recruit)` and `dispatch(recruit)` disagreed on the default approach.** The reducer
  defaults an absent approach to `promise`; `can` compared `a.approach` directly, so every gate
  keyed to an approach was skipped by any caller that left it off — including the new one. The UI
  could offer a button the reducer then resolved as something else.
- **`can(recruit)` checked distance before the gates you cannot walk to fix.** Being told to
  cross town and *then* that they were never going to say yes is a bad answer for a player and a
  worse one for the bot, which read the location refusal as a maybe and spent entire days walking
  to people it could not recruit. Hard gates now come first. This one was worth about $12,000 and
  eight rackets over thirteen honest days.

**Numbers.** `npm run sim -- 60 <seed> honest`, cash / dirty at day 61:

| seed | before | after |
|---|---|---|
| 3 | 37 / 494 | 64 / 1,111 |
| 7 | 6,161 / 1,037 | 7,714 / 1,092 |
| 11 | 0 / 12,721 | −388 / 50,182 |
| 19 | −1,443 / 24,982 | 125 / 2,774 |

`npm run sim -- 60 7 all` still reports **13/13 systems** and 32 distinct op kinds.

**Watch out.**

- **No `WORLD_VERSION` bump.** All four new `Relationship` fields are optional, so existing saves
  load — with everybody a stranger, which is the right answer for anyone the player has not dealt
  with since. They will notice concessions they used to get are refused until they re-earn them.
- **The honest curve moved and is not comparable seed-for-seed with older entries.** Seeds 3, 7
  and 19 land in a similar band; seed 11 does not, for a reason that is not this pass's (below).
- **Seed 11's 50,182 stuck dirty is a pre-existing hole this pass made visible, not one it
  created.** The bot recruited the city's only fixer. `recruit` sets `role = 'crew'`, and
  `fixersKnown` filters on `role === 'fixer'`, so the only laundering route in that world simply
  stopped existing. Confirmed identical at generation before and after this pass. **Deliberately
  out of scope** — it needs either a "was a fixer" flag or recruit preserving the capability, and
  this pass ships alone. It was already costing seed 11 $12,721 before any of this.
- **`sim/test-util.ts` is new** and is where the new pacing is expressed for tests: `known()`,
  `owes()`, `unknown()`. A test that sets `rel.trust = 90` and expects a concession will now fail,
  correctly — use these instead of re-deriving the floor.
- **Glossary ids:** `leverage` was already taken by the hostage-release mode, so the new entry is
  `hold`. New ids: `stakes`, `familiarity`, `hold`, `favour`.
- The NPC sheet gained a **Standing** row (how long you have known them, what they owe you, any
  hold) so a refusal has somewhere to be looked up.

**Files.** New: `content/standing.ts`, `sim/standing.ts`, `sim/test-util.ts`,
`sim/fear-stakes.test.ts`, `sim/trust-gating.test.ts`, `sim/reputation-propagation.test.ts`,
`sim/familiarity-floor.test.ts`. Changed: `sim/util.ts`, `sim/types.ts`, `sim/economy.ts`,
`sim/reducer.ts`, `sim/select.ts`, `sim/events.ts`, `sim/people.ts`, `sim/ops.ts`, `sim/combat.ts`,
`sim/hostages.ts`, `sim/crews.ts`, `sim/cyber.ts`, `sim/intel.ts`, `sim/production.ts`,
`sim/generate.ts`, `sim/politics.ts`, `sim/tick.ts`, `content/rackets.ts`, `content/glossary.ts`,
`ui/components/NpcSheet.tsx`, `ui/components/BusinessSheet.tsx`, `docs/DESIGN.md` §3.7.

---

## 2026-09-14 — The bot learns the production pass: foremen, standing orders, and getting inside a bank

**What.** The soak bot now posts a foreman, sets a standing order on a product racket, and goes
looking for somebody who works at a bank or an armoured depot to rat — then uses the route intel
it gets on a `heist_armored`. Three new rows in the coverage table cover those systems, so
`scripts/bot.test.ts` fails if a future pass breaks them.

**Why.** The production overhaul shipped automation, distribution and a use for banks and depots,
and the bot could not reach any of it. A sixty-day sweep reported a healthy economy and told you
nothing about three systems that had just landed — which is exactly the failure the coverage
table was built to stop, happening again one pass later.

**How.**

*Three new tracked systems* in `scripts/bot/coverage.ts` — `foremen`, `standing orders`,
`bank / depot intel` — backed by eight counters (`foremen`, `foreman_switches`, `supply_set`,
`supply_delivered`, `intel_ratted`, `skims`, `routes`, `route_used`) and a `production & intel:`
summary line. Same shape as `kit` and `the wire`, so `fullyCovered()` now demands 13/13.

*The assignment order was the whole bug.* `runTheEmpire` handed idle crew to unmanned rackets
first. With 41–45 rackets and 8 crew there is always an unmanned racket, so the foreman branch
below it was dead code: **foremen posted 0 over sixty days, on every scenario.** Reordered to
foreman → racket → wire. That is also the right call for a player: a production nobody runs
wastes ingredients daily and drifts onto the wrong recipe; the marginal racket runner is worth a
few hundred. There is normally one production, so it costs one body.

*Standing orders* (`setStandingOrders`) only act when a racket's current rule is feeding it
nothing: widen `block` → `empire` when stock exists elsewhere, narrow back when it does not.
Leaving a working rule alone matters — rewriting every racket's rule every day would have made
the counter look great and tested nothing.

*Banks and depots* (`workTheBuildings`) run before the ordinary op planner and do one of two
things: if a route is live, plan the `heist_armored` that uses it; otherwise find an un-ratted
employee whose `intelSourceFor` is a bank or a depot and plan a `rat` on them. It is gated on
`opsPerDay > 0` so the no-ops scenarios keep the day they have always had.

**Numbers.** `npm run sim -- 60 7 all`, combined across the eight scenarios:

| | before | after |
|---|---|---|
| systems covered | 12/13 (`foremen` ✗) | **13/13** |
| foremen posted | 0 | 7 |
| standing orders set | 0 | 3 |
| deliveries | 0 | 25 |
| employees got at / skims | 0 / 0 | 69 / 68 |
| routes | 0 | 1 |
| distinct op kinds | 31 | 32 (of 41) |

**Watch out.**

- **The frozen `honest` scenario moved on one seed of four.** Seeds 3, 11 and 19 are bit-identical
  before and after; seed 7 goes $6,320 → $6,161 (−2.5%), because that is the only one of the four
  where a spare crew member exists to be made a foreman. Nothing in `/sim` or `/content` changed —
  the diff is three files under `scripts/bot/`. This is the bot playing slightly differently, not
  a balance shift, but the seed-7 number in older entries will not reproduce. Compare across seeds.
- **`recipe switches` still reads 0.** The bot sets a recipe before it posts the foreman, and the
  foreman agrees with it, so nothing switches. Real behaviour, not a gap — but it means
  `bestRecipeFor`'s switching path is exercised by `sim/production-automation.test.ts` and not by
  the soak. Left as is deliberately.
- **`routes used on a job` is 0 or 1 depending on seed.** A route has to exist *and* survive to a
  day with enough idle crew for `heist_armored`. The `bank / depot intel` row is satisfied by
  skims alone, so the test does not hang on it; if you want that path covered reliably it needs an
  admin-panel entry that hands you a route.
- Nine op kinds still never run: `heist_warehouse`, `insurance_fraud`, `frame`, `defend_racket`,
  `digital_strike`, `takeover`, `claim_abandoned`, `heist_containers`, `heist_countroom`.

**Files.** `scripts/bot/coverage.ts`, `scripts/bot/policy.ts`, `scripts/bot/run.ts`,
`docs/DESIGN.md` §4.14.

---

## 2026-09-14 — Production overhaul: the icon bug's real cause, an inventory worth reading, foremen, recipes with names, and two buildings that did nothing

**What.** Five pieces. The icon bug turned out to have one root cause behind three separate
reports. Then: a rebuilt inventory screen, production automation, twenty recipes with identity,
and a use for banks and armoured depots on days you are not robbing them.

**Why.** Reported from play, all of it.

**How.**

*The icon bug, and its real size.* Booze rendered as a placeholder in the stash; the Back-Room
Market and several item listings were "fucked up on phone and desktop". One cause: **Booze was the
only product whose icon came from Unicode 9.0** — every other one is Unicode 6.0. Post-6.0 glyphs
tofu on older Android and Windows font packs, and a tofu box in a 28px icon slot next to text
reads exactly like a broken listing. An audit found **24 across the codebase**, newest from Unicode
14.0 (2021): the Back-Room Market was a toolbox, the suppressed pistol a shushing face, union dues
a placard, the nightclub a disco ball. All replaced with Unicode 6.0 equivalents.
`sim/emoji-support.test.ts` walks the real source and fails on anything newer.

*The market listings had a second problem behind the tofu.* The buy row crammed a bold name, a
small grey price and a pill onto one wrapping line; the sell row truncated two-word item names with
an ellipsis. Both rebuilt as a shelf row: icon, then a stack that owns its own line breaks, then the
action. Nothing truncated, nothing mixed on a line that wraps.

*The inventory.* Identity, quantity, value and flow travel together at every level of zoom. Per
product: what it is (the recipe's name where a production gives it one), how much, what a unit
fetches, what the lot is worth, and which locations hold it. Empty safehouses collapse behind a
count. Move controls are generated from what is present — two units offers "move both", not 5/10/25.
Automation is stated inline, naming the foreman and what is being made.

*Automation.* A **foreman** assignment keeps a production on the best recipe you know, buys
ingredients when it runs dry, and moves output somewhere with room. **Standing orders** generalise
the same-block restock from the dealing fix: every product racket has a `supply` rule — this block,
anywhere you own, or by hand.

*Recipes.* Twenty, five per kind, each naming a thing you actually make, with a third axis: heat
and risk. Every kind has a genuinely quiet method and a genuinely loud one.

*Banks and depots.* Getting inside an employee (the existing `ratted` per-target unlock) opens a
**skim** out of a bank — small, daily, compounding discovery risk — or a **route** out of a depot,
which pays nothing but takes 22 difficulty and a fifth of the heat off the next armoured-car job.
Both also surface as opportunity event cards.

**Files.** New: `content/intel.ts`, `content/events.ts` additions, `sim/automation.ts`,
`sim/intel.ts`, `ui/components/Inventory.tsx`, and five test files (`sim/emoji-support.test.ts`,
`sim/recipes-expanded.test.ts`, `sim/production-automation.test.ts`, `sim/bank-depot-intel.test.ts`,
`ui/inventory.test.tsx`). Changed: 18 files for the emoji sweep, `content/rackets.ts` (recipes),
`sim/types.ts` (`foreman` assignment, `Racket.supply`, `Npc.intel`), `sim/tick.ts`, `sim/ops.ts`,
`sim/select.ts`, `sim/events.ts`, `ui/components/Kit.tsx` + `BusinessSheet.tsx` + `EmpireTab.tsx` +
`NpcSheet.tsx`, `ui/styles.css`, `docs/DESIGN.md` §4.17–4.20.

**Watch out.**

- **No `WORLD_VERSION` bump.** `Racket.supply`, `Npc.intel` and the `foreman` assignment are all
  optional additions; existing saves load and default to the old behaviour.
- **Volume beats premium on raw revenue, and that is deliberate.** Measured: with a tech-8 worker a
  still makes 1.08 rev/day on the house standard, 1.76 on overproof, and **0.96 on barrel-aged**.
  Output multipliers reach 1.6× while `qualityMult` spans only 0.7–1.2, so a 20% output cut can
  never be repaid on price alone. Rather than inflate quality globally, `bestRecipeFor` blends value
  per day with value per unit by how full the safehouse is — with room, volume wins; with the
  shelves full, the premium methods do. Without that term the careful recipes were dead weight at
  every moment of the game, which the automation tests would not have caught.
- **My own emoji guard caught me** mid-pass: I had quoted the broken glyph inside a code comment
  describing the bug. Working as intended, but worth knowing the test reads comments too.
- **The foreman counts as the worker.** Assigning one sets `workerId` if empty, so a production does
  not need both. Two people cannot run the same one.
- **Deliberately out of scope:** the stash stays a bare count per product — style identity is
  *reported* from whichever production is making that product, not stored per unit, so mixed stock
  of two styles shows the dominant one. Per-batch provenance would mean changing the data model.
- **Still not done:** the soak bot never assigns a foreman, never sets a supply rule, and never
  rats a bank employee, so none of this pass has automated coverage in the sweep — only in its unit
  tests. Teaching the bot to use the automation is the obvious follow-up.


## 2026-09-14 — Rackets diversify, territory finally moves, and two gates that asked the wrong question

**What.** Saturation and synergy give racket kinds a reason to be picked between; influence
accrual now rewards depth and spreads outward from strongholds; four new racket kinds; ten new
event cards wired to systems that had no daily presence; and two bugs reported from real play.

**Why.** Protection costs nothing and works anywhere, so nothing else was ever worth buying. And
city control had sat near the same low percentage since this project's first soak — diagnosed
repeatedly, never actually fixed.

**How.**

*Saturation.* Per district, per kind, per owner. The first three of a kind are untouched; each one
past that is worth 0.8× the one before, floored at 25%, ordered oldest-first so a new route
dilutes itself rather than retroactively punishing what was already running. Applied to income
and to laundering capacity.

*Synergy.* One-directional pairs — fencing fed by dealing, laundering by carding, dealing by
smuggling, loansharking by a gambling den, no-show jobs by union dues — paid while the feeder is
running, unshut, in the same district.

*Territory.* Influence is gathered per block and applied once, so accrual can see the whole depth
of what you run there: each operation past the first adds half again (cap four), consecutive days
held add up to half again more, rivals get pushed off ground you run deeply, and — the piece that
actually mattered — a block you control with depth ≥ 2 bleeds influence into its neighbours.

*Four new kinds:* union dues, counterfeiting, after hours, policy bank. Only worth adding once
there was a reason to pick between them.

*Ten new events*, each weighting on the state it is about: a wronged mark's family turning up;
gossip reaching somebody you never spoke to; an officer quietly asking around before the posture
moves; a tap surfacing something unprompted; a card about to go cold; a one-time price on kit; a
rival noticing what you carry; a street crew offering terms; somebody asking about a block you
claimed.

**Two bugs from real play.**

1. **A detective on day one.** `cops_sniffing` weighted purely on owning any racket, so your
   first protection job could summon a plainclothes cop who had supposedly been watching it for
   two nights. It now needs real police interest (heat, an escalated Authority, or an open file)
   *and* a racket at least four days old. `content/events.ts` holds those thresholds so the rule
   is a constant rather than a habit, and `sim/events-variety.test.ts` draws thousands of cards
   from worlds lacking each system to prove nothing fires without its state.
2. **A derelict lot you found yourself could not be taken.** `claim_abandoned` required
   `priorOps: ['scout_block']` — having scouted *anywhere* — but many derelict blocks are visibly
   derelict from generation. It uses the per-target family now (`derelictTarget`), and walking
   onto *or through* a derelict block marks it found.

**Files.** New: `content/territory.ts`, `content/events.ts`, `sim/territory.ts`, and three test
files (`sim/racket-saturation.test.ts`, `sim/territory-accrual.test.ts`,
`sim/events-variety.test.ts`). Changed: `sim/economy.ts` (`rawRacketIncome` split out so the
multiplier applies in exactly one place), `sim/tick.ts`, `sim/types.ts` (four `RacketKind`s,
`Block.heldSince`), `content/rackets.ts`, `content/businesses.ts`, `sim/events.ts`,
`sim/select.ts` (`racketOutlook`/`racketsByOutlook`), `sim/reducer.ts`,
`ui/components/BusinessSheet.tsx` + `BlockSheet.tsx` (both mechanics made visible),
`content/glossary.ts`, `scripts/bot/policy.ts`, `docs/DESIGN.md` §4.15–4.16.

**A third bug from real play, fixed in a follow-up.** A dealing racket "never really sells". There
is no racket inventory — product rackets move what the *player* is carrying, which is a coherent
rule — but production puts everything into safehouses, so the obvious setup (a still upstairs, a
dealer on the corner below) sold nothing forever and nothing on screen said why. A safehouse of
yours **on the same block** now hands 40 units a day down to the corner, and every product racket's
card states what it has to sell, where the rest of it is, and how to get it there. Reaching across
town still is not free: stock in a safehouse elsewhere stays there until you move it.

**Watch out.**

- **No `WORLD_VERSION` bump.** `Block.heldSince` is optional and the new racket kinds only appear
  in worlds that start them.
- **The honest scenario's numbers moved, and they were meant to.** Six seeds, 60 days:
  **control 9.3% → 19.3%** (up on every seed), **rackets 9.2 → 10.2**, **income $1,270 → $746**.
  The income drop is the mechanic working: that bot ends with ten-plus protection rackets in one
  district, which is precisely the shape saturation exists to tax. Its escapes — spread to another
  district, or diversify — are both closed to it, because `nearBiz` confines it to two blocks
  from start and it never holds clean cash. **That is a bot limitation, not a balance result**;
  teaching it to expand into a second district is the obvious follow-up and is **not done**.
- **I changed a shared bot policy branch**, so `honest` is no longer byte-frozen: racket choice
  now reads `racketsByOutlook` (best affordable yield) instead of a fixed favourites list. Its
  *ordering* is unchanged, which is what the CLAUDE.md rule protects, but future comparisons
  should baseline against this pass, not earlier ones.
- **Tuning history, so nobody re-treads it.** Saturation with no grace cut honest income nearly
  in half and made the early game strictly worse; `free: 3` and `decay: 0.8` is where it landed.
  Depth/tenure accrual alone moved control **not at all** — the blocks were already at influence
  100 — and only spill moved the number. If you are tempted to tune accrual to fix territory,
  measure how many blocks the player has anything on first.
- **`sim/events-variety.test.ts` was 60s** until `kindsDrawn` stopped cloning the whole city per
  draw; it is 4s now. If you add draws, reuse the clone.
- **Two existing tests changed** because they encoded the old `claim_abandoned` rule. That was
  deliberate; the new assertions say scouting elsewhere is worth nothing on its own.
- **Deliberately out of scope:** synergy is one-directional and does not chain; saturation is per
  district and ignores what rivals run; the bot does not plan for synergy (it scored 3 synergised
  rackets of 40 in a boosted run), so that pairing is strategy for a human rather than something
  the soak exercises.


## 2026-09-14 — An admin panel, and a soak bot that can actually reach the game

**What.** The `cheat` action grew from a money/skills/crew list into a real admin panel that sets
individual systems up; the soak bot was rebuilt around it with scenarios and a coverage report;
and the bot immediately found two genuine bugs, both fixed here.

**Why.** Three feature passes in a row shipped with the bot silently unable to reach what had just
been built — it never got past tier 1, never escalated an Authority, never had a card in its
pocket. Each time the economy curve came back healthy and meant nothing, and each time I wrote
"teaching the bot to do this is the obvious next job" in the changelog and did not do it. The
soak was giving false assurance, which is worse than no soak.

**How.**

*The admin panel.* New cheats — `kit`, `rackets`, `war`, `attention`, `jail_crew`, `open_case`,
`cards`, `ratted` — each setting up one system's prerequisites, plus `amount` on the ones where a
number makes sense. They are ordinary `cheat` actions through the ordinary reducer, so there is
no test-only path into the sim: the bot reaches the late game exactly the way a person poking at
the build does, and everything stamps `w.cheated`.

*The bot.* Split out of one long loop into `scripts/bot/`: `policy.ts` (a day), `admin.ts`
(scenarios), `coverage.ts` (what got exercised), `run.ts` (one run). It now plans and launches
real ops — biased toward kinds this run has not tried and toward the top of the tree — answers
mid-job complications, works the law, runs and dumps cards, sells dirt, pulls taps and scrubs
wire heat.

*Coverage.* Every run reports which of ten systems it touched, how many distinct op kinds ran,
and what never ran at all. The combined sweep now reaches **10/10 systems and 35 of 41 op kinds**,
with 209 complications and 421 confrontations across the scenarios.

*Two bugs it found.*
1. **A pending event blocked answering a confrontation.** Both are modal, and the confrontation
   modal renders on top of the event card — so the player clicked a button they could see and got
   a refusal about a card they could not. The bot found it by spinning against the refusal 140
   times in a thirty-day war. `resolve_confrontation` is now exempt from the pending-event gate.
2. **`flipLieutenant` crashed the game.** It cast `c.assignment` and read `.districtId` off it.
   The "somebody is courting your lieutenant" card is drawn at End Day and answered the next
   morning, and in between the tick can jail them or a case can charge them — at which point
   resolving the card threw and took the whole app down. Guarded, with three regression tests.

**Files.** New: `scripts/bot/{policy,admin,coverage,run}.ts`, `scripts/bot.test.ts`,
`sim/cheats.test.ts`. Changed: `scripts/headless.ts` (now only a CLI), `sim/actions.ts` +
`sim/reducer.ts` (the panel, and the confrontation gate fix), `sim/lieutenants.ts` (the crash),
`sim/index.ts` (exports `CheatKind`), `ui/components/HelpSheet.tsx`, `vitest.config.ts`
(includes `scripts/`), `sim/combat.test.ts` and `sim/lieutenants.test.ts` (regressions),
`README.md`, `CLAUDE.md`, `docs/DESIGN.md` §4.14.

**Watch out.**

- **The `honest` scenario is frozen and must stay that way.** It is the only run whose numbers are
  comparable with earlier passes. Its day is ordered exactly as the original bot's was — during
  this work I reordered it twice by accident and moved the curve 8% both times, for no gameplay
  reason. `npm run sim -- 60` still reports $764 dirty on the default seed, byte-identical to
  before. If you want the bot to do something new, add a scenario.
- **`npm test` went from ~12s to ~23s.** The bot suite is eight soak runs; they are cached per
  scenario and capped at 16 days, which was the smallest size that still reached full coverage on
  six different seeds. Do not raise the day count without checking what it costs.
- **The roster-coverage floor is 40%, not 50%.** Measured 17–20 of 41 kinds across six seeds; a
  threshold only the best seed clears is a flaky test pretending to be a standard. Raising it
  means teaching the bot, not re-rolling.
- **Six ops still never run**: `heist_warehouse`, `defend_racket`, `takeover`, `claim_abandoned`,
  `heist_containers`, `heist_countroom`. They need conditions no scenario sets up (a scouted
  derelict block, a threatened racket, a warehouse or nightclub in that particular city). The
  sweep names them every run, so this is written down rather than implied — but it is **not
  fixed**.
- **Fog is still uncovered and cannot be covered here.** Chunk loading is network work and the
  headless bot has none, so travel into unmapped ground has no soak coverage at all. That needs a
  fake chunk source, and it is not done.
- **`npm run sim -- 60 7 all` is the new habit.** CLAUDE.md now says to run it after building
  anything and read the table. The default honest run reports 2/10 coverage, by design — it says
  so and points at the sweep.


## 2026-09-14 — Ops overhaul: working on the law, complications, and a much bigger roster

**What.** Fifteen new ops, three of them aimed at the law itself; tier-2+ jobs can now stop
halfway and ask the player a question; and the per-target gating pattern grew from one key to
five. No new plumbing: everything rides systems that already existed.

**Why.** Three separate gaps. An `Authority` only ever escalated — `bribe_official` moves an
official's trust and buries paper but never touches `Authority.attention`, which is the number
the building decides its posture from, so a crackdown was weather you waited out. A big job was
one hidden roll, identical in shape to a stick-up, so tiers cost more without *feeling* like
more. And the ops tree had 25 entries, most of them violence.

**How.**

*Working on the law.* `buy_down` (sit down with somebody inside and pay for their attention to go
elsewhere), `spring_crew` (get one of your own out before the sentence runs), `buy_case` (kill one
specific open file — distinct from silencing a witness, which only stops a file *growing*). All
three are ordinary `OP_DEFS` entries with a `requires` and a `tier`, and all three read
`authorityDifficulty()`: the target building's rung (0 at routine, 36 at crackdown), the
`effectivePolice()` where it stands, and its current attention. Cost scales the same way —
`buyDownCost` ×2.35 per rung, `buyCaseCost` ×2.1 per rung plus how far the file has got. Buying
down a routine precinct is a few thousand; a crackdown is more than eight times that. The cheap
time to do this is before you need to, which is the point.

*Complications.* A tier-2+ op can interrupt itself and put a question to the player, through the
**existing** confrontation machinery and nothing else: a complication *is* a `Confrontation` with
`kind: 'op'`, raised by `queueConfrontation`, answered through `resolve_confrontation`, priced by
the same kit functions, shown by the same modal, swept up by the same End Day line. The three
answers stay fight/flee/backup so `sim/items.ts` reads them unchanged; what varies is what those
words mean on this job and how well each does. Handled +18 to the op's roll, fumbled −16, never
answered −30 — never answering is deliberately worst, which is what earns the modal the right to
block your day. Heat moves too: through people ×1.35, talked out ×0.85.

*The roster.* Four heists (payroll, containers, the collection, the count room), five paper jobs
(long con, staged accident, shell company, charity front, counterfeit run), three moving jobs
(dockside pickup, hijack, convoy). Every one has a `requires` and a `tier` and appears in the
tree. Kept abstract on purpose, the same treatment the card system got: there is no technique in
any of them.

*The per-target family.* `rattedTarget` became the template for `officialTarget`, `jailedTarget`,
`casedTarget` (reusing `Business.casedUntil`, which case-the-joint already wrote and nothing read
for gating) and `caseTarget`. All ask about the mark rather than the empire; all fall back to
"does any valid mark exist" when the tree is browsed with nothing selected.

**Files.** New: `content/complications.ts`, `sim/complications.ts`, `sim/authority-ops.ts`, and
four test files (`sim/authority-ops.test.ts`, `sim/complications.test.ts`, `ui/ops-tree.test.tsx`,
plus an "expanded roster" block added to `sim/ops-progression.test.ts`). Changed:
`content/rackets.ts` (15 op defs, 4 requires keys, `target: 'case'`, `costScales`),
`sim/types.ts` (OpKind, `Op.targetCaseId`/`complication`, `ConfrontKind` gains `'op'`),
`sim/combat.ts` (an `op` branch and complication wording), `sim/ops.ts` (raise, swing, outcomes),
`sim/select.ts` (`opCost`, the per-target gates, a richer `opChance` target),
`sim/reducer.ts` (case targets, dynamic cost, a narrowed official guard),
`ui/components/OpsTab.tsx` (case picker, per-gate mark lists, the price panel),
`ui/components/ConfrontModal.tsx`, `content/glossary.ts`, `docs/DESIGN.md` §4.11–4.13.

**Watch out.**

- **No `WORLD_VERSION` bump.** `targetCaseId` and `complication` are optional on `Op`, and the
  new `ConfrontKind` only appears on confrontations created after this ships, so existing saves
  load unchanged.
- **One existing guard was narrowed, deliberately.** `plan_op` refused *any* npc-targeted op
  against an official. Violence against one is still refused; an op declaring
  `requires.officialTarget` is now exempt, because sitting down with one is the entire point.
  If a future op wants to hurt an official, it must not use that key.
- **`buy_down` was unlocked on day one** until my own progression test caught it —
  `officialTarget` alone is satisfied from world generation. It now also carries `crewCount: 1`,
  the established "you are somebody now" gate. Any future op whose only gate is a per-target one
  will have the same problem: per-target keys say *who*, never *when*.
- **The tier gate on complications is load-bearing.** Measured: 0% at tier 0/1, then 37% / 45% /
  51% for warehouse, jeweller, bank. If a street job ever raises one, the difference between a
  stick-up and a bank job has been thrown away.
- **A complication raised during End Day waits for the next time the player is at the controls**,
  so the op resolves a day late and you wake up to the crew asking a question. That is intended,
  not a scheduling bug.
- **The soak is unchanged and proves nothing here** ($764 dirty on the default seed, identical to
  before): the bot runs street jobs, never reaches tier 2, never escalates an Authority far
  enough for law work to matter, and cannot answer a modal. Complication rates were measured with
  a direct probe instead. Teaching the bot to run a tier-2 job and answer a complication is the
  obvious next job and is **not done** — until then nothing regression-tests complication balance
  across a long game.
- **Deliberately out of scope:** complications cannot chain (one per job, by design); there is no
  way to *raise* an Authority's attention deliberately; `buy_down` reaches one building at a time
  rather than the city; and the new paper jobs pay flat cash rather than opening any new economy.


## 2026-09-14 — The law as an entity, map overlays, and fog over unmapped ground

**What.** Three things: police become a real entity (`Authority`) with a visible monitoring
radius and their own escalation ladder; toggleable map overlays over per-block fields that
already existed; and cloud over unmapped city that lifts by travelling rather than by tapping.

**Why.** A police station used to write `police += 25` into its block and `+= 10` into each
neighbour, once, at world generation, and then cease to exist — an invisible number with nothing
behind it that the player could neither see nor reason about. The three officials floated free
with no territorial tie. And tapping empty map space instantly conjured a district full of
people, which made territory something you summoned rather than somewhere you went.

**How.**

*Authority, deliberately not a Faction.* A `Faction` carries soldiers, cash, tribute owed,
standing toward every other faction, and the alliance/peace/tension/beef/war ladder. Police have
none of that, and reusing the type would make "declare war on the cops" a legal move — you could
ally with them, be paid tribute by them, broker peace between them and the Vitales. So
`Authority` is its own lighter type: a block, an `attention` number, a posture, and a list of
officials. Nothing converts between the two ladders in either direction, and
`sim/authority.test.ts` asserts that both ways round.

*The radius is live now.* `reach: 25, falloff: 0.4` over a posture-sized hop BFS on the same
`neighborIds` graph movement walks. At the `routine` rung that is exactly +25 / +10 — a fresh
world starts precisely where the old one did — but unlike the baked number it grows with posture,
vanishes if the entity does, and the map can draw it. **Every risk roll now reads
`effectivePolice(w, blockId)`**, not `b.police`: racket incidents, production interruptions,
faction expansion, hostage risk, the block sheet. Generation-time placement still reads the raw
baseline, because it runs before the buildings are all in place.

*The ladder.* routine → watching → investigating → task_force → crackdown, on an `attention`
number that chases pressure at +6/−3 a day so escalation builds and decays instead of flipping.
Pressure is `street × streetWeight + wire × wireWeight + openCases × caseWeight`, where *street*
is `heat − cyberHeat` and *wire* is `cyberHeat`. The two kinds weight them oppositely — a
precinct is boots on the ground (street 1.0 / wire 0.45), city hall reads reports and the wire is
all report (street 0.55 / wire 1.2). That is the point of `cyberHeat` existing as a distinct
tracked share: the same 60 heat escalates a different building depending on how you earned it. An
official of yours inside takes up to 45% off what it notices, never 100%. Posture multiplies the
nightly raid chance 1.0 → 2.2.

*Overlays.* Heat, wealth, police (baseline + the live monitoring field), one outfit's influence,
one product's demand. Reads only — no overlay added a per-block stat, and
`ui/map-layers.test.tsx` asserts that switching layers leaves the world object byte-identical.

*Fog.* Cloud over every unpopulated chunk in view, so never-downloaded ground and
downloaded-but-unvisited ground look the same — because to the player they are. `sim/fog.ts`
decides what lifts: a chunk opens when a *presence* is within `REVEAL_M` (500 m, about a block
and a half) of its bounds. A presence is the player, or a crew member actually posted somewhere
(guard, racket runner, production worker, lieutenant); idle, jailed and dead crew are worth
nothing. The rule is pure; the UI does the fetching, since `/sim` does no network work.

**Files.** New: `content/authority.ts`, `sim/authority.ts`, `sim/fog.ts`,
`ui/components/MapLayers.tsx`, and four test files (`sim/authority.test.ts`, `sim/fog.test.ts`,
`ui/map-layers.test.tsx`, `ui/fog-delivery.test.ts`). Changed: `sim/types.ts` (`Authority`,
`World.authorities`, `Npc.official.authorityId`), `sim/generate.ts` (city hall + a fallback
precinct + `WORLD_VERSION`), `sim/populate.ts` (the bump becomes an entity),
`sim/tick.ts`/`hostages.ts`/`factions.ts`/`reducer.ts` (read `effectivePolice`), `sim/select.ts`,
`ui/store.ts` (layer state; `revealNear` replaces `populateAndOpen`), `ui/components/Map.tsx`
(overlay shading, fog layer, law markers), `ui/components/BlockSheet.tsx` (a Watchers panel),
`ui/components/Hud.tsx`, `ui/styles.css`, `content/glossary.ts`, `docs/DESIGN.md` §5.5.

**Watch out.**

- **`WORLD_VERSION` 7 → 8, so every existing save is dropped.** It has to be: old saves have the
  +25/+10 already baked into `b.police` and no `authorities` at all, so they would either
  double-count the radius or show none of it.
- **Tapping empty map no longer populates it — this is the change that will surprise a
  playtester.** There is no transition: where a tap used to produce a district, it now produces a
  sentence telling you to walk. If that reads as broken rather than deliberate, the dial is
  `REVEAL_M` in `sim/fog.ts` (higher opens the city faster; high enough makes fog decorative).
  `ui/fog-delivery.test.ts` pins `revealNear()` as the only path that populates a chunk,
  precisely because restoring instant-populate is the obvious "quality of life" regression.
- **Balance: neutral at rest, real once you escalate.** Measured directly rather than through the
  soak, because a change this deep reshuffles the RNG and makes seed-by-seed totals meaningless
  (they swung −0% to +54% in both directions across 5 seeds, which is noise, not a trend). On five
  cities: at the routine rung the citywide mean police rises 1.8–2.1 points with 8–9 blocks of 45
  covered and raid chance ×1.0 — and in a city with a real police landmark it is *exactly*
  neutral by construction. After 40 days at heat 85 / cyberHeat 30, coverage nearly triples
  (8–9 → 21–30 blocks) and raids run ×1.8.
- **The soak bot does not exercise any of this.** It never escalates far, never opens overlays and
  never walks into fog, so the economy curve says nothing about the three features. Teaching it to
  travel into unmapped ground would be the way to catch a fog rule that strands the player, and is
  **not done**.
- **Deliberately out of scope:** no way to interact with an Authority directly (no surrendering,
  no negotiating, no attacking a precinct); bribery still works through the individual officials
  it already worked through, and now merely slows their building down; the overlay set is fixed,
  with no per-district or per-faction heat view; and fog has no minimap or compass to tell you
  which way the unmapped city lies.


## 2026-09-14 — The wire: cards, taps, wire fraud, a digital war lane, dirt, and scrubbing

**What.** A whole cybercrime lane, eight pieces: a **mugging** op as the doorway; lifted **cards**
with a freshness clock and three ways to work them; **ratting** with two modes (one look, or a
tap left running); **wire fraud** behind the game's first per-target gate; **Pull Their Wires** as
a war lane without muscle; **dirt-brokering** to rival factions; **Scrub Your Trail** as a tech
answer to heat that no official touches; and a `{ kind: 'hack' }` crew assignment that works the
card pile passively. Plus one fix found on the way (see *Watch out*).

**Why.** `tech` was a skill you spent points on and then mostly read about. Every existing money
lane went through muscle, charm or a business you owned; nothing paid off brains-and-tech play,
and the heat system had exactly one release valve — bribing an official — so a quiet player had
no quiet way out.

**How.**

*Everything is dice.* `content/cyber.ts` and `sim/cyber.ts` contain no technique of any kind, and
neither does the UI. A card is a tier, a limit and a clock. The brand, **Bellwether**, is
invented — there is no real issuer, network or number anywhere in RACKETS, and that is a hard
rule, not a preference.

*Cards.* Freshness 70–100, falling 9/day; value scales with it, so cards perish. A quiet run
takes 18% of the limit at 10% dead / 6% flag; one big score takes 70% at 55% / 30%. Both scale
with staleness, with whether the card is already flagged, and inversely with the player's tech. A
flagged card run again opens a police file 35% of the time. Dumping the whole pile through a
carding racket of your own pays 28% of face with no exposure — deliberately the worst money and
the best insurance.

*Ratting.* The first op to use `OpDef.modes` (a list beside the three approaches, not a second
approach system). `tapRisk()` is shaped like `holdRisk()` in `hostages.ts` — base × time — but its
inputs are the person: their `tech`, `connected` (×1.35), `quiet` (×1.2). Not the block. There is
a source-scanning test asserting `tapRisk` contains no block lookup, because turning it into a
stakeout is the obvious wrong simplification.

*Wire fraud.* `requires: { rattedTarget: true }` — the only per-target requirement in the game.
`opLocked(w, kind, target?)` now takes a target; `plan_op` passes the npc id. With no target (the
ops tree) it asks only whether you have any mark at all, so the node can read unlocked; the real
per-person check happens at plan time. Reading A does nothing for A's brother.

*Digital strike.* Same `requires.stance` as `ambush_soldiers` — one gating mechanism, not two.
Disrupts the target's rackets 3–6 days, pays $200–1,200 against the ambush's $800–3,500, and
leaves their soldiers standing. Not a strictly better option, on purpose.

*Dirt.* Base $1,200 × rank (boss 2.5, lieutenant 1.6) × the buyer's existing stance toward the
subject's people (war 2, beef 1.5, unaffiliated 0.8) × a charm term. Buyer gains 8 standing; 30%
blowback costs 12 with the subject's faction plus a grudge. Sells once.

*Heat.* `player.cyberHeat` rises with ordinary heat on every wire action and comes down **only**
through `scrub_trail` (1 AP, ~$260/point before skill, ~6 points before skill, both improved by
tech + brains at 7% each). It routes through no captain and no councillor — that is the whole
point of the lane's tradeoff.

*Crew.* `{ kind: 'hack' }` runs the freshest cards first, ~2/day scaled by tech, keeps 20%, needs
at least 3 live cards to bother, and costs 1 wire heat a day. No action, no AP.

*Pulling a tap.* `endTap(w, n, false, rng)` was written for a player-initiated pull and had no
caller — a tap could be planted and never taken off, which makes a compounding risk a trap rather
than a decision. Added `{ type: 'pull_tap'; npcId }`, free and AP-free on purpose, plus a panel on
the NPC sheet showing the days it has run and the real per-day discovery number.

**Files.** New: `content/cyber.ts`, `sim/cyber.ts`, `ui/components/Wire.tsx`, and six test files
(`sim/cards.test.ts`, `ratting`, `wire-fraud`, `digital-war`, `dirt-brokering`,
`hack-assignment`) plus `ui/wire.test.tsx`. Changed: `sim/types.ts` (`Card`, `Secret`, `Npc.tap/ratted`,
`Player.cards/secrets/cyberHeat`, `Op.mode`, `Assignment` gains `hack`), `sim/actions.ts`,
`sim/reducer.ts`, `sim/select.ts`, `sim/ops.ts`, `sim/tick.ts`, `content/rackets.ts` (`OpMode`,
`OpRequires.rattedTarget`, six op defs, the carding racket), `content/glossary.ts` (eight new
entries), `ui/components/OpsTab.tsx` (mode picker; the wire-fraud target list shows only marks
you have been inside of), `ui/components/NpcSheet.tsx`, `ui/components/EmpireTab.tsx`,
`ui/derive.ts`, `ui/test-util.ts` (new `plain()` — `renderToString` writes `<!-- -->` between
adjacent interpolations, so any assertion spanning a text/expression boundary needs it),
`docs/DESIGN.md` §4.10.

**Watch out.**

- **No `WORLD_VERSION` bump.** Every new field is optional and every reader defaults it, so old
  saves survive. Keep it that way if you extend this.
- **`opChance` now counts the player on `minCrew: 0` ops**, and this is a real balance change that
  came out of building the lane. It never counted the player at all, so a solo-capable op with no
  crew on it had a skill sum of zero and floored at the 3% minimum — while the ops tree cheerfully
  advertised it as "solo ok". Mugging went 3% → 56%, Scout the Edges 3% → 64% for a fresh
  character. Ops that *require* crew are untouched deliberately: their balance is the crew you
  bring, not you.
- **The soak does not cover that change.** Six seeds × 60 days came back byte-identical before and
  after ($609 / $1,106 / $1,213 dirty on seeds 1–3), because the headless bot only ever runs
  crewed ops. That is reassuring about the economy curve and says nothing about the solo path — if
  you touch solo-op balance, the soak will not tell you. Teaching the bot to run solo ops and work
  a card pile is the obvious next job and is **not done**.
- One existing test changed: the 1.3× cap test in `sim/items.test.ts` zeroes the player's muscle
  now, because on a stick-up the player is one of the hands and was pushing the quiet side to the
  ceiling too. A new test beside it pins the solo-hands rule in both directions.
- **Deliberately out of scope:** no bot coverage for the wire (above); dirt is sellable to
  factions only, not to individual NPCs; `cyberHeat` has no UI meter of its own yet — it is shown
  inside the scrub panel and nowhere else, which is thin if the number ever matters more.


## 2026-09-13 — Combat you take part in, war work, and casing a place

**What.** Four things: a faction attacking you directly now waits for an answer instead of
resolving overnight; ops that only exist while somebody is at beef or war with you; armed
versions of the everyday jobs; and "case the joint". Plus the arsenal the kit system was asking
for — ten weapons across melee, pistol, shotgun, rifle and explosive.

**Why.** Being attacked was a line in the morning log: the most dramatic thing that happens to a
player was the one thing they could not touch. And the kit layer that landed an hour ago had
exactly three weapons, so "what are you carrying" was a thin question.

**How.**

*Confrontations* (`sim/combat.ts`). The three direct branches of `actAgainstPlayer` —
racket, business, crew — now call `queueConfrontation` instead of applying damage. A queued
confrontation blocks every other action (the same gate pending events use) until answered with
fight / backup / flee. The three answers map onto the three op approaches (loud / inside /
quiet), which is what lets `kitSkillBoost`, `kitApproachBias` and `kitHeatMult` be reused
unchanged rather than re-derived — a pump-action helps you stand and does nothing for you
running. The odds shown are the odds rolled (`confrontChance` is what the reducer uses).
Ambushes on blocks you hold stay automatic, because nobody is standing in front of you for that.
Anything unanswered lands at End Day exactly as it would have before, which also keeps the
soak bot honest. Measured over 60 days at war: 39 confrontations, answered or landed.

*War and armed ops.* `OpRequires` gained `stance` and `weapon` rather than a second gating
mechanism, so `opLocked` explains them like everything else. New: Ambush Their Soldiers, Dig In
(answers a racket carrying the new `threatened` marker), War Strike (war only), Armed Robbery
and Armed Message (locked without a weapon equipped).

*Case the joint.* 2 AP, in person, once per few days per place: sets `Npc.hint` on everybody
inside who is not already known — a feel, no trait names, no numbers — and `Business.casedUntil`,
which `opChance` reads as a difficulty cut for the next job there. `opChance` now takes the
target business so the bonus reaches both the odds the player sees and the roll.

*Weapons.* Melee (knuckles, bat, machete), pistols (pistol, magnum, **suppressed** — the one
weapon that helps a quiet job), shotguns (sawn-off, pump), a hunting rifle, and explosives
(molotov, pipe bomb, at 1.7× and 1.9× heat). Families climb their own ladders; the catalogue test
checks that rather than one global ordering.

**Files.** `sim/combat.ts` (new), `sim/factions.ts`, `sim/tick.ts`, `sim/reducer.ts`,
`sim/select.ts`, `sim/ops.ts`, `sim/types.ts`, `content/rackets.ts`, `content/items.ts`,
`content/glossary.ts`, `ui/components/ConfrontModal.tsx` (new), `ui/App.tsx`,
`ui/components/BusinessSheet.tsx`, `ui/components/OpsTab.tsx`, `ui/components/NpcSheet.tsx`,
`ui/components/Kit.tsx`, `scripts/headless.ts`, `sim/combat.test.ts` (new),
`sim/case-joint.test.ts` (new), `sim/items.test.ts`, `docs/DESIGN.md` §4.8–4.9.

**Watch out.**
- **No `WORLD_VERSION` bump**: `confrontations`, `casedUntil`, `hint` and `threatened` are all
  optional, so v7 saves load.
- A confrontation blocks other actions but **not** End Day — deliberately, so a player can always
  end the day, and so the headless bot cannot deadlock. The soak answers them explicitly.
- `Dig In` targets a business you run something in, which the generic plan_op check used to
  refuse with "That is yours." There is now an `ownRacket` flag on the op def for that case;
  reuse it rather than special-casing a kind.
- Explosives stack multiplicatively with everything else carried: a pipe bomb and a molotov
  together is 3.2× heat before the approach multiplier. That is a real decision, not a bug.

## 2026-09-13 — Kit: items, markets, and equipment that changes a job

**What.** Personal equipment as a layer alongside the product stash: a small catalogue of
weapons, tools, tech and a car; markets that buy and sell them; and real effects on an op's
odds and its heat. A loadout screen on the Crew tab, the shelf on a market's sheet, and the
carried kit shown against the approach you are picking in Ops.

**Why.** Everything after this — cybercrime, muggings, better heists — needs a place for
things the player owns and carries. The stash is bulk goods sold by the unit and the wrong
shape for it, so this is a new layer rather than a change to that one.

**How.** `content/items.ts` holds the catalogue; `sim/items.ts` reads it and nothing invents
per-item behaviour elsewhere. Each item is `skillBoost` (folded into the crew total in
`opChance`), `approachBias` (scales the chosen approach's skill weights) and `heatMult`
(multiplies what the job leaves, like an approach's own `heat`). Three carried at once.

Every item is a tradeoff, enforced by a test: a sawn-off is +0.5 loud / −0.35 quiet, lockpicks
+0.35 quiet / −0.15 loud, a burner cuts heat 15%. **Measured** across the op list with a
three-hand crew: a sawn-off takes a bank job's loud odds 33% → 44% and its quiet odds 32% → 10%;
lockpicks take the same job 33% → 29% loud and 32% → 42% quiet.

One limit worth knowing, found while writing the tests rather than assumed: `opChance` caps
each skill's contribution at 1.3× the job's need, so on an easy job an over-qualified crew is
already at the ceiling and kit adds nothing on that side — while the penalty side still lands.
Kit closes gaps on hard jobs. That is the right shape, and there is a test named for it.

Markets reuse the buy/sell reducer pattern rather than new economy plumbing: buying takes clean
cash and being there in person, selling pays **dirty**, and selling one of a pair leaves the one
in your hand alone. A shop's stock is derived from its business id — stable per shop, nothing
stored in the save. Pawn shops carry what they can display; the new `black_market` type carries
the under-counter half.

**Files.** `content/items.ts` (new), `sim/items.ts` (new), `sim/types.ts`, `sim/actions.ts`,
`sim/reducer.ts`, `sim/select.ts` (`opChance`), `sim/ops.ts` (heat), `sim/generate.ts`,
`sim/populate.ts`, `content/businesses.ts`, `content/names.ts`, `content/glossary.ts`,
`ui/components/Kit.tsx` (new), `ui/components/CrewTab.tsx`, `ui/components/BusinessSheet.tsx`,
`ui/components/OpsTab.tsx`, `scripts/headless.ts`, `sim/items.test.ts` (new), `docs/DESIGN.md` §4.7.

**Watch out.**
- **No `WORLD_VERSION` bump**: `items` and `equipped` are optional on `Player` and every read
  goes through `sim/items.ts`, which defaults them, so v7 saves load and simply own nothing.
- Markets were unreachable in some cities on the first cut — a starting chunk only generates
  **two** districts, so a one-per-district rule meant exactly one back room, and cities whose
  districts did not carry the type had none at all. Now: one per ~15 blocks of a district,
  never where police > 55, plus a guarantee of at least one per city. A city grows as you
  explore (1 → 4 → 8 back rooms over three more chunks).
- The soak bot buys kit when a market is within one block. It first shopped across town every
  day, which cost it about a third of its take across six seeds — a bot problem, not a balance
  one, but the reason the summary line now prints what it is carrying.
- `black_market` rolls that fail the rarity test become pawn shops, which nudges pawn-shop
  counts up slightly in the districts that carry the type.
- UI tests compare rendered HTML, where an NPC nickname's quotes are escaped
  (`Darlene &quot;Grip&quot; Reed`). That has broken two assertions now; `ui/test-util.ts`
  holds `asHtml()` for it — use it for any name comparison.

## 2026-09-13 — Trim the dead band under the tab bar on a home-screen install

**What.** Installed to the home screen, the bottom nav reserved the whole home-indicator inset
below itself: a 94px bar with ~34px of empty ground under the labels. Now 80px.

**Why.** `--sab` is `env(safe-area-inset-bottom)`, which iOS reports as 34px in standalone (and
0 in a browser tab, which is why this only showed up on the installed app). Apple's own tab bars
take the full inset, but they sit under a 49pt row with the labels hard against its bottom edge;
ours already leaves ~10px of slack inside a 60px row, so the full inset stacked into a visible
dead band.

**How.** A second variable, `--sab-nav: min(var(--sab), 20px)`, used by the bottom-anchored
chrome — tab bar, bottom sheet, scene sheet, the onboarding footer, the toast offset and the
panel's scroll padding. 20px plus the row's own slack keeps content ~8px clear of the home
indicator's zone. Scrolling content keeps the full `--sab`: padding at the end of a scroll costs
nothing. On a desktop or a browser tab the inset is 0 and `min()` leaves everything as it was.

**Files.** `ui/styles.css`.

**Watch out.** `env(safe-area-inset-*)` is 0 in a normal browser window, so this class of thing
is invisible in dev and in the UI tests. To see it, force the value in the page
(`document.documentElement.style.setProperty('--sab', '34px')`) and screenshot at phone size —
that is how the 94px → 80px was measured.

## 2026-09-13 — Fix: shipped changes took two reloads to reach players

**What.** A new deploy did not appear until the player reloaded **twice**. The Social tab was
live on the site and still missing on screen. Now one reload is enough, and the Help sheet
shows which build you are actually running.

**Why it happened.** The app is a PWA. `vite-plugin-pwa` injects a registration one-liner
(`dist/registerSW.js`) that registers the service worker and nothing else — it never notices a
newer worker. So: reload one installs the new worker (the page it just served came from the old
precache), reload two is finally served by it. Measured in a browser, old build vs new: old
needed two reloads, the fix needs one.

**How.** `injectRegister: null`, and `ui/main.tsx` registers through `virtual:pwa-register`
itself with `immediate: true`. In `autoUpdate` mode the client calls **`onNeedReload`** when the
new worker activates — `onNeedRefresh` is never called there, which is a trap worth knowing:
wiring to it looks right and silently does nothing. That hook flushes the save (new
`flushSave()` in the store, since the autosave is debounced 400ms and an update must not eat the
last move) and then reloads. A registration also polls for a new worker hourly, so a tab left
open overnight is not a week behind.

`__BUILD_ID__` is defined at build time — the commit sha on Cloudflare (`CF_PAGES_COMMIT_SHA` /
`COMMIT_REF` / `GITHUB_SHA`), a timestamp locally — and printed at the bottom of the Help sheet,
so "is my deploy live?" takes two seconds to answer instead of a debugging session.

**Files.** `vite.config.ts`, `ui/main.tsx`, `ui/store.ts` (`flushSave`), `ui/vite-env.d.ts`,
`ui/components/HelpSheet.tsx`, `ui/pwa-update.test.ts` (new), `vitest.config.ts`.

**Watch out.**
- A player on a build from before this fix still needs two reloads **once** to pick it up. After
  that, one.
- `ui/pwa-update.test.ts` is a source-level guard, not a behavioural test: no unit test in this
  suite runs a service worker. If you change the registration, verify it in a real browser —
  install build A, serve build B, reload once, check the bundle hash in the page changed.
- Deployed ≠ delivered. When a change is not visible, check the build stamp in Help before
  assuming the deploy failed.

## 2026-09-13 — Social tab: everybody you have met, and who they have

**What.** A sixth tab. It lists every person the player has met, groups them by ties, district
or faction, opens each one's family and friends in place, walks from a tie to that person's
row, and keeps the player's own note on anybody.

**Why.** The family/friend web went in two changes ago and had exactly one window onto it: a
line at the bottom of one person's sheet. You could see that Rosa is somebody's cousin, but
not who *you* know, who is connected to whom, or which household you had already leaned on.
The ask was specifically about keeping track of who is related to who, which is a roster
problem, not a sheet problem.

**How.** Two read-only selectors do the thinking, per the /sim rule:
`select.metNpcs(w)` (alive and `isKnown` — the same either-or the person's own sheet uses to
decide whether to show traits, so the roster never knows more than the sheet does) and
`select.knownConnectionsOf(w, n)` (ties to people you have also met, which is what the
"connected" grouping means). Grouping itself is presentation and stays in the component.

Tapping a tie walks to that person's row when you know them and opens their sheet when you
do not; unmet people show in a tie list marked "not met", which is the same information their
own sheet would give you (a name, nothing else).

`Npc.playerNote` is new and deliberately separate from `notes`: one is what the player wrote,
the other is what the sim wrote, and neither touches the other. It goes through a `set_note`
action like every other change to the world, capped at `PLAYER_NOTE_MAX` 240, trimmed, and
cleared to `undefined` rather than `''`. It is exempt from the "deal with what is in front of
you first" gate — a note is bookkeeping, not a move — and costs nothing.

The sheet gained the note (shown above the sim's flavour, in its own card) and now phrases its
tie list through the same `whereabouts()` helper the tab uses, so both screens say
"Nestor Morales (in-law), runs Chez Roma on City Centre K7".

**Files.** `ui/components/SocialTab.tsx` (new), `ui/components/Note.tsx` (new),
`ui/components/NpcSheet.tsx`, `ui/components/TabBar.tsx`, `ui/App.tsx`, `ui/store.ts` (the
`Tab` union), `ui/styles.css` (six tabs on a 320px phone), `ui/components/HelpSheet.tsx`,
`sim/types.ts`, `sim/actions.ts`, `sim/reducer.ts`, `sim/select.ts`, `sim/social.test.ts` (new),
`ui/social.test.tsx` (new), `docs/DESIGN.md` §3.6.

**Watch out.**
- **No `WORLD_VERSION` bump**: `playerNote` is optional, so v7 saves load fine and simply have
  no notes yet.
- Driven in a real browser as well as the tests (inject a save into IndexedDB, click through):
  traversal, note saving and the six-tab bar all behave. The SSR tests cannot click, so
  expanding a row and walking a tie are covered by `sim/social.test.ts` at the data level
  rather than through the DOM.
- The grid banner ("London is on a grid") is `position: absolute` and overlaps the top of any
  tab panel, including this one's grouping control. Pre-existing on every tab; worth fixing
  separately.

## 2026-09-13 — Fix: opening a street crew's corner blanked the game

**What.** Clicking a block held by a street crew unmounted the whole app and left a black
screen. Fixed, and wrapped in error boundaries so no future render crash can do the same.

**Why it happened.** `can('rent_safehouse')` did `w.factions[factionOf(w, blockId)].stance[…]`.
`factionOf` returns whoever *controls* a block, and a street crew holds its corner with 35–55
influence — so on those blocks it returns a **crew** id, `w.factions[crewId]` is `undefined`,
and reading `.stance` threw. The block sheet renders a "rent a safehouse" button, `can()` runs
during render to decide whether it is enabled, and a throw during render unmounts React: black
screen, save still in IndexedDB, no way back to it. Pre-existing; nothing recent caused it.

**How.** The lookup is guarded, and street crews get a rule of their own rather than being
squeezed through the faction one: a crew on your payroll never objects, a hostile crew
(`mood < 0`) refuses and points at parley or taking the corner, and a neutral crew does not
care — the same shape as the faction rule, which only blocks at beef or war.

Then the safety net, because the failure mode was out of proportion to the bug: `ErrorBoundary`
wraps the game, the tab panel and the sheet stack. A crash below one of those now shows what
broke and a way back (close the panel, back to the map, reload) instead of taking the session.
Renders never touch the world, so "close it and carry on" is honest.

**Files.** `sim/reducer.ts` (the `rent_safehouse` case), `ui/components/ErrorBoundary.tsx` (new),
`ui/App.tsx`, `sim/affordances.test.ts` (new), `ui/sheets.test.tsx` (new), `vitest.config.ts`
(the suite now includes `ui/**/*.test.tsx`), `docs/DESIGN.md` §9.

**Watch out.**
- `factionOf` / `controller` / `select.blockController` all return a **street crew id** when a
  crew holds the block. Compare ids freely; never index `w.factions` with the result without a
  guard. That was the only unguarded one left — `sim/affordances.test.ts` now walks every block,
  business, person and faction in a city with crews and asserts `can()` answers instead of
  throwing, which is the general version of this bug.
- UI tests run under `environment: 'node'` with `react-dom/server`. That catches render-time
  throws, which is the class that blanks the screen; it does not catch anything that only
  happens in effects, event handlers or the map.

## 2026-09-13 — The fixer: a guaranteed early launderer

**What.** Every world now seeds one **fixer** NPC on the player's starting block, and a new
`launder_with_fixer` action that washes dirty money at a trust-scaled rate, capped by the day.

**Why.** Setup costs are clean-cash only (rightly — dirty money must not buy its own way
out), and laundering is the only conversion in the game. A player who ends up with a pile of
dirty money, no laundering racket and not enough clean cash to start one has nothing left to
do about it. The soak bot hits exactly that state: it finished day 60 sitting on ~$40k dirty
and negative clean cash. This is the bridge out, and only a bridge.

**How.** Seeded like the two guarantees already in `generateWorld` (the soft-nerve first mark,
the old friend): one `role: 'fixer'` NPC on the start block — zero legwork away, reachable
before anything else — starting at `FIXER.startTrust` 20 and `known: true`, hanging around a
business on the block so the player finds them by opening a door, and tied into the block's
connection web like everybody else.

The deal is deliberately, permanently worse than owning capacity:

- Rate `fixerRate(trust)`: 0.55 at trust 0 → 0.70 at trust 100, linear, trust-scaled the same
  way `buy_business` scales an owner's asking price. `LAUNDER_RATE` (a racket) is 0.85 and the
  fixer's ceiling sits under it for ever, so a racket stays an upgrade, not a speed-up.
- Window `fixerDailyCap(trust)`: $400 + $8/trust, so $1,200/day at full trust against a level-1
  racket's $1,500 base before multipliers. **The window is frozen when they first take money
  that day** (`Npc.fixer = { day, amount, cap }`) — without that, the trust earned by a use
  widened the same day's cap and "come back tomorrow" never quite arrived.
- Each use builds trust through `adjustRel`, scaled by how much of their day you filled
  (`FIXER.trustPerUse` 3 for a full day's worth, minimum 1), so early reliance pays off.

1 AP and face-to-face, like every other dealing with a person. Entirely separate from
`launder`: it never touches `player.launderedToday` or racket capacity.

While in here, `LAUNDER_RATE` replaced the 0.85 that was written out by hand in both `tick.ts`
and the `launder` reducer case, so the fixer's ceiling can be compared against one source.

**Files.** `content/rackets.ts` (`FIXER`, `LAUNDER_RATE`), `sim/economy.ts` (the four fixer
formulas), `sim/types.ts` (`Npc.fixer`), `sim/actions.ts`, `sim/reducer.ts` (can + dispatch),
`sim/generate.ts` (`addFixer`), `sim/select.ts`, `sim/tick.ts`, `scripts/headless.ts` (the bot
uses one until it owns a racket), `ui/components/NpcSheet.tsx` (`FixerAct`),
`ui/components/EmpireTab.tsx` (a signpost under Launder), `content/glossary.ts`,
`sim/fixer.test.ts`, `docs/DESIGN.md` §4.6.

**Watch out.**
- **No `WORLD_VERSION` bump**, on purpose: `Npc.fixer` is optional and `role: 'fixer'` already
  existed in the type, so v7 saves stay valid. The cost is that a game started before this
  ships has no fixer, because the guarantee lands at world generation. Dropping every save to
  fix that is the worse trade; if a migration system ever arrives, seeding a fixer into an old
  save is a one-liner.
- Fixers are only seeded at world generation, not in chunks populated later. One near the
  start is the guarantee; a city-wide population of fixers is a separate question.
- The soak bot now washes through the fixer when it has no laundering racket, which is why its
  dirty pile at day 60 dropped from ~$40k to ~$24k. That is the feature working, not a balance
  regression — the bot never builds a laundering racket at all.

## 2026-09-13 — Everybody has people: households and friends

**What.** Rebuilt the NPC connection web so every person in the city has at least three
ties, most of them in a family of three to six relatives who are all tied to each other.

**Why.** The first version of the web (same day, below) linked people in ones and twos and
left most of the city with nobody: 60–80% of people had no ties at all, and "family" was a
single edge rather than a household. A web that thin cannot carry the things built on it —
the family agenda, gossip along real ties, and the leverage plays still to come.

**How.** Two passes in `linkConnections`:

1. **Households.** ~85% of people (`HOUSEHOLD_SHARE`) are drawn into a family of
   `HOUSEHOLD_MIN`=3 to `HOUSEHOLD_MAX`=6 members, size scaling with the district's
   `closeness`. Every member is tied to every other — a clique, not a chain. The family
   surname comes from an **owner** when the household has one, because business names are
   built from their owner's surname at creation and must not drift; a second owner, or a
   relative out of another naming pool, keeps their own name and is labelled "married in".
2. **Friends.** Everyone is then topped up to `MIN_TIES`=3, plus up to
   `FRIENDS_PER_CLOSENESS`=3 more where people are close, so anyone no household took still
   has people. `MAX_LINKS`=8 stops anyone becoming the hub of the neighbourhood.

Backup (the nerve/trust modifier) now counts only ties **beyond `TIES_BASELINE`** (= the
three everyone has). Without that, making the city connected would have handed every owner
+12 nerve and quietly made shakedowns harder across the board; the number is meant to say
"better connected than their neighbours", and now it does. Values unchanged: +4 nerve, −2
starting trust per tie above the baseline, capped at 3.

Measured over 9 seeds: 3.5–5.5 ties a head (min 3 everywhere, nobody alone), 89–95% with
living family, 90–115 households of 3+ per city. An old quarter reaches ~5.8 ties and ~3.5
relatives a head against downtown's ~3.5 and ~1.6 — closeness still does the work.

**Files.** `sim/connections.ts` (the two passes, `takeSurname`, backing), `sim/connections.test.ts`,
`sim/no-ethnicity-mechanics.test.ts` (backing test now needs ties above the baseline),
`docs/DESIGN.md` §3.6, `content/glossary.ts`, `README.md`.

**Watch out.**
- Save size went 282 KB → ~345 KB. That is the web; IndexedDB does not care, but do not
  stack another per-NPC list on it without checking.
- Two namesakes are never put in one household, and taking the family name never creates
  one (`usedNames`). A city-wide namesake is still allowed and is fine.
- Households are built per chunk, per district, before agendas are assigned — the family
  agenda needs real family to point at. Keep that order in `populateChunk`.

---

## 2026-09-13 — Build your own character

**What.** An alternative to the five presets: point-buy over the five skills plus one
starting trait.

**Why.** Presets are sharp and opinionated, which is right for a first game, but there was
no way to play a specific idea (a driver who can also talk, say).

**How.** `CUSTOM_BUDGET`=19 points, 1–7 per skill, and one of four traits (connected,
earner, local, feared) applied entirely at generation time so no rule elsewhere has to know
about them. The budget sits **below** every preset's total (21–23) and the ceiling below
their spike of 8: broad and pointed against sharp and perked, a tradeoff rather than a
strictly better option. `legalCustomSkills()` clamps whatever the UI sends, so the rule
holds even if the screen is bypassed.

**Files.** `content/backgrounds.ts`, `sim/generate.ts` (`startingSkills`, `applyStartTrait`),
`ui/components/Onboarding.tsx` (`CustomMaker`), `ui/store.ts` (rebuild keeps the spread),
`sim/backgrounds.test.ts`.

**Watch out.** `rebuildOnRealStreets` has to pass `custom` through or a hand-built character
is regenerated at the floor. Traits live only in world-gen: if you ever give one an ongoing
effect, it needs a home in the sim, not in `generate.ts`.

---

## 2026-09-13 — Start anywhere, and five backgrounds

**What.** Sixty-odd random cities instead of eight, a start that lands in a different corner
of a city each time, and two new backgrounds (wheels, tech).

**Why.** Every city-level pick dropped the player on that city's literal downtown pin, so
replaying Tokyo was the same kerb, the same district mix and the same people every time.
And three backgrounds covered three of the five skills, leaving wheels and tech with no
opening that played to them.

**How.** `sim/start.ts` moves a **city-level** pick 1–4 km into one eighth of the compass,
area-weighted so most starts land out in the neighbourhoods, with a re-roll that never
returns the corner you are in. City-level is decided from the geocoder's class/type; a typed
address, a map tap and the device's own position are `exact`/`device` and never move — that
distinction is the whole safety of the feature and is tested both ways. Wheels gets
`WHEELS_BONUS_LEGWORK`=2 a day on top of the skill; tech starts knowing one still or grow-op
recipe (`TECH_START_RECIPES`), which is worth days of play and closes the recipe-unlock gap
the soak bot found.

**Files.** `sim/start.ts`, `content/cities.ts`, `content/backgrounds.ts`, `sim/generate.ts`,
`ui/components/Onboarding.tsx`, `sim/start.test.ts`, `sim/backgrounds.test.ts`.

**Watch out.** `generateWorld` seeds from the origin coordinates when no seed is passed, so
jitter changes the seed too — that is intended (a new corner is a new city), but it means a
"same city" replay is not reproducible unless you pass a seed.

---

## 2026-09-13 — Name groups, district flavour, and the first connection web

**What.** Names are drawn from eight cultural groups instead of two flat pools; districts
carry naming weights and a `closeness` value; NPCs gained `connections`.

**Why.** Picking first and last names independently produced Tony Byrne and Wei Marconi all
day, and the pools were small enough that a city repeated itself. Districts had no texture
of their own. And NPCs had no relationships with each other at all — `rel` is player-facing
only — so nothing could travel between people.

**How.** `content/names.ts` holds eight groups (Italian, Slavic, Black American, East Asian,
Latino, Irish, Middle Eastern, Anglo), each pool 2–3× the old size; `mkNpc` picks a group
first, weighted by the district, then draws both halves from it. `DistrictDef` gained
`nameGroups` (cosmetic, naming only) and `closeness` (social density, rolled per district).

The hard boundary, and the reason it is written down: a name group decides **names and
nothing else**. There is no ethnicity field on an NPC, and nothing that computes skills,
traits, nerve or trust reads a group. `sim/no-ethnicity-mechanics.test.ts` enforces it two
ways — identical rolls whatever a district is flavoured as, and a source scan that fails if
a group is ever mentioned on a line that works out a stat. If you add a district property,
keep that separation: `closeness` is a property of the *place*.

**Files.** `content/names.ts`, `content/businesses.ts`, `sim/types.ts`, `sim/populate.ts`,
`sim/connections.ts`, `sim/people.ts` (family agenda, gossip along ties),
`ui/components/NpcSheet.tsx`, `sim/names.test.ts`, `sim/connections.test.ts`,
`sim/no-ethnicity-mechanics.test.ts`, `docs/DESIGN.md` §3.2/§3.4/§3.6.

**Watch out.**
- `WORLD_VERSION` 6 → 7. Every existing save was dropped on deploy.
- Real map names are now reserved before procedural fill (`reservedReal` in `populateChunk`),
  because the filler could take "Ace Motors" two blocks before the real Ace Motors landed.
- Deliberately out of scope, phase 2: leverage plays on top of the graph — threatening a
  named relative, friend-referral recruiting, turning a rival's brother into an inside man.
