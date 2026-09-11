# CLAUDE.md

RACKETS: map-based crime empire sim (mobile PWA). Read `docs/DESIGN.md` first; it is
the design authority. `README.md` explains the layout and commands.

## Hard walls
- `/sim` is pure: no React, no fetch, no `Math.random` (use `sim/rng.ts`). Every
  change to the world goes through `dispatch(world, action)`. Add new player
  abilities as new `Action` variants in `sim/actions.ts`, validated in `can()`.
- `/ui` reads state and dispatches actions. If the UI needs a derived value, add a
  read-only helper to `sim/select.ts`; never compute outcomes in components.
- `/content` is data. Balance numbers live there or in the formulas in
  `sim/economy.ts`, not scattered through the reducer.

## Before pushing
`npm run typecheck && npm test && npm run sim -- 60` must all pass. The soak bot
prints the economy curve; if income or faction growth looks broken, fix the balance
before shipping.
