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

## 2026-09-15 — Dialogue that reads the history the game was already keeping

**What.** Every opening and result pool grown from 1–2 lines to 4–6, and `openingLine` now reads
three pieces of state it had never touched: a person's `ledger`, their `nemesis` record, and the
player's earned `street` name.

**Why.** The pools were the smaller problem — a player shaking down a second coward got the same
sentence, and by day forty a run had printed it a dozen times. The larger one is that the game
tracked a great deal about every relationship and the dialogue read none of it. What somebody said
to you was a function of their trait and your trust bar, so the conversation *after* you did them a
favour opened exactly like the one before it, and a hothead lieutenant who had beaten you three
times read from the same six sentences as a hothead shopkeeper met once. The recurring-antagonist
arc worked perfectly and sounded like furniture.

**How.**

- **Volume.** `OPENING` and `RESULT` filled out to 4–6 per key, same voice, same length, no new
  mechanics. `content/lines-volume.test.ts` holds a floor of 4 so a new trait key or approach
  cannot ship with one placeholder line.
- **A worse bug underneath it.** The index was `(w.day + n.id.length) % lines.length`. Npc ids are
  `n3` and `n47`, so `id.length` took about two values across the whole city and **everybody with a
  two-character id said the same sentence on the same day**. Filling the pools out would have
  hidden that. It is `hashString` over scene, key, id and day now — still pure, so reopening a
  sheet never rerolls — and the volume test also asserts the pools *reach* the player, because a
  pool of five that always prints entry zero is a pool of one.
- **The ledger clause.** The most recent entry within 20 days, `met` excluded, picked from a pool
  keyed by the entry's **kind** — a favour and a threat are different conversations, and the kind
  is the part worth saying out loud. `{when}` becomes the words somebody would use. The ledger's
  own `text` is not spliced in: it is narration ("You gave them $500.") and does not survive being
  put inside quotation marks. It fires at 45%, resolved deterministically, because somebody opening
  with the same favour nine visits running is a worse repetition than a small pool.
- **The nemesis pool replaces the trait pool** rather than adding to it: past `NEMESIS.known` the
  record is the thing in the room. `{name}` resolves through `nemesisName`, so the street's name for
  them is the dialogue's; lines that count the meetings are filtered out below two wins, because
  "we have done this 1 times" is worse than silence.
- **The reputation clause** is `lifestyleLine`'s pattern, deliberately, not a second mechanism —
  read one piece of player state, return a clause or nothing. First meetings only: a reputation is
  what people know about you when they do not know you.

**Numbers.** Honest 60-day curve **byte-identical** to baseline, verified by diff. 1364 → 1496
tests. Coverage table 44 → 47 rows.

**Files.** `content/lines.ts` (the pools, plus `NEMESIS_OPENING`, `REPUTATION_OPENING`,
`LEDGER_CALLBACK`), `sim/scenes.ts` (`pick`, `ledgerCallback`, `reputationLine`, the nemesis
branch), `sim/conversation.ts`, `sim/select.ts`, `content/glossary.ts`, `ui/components/SceneSheet.tsx`,
`scripts/bot/{policy,run,coverage}.ts`, `scripts/bot.test.ts`, `docs/DESIGN.md` §3.5b. Tests:
`content/lines-volume.test.ts`, `sim/ledger-callback.test.ts`, `sim/nemesis-dialogue.test.ts`,
`sim/reputation-opener.test.ts`.

**Watch out.**

- **The conversation screen was already printing `(Last time: ...)`.** Now that the opening speaks
  to the same entry in voice, that receipt is suppressed *for that entry only* —
  `sim/conversation.ts` asks `ledgerCallback` the same deterministic question and gets the same
  answer, rather than a flag being threaded between two files. On the days the callback does not
  fire, the receipt is still there, and a test holds both halves.
- **All six guards were mutation-tested**, including the original weak index: removing the ledger
  clause, making a nemesis fall back to the trait table, letting the reputation line fire on every
  meeting, shrinking a pool to one entry, collapsing the picker to `items[0]`, and restoring
  `(day + id.length)` each fail the relevant file.
- **Teaching the bot moved a scenario, and the suite caught it.** All three new coverage rows read
  ✗ first time — the bot only ever talked to shopkeepers it had already met. Sending it to a
  nemesis unthrottled displaced the ordinary conversation on most days of every scenario, which
  pushed `legacy` past the day it loses its player and broke the `succession` row. It is one day in
  five now. Loosening to one in three changed nothing, which is how it was established that **run
  length, not the bot's eagerness, is the limit**: a nemesis needs `NEMESIS.known` notoriety and
  sixteen days does not have it. So `a nemesis opener` joins `SLOW_OR_TERMINAL` and `SLOW_ROWS`,
  pointed at the `fortune`/60/seed-7 run two other rows already use — no extra soak.
- **Nothing here is new per-NPC state.** No `WORLD_VERSION` bump; every save loads, and every line
  is composed at read time from fields that already existed.

---

## 2026-09-15 — Per-crewmate kit, and a character sheet to put it on

**What.** `Npc` now carries its own `items` / `equipped`, exactly like `Player`. Kit can be bought
for a named crew member, equipped from a new per-person character sheet, and — the point of all of
it — an op's kit bonus now comes from whoever is actually on the op rather than always from the
player's pockets.

**Why.** "Give the good gun to the man doing the job" had no representation at all: the three kit
functions read `w.player.equipped` and nothing else, so the man holding the shotgun and the man
doing the job were the same person by construction. On a job with `minCrew: 3` the game already
says your hands are not what it is about, and then counted your gun anyway.

**How — the decision, stated rather than left to fall out.** A job carries **one item per category,
across everybody on it, whole**: one weapon, one tool, one vehicle, and where two people brought the
same kind of thing the **dearest** one counts, with its whole `mods` block — its help and its cost
together.

- *Not a sum.* Heat is multiplicative: five crew with a sawn-off each would be ×5.4 heat on one job,
  and `approachBias` feeds a `1 + bias` multiplier on every skill weight, so fifteen items of bias
  would swamp the roll outright. That does not need balancing, it needs not doing.
- *Not best-value-per-mod*, the other obvious answer. Taking the quietest heat off one gun and the
  biggest muscle off another lets you carry both and keep only the good half of each, which
  dissolves every tradeoff the catalogue was rebuilt on last pass.
- **Armour is out of the pool entirely.** Its only job-facing mod is a penalty for wearing it
  (`wheels −3` on a plate carrier) and its real effect, `cover`, is personal. Pooling it would let a
  second man in a light vest cancel the first man's plates. `kitCover` stays per person.
- **Whose hands:** the assigned crew, plus you unless you are unavailable. Ops resolve at End Day
  whether or not you can be there (`sim/tick.ts`), so a job running while you are in a cell or off
  the street is a real state — and it goes out on your crew's kit alone. This is about kit, not
  skill: `opChance`'s `minCrew: 0` rule for folding in the player's *skills* is untouched.

Mechanically, the three formulas moved onto a plain list of items (`skillBoostOf`,
`approachBiasOf`, `heatMultOf`) and **whose kit it is became the caller's question** —
`kitSkillBoost` for one person, `jobSkillBoost` for an op, `poolKit` for a fight at your door. That
is what stopped this forking the heat maths three ways. Every reader takes a `Kitted` defaulting to
`w.player`, so every old call site still reads "the player", which is what it always meant.

`buy_item` / `sell_item` take `forNpcId`, `equip` takes `npcId`; one gate (`handsReason`) covers all
three because they are the same physical act — your own crew only, alive, not in a cell. Buying
somebody kit bumps loyalty on the gift curve and goes on their ledger.

**Numbers.** Honest 60-day curve **byte-identical** to the pre-change baseline (day 60: $0 clean,
$212 dirty, paid $568, heat 3) — verified by diff, not by eye. Coverage table 42 → 44 rows; union
still "every system was exercised at least once". 1341 → 1364 tests.

**Files.** `sim/types.ts` (`Npc.items`/`equipped`), `sim/items.ts` (the rewrite: `Kitted`, `poolKit`,
`handsOn`, `jobKit`, `job*`), `sim/select.ts`, `sim/ops.ts`, `sim/combat.ts` (the three call sites),
`sim/actions.ts` + `sim/reducer.ts` (the per-person fields and gate), `ui/components/CharacterSheet.tsx`
(new), `ui/components/NpcSheet.tsx`, `ui/components/Kit.tsx` (the "Buying for" picker),
`ui/components/OpsTab.tsx`, `content/glossary.ts` (`jobKit`), `scripts/bot/policy.ts` +
`scripts/bot/coverage.ts`, `docs/DESIGN.md` §4.7d. Tests: `sim/npc-kit.test.ts`,
`sim/kit-migration.test.ts`, `ui/character-sheet.test.tsx`.

**Watch out.**

- **No `WORLD_VERSION` bump and no migration step, deliberately** — every existing save loads. The
  cost is that nothing anywhere may assume the arrays exist; `sim/kit-migration.test.ts` walks the
  whole kit surface against people who have neither field and then runs a day. One
  `n.equipped.length` in an uncovered path throws at End Day and takes the save with it.
- **The honest run needed an explicit gate.** `armTheCrew` is skipped when `c.reserve <= 0` (the
  existing flag for "this scenario runs jobs"). Without it the frozen honest close moved to $378
  dirty / heat 0 — a real, measured drift, caught by diffing the soak rather than by reading it.
- **All four guards were mutation-tested**: making the pool a sum, making the hands the whole crew
  instead of the assigned ones, making `equip` ignore `npcId`, and making an `Npc` array
  non-optional each fail the relevant file. A test that only checked the crew member's array would
  have passed against a reducer writing to both, so the UI test asserts the player's kit is
  *unchanged*.
- **Balance shift, on purpose and mild:** a `minCrew > 0` op that used to get the player's kit for
  free can now be beaten in a category by a crew member's dearer piece — and its heat with it. On an
  old save nobody has anything, so day one after this ships is identical to day zero.
- Deliberately out of scope: handing an item from your pockets straight into theirs. Kit reaches a
  crew member by being bought for them at a shop, which is one act in one place; an
  inventory-to-inventory transfer would need its own rules about who is standing where.

---

## 2026-09-15 — The map opens on the city, not on a guess (tablet fix)

**What.** The map now frames the whole city when a world loads, instead of jumping to a coordinate
at a hard-coded zoom. The legend no longer opens itself on wide screens. UI only — no sim, no save
change, no balance movement.

**Why.** Reported as "iPads and tablets, game doesn't work, map UI is fucked and bugged". It was:
`MapView` did `jumpTo(world.origin, 15.2)`. `world.origin` is where the *player* starts, not the
middle of the generated city, and 15.2 was a number picked by eye against a phone — so the more
screen you had, the more of it was empty. On an iPad in landscape the entire city sat in the top
third of the viewport with black underneath it. Tablets did not break anything; they made a
phone-era constant visible. Second half of the same bug: the legend started open above
`innerWidth >= 700` "for desktop", and every tablet is above 700, so a panel covered the top-left
corner of the map — on top of the grid-city banner, which lives in the same corner — from the
moment the game loaded.

**How.** A pure `cityFrame(world, box)` returns the bounds of every block centre plus a padding box
and a `maxZoom`; `frameCity` applies it with `fitBounds`. Three bounds on the fit, each of which
cost something to learn:

- **Padding is capped at a fifth of each dimension**, not a fixed pixel count. MapLibre refuses the
  *whole* `fitBounds` call when the padding box exceeds the canvas — no error the player sees, the
  view simply never moves. A hard 84px bottom throws on a phone in landscape with the keyboard up.
- **`maxZoom: 16.2`**, or a small starter city fits itself to the rooftops on an iPad Pro.
- **A floor at `LOAD_MIN_ZOOM` (12.5)** after the fit. Below it no chunks are fetched, so a very
  short viewport would frame the city beautifully and then quietly stop discovering streets.

Re-framing on a rotate is handled by the existing `ResizeObserver`, but only on a >60px shape change
(below that is just the HUD measuring itself) and **only until the player touches the map** — after
a drag or a pinch the view is theirs, and re-framing it on rotate would be a worse bug than the one
being fixed. Ownership is detected via `originalEvent`, which only a real gesture carries.

**Numbers.** Measured in Chromium against a generated world, markers in view: iPad portrait 30 → 49,
iPad Pro 41 → 133. Rotating landscape → portrait re-frames (zoom 14.48 → 14.12); rotating *after* a
player drag keeps their view. No page errors at 320×280, 844×390 or 507×1180.

**Files.** `ui/components/Map.tsx` (`cityFrame`, `frameCity`, the `ownedByPlayer`/`framed`/`lastSize`
refs, the `ResizeObserver` body), `ui/App.tsx` (`MapLegend` default), `ui/map-framing.test.ts` (new),
`docs/DESIGN.md` §5.5.4.

**Watch out.**

- **The soak cannot see any of this and never will.** The bot calls the reducer directly and never
  renders a map, so `npm run sim -- 60 7 all` reports exactly what it did before — 42 rows, union
  green, "every system was exercised at least once". That is not evidence about this change. The
  evidence is `ui/map-framing.test.ts` and screenshots at nine viewport sizes.
- **Both new guards were checked against the pre-fix code and fail there**, which is the only reason
  to believe they guard anything: restoring the fixed padding fails the 320×100 case, and restoring
  the width-conditional legend fails the overlay check.
- The legend check is deliberately blunt — it asserts `App.tsx` contains no `innerWidth` at all.
  `App.tsx` is the shell and the things sitting on top of the map, so nothing in it has a reason to
  measure the window; if that ever stops being true, the guard needs narrowing rather than deleting.
- The honest 60-day curve is **unchanged and must be** — nothing outside `ui/` was touched.

---

## 2026-09-15 — Real guns, real cars, and something to wear

**What.** The kit catalogue goes from 15 items to 35: every weapon family filled out with named
real-world models, a new **armour** category, and four vehicles where there was one.

**Why.** Each family was one or two items deep, so "which pistol" was never a question — there was
one. A shop screen with a single entry per idea is a list, not a choice.

**How — and the rule that keeps it from being reskins.** Inside a family, **price does not decide
the order**. That replaced a real invariant: the old test asserted a straight ladder, dearer meaning
louder and hotter, which was true of a one-deep family and false the moment there was a choice. A
Benelli costs more than an 870 and is *quieter and cooler* — it buys being a professional rather
than a headline. What price must still buy is a **peak**: the dearest in a family has to be best at
something, which is what the rewritten test holds.

| Family | Members | What separates them |
| --- | --- | --- |
| Melee | knuckles, tire iron, bat, razor, machete | the only group with anything for a *careful* job |
| Pistol | Beretta 92, Glock 19, SIG P226, suppressed .22 | noise, heat and price, not a ladder |
| Revolver | snubnose .38, magnum | own family: less gun, nothing left on the floor |
| Shotgun | Shockwave, sawn-off, 870, Benelli M4 | how much you'll pay to be less obvious |
| Rifle | SKS, hunting rifle, AR-15 | only the bolt gun buys *not being in the room* |
| Vehicle | motorcycle, sedan, van, muscle car | the fastest is not the one that leaves least behind |

**Armour is the exception that defines the categories.** Every other item exists to change how a
job goes; armour changes nothing about any job. No `approachBias`, no `heatMult` — the catalogue's
"helps one approach, hurts another" rule exempts it *by name*. Its whole effect is `mods.cover`,
summed by `kitCover` and added in `personalCover`: the one place the game subtracts a defence,
on the night somebody comes for you. Nothing that decides an op reads `cover`, so it cannot leak.

What it costs is a carry slot, and at the heavy end a real `skillBoost` penalty — a plate carrier is
`wheels −3`, because it does not make a burglary louder, it makes *you* slower.

**What I checked before touching, as asked.**

- **`EQUIP_MAX` stays 3.** Nothing breaks; the squeeze is the point — a vest on is a gun off.
- **`marketStock` needed no change.** The shelf table already generalised over the pool;
  `sim/market-stock.test.ts` now proves it at 60 shops × 3 kinds with a catalogue twice the size —
  full shelves, no duplicates, stable per shop, and 80%+ of the catalogue reachable somewhere.
- **Three things *were* keyed to the old single entries** and did break: the tests that used
  `'pistol'`/`'pump'`/`'getaway'` as stand-ins (renamed to real models), the icon table, and the
  `kit` cheat — see below.

**Files.** `content/items.ts` (rewritten), `content/items-variety.test.ts`, `sim/armor.test.ts`,
`sim/market-stock.test.ts`, `sim/items.ts` (`kitCover`), `sim/legacy.ts`, `ui/icons/paths.ts`,
`vitest.config.ts`, and id fixes across five test files.

**Watch out.**

- **The `kit` cheat quietly killed a coverage row.** It hands out one of each kind; adding a fourth
  filled all three slots, and the bot's `buyKit` only shops when it has somewhere to put things —
  so the whole `kit` row went dark with nothing failing. It now leaves one slot open deliberately.
  Worth remembering: that cheat had *also* been naming `'sedan'` before a sedan existed, handing out
  two things instead of three for who knows how long, silently, because it filters unknown ids.
- **`vitest.config.ts` now includes `content/**`.** The content tables have invariants of their own
  — a family of weapons that is secretly one weapon is a content bug — and the test belongs next to
  the table it guards.
- **Four emoji were too new** (🪒 🦺 🧥 🛡) and were swapped for Unicode 6.0 equivalents. The emoji
  is a fallback; the real icon is the SVG. Models inside a family **share their family's
  silhouette** on purpose: three pistols at 16px should read as "pistol" and let the label carry
  the model. Vehicles get four distinct drawings, because those genuinely differ in shape.
- **The honest 60-day curve moved, on some seeds a lot** — seed 7 cash 46 → 1, dirty 4,558 → 1,585,
  fear 26 → 45; seed 19 moved further. **Seed 3 is byte-identical**, which is the tell: this is
  shelf-dependent drift, not an economy change. The amplifier is the bot's own policy — `buyKit`
  buys *the most expensive thing it can afford*, and the catalogue now has scarier things in it, so
  the honest bot walks into its doorstep confrontations carrying more gun than it used to. Heat and
  fear follow from that (`kitHeatMult` is read by confrontations as well as ops). Medians across
  four seeds are unchanged in the ballpark: dirty ~2,570 before, ~2,260 after.

---

## 2026-09-15 — Gate fix: green tests, red exit code

**What.** `npm test` was exiting **1 with all 1,298 tests passing**, and the previous commit went
out on top of it. Fixed, and the way I missed it is worth writing down.

**How I missed it.** I ran the gate as `npm run typecheck 2>&1 | tail -2 && npm test …`. The pipe
made the chain see `tail`'s exit code, not `tsc`'s, so a typecheck failure — two unused bindings in
the new test file — read as a pass and I pushed. **Check exit codes, not the tail of the output.**

**The real failure underneath.** Once the typecheck was fixed, `npm test` still exited 1:
`scripts/bot.test.ts` had grown to ~70 seconds of synchronous soak runs and tripped vitest's worker
RPC timeout (`Timeout calling "onTaskUpdate"`). Every test passed; the run still failed. The cause
was the union test's fallback doing four separate 60-day soaks. Two of its rows — the fourth tier
and the upstart — now share one cached `fortune` run, which is honest (runs are cached by scenario,
days and seed) and takes the file back under the limit.

**Files.** `sim/kin-at-the-door.test.ts`, `scripts/bot.test.ts`.

**Watch out.**

- **That file is near a real ceiling.** It is ~58s of a ~60s suite. The next thing that needs a
  long run in it should share an existing one or go somewhere else; adding a fifth 60-day soak will
  break the gate again, and it will break it with everything passing, which is the confusing way.
- **Verified by exit code this time**: `typecheck=0 tests=0 soak=0`.

---

## 2026-09-15 — Somebody's brother

**What.** Put a job on a man who is close to one of your own people and that crew member is waiting
for you **before it goes out**, with four ways to answer for it — including handing them the job.

**Why.** Reported from play: a hit landed on a family member of a loyal crew member and the game
said nothing except a loyalty number afterwards. The web has been in `Npc.connections` since
generation and a hit has always been allowed to land on anybody; the two systems had simply never
met.

**How.** A new confrontation kind, `kin`, raised at **plan** time rather than after — afterwards
there is nothing left to decide, which was the whole problem. Who turns up is the most loyal crew
member tied to the mark, above `KIN.loyal` (55); below that a cousin they never see stays a line in
the log. Four answers:

| Answer | The job | The price |
| --- | --- | --- |
| **Tell them straight** | runs | charm against loyalty: they wear it (−14), or you lose them (−42 and a grudge) |
| **Let them handle it** | done, by them | −30 loyalty, a quarter of the heat, and a real chance they cannot |
| **Call it off** | aborted | he is still out there, and he was on that list for a reason |
| **Say nothing** | runs | −55 and a grudge when they find out |

"Let them handle it" is the one worth the feature. It is **cheaper** — no crew tied up, almost no
heat, nothing leading back — and what it costs is that you made somebody loyal to you do the worst
thing there is. Whether they can is **nerve alone**, never charm: it is the one thing you cannot
talk a person into being able to do, which is why it is offered rather than ordered. When they
flinch, the mark lives, holds a grudge, and knows exactly who sent them.

**Letting the day end is the 'say nothing' branch**, because walking away from somebody asking you
that is an answer.

No new state: it reads `connections`, moves `loyalty`, `grudge` and the ledger, and ends an op
through the same `aborted` status the abort button uses.

**Files.** New: `content/kin.ts`, `sim/kin.ts`, `sim/kin-at-the-door.test.ts` (15 tests). Changed:
`sim/types.ts`, `sim/actions.ts`, `sim/combat.ts`, `sim/reducer.ts`, `sim/select.ts`, and the bot.

**Watch out.**

- **The soak read ✗ on this for three attempts, and every one taught me something.** First I tried
  weighting `planAnOp`'s ranking toward it — that cost *two other systems* their coverage and was
  backed out; you do not fix reach by distorting a ranking everything else depends on. Then, as its
  own step, it still never fired: `idleCrew` is routinely **empty** at planning time because
  `promoteLieutenants` and `runTheEmpire` assign every last body first, so a one-hander never goes
  out. The step now takes somebody off a racket, once per run, the way a player would without
  thinking about it. Then it fired and *still* read zero, because the scene is raised mid-day and
  swept at End Day before the morning pass ever sees it — so the bot answers it there and then.
  **42/42 now**, nine scenes across the sweep.
- **The bot rolls its answer rather than taking the best odds.** Two of the four are flat 100%
  (they are decisions, not contests), so "best odds" called every job off and three branches never
  ran once.
- **`the fourth tier` moved to seed 7 in the union test, and that is not a fudge.** Tier 4 is gated
  on *standing*, not money: at seed 5 `fortune` ends on $259,000 having never become somebody the
  room would deal with — the gate working, not failing. It is still zero at **80** days there, so
  raising the day count is the wrong answer; the row is checked on seed 7, the seed
  `npm run sim -- 60 7 all` uses and where the full sweep reads 42/42.
- **Nothing in `/sim` changed for a player who never plans a hit on family**: the honest 60-day soak
  is identical.

---

## 2026-09-15 — The sweep: one more system with no door at all

**What.** Swept for the pattern behind the last two bugs. Found a worse one: **`buy_favour` had no
button anywhere in the app.**

**Why it was worth sweeping.** Two bugs in three days had the same shape — a control narrower than
the rule it was offering. The question was whether there were more. There were, and the worst was
not a narrow control but a missing one.

**How the sweep was done**, because grep only finds lines that *look* wrong:

1. **Every op target, programmatically.** For each op, compare what the planner would list against
   every target `can(plan_op)` actually accepts. Clean now, apart from two cases where the
   **reducer is looser than the picker** — it would accept a bank for `robbery` and your own crew
   for `mugging`. The picker is right in both; noted, not changed, because no player can reach it.
2. **Every conditionally rendered control, by hand.** `canDefect` and the fixer check match their
   reducer rules. `extortable` on the business sheet read only *half* the rule — the type's racket
   list, not its intersection with the tier — so it now reads `select.extortReason`. No live bug
   (no tier-3 type lists protection) but it was one content edit from being one.
3. **Every action id against the components.** This is the one that paid.

**What it found.**

- **`buy_favour` was unreachable.** It shipped as one of the five money sinks, its tests passed,
  the soak bot drove it directly, and the coverage table has read ✓ next to "buying a favour" for
  two passes. There was never a button. It is now on the NPC sheet beside Gift and Bribe, showing
  its own refusals — "they do not take money from people they do not know", "money will not touch
  a grudge" — because those two rules are what make it a sink with teeth rather than a shop.
- **`rename` was unreachable.** A player who typed their name wrong at the start carried it for the
  whole game. Now on the save card. The *street* name beside it stays unpickable: that one is
  earned.

**The guard.** `ui/every-action-has-a-door.test.tsx` reads every `{ type: '...' }` out of
`sim/actions.ts` and fails if no component mentions it. Crude — it counts a mention, not a working
route — and it would have caught all three of this week's bugs. Three actions are excused by name
with a written reason each; nothing goes on that list for being inconvenient.

**Files.** `ui/components/NpcSheet.tsx`, `ui/components/EmpireTab.tsx`,
`ui/components/BusinessSheet.tsx`, and `ui/every-action-has-a-door.test.tsx` (2 tests).

**Watch out.**

- **A coverage table cannot see this class of bug and never will.** It answers "was this system
  reached", and the bot reaches everything by calling the reducer directly. Every one of this
  week's three bugs was found by a person playing. The new test is the first thing in the repo that
  asks the other question.
- **The two reducer-too-loose cases are latent, not harmless.** Nothing builds op actions
  programmatically today; the day something does, `robbery` on a bank becomes reachable.

---

## 2026-09-15 — You could not whack the man who snitched on you

**What.** A crew member who betrayed you and walked could not be selected as the target of a hit,
a kidnapping or a frame. Reported from play.

**Why.** The ops planner carried its own hard-coded list of who could be targeted —
`boss | lieutenant | owner | official | soldier` — and **every** route out of your crew leaves
somebody on `role: 'patron'`: the betrayal event, being fired, walking out on low loyalty, a skim
confrontation that went the wrong way, a deposed rival, an heir. So the one person a player most
wants to reach was the one person they could not see, while a hundred and seventy strangers stayed
on the list.

The reducer had no such rule. Measured on a fixture matching exactly what `betrayal:cut` leaves
behind: **op unlocked, `can(plan_op)` → true, planner offers them → false.** Nothing refused the
job; the picker simply never showed the name, and there is no other route to targeting an NPC.

**How.** `select.opNpcTargets(w, kind)` owns the list now, for the same reason the recruit button's
role check moved into the sim two commits ago: a permission and the control that offers it must not
be two lists. The rule is **the people who matter in the city, plus anybody you have actually dealt
with** — history being `ledger?.length || grudge`, both already written by the game for its own
reasons, so no new tracking. A recruit writes a ledger entry the day they join, which catches an
ex-crew member even when they left without hard feelings.

Two things that make it usable rather than merely correct: the **per-op requirements come first**
(a job wanting somebody in a cell offers the cell, one wanting somebody whose books you have read
offers those, one wanting an official offers officials), and **history sorts to the top**, because
the screen cuts at forty names and the person you came looking for should not be on page four. On
the reported fixture the snitch now lands at position 1 of 174.

**Files.** `sim/select.ts` (`opNpcTargets`), `ui/components/OpsTab.tsx`, and a new
`sim/op-npc-targets.test.ts` (10 tests).

**Watch out.**

- **The test was written to fail first**: all 10 fail against the previous commit, all 10 pass
  after. The load-bearing one asserts the planner and the reducer *agree* rather than asserting a
  role list, so the two cannot drift apart again without something going red.
- **This is the second instance of one pattern in three days** — the recruit button was the first.
  A component holding its own copy of a rule the reducer already owns, narrower than the reducer,
  with no fallback path. Worth grepping for a third before it is reported: the shape to look for is
  a role or status check written inline in a `.tsx` that decides whether a control appears at all.
- **The soak bot cannot see this class of bug.** It builds its own target lists and calls the
  reducer directly, so it never walks through the picker. Both of these were found by hand, and
  that is not luck — coverage measures whether a system was reached, not whether the route a player
  takes to it works.
- **Nothing in `/sim` changed behaviour**: `opNpcTargets` is a read-only helper, and the honest
  60-day soak is identical.

---

## 2026-09-15 — The Empire tab folds up

**What.** Every list heading on the Empire tab is now a control: tap it and the section shuts.

**Why.** That tab is where everything lands that does not belong on the map — holdings, stash,
businesses, the wire, the news, what a fortune is for, rackets, safehouses, cold cases, the record,
the log, the save card. On a phone most of a visit was scrolling past the parts you were not there
for, and every pass that added a system made it longer.

**How.** One `Section` component in `ui/components/Act.tsx`, and three rules that are the
difference between this being an improvement and being a locked drawer:

1. **A shut section still says what is in it.** The count sits on the heading, outside the body, so
   "Rackets 12" reads without opening anything.
2. **Shut is `hidden`, not unmounted.** Find-in-page and a screen reader's own search still reach
   the content, and nothing re-mounts or loses its place when it opens. These lists are small and
   capped (the log shows 25 until you ask for more), so there is no render cost worth trading for.
3. **The choice sticks** — `folds` in `ui/store.ts`, persisted to `localStorage`, so the screen is
   arranged once rather than every visit.

`folds` records **only what the player actually changed**. An absent id means "this section's own
default", so a default can be changed later without fighting a preference somebody set months ago.

Defaults split on what a section is *for*: things you act on open (holdings, stash, businesses, the
wire, rackets, safehouses, cold cases), things you read shut (the record, the log, the save card).

**Files.** `ui/components/Act.tsx` (`Section`), `ui/store.ts` (`folds`, `toggleFold`, `isOpen`),
`ui/components/EmpireTab.tsx`, `ui/components/Wire.tsx`, `ui/components/Inventory.tsx`,
`ui/components/TrophyScreen.tsx`, `ui/styles.css`, and a new `ui/empire-folds.test.tsx` (9 tests).

**Watch out.**

- **Three headings were deliberately left alone**: "Getting out" is a short conditional card that
  only appears near the endgame, and "What you know" and "Where it is" are sub-headings *inside*
  sections that already fold. Folding a section inside a folded section is furniture, not control.
- **`Term` gave way to `Info` on the Stash heading.** The heading text now lives inside the fold
  button, and `<Term>` is itself a button — nesting one inside another is invalid and neither
  clicks. The `<Info>` dot beside it opens the same glossary entry, which is what every other
  section heading already used.
- **The test lists the defaults explicitly** rather than reading them off the components, so a
  default that changes silently fails a test. Silently changed defaults read to a player as "the
  app forgot my settings", which is worse than the scroll this replaces.
- **Nothing in `/sim` changed**: the honest 60-day soak is identical to the run before this.

---

## 2026-09-15 — The computer store, and four pieces of tech

**What.** A third kit shop — tech and only tech — and the items to stock it.

**Why.** Kit had two shops and they were the same shop with a different filter: a pawn shop showed
what it was allowed to, a back room showed everything. Nothing in the city sold to the player who
was building toward the wire, and the tech shelf itself was two items deep (a burner and a laptop)
against eleven weapons.

**How.**

- **`computer_store`**, tier 1, alongside the pawn shop and the phone shop. Its owners are a
  little harder than a phone shop's (`nerve` 45 vs 35) — the man who builds machines for a living
  has met people like you. It appears in downtown, market, heights and the projects.
- **The three shelves are one table now** (`SHELVES` in `sim/items.ts`) rather than an `open`
  boolean and a branch, so a fourth shop is a row and nothing else:

  | Shop | Shelf | Lines |
  | --- | --- | --- |
  | Pawn Shop | anything not under the counter | 3 |
  | Computer Store | tech only, none of it under the counter | 4 |
  | Back-Room Market | everything | 5 |

- **Four tech items**, each a tradeoff rather than a rung, per this file's own house rule:
  **Signal Fob** (tech +2, quiet and inside work, useless in a fight), **Rogue Hotspot** (the best
  inside-job item there is), **Desktop Tower** and **Card Skimmer**.
- **The tower is the answer to "a desktop should beat a laptop".** It is tech +4, the most raw
  tech you can own, and the whole wire lane is measured against it — but it is a *tower*: it takes
  one of your three carry slots and makes a job you walk to go worse, badly so if you go in loud.
  Work done at a desk does not care. Best thing you can own, worst thing to be holding when a door
  opens.
- **The skimmer keeps the back room's edge.** It is the only tech that makes the law *worse*
  (heat ×1.2, because holding it is a charge on its own) and the only tech marked `underCounter` —
  so "tech, all of it legal" stays a real distinction rather than a flavour note.

**Files.** `sim/types.ts`, `content/businesses.ts`, `content/names.ts`, `content/items.ts`,
`content/glossary.ts`, `sim/items.ts`, `ui/icons/paths.ts` (five new drawings), and a new
`sim/computer-store.test.ts` (15 tests).

**Watch out.**

- **The honest 60-day curve moved: cash 43 → 46, dirty 6,297 → 4,558, fear 12 → 26.** Rackets and
  control are unchanged. This is stream drift and nothing else — a new entry in a district's
  weighted mix changes the total weight, so every draw after it shifts. There is no way to add a
  business type that appears in the world without this; the landmark pass avoided it only by
  *converting* an existing building rather than adding one.
- **Six tests broke on that drift and every one of them was brittle rather than wrong.** Worth
  reading, because the pattern will recur: `softTarget` picked "the first unprotected place on the
  block" and got an importer, where fear is not a door at all; `placed` set a faction's influence
  to 60 *on top of* whatever was already there and produced an informant in the wrong outfit; a
  tier-2 owner's nerve is `gauss(72, 15)` and the test asserted a floor 0.8σ down, so it was always
  going to fail eventually — with a value that was never wrong. Each is now pinned to what it
  actually meant (a tier-1 target, a cleared block, a claim about the distribution), which makes
  them stronger than before, not weaker. **None of the fixes loosened an assertion about the game.**
- **Three coverage rows needed longer runs in `scripts/bot.test.ts`.** The full sweep is still
  41/41 at sixty days, but sixteen days on the canon seed stopped reaching the fourth tier, the
  upstart and succession. They use the existing `SLOW_ROWS` fallback with day counts measured to be
  the shortest that work (40, 40, 32) rather than rounded up, and the runs are cached so the two
  `fortune` rows share one. Adding rows to that list to make a red test green is still the thing
  not to do — these were each verified reachable first.
- **`WORLD_VERSION` is untouched.** A save made before this loads fine; it simply has no computer
  stores in it, because the city is generated once.

---

## 2026-09-15 — Two bugs in the recruit flow, found by hand

**What.** You could not recruit most people, and for two roles the button was not there at all.
Both found by playing, not by the sweep.

---

### 1. The door checked the hardest approach, not any approach

Tapping **Recruit** opens a conversation, and the conversation is where you pick *how* to ask —
a wage (`cut`, $200), a straight pitch (`promise`), or fear (`lean`). The door check called
`gate(w, sceneAction({ … }))` with **no approach**, and `recruit` is the one scene whose gate turns
an absent approach into a specific one: it defaults to `promise` and runs `concessionReason`
against it. Fail that — no favour done, no leverage held — and the button was disabled outright.

So a player with **$5,000 in their pocket and the whole street frightened of them** could not
recruit an ordinary patron, because the only door being tested was the one that wants a favour.
The other two are real, already-coded, and need neither. The conversation never opened, so the
choice was never offered.

**Fix.** The door tries every approach in `APPROACHES[scene]` and opens if any one passes. When
none do it reports what each would have taken, deduped — the single-reason case (no AP, not here,
nobody home) reads exactly as it always did. Safe for every other scene: each of those has at
least one ungated approach, so their doors behave identically. Recruit was the only scene where
*all three* approaches are individually gated, which is why it was the only one that broke.

**And the other half of it.** `talkOptions` never set `disabled` on a closing approach, so inside
the scene all three rendered live and the shut ones refused on tap (with a toast). That was
survivable while the door only let through players who could use `promise`; it is not once the
door opens for somebody whose only route is the wage. `SceneSheet` now asks the reducer's own
`resolve_confrontation` gate per move — which already delegates to the scene's rules — so the menu
and the door are asking one question, and a shut approach shows its reason where its cost goes.

### 2. The sheet's role list was narrower than the reducer's

```
NpcSheet:  (n.role === 'patron' || n.role === 'owner') && !n.crew
reducer:   ['patron', 'owner', 'soldier', 'fixer'].includes(n.role)
```

A **fixer**, or a **soldier who belongs to no faction**, got no Recruit button at all — not
disabled, absent — although the reducer would happily have run the attempt. `NpcSheet` is the only
place Recruit is surfaced anywhere in the app; there is no fallback through `CrewTab` or
`BlockSheet`.

**Fix.** `recruitRoleReason(n)` in `sim/standing.ts` holds the rules once — the four roles, nobody
already on your books, no soldier in somebody else's colours — and the gate and the button both
read it. A permission and the control that offers it should never be two lists.

---

**Files.** `sim/standing.ts` (`recruitRoleReason`, `RECRUITABLE_ROLES`), `sim/reducer.ts` (the
`talk` door, the recruit gate), `sim/select.ts`, `ui/components/NpcSheet.tsx`,
`ui/components/SceneSheet.tsx`, and two new tests: `ui/recruit-button.test.tsx` (12) and
`sim/recruit-roles.test.ts` (7).

**Watch out.**

- **Both tests were written to fail first.** Against the previous commit, 13 of the 18 fail; all 18
  pass after. If you are changing this area, check they still fail against a reverted fix — a
  regression test that passes either way is not one.
- **The soak bot could never have found this**, and that is worth understanding rather than
  treating as bad luck. It calls `{ type: 'recruit', npcId }` **directly**, never through the
  `talk` door, so it walks past the broken gate entirely. Coverage tables measure whether a system
  was *reached*, not whether the route a player takes to it works.
- **Deliberately left alone: the bot still only ever tries `promise`.** Its own recruit call passes
  no approach, so two of the three routes have never been exercised by a soak. Teaching it to pay
  or to lean would change how many people the `honest` run ends up with, and that curve is frozen;
  it wants a scenario, not a tweak to the measuring stick. Noted here so the next session knows the
  gap is known rather than missed.
- **No balance changed, and `WORLD_VERSION` is untouched.** The honest 60-day curve is identical.

---

## 2026-09-15 — The log was lying about its own numbers

**What.** Every figure a log line prints is now the figure that actually happened. It was not:
a job announcing **"+16 heat"** was routinely putting 9 on the bar.

**Why.** `addHeat` is the only door heat comes through and it applies five multipliers on the way
in — working alone (×0.75), bought legitimacy, the hour, home turf (×0.8), a school on the corner
(×1.5), with a floor under the lot. Every call site printed the figure it *passed in*. The lone-wolf
and legitimacy discounts have been there for two passes and time-of-day for one, so the gap has
been widening quietly the whole time. The same hole existed at every clamp: "+25 loyalty" at 96 is
+4, "−15 heat" at heat 5 is −5, "+10 respect" at 100 is nothing at all.

**How.**

- **The mutators return what landed.** `addHeat` returns the applied delta after multipliers *and*
  the 0–100 clamp; `loseHeat`, `gainFear`, `gainRespect` and `bumpLoyalty` are its siblings for the
  other clamped stats. `statNote(applied, label)` builds the `" (+9 heat)"` parenthetical and
  returns **empty** when nothing moved — "(+0 loyalty)" is noise, and a figure the bar did not move
  is worse.
- **The multiplier stack is now one piece of arithmetic**, `heatMult(w, blockId)`, pulled out of
  `addHeat`. `addHeat` applies it and `select.opHeat` predicts with it, so the **planner** stopped
  lying too: it printed `def.heat` raw next to "Difficulty 60", which is the job's rating, not a
  promise. `opHeat` leaves out only the clean-job discount, because nobody knows before the night
  whether it went that well.
- **`OpResult.heat` is overwritten with the applied figure** before the result is stored, so the
  ops-tab card, the log line and any later reader all say one number.
- **Two things are deliberately not printed as figures**: a `spreadRep` fear number and an
  `adjustRel` trust number. Both are capped per person by what the act cost and by how well the
  person knows you, so there is no single number anybody got. Those lines now say what happened.
- **The encounter that bypassed `addHeat`** — a near miss with a hunter wrote `w.player.heat`
  directly — goes through the front door like everything else.

**Twenty-six log lines across nine files**, plus three screens.

**Files.** `sim/util.ts` (the helpers and `heatMult`), `sim/select.ts` (`opHeat`), `sim/ops.ts`,
`sim/events.ts`, `sim/production.ts`, `sim/reducer.ts`, `sim/tick.ts`, `sim/people.ts`,
`sim/hostages.ts`, `sim/encounters.ts`, `sim/commission.ts`, `ui/components/OpsTab.tsx`,
`ui/components/OpTree.tsx`, `ui/components/EmpireTab.tsx`, and a new `sim/honest-numbers.test.ts`
(11 tests).

**Watch out.**

- **The guard is a grep over the source.** `sim/honest-numbers.test.ts` reads every non-test `.ts`
  and `.tsx` file and fails on any `(+N heat)`-shaped literal. It found four I had missed by hand
  on its first run, which is exactly why it exists: the mutators were easy to fix once, and the
  real failure mode is a new line next year with a figure typed into it. If you add a line that
  legitimately cannot name a number, phrase it in words rather than adding an exception.
- **Numbers in the log got smaller, and nothing got easier.** No balance changed — the multipliers
  were always applied. Only the reporting was wrong. A player who thought heat was cheaper than the
  log implied was right.
- **The honest 60-day curve moved by $3** (cash 40 → 43, everything else identical), from routing
  that one encounter through `addHeat`: it now puts heat on the block as well as the player, as
  every other source always has.
- **`scripts/bot.test.ts`'s union test gained one targeted long run.** Faction-vs-faction war does
  not conclude inside sixteen days, so that row alone is checked with a sixty-day `ambitious` run
  rather than by weakening the assertion. **Do not add rows to that list to make it green** — if it
  fails, faction independence has actually broken.

---

## 2026-09-15 — The map, in colour, and sooner

**What.** Business markers appear further out before collapsing to a count badge, and each one is
now coloured by its tier.

**Why.** Two complaints about the same screen. The icons only turned up once you were practically
on top of a single street, and when they did they were all the same near-white — a grey field with
numbers on it, when the map is the thing you spend the whole game looking at.

**How.**

- **`MARKER_BLOCK_PX` 96 → 64.** That is the on-screen width a block has to reach before its
  businesses draw as their own icons. 96 was a block filling most of a phone; 64 hands over a
  little over half a zoom level earlier and still leaves more than twice the 26–28px chip, so a
  marker cannot spill onto its neighbours and a busy block's ring of them does not overlap itself.
- **Colour by tier** — slate / teal / terracotta / purple for street / established / institutional
  / chartered, as `--tier-1`…`--tier-4` in `styles.css` and `.biz-marker.t1`…`.t4` on the chip.
  Tier is the one thing the map could not otherwise tell you: block fill already says who holds
  the ground, but nothing said which of the forty shops on it was a bar and which was a merchant
  bank. The glyph is stroked in `currentColor`, so setting `color` on the chip paints the drawing.
- **The ramp may not borrow gold or law blue**, and a test enforces it. Gold is always "yours" and
  blue is always the law; a tier wearing either would read as a claim about ownership or about the
  police. `.yours` and `.sel` still override the tier hue — whose it is beats what it is.
- **The legend gained a second key** (*Ground* and *Places*), reading its tier rows off `TIERS` so
  a fifth rung would appear without anybody remembering to come back for it. Tier swatches are
  outlined rather than filled, because a marker is a hairline chip with a coloured drawing in it.

**Files.** `ui/components/Map.tsx`, `ui/styles.css`, `ui/App.tsx` (`legendKeys` extracted so the
legend's contents are testable without a click), `content/glossary.ts`, and a new
`ui/map-markers.test.tsx` (6 tests).

**Watch out.**

- **The glossary's `bizTier` entry was a pass out of date** — it still described three tiers after
  tier 4 shipped. Fixed here along with the colour key, but it is worth knowing that the
  player-facing explainer went stale without anything failing.
- **`ui/map-markers.test.tsx` reads `styles.css` as text.** That is the only way to assert a CSS
  token exists from a unit test, and it means renaming `--tier-N` or `.biz-marker.tN` fails the
  test rather than silently un-colouring the map. If you restructure the stylesheet, that is the
  file that will tell you.
- **Nothing in `/sim` changed**: the honest 60-day soak is identical, down to the dollar.

---

## 2026-09-15 — What a fortune is for, what you can lose, and a city that does not wait

**What.** Seventeen things in one pass, in three groups: five **money sinks** so late cash has
somewhere to go; four **stakes** so there is something to lose; three **world-life** systems so the
city moves without you; and five pieces of **content** so there is texture between the systems.

**Why.** The game had two holes that had been open for four passes. Money stopped mattering around
the point you had enough of it — nothing above tier 3 to buy, nothing personal to spend on, no way
to convert a pile into anything permanent. And nothing was ever *at risk*: you could lose a racket
or a crew member, never the thing itself, and there was no ending of any kind at either end.

---

### 1. The five money sinks

| Sink | What it buys | Where the numbers live |
| --- | --- | --- |
| **Tier 4** | casino / merchant bank / shipping line / development co. | `content/businesses.ts` |
| **A favour** | somebody important owes you one | `FAVOUR_PRICE` |
| **Lifestyle** | home, car, security — 3 ladders × 3 rungs | `LIFESTYLE` |
| **Legitimacy** | a real discount on heat | `LEGITIMACY` |
| **Ceilings** | permanent headroom on crew and safehouse caps | `CEILING` |

**How, and what each one was chosen against.**

- **Tier 4 is gated arithmetically**, not with a hardcoded check: `standingOf(respect, fear) =
  respect + fear / 2` against the tier's `standingFloor` of 55, the same shape `nerveFloorFor`
  already used for tiers 2 and 3. The test of whether a gate is really arithmetic is whether a
  tier 5 would need a new branch. It would not. `TIER_EXCLUDES[4]` leaves only laundering — the
  point is owning one, not the racket inside it.
- **A favour plugs into `personalPull()` and `owedToThem`** rather than being a second relationship
  system, so a bought favour and an earned one are the same thing at the point of use. Price
  escalates ×3.2 each time, `minTrust` 15 means you cannot buy in cold, and a grudge is not for
  sale at any price.
- **Lifestyle is not a vanity screen**: `securityCover` and the home rung feed `personalCover`,
  which is subtracted on the night somebody comes for you. That is the whole reason it exists.
- **Legitimacy is in real tension with the rest of the game** — the money that buys it is the money
  you made generating heat. `legitimacyHeatMult` multiplies inside `addHeat` down to ×0.55 at the
  cap, decays 0.9/day so it is a standing cost, and `LEGITIMACY.heatFloor` (0.4 of the **raw**
  figure, applied last) is what stops this and `LONE_WOLF.heat` together deleting the police.
- **Ceilings raise caps that already existed** rather than adding new ones. Extra beds fold into
  the arithmetic `assign` already enforced, via a new `bedsTotal()` that replaced three copies of
  the same sum.

### 2. Stakes and legacy

**Succession — the decision, stated up front because it was made up front.** *Control genuinely
passes: same save, same world, new protagonist.* Not an epilogue. `succeed()` turns the old player
into an ordinary dead NPC (so old log lines and ledgers still resolve) and hands the outfit to the
best heir by `heirs()`: their skills replace yours, respect and fear inherit at 0.45, the **street
name and the legitimacy are lost** — those were yours, not the outfit's — and the blocks, rackets
and estate are all still there under a new name. With nobody fit to take over the game ends
(`gameOver.reason = 'gone'`). The reasoning is in the header comment of `sim/legacy.ts` so it
cannot drift out of the code.

**They come for you.** Past the `named`/`connected` milestone a nemesis stops waiting. It queues an
ordinary confrontation of kind `'you'` and a loss runs `landOnPlayer`: `rng.int(0,100) +
severity*30 - personalCover(w)` — under 45 you are walking, 45–78 puts you in a room for days and
takes 30% of your dirty, over 78 is a killing.

**Somebody to protect.** One person outside all of it, generated with the world and wired into the
neighbourhood web like anybody else. Deliberately **not a game piece**: no racket, no assignment,
no stat you spend. What they are is the softer target (a hunter goes for them 45% of the time when
there is one) and the thing `GO_STRAIGHT` requires you to have.

**Getting out.** $750,000 clean, nothing dirty, heat under 15, 45 legitimacy, somebody to go
straight *for* — all five at once for fourteen days, with the clock resetting the moment one
lapses. A real epilogue, not a stat moving.

### 3. A world that does not wait

- **Factions act on their own**: a **grievance** starts a war for a reason, a **sit-down** ends
  one, and a war with a clear winner **absorbs** the loser's ground, soldiers and people. All
  three are written with the stance/standing machinery that was already there.
- **An upstart** starts at one soldier on day 12 and grows on its own money — a race, not a siege.
- **Time of day**: `w.hour`, four dayparts, each buying and costing *different* things. Night is
  +9 chance, ×0.8 payout, ×0.7 heat, ×1.25 police; afternoon is the mirror. An op takes the hour it
  was **created** with.

### 4. Content

Five **landmarks** with a job that exists only there; one-off **specialists** hired for one night
through the existing recruit/trust/leverage machinery, each with a reliability under 1; a **news
ticker** built purely off `w.log`; **street encounters** at 13% a move; and **the record**, a
trophy screen aggregated entirely from the log, the ledgers, the ops and the counters — no new
state, which is what makes it a file somebody kept on you rather than a scoreboard.

---

### What the soak said, and the two bugs it found

`npm run sim -- 60 7 all` now reports **41/41 systems** (was 25/25 against a smaller table), and
**53 distinct op kinds** against 41 before this pass; ops never run fell 29 → 17. Getting there
needed three new scenarios and two real fixes:

1. **`comeForThePlayer` was dead code for anybody with a crew.** It was written as the last arm of
   the `actAgainstPlayer` chain, and the racket/business/crew arms above it cover every roll a
   player with an outfit can produce. So the one thing a nemesis passing `named` is *for* never
   happened. It now goes **first** in that chain — it is the rarest act in there (6%/13%) so the
   ordinary acts barely notice, and it is the right order anyway: somebody who has decided to come
   for you personally does not go and lean on one of your bars instead.
2. **The soak played on past the end of the game** — thirty-six days of "The game is over." in the
   log and nothing else. `run.ts` now stops on `w.gameOver` and names which ending it was.

New scenarios, each existing because the thing it tests is structurally unreachable otherwise:
`fortune` (money, and everything meant to absorb it), `straight` (the clean ending — no ops, no
crew, because the four conditions are hostile to an ordinary day), `legacy` (a nemesis and
**nothing bought to stand between you and them** — a bot that had bought the security ladder
survived nine attempts in a row, which is the mechanic working).

**Files.** New: `content/fortune.ts`, `content/landmarks.ts`, `content/specialists.ts`,
`content/timeofday.ts`, `sim/fortune.ts`, `sim/legacy.ts`, `sim/upstart.ts`, `sim/specialists.ts`,
`sim/encounters.ts`, `sim/news.ts`, `sim/trophies.ts`, `ui/components/NewsTicker.tsx`,
`ui/components/TrophyScreen.tsx`, and eighteen test files. Changed: `content/businesses.ts`
(tier 4, `standingFloor`, `standingOf`), `sim/tiers.ts`, `sim/util.ts` (`addHeat` ordering),
`sim/generate.ts` (landmark conversion, the loved one), `sim/factions.ts`, `sim/combat.ts`,
`sim/reducer.ts` (six new actions), `sim/tick.ts`, `sim/select.ts`, `ui/components/OpsTab.tsx`,
`ui/components/EmpireTab.tsx`, and the bot (`scripts/bot/*`, `scripts/bot.test.ts`).

**Watch out.**

- **No `WORLD_VERSION` bump.** Every field added this pass is optional; old saves load and behave
  exactly as before until they earn one.
- **The honest 60-day curve moved, and this entry is where that is stated.** cash 45 → 40, dirty
  4,259 → 6,297, rackets 5 → 4, control unchanged at 15.6%. **This is stream drift, not a balance
  change**: the loved one is generated through `mkNpc`, which consumes RNG, so every draw after it
  shifts. Measured across four seeds before and after, the medians are 4,474 and 3,609 dirty —
  the same distribution, and seed 3 alone swings 47,737 → 920 in one direction while seed 7 swings
  the other. Do not read a balance change into it. The landmark conversion was written to consume
  **zero** RNG for exactly this reason; the loved one could not be, because they are a person.
- **`scripts/bot.test.ts`'s coverage contract changed shape.** "The `everything` scenario touches
  every system" stopped being possible once the game grew endings — a run that goes straight has by
  definition stopped earning. The contract is now the **union across scenarios**, with `everything`
  keeping a weaker one, and the eight excluded rows are excluded for stated structural reasons
  rather than for being flaky.
- **Faction-vs-faction war is slow by design** and does not show up in a sixteen-day run. It is
  reliable in a sixty-day `ambitious` run and in the full sweep. If you shorten the sweep, expect
  that row to go dark.
- **`count_night` needed the bot taught to case a joint**, which it had never done in its life. It
  walks a landmark every fourth day now. That is the only reason all five landmark jobs run.
- **The heat stack order matters and is not obvious**: lone-wolf ×0.75, legitimacy, daypart,
  home-turf ×0.8, school ×1.5, and *then* the floor against the raw figure. Changing the order
  changes which discounts compound.

---

## 2026-09-15 — The crash that keeps coming back, two answers to pressure, and a lane of your own

**What.** A reproducible crash and its whole family, plus six things playtesting asked for: an
active answer to rising heat, a solo hedge against a bust, a street name for the player, real
closure when a faction is beaten, a picture of the social web, and an identity for going solo.

---

### 1. The crash, and the pattern under it

`offer_sale:buy` read `w.factions[biz.protection.factionId].standing[PLAYER]` without checking the
protector still existed — reproducible on `everything`, seed 33, by day 60.

**The sweep found the real cause, which is a type-level hole, not a bad line.** `FactionId` is
`Id`, and three populations wear it: `PLAYER`, a faction in `w.factions`, and a **street crew** in
`w.crews`. Factions never vanish — they are marked `alive = false` and left in place — but crews
are genuinely `delete`d. And crews take protection on businesses exactly like anybody else
(`crews.ts`), so a deleted crew's id sits on `biz.protection` for ever. That is all three crashes
this session: `buy_business` on a crew id, `patronTip` on a dead lieutenant, and this one.

So the fix is two functions rather than a third guard on a third call site:

- **`releaseGround(w, id)`** — nothing may still point at an outfit that is gone. A faction's death
  already did this inline; a crew's dissolution did not. Now called from both.
- **`outfit(w, id)` / `bumpStanding(w, id, by)`** — a read that finds nothing answers instead of
  throwing, because line 1 will be missed again one day.

Swept call sites: `events.ts:344` (the reported one), **`ops.ts:337`** (the same read, on a
takeover — the second live instance), and `select.stanceWithPlayer`, which indexed `w.factions`
unguarded and is called with crew ids. `sim/stale-faction-refs.test.ts` covers both defences and
plays seed 33 for sixty days. The sweep was then verified empirically as well as by grep: **9
scenarios × 12 seeds × 60 days, 108 runs, no crashes.**

### 2. Lay low

The heat-60 warning has said *"Lay low, bribe the captain, or pay a sergeant"* since the game had a
heat meter, and only two of those three existed. `lay_low` is paid for in the thing the player
actually has — **their own turns**: while you are under the day arrives with no AP and no legwork,
heat falls `LAY_LOW.heatPerDay` on top of the ordinary decay, and the street rates you lower for
being nowhere. Cash on top; rent and wages do not stop for you. It needs nobody, which is exactly
why it belongs next to the bribe rather than inside it.

A week under is roughly 60 points of distance and most of a fortnight's earning. `sim/lay-low.test.ts`.

### 3. The hole in the wall

A bust seizes 80% of dirty cash. An outfit absorbs that; one person has one pocket. `cache` is the
hedge, and it is **solo by construction rather than by a flag**: capacity falls `CACHE.perCrew` per
body alive and out of a cell, and is zero by the fourth. That is the honest reason a lone operator
can hide money and an outfit cannot, and it leaves a bust's stakes intact for everybody else. They
still find it `CACHE.bustChance` of the time — a hedge, not immunity. People in a cell do not count,
so a bust *widens* the hole afterwards, which is when it matters most.

### 4. A street name for the player

A lieutenant who kept turning up earned a name that replaced theirs everywhere; the player stayed
whatever they typed at the character screen. `playerName(w)` closes it through the **same**
function — `withNickname`, factored out of `nemesisName` — so the two cannot drift.

**Which pool it draws from is the point.** Fear and respect are two different ways of being
somebody and nothing has ever read the difference out loud. Ahead on fear by `STREET_NAME.margin`
and you are *the Hammer*, *Sunday*, *Cold*; ahead on respect and you are *the Mayor*, *the Deacon*,
*Pop*; neck and neck and the street just calls you *Big*. Set once, deterministic from the name, and
`select.factionName(w, PLAYER)` picks it up — which is how it reaches the map legend, holdings and
the faction screens without any of them knowing it exists.

### 5. Beating somebody actually ends

The only death was bleeding out (`soldiers <= 0 && cash < 0`); rebuilding needs `cash > 6000`.
Anything between those two with nobody on the street could **neither die nor recover** — a husk,
still nominally at war, for ever. That is the gap.

`checkDefeated` uses the street condition plus the one thing that undoes it: no soldiers, no blocks,
no lieutenant still walking, **and not enough left to hire anybody**. That last clause came out of
writing the test — the first version asserted a healthy bank balance should not save an outfit, and
the sim disagreed, correctly: with money and nobody they are between hires, not beaten.

Their ground goes somewhere real: places they collected from on ground *you* hold come to you,
everything else opens up (a collapse is an opportunity, not a gift), residual influence where you
were already pushing transfers at half. `defeatedBy` credits it to you when you were the one at war
— worth respect and fear — and an outfit that merely fell apart is credited to nobody. Fires once.

### 6. The web, drawn

A fourth mode on the Social tab, and it **adds no data**: every field comes off `Npc`,
`n.connections`, `n.asset`, `n.nemesis`. Four rings — you, yours, theirs, and the connective tissue
(anybody you have met tied to two or more of the above), which is the whole reason it is a picture
rather than a fifth list: it is where *"my informant inside the Delgados is the nemesis's cousin"*
lives.

Layout is computed in `/sim` and is deterministic from a stable sort on id, so the same save draws
the same web every time — a map, not a lava lamp. Writing the test caught two real things: it was
drawing faction lieutenants the player had **never met** (leaking the roster and burying the people
who actually matter), and it ignored earned nicknames, so the nemesis on the map was not the one in
the log.

### 7. Lone wolf, as a build

The earlier pass made solo *viable*. This gives it an identity, and the line it has to hold is:
**`OpRequires.alone` is not `minCrew: 0`.** A `minCrew: 0` job is one you *can* do alone; an
`alone` job stops existing the moment there is a second person to be seen, remembered or leaned on.
If the lane were a relaxation of crew-gated content it would be a discount — because it is its own
content, an outfit cannot buy in at any price.

- Two ops only a lone operator can run: **Nobody Saw Anybody** (tier 2, loot, and *zero heat* —
  there is no second story to check) and **No Loose Ends** (tier 3, behind the first).
- `LONE_WOLF.heat` — heat is other people talking, and there is nobody to talk.
- `LONE_WOLF.respectDrag` — the counterweight: the street rates an *outfit*, and you are not one.
- `LONE_WOLF.opBonus` on a job run with nobody on it, reading `isLoneWolf` rather than "who is on
  this op", so a crew player cannot pick it up by leaving everybody at home.

**A number I got wrong first and measured.** `LONE_WOLF.heat` started at 0.55, and at that value
the heat ladder simply stopped engaging: a sixty-day honest run — which *is* a lone-wolf run, since
the bot's first recruit lands on day 56 — went from two rackets to eight and never saw a raid.
Switching off the game's main pressure system is not a build payoff. 0.75 is a third more work
before the ladder fires, which is felt, and the ladder still fires.

---

**Files.** `sim/util.ts` (`outfit`, `bumpStanding`, `releaseGround`, the heat and respect terms) ·
`sim/events.ts`, `sim/ops.ts`, `sim/select.ts`, `sim/crews.ts`, `sim/politics.ts` (the sweep) ·
`sim/factions.ts` (`checkDefeated`) · `sim/nemesis.ts` (`withNickname`, `playerName`,
`earnStreetName`) · `sim/relationships.ts` (new) · `sim/tick.ts`, `sim/reducer.ts`,
`sim/actions.ts`, `sim/types.ts`, `sim/economy.ts` · `content/events.ts` (`LAY_LOW`, `CACHE`),
`content/nemesis.ts` (`STREET_NAME` + pools), `content/backgrounds.ts` (`LONE_WOLF`),
`content/rackets.ts` (`alone`, two ops), `content/glossary.ts` ·
`ui/components/RelationshipMap.tsx` (new), `SocialTab`, `EmpireTab`, `Hud`, `CrewTab`,
`ui/icons/paths-ops.ts`, `ui/styles.css` · seven new test files.

**Watch out.**

- **No `WORLD_VERSION` bump.** `layLowUntil`, `cache`, `street`, `defeatedDay`, `defeatedBy` are all
  optional; old saves load with none of them and behave exactly as before until they earn one.
- **The honest 60-day curve moved, and this entry is where that is stated.** cash 3 → 45, dirty
  254 → 4,259, rackets 3 → 5, control 11.1% → 15.6%. Cause is `LONE_WOLF.heat`, and it is not an
  accident: **the honest bot is a lone wolf for 55 of its 60 days** — its first recruit lands on
  day 56 — so the discount applies to almost the whole run. That is the mechanic working, not
  leaking. If a later pass wants the honest curve to mean "ordinary play" again, the thing to
  change is the bot's recruiting, not this number.
- **Balance shift for every player, not only solo ones.** Everybody starts with no crew, so the
  opening of every game now draws less heat and earns less respect until the first recruit.
- **`alone` is the first addition to the op gating vocabulary since it was frozen**, and
  `sim/ops-progression.test.ts`'s allow-list was widened deliberately, with the reasoning inline.
  No existing key expresses it: `crewCount` asks whether anybody *ever* joined; this asks whether
  anybody is here *now*, and that answer has to be able to go back to no.
- **Deliberately not done.** The two new ops are in `OP_DEFS` and the sweep runs them, but neither
  has a bespoke complication, and `ghost_job`'s zero heat is enforced by its `heat: 0` rather than
  by a rule that would survive somebody editing that number. Worth a guard if the lane grows.

---

## 2026-09-14 — Six things bot playtesting found, and what they actually were

**What.** Six findings from playing all eight scenarios end to end. Four were real bugs, one was a
real bug with the wrong cause attached, and one was a bot problem that was also telling the truth
about the game. Plus a collapsible map-layer menu, asked for alongside.

---

### 1. Every nemesis that ever earned a name had two

`nemesisName()` split on the first space and inserted the earned nickname there. `populate.ts`
gives **every boss and every lieutenant** a nickname at generation, and a nemesis is always a
lieutenant — so this was not an edge case, it was all of them:
`Cassandra "the Nail" "Moose" Booker`. The function's own doc comment said "replaces"; it added.
It now strips whatever is already in quotes first. `sim/nemesis-naming.test.ts` runs every
milestone nickname against every generated lieutenant on a real seed.

### 2. The duplicate repel event was two different events with one sentence between them

Reported as a duplicate-processing bug from four runs across three scenarios, and it reproduced
immediately — same day, identical wording, in `war`, `everything`, `boosted` and `law`. **It was
not a duplicate.** In war a faction takes *two acts a day*; two genuinely different incidents —
muscle in a racket, one of your crew against a wall across town — were both answered with a fight,
both won, and both printed the same fixed string, which named the faction and nothing else. Two
events, one sentence.

So the fix is not deduplication, it is the log saying which incident it means. `what(w, c)` was
already computed for the ledger line; every outcome line now uses it. Same-day duplicate log lines
across the four scenarios: **23/24/22/17 → 11/7/8/10**, and none of the remainder is a
confrontation line.

There *was* one genuine duplicate hiding behind it: two acts a day can pick the same racket twice.
`alreadyAtTheDoor` now means one door gets one crowd.

### 3. Total crew wipeout was a dead end, not a balance question

The report was 8 of 8 crew jailed, dead or injured at once with both rival factions already at
zero soldiers. Measured across the sweep, that is not an outlier — `boosted` normally ends 60 days
with **1 of 8** standing and 25 busts behind it.

The balance is arguable. What is not arguable: **`spring_crew` required an idle crew member**, and
it is the one op whose entire purpose is getting your people out of a cell. The op that recovers
from losing your crew required crew. Lose everybody and there was no move.

Two changes. `spring_crew` is `minCrew: 0` — you go yourself — with its `needs` rescaled onto the
one-person scale from the solo pass (46% solo for a brains player, 39% tech, 21% muscle: hard, and
the right kind of hard). And `bust()` never takes the last body standing: whoever is left is the
thread you pull. Across 40 seeded busts, standing crew is never zero; two busts back to back still
cannot empty the outfit. In the sweep `spring_crew` went from barely reachable to **56 runs**.

### 4. The nemesis system was not "rarely firing". It was unreachable.

Worse than reported. Notoriety floors at 0 and a loss took a flat slab off it, so a lieutenant who
came at the player and lost sat on the floor for ever and no later win climbed off. The 60-day war
soak had Pablo "Tiny" Delgado at the player's door **84 times — W7 L77 — at notoriety 0.0**, and
*every scenario in the sweep finished with zero nemeses*.

Two of the three things that make a recurring antagonist were counted; the third — that they keep
turning up at all — was not, in a file literally called "the lieutenant who keeps turning up".

- **`perMeeting: 1.4`**, win or lose. The man at your door for the ninth time is somebody.
- **`perLossFraction: 0.12`** replaces the flat `perLoss: 6`. Proportional erosion keeps the
  design intent — a nemesis who keeps losing stops being one — without a fixed subtraction against
  a floor of 0 turning decline into deletion. It is self-limiting, which the flat number was not.
- **`earnedFloor`**: notoriety never falls back through a milestone already paid. A name the
  street gave them does not come off.

The three terms sit in tension on purpose: somebody who *only* loses plateaus at
`perMeeting / perLossFraction` ≈ 10–18, deliberately **below** `known` (20) — on your sheet, not
your nemesis. A win is worth several meetings, so beating you occasionally is what crosses the
line. Pablo now finishes at **40** in war and **85** in `everything`; a lieutenant with W0 L24 sits
at 11.6.

**A nemesis now appears in 6 of 8 scenarios, including both that use no admin panel** (`solo` 2,
`ambitious` 2). It previously appeared only in `boosted`/`everything`, at 1. Sweep total for
"made into somebody": 5 → 12.

### 5. Informants went cold in clumps because they shared one clock

`ASSET.goesCold` was a flat global threshold, so every asset turned in the same week and left
alone became eligible on the same morning. The 20%-a-day roll spreads the *drop* slightly and does
nothing about the clump, because they all entered the pool together. Each person now carries a
fixed offset up to `ASSET.coldSpread` (12 days), **derived from their id rather than rolled** —
`/sim` has no `Math.random`, and a save reloaded mid-arrangement has to come back with the same
clock it had. `sim/informant-cooldown.test.ts` checks a batch of 24 spreads over several days,
that no single day takes more than 40% of them, and that the clock survives a save round trip.

### 6. The bot walking loop was a bot bug that was also telling the truth

`workTheStreet` ended its day by walking to a random person and visiting them, and on a *failed*
visit it `continue`d. Once a walk between two adjacent blocks costs no legwork, that is an
oscillation between the same pair until the loop guard runs out. Fixed: a failed visit ends the
day. Same fix on the heat branch, plus a one-bribe-a-day guard — the captain was being paid seven
times in one day in the `law` scenario.

**And the design question the user asked me to judge.** It is mostly a bot gap: the honest bot
plans no ops by design, so it genuinely has less to do than a player. But the honest run says
something real that is not the bot's fault, so it is written down rather than tuned away: **90 days
of honest play finishes with one crew member and no cash.** Wages outrun three rackets' income and
the player has no way out of it inside what honest play is allowed to do. Flagged, not fixed — the
honest run is a measuring stick and you do not fix a measurement by moving the stick.

### Also: the map-layer picker is a menu now

Six overlay chips plus their sub-pickers is two rows of furniture across the bottom of the map that
cannot be dismissed — over exactly the ground the player is most likely to be looking at. Shut, it
is one chip naming the mode you are in; open, it is the same list it always was; picking one shuts
it again, because picking one is why it was opened.

---

**Files.** `sim/nemesis.ts` (the name, `scoreMeeting`, `earnedFloor`) · `content/nemesis.ts`
(`perMeeting`, `perLossFraction`) · `sim/combat.ts` (outcome lines, `alreadyAtTheDoor`) ·
`sim/factions.ts` · `sim/tick.ts` (`bust`) · `sim/informants.ts` + `content/informants.ts`
(`coldAfter`, `coldSpread`) · `content/rackets.ts` (`spring_crew`) · `scripts/bot/policy.ts` ·
`ui/components/MapLayers.tsx`, `ui/store.ts`, `ui/styles.css`, `ui/icons/paths.ts` ·
`content/glossary.ts` · five new test files + `ui/map-layers.test.tsx`.

**Watch out.**

- **No `WORLD_VERSION` bump.** Nothing here adds a stored field; saves carry over. A save with a
  nemesis mid-arc picks up the new curve from wherever they are, which is fine — the floor only
  ever protects milestones already earned.
- **The honest 60-day curve moved, and this is the entry that says so.** cash 38 → 3, dirty
  238 → 254, crew 4 → 5, fear 6 → 28; rackets 3 and control 11.1% unchanged. Cause is finding 6:
  the bot was spending the end of every day in a loop, so the old numbers were produced by a bot
  that was broken. `honest` is frozen against *tuning*, not against bug fixes — but a moved
  baseline has to be stated, which is why these numbers are here rather than in a commit body.
- **Balance shift.** Nemeses will now actually happen to competent players, which means harder
  lieutenants, better-connected ones, and a real contender when a boss goes down. That is the
  intended arc, but an existing save of a dominant player will feel it.
- **Sweep numbers.** 46 distinct op kinds, all 25 systems covered. That sits inside the 43–55
  seed-noise band established last pass — do not read a two-kind move off one seed.
- **Deliberately not done.** The wider question behind finding 3 — whether crackdown frequency at
  high posture is itself too high (25 busts in 60 boosted days) — is untouched. The dead end is
  fixed; whether the pressure is fun is a separate judgement and a separate pass.

---

## 2026-09-14 — Playing it alone: the solo tree, the whole wire lane, and your own hands on a still

**What.** Two halves of one problem. Every op the tree marks solo is now a job a solo player can
actually land; the whole wire lane is work for one person, by rule and by test; and the player
personally works one unmanned production line instead of leaving it at the absentee half-rate. A
new soak scenario, `solo`, plays sixty days with `crewCap: 0` so any of this can be checked.

**Why.** The opening did not work. Measured before anything was changed, at day-one skills, best
background, best approach, alone:

| job | tier | before | after |
|---|---|---|---|
| Get inside their business | 1 | 39% | 70% |
| Take their number | 1 | 35% | 57% |
| Pirate feeds | 2 | 47% | 64% |
| Pull their wires | 2 | 28% | 54% |
| The long con | 2 | 12% | 53% |
| Wire fraud | 3 | **4%** | 42% |
| Wash it sideways | 4 | — (needed 3 crew) | 40% |

Two causes, and neither was the formula.

1. **`needs` written on the crew scale.** `needs` is a *sum across the hands on the job*, and one
   person is about a 4 in a skill and an 8 if it is theirs — and the player's spread never grows,
   so that is as true on day 300 as on day 1. Wire fraud asked for tech 14 + brains 12 on an op
   whose `maxCrew` is 2 and whose `minCrew` is 0: a three-hand job wearing a "solo ok" badge. The
   second need did most of the damage, because `ratio` is the *mean* across needs, so one
   crew-scale entry sinks the job however good you are at the other.
2. **Headcount gates on solo work.** `crewCount` reads `player.crewEver`, so pirate feeds, build a
   person and wash it sideways could not be *opened* until you had hired somebody — on a lane sold
   as work you do at a keyboard on your own.

**How — the ops.** Every `minCrew: 0` op's `needs` is now on the one-person scale: a primary that a
specialist can reach but not cap alone, and secondaries at what anybody has spare. Floors, held by
`sim/solo-play.test.ts`: 60% at tier 0 down to 30% at tier 4, for the best background, alone, day
one, no kit, no heat, and not counting the inside man (which needs somebody on trust 35+ and is not
offered at all on a job aimed at a person, so counting it would flatter every number in the file).

This raises the floor without moving the ceiling — `ratio` caps at 1.3 per skill either way, so a
fully-crewed wire fraud went 58% → 64% while the solo one went 4% → 42%. There is a test for that
too, and one for the opposite overshoot: `rat` at tech 8 let a specialist cap the job alone, which
left no reason ever to bring a second pair of hands, so it went back up to 9.

Charm jobs needed the most room, and the reason is worth writing down: **no approach weights
charm.** `loud` is muscle/wheels, `quiet` is tech/brains, `inside` is brains — so a charm player
can only ever lose by picking one, and a charm job's needs have to be reachable at weight 1.0 or
the charm lane is just a worse brains lane. The long con, charity front and buying down the heat
were all being won by the brains background before this.

**How — the wire.** `family: 'wire'` now covers eight jobs, not five: pirate feeds, build a person
and run a book online were doing the same work without the badge. The rule is now testable —
**every op in the wire family has `minCrew: 0` and no `crewCount`** — and the lane's blurb says so
on the screen. Pacing moved to `priorOps`, `safehouseTier` and the per-target flags, which is where
it belongs. Run a book online and wash it sideways dropped to `minCrew: 0`; pirate feeds trades its
headcount gate for `safehouseTier: 1` (somewhere to put the gear), which a day-one player can
reach.

**How — the still.** `runnerFactor` gives an unmanned line 0.5, an absentee's half rate, and that
was also what you got standing in your own back room with tech 8 in your head. It made the one
opening a broke day-one player can afford — a back room ($600) and a still ($1,200) out of $2,500 —
pay like a line nobody was running: 6 units a day at quality 22, which is unsellable. You now work
**one** line personally: the unmanned one your own skill does the most good on, ties broken on id
so the ledger's estimate and the end-of-day tick can never disagree about which room you were in.
`PLAYER_HANDS` is `0.55 + skill/12` against a runner's `0.6 + skill/10`, quality `30 + skill×4`
against `35 + skill×5`. A tech player's first still: **6/day at q22 → 14.6/day at q62**. Muscle:
8.6 at q38.

Both limits are the design, not a rough edge. **Below a dedicated runner**, because somebody who
does nothing else does it better — that gap is what makes a wage worth paying. And **one line**,
because you are one person: the second still is what sends you out to meet somebody, which is the
arc the whole pass is for.

**How — the bot, which could see none of this.** The honest run never builds a line and never
plans a job, so it had nothing to say about any of the above, and its numbers are frozen. So:
a `solo` scenario, no admin panel, `crewCap: 0`, `opsPerDay: 2`. Sixty days on seed 7: **147 jobs
finished with nobody on them across 15 op kinds**, six of the eight wire jobs among them (run a
book online and wash it sideways want a bookmaking racket and a tier-2 safehouse, which sixty solo
days do not reach); a line up on day one and worked by the player every day after; product carried
to a corner by hand seventeen times. It ends on $1,070 clean, $863 dirty and six rackets — the
honest bot, *with four crew*, ends the same sixty days on $38 and three.

Three new counters say whether it worked: `jobs run alone`, `lines built`, `street sales`. The last
one was a genuine blind spot — `sell_product` had **never once been called in a soak** in the
game's history, so street price, block demand and the quality multiplier were only ever exercised
through the racket tick. The bot now takes its stock to a corner.

Two knobs keep the frozen run frozen. `Scenario.stillAt` is the cash the bot wants before building
a line: 5,000 for everyone (the honest bot never has that much, which is why it has never built
one), 1,800 for `solo`. And a production-first scenario gets its line and its street sale at the
*top* of the day — otherwise the bot settles somebody's shark debt and buys a round with the
opening money, takes a protection racket, and does not get a line up until day 49 of 60. The
honest 60-day curve is byte-identical before and after: cash 38, dirty 238, 3 rackets, control
11.1%.

**A crash the soak found on the way.** `patronTip` in the reducer read
`w.npcs[faction.lieutenantIds[0]].name` after only checking the faction exists. A faction whose
last lieutenant is dead or in a cell still holds blocks, so that is routinely `undefined` by the
middle of a war — and it took the whole dispatch down. It now names the collector when there is
one and says "they collect on this block every week" when there is not. Pre-existing; a real player
could hit it.

**Files.** `content/rackets.ts` (needs, difficulty and `requires` on 20 ops; three new `family`
tags; the lane blurb) · `sim/production.ts` (`PLAYER_HANDS`, `playerWorked`, `playerWorks`,
quality) · `sim/economy.ts` (`productionOutput`) · `sim/select.ts` (the holdings row, the
re-export) · `sim/reducer.ts` (the `patronTip` crash) · `ui/components/BlockSheet.tsx` ·
`content/glossary.ts` (`selfWorked`, `quality`, `opChance`) · `scripts/bot/{admin,policy,run,coverage}.ts` ·
`sim/solo-play.test.ts` (new, 40 cases) · `ui/clarity.test.tsx`, `scripts/bot.test.ts`.

**Watch out.**

- **No `WORLD_VERSION` bump.** Nothing here adds a field; saves carry over.
- **Balance shift, and it is a real one.** Every solo-capable op got easier for the background it
  belongs to, and a solo player's first production line roughly doubles in output and triples in
  quality. Existing saves get both immediately.
- **The sweep's distinct-op-kind count is noisier than one seed makes it look.** Seed 7 went
  48 → 43 when the bot started selling on the street, which reads like a coverage regression and is
  not one. Three seeds, with the sale on and off:

  | | seed 7 | seed 11 | seed 23 |
  |---|---|---|---|
  | selling | 43 | 45 | 53 |
  | not selling | 48 | 55 | 44 |

  The spread *within* each row (ten kinds) swamps the difference between them, and seed 23 is nine
  kinds *better* with the sale. One more action a day moves the bot's whole trajectory through a
  63-op tree; it does not make anything unreachable. **Do not tune the bot against a single seed's
  count** — that is how this nearly turned into an afternoon of chasing noise.
- **Deliberately out of scope.** `buy_down`, `buy_case` and `shell_company` kept their
  `crewCount: 1`: they are not wire work and reaching into a building is fairly gated behind having
  been a boss at all. Their `needs` were rescaled with the rest.
- **Still carried over from the tier pass:** recruiting the city's only fixer deletes all
  laundering capacity, because `recruit` sets `role = 'crew'` and `fixersKnown` filters on
  `role === 'fixer'`.

---

## 2026-09-14 — What the bot walkthrough found: too grey, and four things still drawing emoji

**What.** Let the soak bot play 23 days, then rendered every screen off that save and looked at
them one at a time. Nine fixes, most of which only show up with a played world in them: four
surfaces still drawing emoji, three overlapping bits of map furniture, two places where text was
cut mid-word, and a palette pass — the look had come out grey with amber accents rather than amber
on navy.

**Why.** The visual pass shipped with component tests that render screens in isolation against a
hand-built world. An empty screen looks fine: no kit, no options on a confrontation, no log to
read. Everything below was invisible to those tests and obvious in a screenshot of a real save.

**The emoji that were left.**

- **The kit rows** — three sites in `Kit.tsx` still rendered `item.icon`. They passed the
  no-emoji test because the test world carries no kit.
- **Every option icon.** Two different things share the field name `icon`: on a content table it
  is an emoji (data, never drawn), on an *option* it is the name of a drawing, because there is no
  id to resolve from. Confrontation answers, scene approaches, op approaches, conversation moves,
  agenda moves, complications and the two rat modes were all still emoji, which `<Icon>` silently
  resolved to the fallback — so every option on a screen drew the same glyph. ~45 of them, now
  names, with `ui/icons.test.tsx` asserting each resolves.
- **The log.** Five lines in `/sim` prefixed themselves with an emoji off a content table
  (`${AUTHORITY_KINDS[a.kind].icon} ${a.name}: crackdown`). The log is a screen — it is most of the
  recap and a third of the empire tab. Prefixes removed; the tone colour already carried it.

**Too grey.** The pass had drawn the structure in grey and saved amber for accents, which is how a
tactical HUD turns into a grey app with a yellow button on it. The rule now: **labels and the
things that are yours are amber; prose is grey; trouble is red.** Section titles, `kv` keys, meter
and HUD labels, and icons inside rows are amber; the ground went darker (`#05070c`) and panels
lighter so they read as panels; secondary prose lifted from `#7d8a9d` to `#949dad` with a separate
`--faint` for genuinely third-rank text; the ops tree gives an available job an amber keyline and
glyph and dims a locked one; skill bars went from blue — the one off-palette colour in the app —
to amber.

**Overlaps and cuts.**

- The map hint printed over the second row of layer chips and the end-day button covered their
  right-hand end. One stack now: layer chips, then the ramp key, then the hint, with the button
  beside the hint rather than on top of anything. All six overlay modes stay visible — the first
  attempt made the bar a scroller, which showed two chips and no sign the other four existed.
- The "mapping new streets" chip moved to the top *right*: the legend owns the top left and is 60%
  wide when open.
- A meter's value column was 36px — three characters — so a standing of −100 wrapped onto its own
  line, and `Close-knit` was cut mid-word in the narrow two-column meters.
- Shelf rows let the controls take half the width, so `Lockpick Set` broke into `Lockpi / ck Set`.
- `kv` keys were uppercased, which shouted `RENT` next to sentence-case `Clean income`.

**Files.** `ui/styles.css`, `ui/components/{Kit,Map,SceneSheet,OpsTab}.tsx`,
`content/{lines,agendas,complications,rackets}.ts`, `sim/{combat,conversation,authority,
complications,cyber,intel,reducer}.ts` (text only), `ui/icons.test.tsx`, `ui/visual.test.tsx`,
and a new `scripts/shot/walk.tsx` + `shots.sh` — the harness that plays the bot and renders every
screen off the result.

**Watch out.**

- **Nothing in `/sim` changed behaviour.** The text edits are log strings and option labels; the
  honest 60-day soak is identical again, down to the last dollar.
- **The walkthrough harness lies in four ways**, all now pinned in its own header: headless Chrome
  clamps the window to 500px (so `--window-size=390` silently crops and reads exactly like an
  overflow bug), `100dvh`/`env()` collapse the app frame, sheets are `position: fixed` so they size
  to the window rather than the frame, and a screenshot lands mid-animation, which reads as "the
  whole sheet is dimmed". Every one of those cost time before it was ruled out. Check the harness
  before believing a bug it shows you.
- **Still open, deliberately:** the holdings sort chips take three rows before you reach any data,
  and kit rows are tall because the same disabled-button caption repeats under every item.

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
