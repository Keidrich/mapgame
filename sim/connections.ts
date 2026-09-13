/**
 * The web of family and old friends between NPCs.
 *
 * People here are not islands. Somebody's brother runs the bakery two streets over; the
 * man at the bar went to school with the woman behind the counter. The web is mutual
 * (both sides carry the link), lives on `Npc.connections`, and has nothing to do with the
 * player — it is the city's own social fabric.
 *
 * How dense the web is comes from one number: the district's `closeness` (0..1). A close
 * district webs the whole neighbourhood together; a district of strangers gets a handful
 * of block-local ties and no more. `closeness` is a property of the district, not of the
 * people in it: it is never read from, and never stands in for, anybody's name group.
 */
import { groupsOfLastName } from '@content/names';
import type { Rng } from './rng';
import type { Block, Connection, District, Id, Npc, World } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Chance a person has any ties at all, and how much closeness adds to it. */
export const LINK_BASE = 0.1;
export const LINK_PER_CLOSENESS = 0.6;
/** Nobody is the hub of the whole neighbourhood. */
export const MAX_LINKS = 4;
/** How much a person's living ties in their own district stiffen them, per tie, up to MAX_BACKING. */
export const BACKING_NERVE = 4;
export const BACKING_TRUST = 2;
export const MAX_BACKING = 3;

export const FAMILY_LABELS = ['sibling', 'cousin', 'in-law', 'second cousin'];
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
  for (const [districtId, pool] of byDistrict) {
    const d: District | undefined = w.districts[districtId];
    if (!d || pool.length < 2) continue;
    linkDistrict(d, pool, rng);
    for (const n of pool) applyBacking(w, n);
  }
}

function linkDistrict(d: District, pool: Npc[], rng: Rng): void {
  const closeness = clamp(d.closeness, 0, 1);
  const byBlock = new Map<Id, Npc[]>();
  for (const n of pool) { const list = byBlock.get(n.homeBlockId) ?? []; list.push(n); byBlock.set(n.homeBlockId, list); }
  for (const n of pool) {
    // one roll for a first tie, a second roll only where the neighbourhood is tight
    const attempts = 1 + (rng.chance(closeness) ? 1 : 0);
    for (let i = 0; i < attempts; i++) {
      if (!rng.chance(LINK_BASE + LINK_PER_CLOSENESS * closeness)) continue;
      if (n.connections.length >= MAX_LINKS) break;
      // how far the tie reaches: the whole district where people are close, the block where they are not
      const reach = rng.chance(closeness) ? pool : (byBlock.get(n.homeBlockId) ?? pool);
      const other = pickPartner(n, reach, rng);
      if (!other) continue;
      const kind: Connection['kind'] = lastNameOf(n) === lastNameOf(other) || rng.chance(0.35 + 0.2 * closeness) ? 'family' : 'friend';
      const label = kind === 'family' ? rng.pick(FAMILY_LABELS) : rng.pick(FRIEND_LABELS);
      if (!connect(n, other, kind, label)) continue;
      // families share a name more often than not; only patrons take one, so business names stay
      // put, and only within one naming pool, so nobody ends up a Wei Marconi
      if (kind === 'family' && other.role === 'patron' && lastNameOf(n) !== lastNameOf(other) && sameNamePool(n, other) && rng.chance(0.6)) {
        other.name = `${other.name.split(' ').slice(0, -1).join(' ')} ${lastNameOf(n)}`;
      }
    }
  }
}

/** Do two people's surnames come out of the same naming pool? Cosmetic: it only guards renames. */
function sameNamePool(a: Npc, b: Npc): boolean {
  const ga = groupsOfLastName(lastNameOf(a));
  return groupsOfLastName(lastNameOf(b)).some(g => ga.includes(g));
}

/** Someone free to be tied to, preferring a shared surname: that is what makes a family read as one. */
function pickPartner(n: Npc, reach: Npc[], rng: Rng): Npc | undefined {
  const free = reach.filter(o => o.id !== n.id && o.alive && o.connections.length < MAX_LINKS && !isConnected(n, o));
  if (!free.length) return undefined;
  const kin = free.filter(o => lastNameOf(o) === lastNameOf(n));
  return kin.length && rng.chance(0.7) ? rng.pick(kin) : rng.pick(free);
}

/**
 * People with real backup are harder to scare and slower to warm to a stranger. Applied
 * identically to every NPC from their own connection count — never from where they or
 * their district's names come from.
 */
export function applyBacking(w: World, n: Npc): void {
  const backing = Math.min(MAX_BACKING, backingOf(w, n));
  if (!backing) return;
  n.nerve = clamp(n.nerve + backing * BACKING_NERVE);
  n.rel.trust = clamp(n.rel.trust - backing * BACKING_TRUST, -100, 100);
}
