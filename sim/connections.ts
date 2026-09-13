/**
 * The web of family and old friends between NPCs.
 *
 * Nobody in a city knows nobody. Everyone here has people — a household of relatives, a
 * couple of old friends, usually both — and the web is mutual (each side carries the
 * other), lives on `Npc.connections`, and has nothing to do with the player. It is the
 * city's own social fabric.
 *
 * It is built in two passes:
 *   1. **Households.** Most people belong to a family: three to five relatives, all tied
 *      to each other, sharing a surname, living on the same block or — where the
 *      neighbourhood is close — spread across the district.
 *   2. **Friends.** Then everybody is topped up to at least a couple of ties, more where
 *      people are close, so nobody stands entirely alone.
 *
 * How dense and how far-reaching the web is comes from one number: the district's
 * `closeness` (0..1). A close district is one big web of cousins; a district of strangers
 * is households of two and a friend at the bar. `closeness` is a property of the place,
 * never read from and never a stand-in for anybody's name group.
 */
import { groupsOfLastName } from '@content/names';
import type { Rng } from './rng';
import type { Block, Connection, District, Id, Npc, World } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Ties everybody ends up with, wherever they live: a household, a couple of friends, or both. */
export const MIN_TIES = 3;
/** Nobody is the hub of the whole neighbourhood. */
export const MAX_LINKS = 8;
/** Households: how many relatives, and how many people have one at all. */
export const HOUSEHOLD_MIN = 3;        // a family, not a pair
export const HOUSEHOLD_MAX = 6;        // at closeness 1
export const HOUSEHOLD_SHARE = 0.85;   // the rest have friends but no family in this city
/** Friends on top of family: more of them where people are close. */
export const FRIENDS_PER_CLOSENESS = 3;
/**
 * Backup stiffens somebody — but only the ties they have *beyond what everyone has*, so a
 * city where everybody knows people is not a city where everybody is hard to frighten.
 */
export const TIES_BASELINE = MIN_TIES;
export const BACKING_NERVE = 4;
export const BACKING_TRUST = 2;
export const MAX_BACKING = 3;

export const FAMILY_LABELS = ['sibling', 'cousin', 'second cousin'];
export const IN_LAW_LABELS = ['in-law', 'married in', 'family by marriage'];
export const FRIEND_LABELS = ['old friend', 'grew up together', 'army buddy', 'school friend', 'drinking partner', 'used to work together'];

const lastNameOf = (n: Npc) => n.name.split(' ').slice(-1)[0];

/** Are these two already tied together? */
export function isConnected(a: Npc, b: Npc): boolean { return (a.connections ?? []).some(c => c.npcId === b.id); }

/** Tie two people together, both ways. Returns false when they were already linked. */
export function connect(a: Npc, b: Npc, kind: Connection['kind'], label: string): boolean {
  if (a.id === b.id || isConnected(a, b)) return false;
  a.connections.push({ npcId: b.id, kind, label });
  b.connections.push({ npcId: a.id, kind, label });
  return true;
}

/** Their living connections, resolved. Order is stable: the order they were made in. */
export function connectionsOf(w: World, n: Npc): { npc: Npc; kind: Connection['kind']; label: string }[] {
  return (n.connections ?? []).map(c => ({ npc: w.npcs[c.npcId], kind: c.kind, label: c.label })).filter(x => x.npc && x.npc.alive);
}
export function familyOf(w: World, n: Npc): Npc[] { return connectionsOf(w, n).filter(c => c.kind === 'family').map(c => c.npc); }

/**
 * Real backup: living connections who live in the same district. This — not where anyone
 * is from — is the only social input to how hard someone is to frighten.
 */
export function backingOf(w: World, n: Npc): number {
  const district = w.blocks[n.homeBlockId]?.districtId;
  if (!district) return 0;
  return connectionsOf(w, n).filter(c => w.blocks[c.npc.homeBlockId]?.districtId === district).length;
}

/**
 * Build the web across freshly populated blocks. Called once per chunk, after the people
 * are made and before agendas are handed out (the family agenda needs real family).
 */
export function linkConnections(w: World, blocks: Block[], rng: Rng): void {
  const byDistrict = new Map<Id, Npc[]>();
  for (const b of blocks) {
    const people = b.businessIds.flatMap(id => [w.businesses[id].ownerId, ...w.businesses[id].patronIds]).map(id => w.npcs[id]).filter(n => n && n.alive);
    if (!people.length) continue;
    const list = byDistrict.get(b.districtId) ?? [];
    list.push(...people);
    byDistrict.set(b.districtId, list);
  }
  // every name in the city, so taking a household's surname can never produce two
  // identical people standing in the same family
  const usedNames = new Set(Object.values(w.npcs).map(n => n.name));
  for (const [districtId, pool] of byDistrict) {
    const d: District | undefined = w.districts[districtId];
    if (!d || pool.length < 2) continue;
    linkDistrict(d, pool, rng, usedNames);
    for (const n of pool) applyBacking(w, n);
  }
}

function linkDistrict(d: District, pool: Npc[], rng: Rng, usedNames: Set<string>): void {
  const closeness = clamp(d.closeness, 0, 1);
  const byBlock = new Map<Id, Npc[]>();
  for (const n of pool) { const list = byBlock.get(n.homeBlockId) ?? []; list.push(n); byBlock.set(n.homeBlockId, list); }
  const reachFor = (n: Npc) => (rng.chance(closeness) ? pool : (byBlock.get(n.homeBlockId) ?? pool));
  formHouseholds(closeness, pool, reachFor, rng, usedNames);
  makeFriends(closeness, pool, reachFor, rng);
}

/**
 * Families, not pairs: a household is everybody tied to everybody, under one surname.
 * Households stay on one block unless the neighbourhood is close enough to spread across
 * the district — which is how a tight district ends up webbed together.
 */
function formHouseholds(closeness: number, pool: Npc[], reachFor: (n: Npc) => Npc[], rng: Rng, usedNames: Set<string>): void {
  const placed = new Set<Id>();
  for (const head of rng.shuffle(pool)) {
    if (placed.has(head.id)) continue;
    placed.add(head.id);
    if (!rng.chance(HOUSEHOLD_SHARE)) continue;   // some people really did arrive alone
    const biggest = HOUSEHOLD_MIN + Math.round(closeness * (HOUSEHOLD_MAX - HOUSEHOLD_MIN));
    const size = rng.int(HOUSEHOLD_MIN, biggest);
    const free = reachFor(head).filter(o => o.id !== head.id && !placed.has(o.id));
    // relatives come out of one naming pool; an in-law from another keeps their own name
    const kin = free.filter(o => sameNamePool(head, o));
    // the odd namesake across a city is fine; two of them in one family reads as a mistake
    const names = new Set([head.name]);
    const picks: Npc[] = [];
    for (const o of rng.shuffle(kin.length >= size - 1 ? kin : free)) {
      if (picks.length >= size - 1) break;
      if (names.has(o.name)) continue;
      names.add(o.name); picks.push(o);
    }
    if (!picks.length) continue;
    const unit = [head, ...picks];
    // The household name comes from an owner when there is one, because a business name
    // hangs off its owner's surname and must not drift. Everyone else takes it; a second
    // owner, or a relative out of another naming pool, keeps their own and married in.
    const named = unit.find(m => m.role === 'owner') ?? head;
    const surname = lastNameOf(named);
    for (const m of picks) placed.add(m.id);
    for (const m of unit) if (m !== named && m.role !== 'owner' && sameNamePool(named, m)) takeSurname(m, surname, usedNames);
    for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) connect(unit[i], unit[j], 'family', familyLabel(unit[i], unit[j], rng));
  }
}

/** Everybody ends up with somebody: family counts, and friends make up the difference. */
function makeFriends(closeness: number, pool: Npc[], reachFor: (n: Npc) => Npc[], rng: Rng): void {
  for (const n of pool) {
    const want = Math.min(MAX_LINKS, MIN_TIES + rng.int(0, Math.round(closeness * FRIENDS_PER_CLOSENESS)));
    let guard = 0;
    while (n.connections.length < want && guard++ < 6) {
      const other = pickPartner(n, reachFor(n), rng);
      if (!other) break;                            // a block of three people can only do so much
      connect(n, other, 'friend', rng.pick(FRIEND_LABELS));
    }
  }
}

/** Take the household's surname, unless that would make two people in this city the same person. */
function takeSurname(n: Npc, surname: string, usedNames: Set<string>): void {
  const next = `${n.name.split(' ').slice(0, -1).join(' ')} ${surname}`;
  if (next === n.name || usedNames.has(next)) return;
  usedNames.delete(n.name); usedNames.add(next);
  n.name = next;
}

/** What two relatives are to each other. Same name, blood; different name, married in. */
function familyLabel(a: Npc, b: Npc, rng: Rng): string {
  return lastNameOf(a) === lastNameOf(b) ? rng.pick(FAMILY_LABELS) : rng.pick(IN_LAW_LABELS);
}

/** Do two people's surnames come out of the same naming pool? Cosmetic: it only guards renames. */
function sameNamePool(a: Npc, b: Npc): boolean {
  const ga = groupsOfLastName(lastNameOf(a));
  return groupsOfLastName(lastNameOf(b)).some(g => ga.includes(g));
}

/** Someone free to be tied to, preferring a neighbour with room left for another friend. */
function pickPartner(n: Npc, reach: Npc[], rng: Rng): Npc | undefined {
  const free = reach.filter(o => o.id !== n.id && o.alive && o.connections.length < MAX_LINKS && !isConnected(n, o));
  return free.length ? rng.pick(free) : undefined;
}

/**
 * People with real backup are harder to scare and slower to warm to a stranger. Applied
 * identically to every NPC from their own connection count — never from where they or
 * their district's names come from.
 */
export function applyBacking(w: World, n: Npc): void {
  const backing = Math.min(MAX_BACKING, backingOf(w, n) - TIES_BASELINE);
  if (backing <= 0) return;
  n.nerve = clamp(n.nerve + backing * BACKING_NERVE);
  n.rel.trust = clamp(n.rel.trust - backing * BACKING_TRUST, -100, 100);
}
