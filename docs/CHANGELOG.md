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
