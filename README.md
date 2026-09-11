# RACKETS — Crime Empire (alpha)

A mobile-first, map-based crime empire sim on the real world map. Start anywhere on
Earth, lay a turf grid over the streets, and build: shake down owners, run rackets,
rent safehouses, cook product, pull heists, and negotiate with (or fight) four AI
factions who are building the same thing.

Design: [`docs/DESIGN.md`](docs/DESIGN.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — open on your phone via the LAN URL
npm run build      # typecheck + production build into dist/ (installable PWA)
npm test           # sim unit tests
npm run sim -- 60  # headless: a scripted player plays 60 days, prints the economy
```

## Layout

| Dir | What | Rules |
|---|---|---|
| `sim/` | The whole game: world generation, actions, end-of-day tick, faction AI, ops, events | Pure TypeScript. Seeded RNG only. No React, no fetch. `(world, action) → world`. |
| `content/` | Data tables: business types, districts, names, rackets, productions, ops | Data only. |
| `ui/` | React + Leaflet phone UI | Reads `World`, calls `select.*`, dispatches `Action`s. Never computes game logic. |
| `scripts/` | Headless soak bot | |

The sim contract is `sim/types.ts` (state) and `sim/actions.ts` (every player
action). `can(world, action)` says whether an action is allowed and why not;
`dispatch(world, action)` applies it and returns a new world. `end_day` runs the
tick. Saves are one JSON `World` in localStorage.

## First five minutes (how to play)

1. Pick a name and a background, then start where you are, search a city, or tap the map.
2. Tap the bright hex in the middle: that is your block. Open a business, read the owner's
   traits. Cowards and low-nerve owners fold fast; hotheads and honest owners fight back.
3. **Threaten** an owner until their fear is up, then **Shakedown** for cash today or
   **Protect** for a daily cut. Fair rates (10 to 15%) keep owners loyal.
4. Talk to patrons (**Visit**). At trust 20 you can **Recruit** them; assign crew to run
   rackets so they earn full income and get busted less.
5. Add a **Numbers** racket to a place you protect, rent a **safehouse** on your block,
   build a **still**, stock it, and sell booze on the street or through a **Dealing** racket.
6. **End Day** each turn. Read the event cards. Watch heat: past 60 you get raided, at 100
   you get busted. Bribe the captain or pay the sergeant to cool off.
7. Check **Factions** before pushing into coloured hexes. Tension means a warning, beef
   means sabotage, war means bodies. Sit-downs, tribute, and ceding a block buy peace.

## Status

Alpha. Everything in the design doc §3–§7 exists in a first playable form. See the
open questions in §11 of the design doc before tuning further.
