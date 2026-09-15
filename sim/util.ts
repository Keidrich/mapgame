import { LONE_WOLF } from '@content/backgrounds';
import { LEGITIMACY } from '@content/fortune';
import { DAYPARTS, DEFAULT_HOUR, daypartAt } from '@content/timeofday';
import { legitimacyHeatMult } from './fortune';
import { Rng } from './rng';
import type { Id, LogEntry, Npc, World, FactionId, Faction, Block } from './types';
import { PLAYER } from './types';
import { distanceM } from '@geo/project';
import { STEP_M } from './populate';
import { controller } from './generate';
import type { Stake } from '@content/standing';
import { fearGain, makeContact, propagation, trustGain, witnessesAt } from './standing';

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const round = (v: number) => Math.round(v);

/** Borrow the world's PRNG; call `done()` to write the state back. */
export function rngOf(w: World): { rng: Rng; done: () => void } {
  const rng = new Rng(w.rng);
  return { rng, done: () => { w.rng = rng.state; } };
}

export function nid(w: World, prefix: string): Id { return `${prefix}${w.nextId++}`; }

export function log(w: World, text: string, tone: LogEntry['tone'] = 'info', refs?: LogEntry['refs']) {
  w.log.push({ day: w.day, text, tone, refs });
  if (w.log.length > 300) w.log.splice(0, w.log.length - 300);
}

/**
 * Move somebody's feeling about you, face to face.
 *
 * Every positive move goes through `sim/standing.ts` on the way in: fear is scaled and capped
 * by `stake` — what the act actually cost you to commit — and trust by the familiarity floor
 * and the ordinary-dealing ceiling. Losses are never gated: trust is easy to lose, and always
 * was. The default stake is `words`, so a call site that does not say what it did is treated
 * as the cheapest thing it could have been. Anything costlier has to say so.
 *
 * Calling this counts as having been in front of them (once per day). Word that merely reaches
 * somebody goes through `bleedRel` instead, which is the same gate without the handshake.
 */
export function adjustRel(w: World, n: Npc, d: { trust?: number; fear?: number; respect?: number }, stake: Stake = 'words') {
  if (!n) return;
  makeContact(w, n);
  applyRel(w, n, d, stake);
}

/** The same gate, for a feeling that arrived second-hand: gossip, or word going round a block. */
export function bleedRel(w: World, n: Npc, d: { trust?: number; fear?: number; respect?: number }, stake: Stake = 'words') {
  if (!n) return;
  applyRel(w, n, d, stake);
}

function applyRel(w: World, n: Npc, d: { trust?: number; fear?: number; respect?: number }, stake: Stake) {
  if (d.trust) n.rel.trust = clamp(n.rel.trust + trustGain(w, n, d.trust), -100, 100);
  if (d.fear) n.rel.fear = clamp(n.rel.fear + fearGain(w, n, d.fear, stake));
  if (d.respect) n.rel.respect = clamp(n.rel.respect + d.respect);
}

export function addHeat(w: World, amount: number, blockId?: Id) {
  const raw = amount;
  // Heat is other people talking about you. Working alone there is one person to describe and
  // nobody to describe them — the single biggest thing being a lone wolf is actually worth, and
  // it stops the day somebody else is on the books. `LONE_WOLF.heat`.
  if (amount > 0 && activeCrewCount(w) === 0) amount *= LONE_WOLF.heat;
  // Money spent on looking respectable, discounting every point of heat in the game — `addHeat`
  // is the only door heat comes through, so there are no per-source special cases to keep honest.
  if (amount > 0) amount *= legitimacyHeatMult(w);
  if (amount > 0) amount *= DAYPARTS[daypartAt(w.hour ?? DEFAULT_HOUR)].heat;
  if (amount > 0 && blockId && blockId === w.player.homeBlockId) amount *= 0.8; // home turf: people look the other way
  if (amount > 0 && blockId && w.blocks[blockId]?.tags.includes('school')) amount *= 1.5; // near a school everybody calls it in
  // …and a floor under all of it together. Alone *and* respectable is the hardest man in the city
  // to look at, and it still must not be a police off-switch — the mistake `LONE_WOLF.heat` made
  // at 0.55 the first time. Applied last, against the raw figure, so every other term stacks
  // freely underneath and only the total is clamped.
  if (amount > 0) amount = Math.max(amount, raw * LEGITIMACY.heatFloor);
  const before = w.player.heat;
  w.player.heat = clamp(w.player.heat + amount);
  if (blockId && w.blocks[blockId]) w.blocks[blockId].heat = clamp(w.blocks[blockId].heat + amount * 2);
  for (const t of [45, 60, 80]) if (before < t && w.player.heat >= t) log(w, t === 45 ? 'Heat 45: cops are starting to notice. Raids begin above 60.' : t === 60 ? 'Heat 60: raids can hit your rackets and safehouses tonight. Lay low, bribe the captain, or pay a sergeant.' : 'Heat 80: one more loud night and the task force comes through everything. Bust at 100.', 'warn');
}

export function addInfluence(w: World, blockId: Id, f: FactionId, amount: number) {
  const b = w.blocks[blockId];
  b.influence[f] = clamp((b.influence[f] ?? 0) + amount);
  if (b.influence[f] <= 0) delete b.influence[f];
}

/**
 * Word gets around — along people, not across a map.
 *
 * This used to paint every face within a block's radius of wherever it happened, which meant a
 * name made in one district quietly worked in the next one over, and expanding into new ground
 * was only ever socially cold once, at the start of a save. Now it walks the connections graph
 * out from whoever was actually there: witnesses full strength, the people they know a little
 * under half, friends of friends a fifth, and nobody at three degrees. Somebody with no path
 * back to the scene never hears about it at all.
 *
 * `degrees` is how far word travels for this particular thing — a killing carries further than
 * a raised voice. It replaces the old geographic `radius`, which had the same call shape.
 */
export function spreadRep(w: World, blockId: Id, d: { respect?: number; fear?: number; trust?: number }, degrees = 1, stake: Stake = 'words') {
  spreadFrom(w, witnessesAt(w, blockId), d, degrees, stake);
}

/** The same, seeded from the people it actually happened to. */
export function spreadFrom(w: World, seeds: Npc[], d: { respect?: number; fear?: number; trust?: number }, degrees = 1, stake: Stake = 'words') {
  // The other side of `LONE_WOLF.heat`: the street rates an outfit, and one person is not one.
  // Half the attention, and harder to take seriously — which is the trade, not a free win.
  const drag = activeCrewCount(w) === 0 ? LONE_WOLF.respectDrag : 1;
  for (const { npc, weight } of propagation(w, seeds, degrees)) {
    bleedRel(w, npc, { respect: (d.respect ?? 0) * weight * drag, fear: (d.fear ?? 0) * weight, trust: (d.trust ?? 0) * weight }, stake);
  }
}

export function factionOf(w: World, blockId: Id): FactionId | undefined { return controller(w.blocks[blockId]); }

/**
 * A `FactionId` that actually resolves to an outfit with a standing track, or nothing.
 *
 * `FactionId` is three populations wearing one type: `PLAYER`, a real faction in `w.factions`,
 * and a **street crew** in `w.crews`. Crew ids are the dangerous ones, because unlike factions
 * (which are marked `alive = false` and left in place) crews are genuinely `delete`d when their
 * block goes or they are folded in — so `w.factions[id]` comes back `undefined` for an id that
 * every type signature says is fine.
 *
 * That is what crashed `offer_sale:buy` on seed 33: a street crew takes protection on a business
 * (`crews.ts`, `biz.protection = { factionId: c.id }`), the crew is later deleted, the business
 * keeps the stale reference, and buying it read `.standing` off nothing. It is the same shape as
 * the `patronTip` crash and the `buy_business` one before it, which is why it is a function now
 * rather than a third guard bolted onto a third call site: the next person to write
 * `w.factions[someProtectionId]` should find this instead.
 */
export function outfit(w: World, id?: FactionId): Faction | undefined {
  if (!id || id === PLAYER) return undefined;
  return w.factions[id];
}

/**
 * Move an outfit's standing with the player, if there is an outfit there to move. A no-op for the
 * player themselves, a street crew (they track `mood`, not standing) and a dangling id.
 */
export function bumpStanding(w: World, id: FactionId | undefined, by: number): void {
  const f = outfit(w, id); if (!f) return;
  f.standing[PLAYER] = clamp(f.standing[PLAYER] + by, -100, 100);
}

/**
 * Let go of everything an outfit was holding, so nothing points at it afterwards.
 *
 * The guard above stops a stale id *crashing*; this stops it existing. A faction's death already
 * did this inline in `successionOrDeath`, and a street crew's did not — which is how a deleted
 * crew's id stayed on a business's `protection` and took down `offer_sale:buy` a fortnight later.
 * One function now, called from both, because the next outfit that can stop existing will
 * otherwise be the third.
 */
export function releaseGround(w: World, id: FactionId): void {
  for (const b of Object.values(w.blocks)) delete b.influence[id];
  for (const b of Object.values(w.businesses)) if (b.protection?.factionId === id) b.protection = undefined;
}

export function playerSkill(w: World, k: keyof Npc['skills']): number { return w.player.skills[k]; }

export function crewOf(w: World): Npc[] { return w.player.crewIds.map(id => w.npcs[id]).filter(Boolean); }

export function activeCrewCount(w: World): number { return crewOf(w).filter(n => n.crew && n.crew.status !== 'dead' && n.crew.status !== 'jailed').length; }

/** Break a truce and they never fully trust you again. */
export function standingCap(f: import('./types').Faction): number { return 100 - 35 * (f.brokenTruces ?? 0); }

export function money(n: number): string { return `$${Math.round(n).toLocaleString('en-US')}`; }

export function blocksNear(w: World, blockId: Id, radius: number): Block[] {
  const src = w.blocks[blockId];
  return Object.values(w.blocks).filter(b => distanceM(b.center, src.center) <= radius * STEP_M + 1);
}

export function isPlayerFaction(f?: FactionId) { return f === PLAYER; }

export function takeCash(w: World, amount: number): boolean {
  if (w.player.cash >= amount) { w.player.cash -= amount; return true; }
  return false;
}

export function officialTrust(w: World, kind: 'captain' | 'councillor' | 'judge'): number {
  const o = Object.values(w.npcs).find(n => n.official?.kind === kind);
  return o ? o.rel.trust : 0;
}
/** Days a crew member sits in jail, after lawyer and judge. */
export function jailDays(w: World, base: number): number {
  let d = base;
  if (w.player.lawyer) d *= 0.5;
  if (officialTrust(w, 'judge') >= 40) d *= 0.6;
  return Math.max(2, Math.round(d));
}
export function collectors(w: World): number {
  return crewOf(w).filter(n => n.crew?.status === 'assigned' && n.crew.assignment?.kind === 'collect').length;
}
