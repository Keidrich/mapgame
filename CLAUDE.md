# CLAUDE.md

RACKETS: map-based crime empire sim (mobile PWA). Read `docs/DESIGN.md` first; it is
the design authority. `docs/CHANGELOG.md` says what recent sessions changed and why.
`README.md` explains the layout and commands.

## Hard walls
- `/sim` is pure: no React, no fetch, no `Math.random` (use `sim/rng.ts`). Every
  change to the world goes through `dispatch(world, action)`. Add new player
  abilities as new `Action` variants in `sim/actions.ts`, validated in `can()`.
- `/ui` reads state and dispatches actions. If the UI needs a derived value, add a
  read-only helper to `sim/select.ts`; never compute outcomes in components.
- `/content` is data. Balance numbers live there or in the formulas in
  `sim/economy.ts`, not scattered through the reducer.

## The Remake
`remake/` is a second, separate game — RACKETS rebuilt with every city, person and job generated
from a seed — reached from the tab on the start screen. `docs/REMAKE.md` is its design authority.
The same hard walls apply inside it (`remake/sim` pure, `remake/ui` reads and dispatches,
`remake/content` is data). The original never imports from `remake/`, except `ui/App.tsx` lazily
loading `@r/ui/App`; the Remake may reuse the original's shared pieces (rng, name groups, icons,
IndexedDB helper). Saves never mix: the Remake's key is `rackets.remake.save.v1`, versioned by
`WORLD_VERSION` in `remake/sim/generate.ts` — changing the order of generation changes every seed's
city, so bump it when you do.

## Before pushing
`npm run typecheck && npm test && npm run sim -- 60 && npm run sim2 -- 60` must all pass. The soak bot
prints the economy curve; if income or faction growth looks broken, fix the balance
before shipping.

The default run is the **honest** scenario: no admin panel, no ops, and its shape is frozen
because it is the only run whose numbers are comparable with earlier passes. Do not "improve"
it — add a scenario instead.

**After building anything, run `npm run sim -- 60 7 all` and read the coverage table.** It says
which systems the bot actually reached and names the ops that never ran. If the thing you just
built shows `✗`, the soak has told you nothing about it: teach the bot (`scripts/bot/policy.ts`)
or add a scenario (`scripts/bot/admin.ts`) before you claim it is tested. Three passes shipped
with the bot silently blind to them, which is why this paragraph exists.

## Leave a trail
Whoever works here next — a person or another session — starts with no memory of this
one. Every change says **what** it did, **why**, and **how**, in the places they will
actually look:
- **The commit message.** A subject line, then a body: the problem, the fix, and the
  numbers that moved. Write it for somebody who was not here. Never just "update X".
- **`docs/CHANGELOG.md`.** One entry per shipped change, newest first, in the what / why
  / how / files shape the file already uses. Add yours before you push, and say what to
  watch out for (a save-version bump, a balance shift, a gotcha you hit).
- **`docs/DESIGN.md`.** When a system changes shape, the design doc changes with it. It
  is the authority; a changelog entry does not replace it.
- **`content/glossary.ts`.** When a formula or threshold changes, the player-facing
  explainer changes with it. House rule, and it is enforced by nothing but you.
- **Comments at the decision points.** Why this number, why this order, what breaks if
  you change it. Not what the line does — the code says that.

If you leave something half-built or deliberately out of scope, say so in the changelog
entry. An unfinished thing nobody knows about is worse than one that is written down.

## Shipping
`main` is the deploy branch: Cloudflare builds and deploys on every push to it. Once the
gate above is green, ship straight away without being asked — commit, push your working
branch, then fast-forward `main` and push that too. If the gate fails, say so instead of
pushing. A change that bumps `WORLD_VERSION` drops every existing save, so call that out
when you ship it.
