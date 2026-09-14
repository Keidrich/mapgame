# RACKETS — context brief for idea generation

Paste this whole thing into a chat before asking for ideas. It assumes you know nothing
about the game.

## What the game is

A mobile browser game. You are building a crime empire on a **real street map** — the game
pulls actual city geometry and turns every real block into a playable tile, populated with
procedurally generated businesses and people. Tone is 1970s crime fiction: protection rackets,
numbers games, bent cops, sit-downs. Dark map UI.

Core loop: each day you get 8 action points and some "legwork" (walking distance). You visit
people, lean on business owners, install rackets, run jobs, and end the day. The world then
simulates overnight — income, police, rival factions, your crew's own lives — and hands you an
event card or two in the morning.

Everything is deterministic from a seed. No server, no multiplayer, no live service.

## The systems that exist (what ideas can build on)

- **Blocks and districts.** The map is blocks; blocks group into districts. Each block has
  wealth, police presence, heat (your notoriety there), population, and per-faction *influence*.
  Hold the most influence on a block (30+) and you control it.
- **Businesses and rackets.** Every business can host rackets. 15 racket types now (protection,
  numbers, bookmaking, gambling den, loansharking, fencing, chop shop, dealing, laundering,
  smuggling, no-show jobs, carding, union dues, counterfeiting, after hours, policy bank).
  Protection is free to install; everything else costs clean money.
- **Two currencies.** Dirty cash (most rackets) and clean cash (buys businesses, bribes,
  racket setup). Laundering converts at a loss. This gap is a constant pressure.
- **People.** Every NPC has skills, traits, nerve, and a relationship with you (trust / fear /
  respect). Everyone has a **family and friend web** — gossip travels along it, and people with
  more backup are harder to frighten.
- **Crew.** You recruit NPCs. They run rackets, guard blocks, work productions, run districts
  as lieutenants (and can skim from you, or defect).
- **Factions.** Rival criminal outfits with their own territory, soldiers, and a stance toward
  you: alliance / peace / tension / beef / war. They attack; you answer in a modal with real odds.
- **The law.** Separate entity type, deliberately not a faction. Precincts and city hall sit on
  specific blocks, project a visible monitoring radius, and climb their own ladder
  (routine → watching → investigating → task force → crackdown) based on your heat, your
  *cyber* heat, and open case files. You can buy their attention down, spring crew from jail,
  or kill a case file — all get harder and more expensive the higher they've climbed.
- **Ops.** 41 planned jobs in a tree — heists, frauds, smuggling, war work, "the wire".
  Tier 2+ jobs can interrupt mid-job and ask you a question (a complication) that shifts the
  outcome.
- **The wire.** Stolen cards with a freshness clock, phone taps on people, secrets sold to
  rival factions, and "scrub your trail" as the only way to clear the heat it makes.
- **Kit.** Weapons, tools, a car. Carry three. Every piece is a tradeoff (a sawn-off makes a
  loud job better and a quiet one much worse).
- **Fog.** Unmapped city is under cloud and only opens when you or a posted crew member
  physically travel to the edge of it.

## What the last pass changed

### Three bugs, all reported from actual play

1. **A detective on day one.** The "a plainclothes cop has been watching your place for two
   nights" event card checked only *do you own any racket* — not heat, not whether police had
   ever noticed you, not whether the racket was more than a few hours old. Now requires real
   police interest and a racket at least 4 days old.
2. **A derelict lot you found yourself, that you couldn't take.** Claiming a derelict block
   required "have you ever run a scouting job anywhere" instead of "do you know about this lot".
   Many ruins are visibly derelict from world generation. Now asks about the block, and walking
   onto or through one counts as finding it.
3. **Dealing rackets that never sold.** Product rackets sell from the *player's* stash, not a
   stock of their own — but production puts product into safehouses, so the obvious setup
   (still upstairs, dealer downstairs) silently sold nothing. A safehouse on the same block now
   restocks the corner, and every product racket states what it has to sell and where the rest is.

All three were the same shape of mistake: **a rule asking a question that sounded right and
wasn't.** Worth assuming more of those exist.

### Rackets now have a reason to differ

Before: protection is free and works on any business, so nobody ever bought a second kind.
Ten racket types were decoration.

- **Saturation.** Running the same kind repeatedly in one district pays less each time. First
  three free, then each is worth 0.8x the one before, floor 25%. Oldest-first, so a new racket
  dilutes itself rather than retroactively punishing what's already running.
- **Synergy.** Ten one-directional pairs that pay a bonus when run together in a district.
  Fencing fed by dealing (+35%). Loansharking fed by a gambling den (+35%). No-show jobs fed by
  union dues (+40%). Laundering fed by carding (+30%). Dealing fed by smuggling (+30%).
  Only pays while the feeder is actually running.
- **Four new kinds**: union dues, policy bank, counterfeiting, after hours.

Net effect: the profitable shape stops being "protection everywhere" and becomes "a few blocks
you actually own, running several different things each."

### Territory finally moved

City control had been stuck near 9% since the project's first test. The standing theory was
that influence built too slowly. **That theory was wrong**, and measuring proved it: a test
player 60 days in had *every block it ran anything on already at maximum influence* — and there
were three of them, out of forty-five.

Influence wasn't building too slowly. It was building to full and stopping, because nothing let
holding ground **spread**. The fix that worked: a block you control with real depth bleeds
influence into neighbouring blocks. Empires now grow outward from strongholds.

Supporting changes: depth on a block compounds accrual, consecutive days held add more, and
deep ground pushes rivals off instead of both sides adding forever.

### Ten new event cards

Wired to systems that previously only existed if you went looking for them: a wronged person's
family turning up outside your place; gossip reaching a stranger who already knows your name;
an officer quietly asking around *before* the police formally escalate; a phone tap catching
something unprompted; a card about to go cold (use-it-or-lose-it); a one-time price on kit; a
rival noticing what you carry; a street crew offering terms unprompted; someone with a clipboard
asking about a block you claimed.

## Where things stand (measured, 6 cities, 60 days, same scripted test player)

| | Before | After |
|---|---|---|
| City control | 9.3% | **19.3%** (up in every city) |
| Rackets running | 9.2 | 10.2 |
| Daily income | $1,270 | **$746** |

The income drop is the saturation mechanic working — that test player crams 10+ protection
rackets into one district, exactly the shape it exists to tax. But that player is hard-coded to
stay within two blocks of its start and never holds clean cash, so **both escape routes are
closed to it**. A real player has both. Treat the income figure as unreliable.

## Known open problems — good places for ideas

1. **The clean/dirty cash squeeze is brutal early.** Every racket but protection costs clean
   money; almost all income is dirty; converting needs a laundering racket that costs clean
   money. A new player is structurally stuck on protection for a long time. There's a "fixer"
   NPC as a stopgap but it's thin.
2. **Synergies don't chain.** Smuggling feeds dealing, dealing feeds fencing, but running all
   three doesn't compound. Left flat deliberately — easier to turn on than claw back.
3. **Saturation ignores rivals.** Only *your own* rackets crowd you out. A district saturated
   by a rival's numbers game doesn't affect yours.
4. **Nothing plans for synergy.** In testing only 3 of 40 rackets happened to land next to
   their feeder. It's strategy for a human to discover, which may be fine or may mean it needs
   signposting.
5. **Where the four new racket types live is a first guess** — which business types host them
   decides which a player meets early and which they never see.
6. **The end game is thin.** You win at 60% city control. There's a "Commission" (the bosses'
   table) but what it's *for* is underdeveloped.
7. **The family/friend web is mostly flavour.** It affects gossip and how hard people are to
   frighten, but there's no way to deliberately work a family, and no long arc to it.
8. **Ops are one-and-done.** You plan a job, it resolves, it's over. No campaigns, no rivalries
   that build across jobs.

## Constraints any idea has to respect

- **No server, no multiplayer, no live service.** Everything runs in the browser from a seed.
- **Deterministic.** Same seed, same world, every time. No true randomness.
- **Mobile-first.** Small screen, thumb reachable, short sessions.
- **The fiction stays grounded.** 1970s crime, no fantasy, no sci-fi. Systems dressed in
  realistic skin but abstracted — there is no real technique in anything, deliberately.
- **The player's own skills are five numbers**: muscle, brains, charm, wheels, tech.
- **Every player ability is an action the simulation validates.** New abilities are new actions,
  not special cases.

## What I'd most like ideas about

Anything, but the sharpest needs are: **the early-game clean-cash trap**, **what the family web
could actually become**, and **what an empire does once it's winning**.
