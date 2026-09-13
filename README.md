# RACKETS — Crime Empire (alpha)

A mobile-first, map-based crime empire sim on the real world map. Start anywhere on
Earth, lay a turf grid over the streets, and build: shake down owners, run rackets,
rent safehouses, cook product, pull heists, and negotiate with (or fight) four AI
factions who are building the same thing.

Design: [`docs/DESIGN.md`](docs/DESIGN.md). What changed lately and why:
[`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — open on your phone via the LAN URL
npm run build      # typecheck + production build into dist/ (installable PWA)
npm test           # sim unit tests
npm run sim -- 60  # headless: a scripted player plays 60 days, prints the economy
```

## Deploy (Cloudflare Workers, static assets)

The repo is connected to Cloudflare through Workers & Pages → Connect to Git. On each
push to `main` Cloudflare runs `npm run build` and `npx wrangler deploy`, which uploads
`dist/` as static assets using `wrangler.jsonc`. SPA routing comes from
`not_found_handling: single-page-application` there (do not add a `_redirects` file;
it conflicts). `public/_headers` keeps the service worker fresh. Node 22 is pinned in
`.node-version`.

## Layout

| Dir | What | Rules |
|---|---|---|
| `sim/` | The whole game: world generation and streaming (`populate.ts`), where a new game starts (`start.ts`), actions, end-of-day tick, faction AI, ops, events, people (`people.ts`: agendas, grudges, gossip), the family/friend web (`connections.ts`), street crews (`crews.ts`), lieutenants (`lieutenants.ts`), production depth (`production.ts`), politics (`politics.ts`: succession, brokering), cold cases (`cases.ts`), the Commission (`commission.ts`) | Pure TypeScript. Seeded RNG only. No React, no fetch. `(world, action) → world`. |
| `content/` | Data tables: business types, districts, names (grouped by culture), backgrounds, the random-city pool, rackets, productions, ops | Data only. |
| `ui/` | React + MapLibre phone UI | Reads `World`, calls `select.*`, dispatches `Action`s. Never computes game logic. `ui/net` is the only network code (Overpass, tiles, IndexedDB). |
| `scripts/` | Headless soak bot (`headless.ts`) and a real-OSM pipeline check (`real-osm.ts`) | |
| `geo/` | Street geometry: Overpass parsing, planar-face polygonisation, chunking | Pure. |

Every stat and piece of jargon in the UI explains itself: `content/glossary.ts` holds
the text and `ui/components/Info.tsx` shows it on tap (phone) or hover (desktop). When
a formula in `sim/` changes, change the matching glossary entry with it.

The sim contract is `sim/types.ts` (state) and `sim/actions.ts` (every player
action). `can(world, action)` says whether an action is allowed and why not;
`dispatch(world, action)` applies it and returns a new world. `end_day` runs the
tick. Saves are one JSON `World` in IndexedDB; reopening after six hours resolves
idle nights (up to three) and shows a recap.

## First five minutes (how to play)

1. Pick a name and a background — one of five, or build your own with point-buy and a
   starting trait — then start where you are, search a city, or tap the map. A city pick
   drops you in one corner of that city, and 🎲 rolls a different corner.
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

8. You stand on one block, marked 🚶 on the map. Anything face to face needs you there:
   open a place or a person and **Walk over** first. Walking costs **legwork**, a separate
   daily pool from AP that comes from your wheels skill. Blocks you run cost nothing to
   cross, so territory pays for itself.
9. When someone has loyalty 50 and a few days in, make them a **lieutenant** over a
   district; rackets there run without a runner. Audit their books now and then.
10. Street crews hold corners between the factions: **parley** with the boss (payroll,
    join, or run them off) or **take the corner**. Ignore them and they grow.
11. Everyone has people. Households of three to six relatives, plus old friends, tie the
    city together — thickest in close-knit districts. Somebody with more backup than their
    neighbours is harder to scare and slower to trust you, and gossip runs along the ties.
    The **Social** tab lists everybody you have met, who is family and who is an old friend,
    and keeps your own notes on them.
12. After day 15 the bosses form the **Commission**. Blocks, respect or an ally get you
    a chair; votes move standing. A hit or a big job opens a **cold case**: scare or
    pay the witness, bribe the captain, keep a lawyer.

## Status

Alpha, v2 systems in. Everything in the design doc §3–§7 exists in a playable form,
plus: player position and legwork (face-to-face actions need you on the block);
derelict blocks with scouting and claiming; hostages; an op tree with requirements;
NPC agendas, grudges and gossip; block memory and home turf; street crews;
lieutenants (delegation with skimming and flipping); production quality, recipes,
upgrades and events; OSM schools and police stations as rules; an overnight recap
and idle days; succession crises with player backing, boss churn, the Frame op and
brokering; cold cases; the Commission; grouped name pools with district flavour, a
family/friend web between NPCs, five backgrounds plus point-buy character creation, and a
start that lands in a different corner of a city each time. See §11 of the design doc for
open questions.
