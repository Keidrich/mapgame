/**
 * The law as its own entity.
 *
 * Why not a Faction: a Faction carries soldiers, cash, tribute owed, a standing toward every
 * other faction and a stance ladder that runs alliance → peace → tension → beef → war. Police
 * have none of that, and forcing them into it would make "declare war on the cops" a legal
 * move with no coherent meaning — you would be able to ally with them, be paid tribute by them,
 * and broker a truce between them and the Vitales. So: a lighter type, anchored to a block,
 * with its own ladder (`content/authority.ts` → POSTURES) driven by how much trouble you are
 * making, and no concept of standing toward anyone but you.
 *
 * Two things this replaces:
 *  - the one-time `b.police += 25 / neighbours += 10` write at generation. That bump is now
 *    computed live from a real entity (`monitoringAt`), which is why it can grow with posture
 *    and why the map can draw it. `reach: 25, falloff: 0.4` reproduces the old numbers exactly
 *    at the `routine` rung, so a fresh world starts where the old one did.
 *  - officials floating free with no territorial tie: they belong to a building now.
 *
 * Pure and deterministic like the rest of `/sim`: no RNG except where a caller passes one in.
 */
import { AUTHORITY, AUTHORITY_KINDS, POSTURES, POSTURE_ORDER, type AuthorityKind, type AuthorityPosture } from '@content/authority';
import { openCases } from './cases';
import { PLAYER, type Authority, type Id, type Npc, type World } from './types';
import { clamp, log } from './util';
import { DAYPARTS, DEFAULT_HOUR, daypartAt } from '@content/timeofday';

export function authorities(w: World): Authority[] { return Object.values(w.authorities ?? {}); }
export function authorityById(w: World, id?: Id): Authority | undefined { return id ? w.authorities?.[id] : undefined; }

/** Build one and file it. `nid` is the world's id minter, passed in so this stays pure. */
export function addAuthority(w: World, kind: AuthorityKind, blockId: Id, name: string, id: Id): Authority {
  const a: Authority = { id, kind, name, blockId, attention: 0, posture: 'routine', postureSince: w.day, officialIds: [] };
  w.authorities = { ...(w.authorities ?? {}), [a.id]: a };
  return a;
}

// ---------------------------------------------------------------- the monitoring radius
/**
 * Blocks within `maxHops` of `from`, with the hop count. Bounded BFS over the same
 * `neighborIds` graph movement walks, so what the player sees on the map is what they would
 * actually walk through.
 */
export function hopsWithin(w: World, from: Id, maxHops: number): Map<Id, number> {
  const out = new Map<Id, number>();
  if (!w.blocks[from]) return out;
  out.set(from, 0);
  let edge = [from];
  for (let d = 1; d <= maxHops; d++) {
    const next: Id[] = [];
    for (const id of edge) for (const nb of w.blocks[id]?.neighborIds ?? []) {
      if (!w.blocks[nb] || out.has(nb)) continue;
      out.set(nb, d); next.push(nb);
    }
    edge = next;
    if (!edge.length) break;
  }
  return out;
}

/** What one Authority adds to a block that many hops away, at its current posture. */
export function reachAt(a: Authority, hops: number): number {
  const def = AUTHORITY_KINDS[a.kind]; const p = POSTURES[a.posture];
  if (hops > p.radius) return 0;
  return def.reach * Math.pow(def.falloff, hops) * p.mult;
}

/**
 * Total patrol strength every Authority is putting on each block right now. One forward pass
 * per authority rather than a search per block, because the map layer asks for all of them.
 */
export function monitoringField(w: World): Map<Id, number> {
  const field = new Map<Id, number>();
  for (const a of authorities(w)) {
    for (const [id, hops] of hopsWithin(w, a.blockId, POSTURES[a.posture].radius)) {
      const add = reachAt(a, hops);
      if (add > 0) field.set(id, (field.get(id) ?? 0) + add);
    }
  }
  return field;
}

/** What the Authorities add to this one block. Cheap: searches out from the block, not in. */
export function monitoringAt(w: World, blockId: Id): number {
  if (!w.authorities) return 0;
  const maxRadius = Math.max(0, ...authorities(w).map(a => POSTURES[a.posture].radius));
  if (!maxRadius && !authorities(w).length) return 0;
  const near = hopsWithin(w, blockId, maxRadius);
  let total = 0;
  for (const a of authorities(w)) {
    const hops = near.get(a.blockId);
    if (hops !== undefined) total += reachAt(a, hops);   // the hop graph is undirected, so this is the same distance
  }
  return total;
}

/**
 * The police reading that actually matters: the block's own baseline plus whatever the
 * buildings nearby are putting on it today. Every risk roll should read this, not `b.police`,
 * or a crackdown is decoration.
 */
export function effectivePolice(w: World, blockId: Id): number {
  const b = w.blocks[blockId]; if (!b) return 0;
  // ...and what time it is. A patrol at four in the morning has nothing else to look at, which is
  // the counterweight to night being the best time to work — see `content/timeofday.ts`.
  return clamp((b.police + monitoringAt(w, blockId)) * DAYPARTS[daypartAt(w.hour ?? DEFAULT_HOUR)].police);
}

// ---------------------------------------------------------------- the ladder
/**
 * What the Authority is reacting to. Street heat and wire heat are read separately and weighted
 * differently per kind: a precinct is boots on the ground and answers to noise, city hall reads
 * reports and the wire is all report. So the same total heat lands differently depending on
 * which kind of trouble you have been making — which is the point of `cyberHeat` existing as a
 * distinct tracked share rather than just more heat.
 */
export function pressureOn(w: World, a: Authority): number {
  const def = AUTHORITY_KINDS[a.kind];
  const p = w.player;
  const street = Math.max(0, p.heat - (p.cyberHeat ?? 0));   // the part of your heat that was made in person
  const wire = p.cyberHeat ?? 0;
  const cases = openCases(w).length * (AUTHORITY.caseUnit * def.caseWeight) / 10;
  const raw = street * def.streetWeight + wire * def.wireWeight + cases;
  return clamp(raw * (1 - boughtRelief(w, a)), 0, 100);
}

/** Somebody inside the building on your payroll slows down what it notices — never to nothing. */
export function boughtRelief(w: World, a: Authority): number {
  let relief = 0;
  for (const id of a.officialIds) {
    const n = w.npcs[id];
    if (n?.official?.boughtBy === PLAYER || (n && n.official && n.rel.trust >= 45)) relief += AUTHORITY.boughtRelief;
  }
  return Math.min(AUTHORITY.maxBoughtRelief, relief);
}

/** Which rung an attention number sits on. Read in order; nothing here touches `Stance`. */
export function postureFor(attention: number): AuthorityPosture {
  let out: AuthorityPosture = 'routine';
  for (const k of POSTURE_ORDER) if (attention >= POSTURES[k].at) out = k;
  return out;
}

/** One day for one building: attention chases pressure, and the rung follows attention. */
export function tickAuthority(w: World, a: Authority) {
  const target = pressureOn(w, a);
  const step = target > a.attention ? AUTHORITY.climbPerDay : -AUTHORITY.coolPerDay;
  a.attention = clamp(target > a.attention ? Math.min(target, a.attention + step) : Math.max(target, a.attention + step), 0, 100);
  const next = postureFor(a.attention);
  if (next === a.posture) return;
  const climbing = POSTURE_ORDER.indexOf(next) > POSTURE_ORDER.indexOf(a.posture);
  a.posture = next; a.postureSince = w.day;
  log(w, `${a.name}: ${POSTURES[next].label.toLowerCase()}. ${POSTURES[next].blurb}`, climbing ? 'bad' : 'good', { blockId: a.blockId });
}

export function tickAuthorities(w: World) {
  for (const a of authorities(w)) tickAuthority(w, a);
}

/** The hardest rung anybody is on — what the nightly raid roll and the HUD should read. */
export function topPosture(w: World): AuthorityPosture {
  let out: AuthorityPosture = 'routine';
  for (const a of authorities(w)) if (POSTURE_ORDER.indexOf(a.posture) > POSTURE_ORDER.indexOf(out)) out = a.posture;
  return out;
}
/** Multiplier the tick applies to the nightly raid chance, so escalation is not cosmetic. */
export function raidPressure(w: World): number { return POSTURES[topPosture(w)].raidMult; }

// ---------------------------------------------------------------- officials
/** Put an official in the building they answer to: captains to a precinct, the rest to city hall. */
export function attachOfficial(w: World, n: Npc) {
  if (!n.official) return;
  const want: AuthorityKind = n.official.kind === 'captain' ? 'precinct' : 'city_hall';
  const pool = authorities(w).filter(a => a.kind === want);
  const a = (pool.length ? pool : authorities(w))
    .slice()
    .sort((x, y) => hopDistance(w, n.homeBlockId, x.blockId) - hopDistance(w, n.homeBlockId, y.blockId))[0];
  if (!a) return;
  n.official.authorityId = a.id;
  if (!a.officialIds.includes(n.id)) a.officialIds.push(n.id);
}
/** Attach every official that has no building yet — called after generation and after each chunk. */
export function attachOfficials(w: World) {
  for (const n of Object.values(w.npcs)) {
    if (!n.official) continue;
    if (n.official.authorityId && w.authorities?.[n.official.authorityId]) continue;
    attachOfficial(w, n);
  }
}
/** Rough hop distance for picking the nearest building; Infinity when there is no way through. */
function hopDistance(w: World, from: Id, to: Id): number {
  if (from === to) return 0;
  const near = hopsWithin(w, from, 6);
  return near.get(to) ?? Infinity;
}

/** The officials of one building, for its sheet. */
export function officialsOf(w: World, a: Authority): Npc[] {
  return a.officialIds.map(id => w.npcs[id]).filter(Boolean);
}
/** The building this official answers to. */
export function authorityOf(w: World, n: Npc): Authority | undefined { return authorityById(w, n.official?.authorityId); }
/** Every Authority whose current radius covers this block, nearest first. */
export function watchersOf(w: World, blockId: Id): { authority: Authority; hops: number }[] {
  const out: { authority: Authority; hops: number }[] = [];
  const maxRadius = Math.max(0, ...authorities(w).map(a => POSTURES[a.posture].radius));
  const near = hopsWithin(w, blockId, maxRadius);
  for (const a of authorities(w)) { const hops = near.get(a.blockId); if (hops !== undefined && reachAt(a, hops) > 0) out.push({ authority: a, hops }); }
  return out.sort((x, y) => x.hops - y.hops);
}
