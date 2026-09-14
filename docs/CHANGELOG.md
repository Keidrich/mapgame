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
