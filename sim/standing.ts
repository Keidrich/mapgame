/**
 * Fear, trust, familiarity and word of mouth — the four numbers every social system in the
 * game reads, and for a long time the four that were flat.
 *
 * What was wrong, in one line each:
 *   - **Fear was a formula, not a consequence.** `threaten` paid an approach base plus half
 *     your muscle whether you said a word or put somebody in hospital.
 *   - **Trust was a counter.** Enough visits and anybody would hand over their business.
 *   - **Reputation was paint.** One notable act coloured every face within a block, so a name
 *     made on one side of town quietly worked on the other.
 *   - **Familiarity was checked in exactly one place.** `promoteReason` would not promote a
 *     stranger; nothing else cared how long you had known anyone.
 *
 * The fix is one rule applied four ways: **a relationship can only become as deep as the thing
 * that built it.** Talk buys wariness and stops. Violence buys terror immediately, because it
 * cost something to do. Deep trust needs leverage or a real favour behind it. And word reaches
 * the people who know the people who were there, and nobody further.
 *
 * Every number is in `content/standing.ts`. Nothing here reaches for `Math.random`.
 */
import { CONCESSION, DEMONSTRATED, FAMILIARITY, REPUTATION, STAKES, type Stake } from '@content/standing';
import { connectionsOf } from './connections';
import { PLAYER, type Id, type Npc, type World } from './types';


// ------------------------------------------------------------------ familiarity
/** Days since you first dealt with them. A stranger is `0`, never `w.day`. */
export function daysKnown(w: World, n: Npc): number {
  return n.rel.metDay === undefined ? 0 : w.day - n.rel.metDay;
}
export function contacts(n: Npc): number { return n.rel.contacts ?? 0; }

/**
 * The floor itself, cut from `promoteReason`'s `w.day - c.joinedDay >= LIEUTENANT.minDays`.
 * Both halves matter: days stop you buying a history in an afternoon, occasions stop you
 * claiming one from a single conversation six days ago.
 */
export function familiar(w: World, n: Npc): boolean {
  return daysKnown(w, n) >= FAMILIARITY.minDays && contacts(n) >= FAMILIARITY.minContacts;
}
/** Why they are still a stranger, in the same voice `promoteReason` uses. */
export function familiarReason(w: World, n: Npc): string | undefined {
  if (familiar(w, n)) return undefined;
  if (n.rel.metDay === undefined) return `You have never actually dealt with ${n.name}. Go and meet them first.`;
  const d = daysKnown(w, n), c = contacts(n);
  if (d < FAMILIARITY.minDays) return `You met ${n.name} ${d} day${d === 1 ? '' : 's'} ago. Give it ${FAMILIARITY.minDays}.`;
  return `You have dealt with ${n.name} ${c} time${c === 1 ? '' : 's'}. Make it ${FAMILIARITY.minContacts} before asking for anything real.`;
}

/**
 * Mark that the player was in front of this person today. Once per day per person, so a scene
 * that nudges three numbers is still one occasion — the thing being counted is meetings, not
 * arithmetic. Called from `adjustRel`, never by hand.
 */
export function makeContact(w: World, n: Npc): void {
  if (n.rel.metDay === undefined) n.rel.metDay = w.day;
  if (n.rel.lastContactDay === w.day) return;
  n.rel.lastContactDay = w.day;
  n.rel.contacts = contacts(n) + 1;
}

// ------------------------------------------------------------------ fear, by what it cost
/**
 * How high this act is allowed to take their fear. Below the familiarity floor a stranger can
 * only be made so nervous by talk — but a demonstrated act is exempt, because breaking
 * somebody's window introduces you perfectly well.
 */
export function fearCeiling(w: World, n: Npc, stake: Stake): number {
  const hard = STAKES[stake].ceiling;
  if (DEMONSTRATED.includes(stake) || familiar(w, n)) return hard;
  return Math.min(hard, FAMILIARITY.shallowFear);
}

/**
 * The fear one act buys. Scaled by what the act cost, and capped by where that cost can reach:
 * at or above the ceiling the gain is zero, which is the intended reading — once somebody has
 * watched you put a man in hospital, your hard stare tells them nothing new.
 */
export function fearGain(w: World, n: Npc, amount: number, stake: Stake): number {
  if (amount <= 0) return amount;
  const room = fearCeiling(w, n, stake) - n.rel.fear;
  if (room <= 0) return 0;
  return Math.min(amount * STAKES[stake].mult, room);
}

// ------------------------------------------------------------------ trust, and what deepens it
/**
 * Where ordinary dealing stops. Favours actually resolved raise it — that is reciprocity, and
 * it is the only thing that does. Nothing raises it to 100: nobody is bought outright.
 */
export function trustCeiling(n: Npc): number {
  return Math.min(CONCESSION.favourCeiling, CONCESSION.ordinary + favours(n) * CONCESSION.perFavour);
}
export function favours(n: Npc): number { return n.rel.favours ?? 0; }

export function trustGain(w: World, n: Npc, amount: number): number {
  if (amount <= 0) return amount;
  const cap = familiar(w, n) ? trustCeiling(n) : Math.min(trustCeiling(n), FAMILIARITY.shallowTrust);
  const room = cap - n.rel.trust;
  return room <= 0 ? 0 : Math.min(amount, room);
}

/**
 * You resolved something real for them. This is the reciprocity half of the concession gate,
 * and the hook the agenda-resolution pass plugs into: anything that genuinely settles somebody's
 * problem calls this once, and the relationship is allowed to go deeper from then on.
 */
export function doFavour(w: World, n: Npc, _reason?: string): void {
  n.rel.favours = favours(n) + 1;
  makeContact(w, n);
}

// ------------------------------------------------------------------ leverage
export type LeverageKind = 'ground' | 'dirt' | 'held';
export interface Leverage { kind: LeverageKind; why: string }

/**
 * Something real that makes a concession make sense to *them*, separate from whether they like
 * you. Three kinds, all of which the player had to do something to get:
 *   - **ground** — you hold the street their door opens onto. Saying no has a cost.
 *   - **dirt** — you have been inside their books, or you are still listening.
 *   - **held** — somebody they are connected to is in your cellar.
 */
export function leverageOver(w: World, n: Npc): Leverage | undefined {
  const blk = w.blocks[n.homeBlockId];
  if (blk && (blk.influence[PLAYER] ?? 0) >= CONCESSION.groundInfluence) {
    return { kind: 'ground', why: `You hold ${blk.name}. ${n.name} knows whose street this is.` };
  }
  if (n.tap) return { kind: 'dirt', why: `You are still listening to ${n.name}.` };
  if (n.ratted !== undefined && w.day - n.ratted <= CONCESSION.dirtDays) {
    return { kind: 'dirt', why: `You have been through ${n.name}'s books and they know it.` };
  }
  for (const c of connectionsOf(w, n)) if (c.npc.hostage) return { kind: 'held', why: `You are holding ${c.npc.name}, their ${c.label}.` };
  return undefined;
}

/**
 * The shared gate for every major concession — protection, a place in the crew, a partner's
 * cut, a friendly price. Trust is necessary and never sufficient: on top of it you need
 * leverage over them or a favour they owe you. Returns why not, or undefined.
 */
export function concessionReason(w: World, n: Npc, what: string): string | undefined {
  const why = familiarReason(w, n); if (why) return why;
  if (favours(n) > 0 || leverageOver(w, n)) return undefined;
  return `${n.name} is friendly, and ${what} is not a thing you ask a friend for. Do something real for them, hold their street, or get inside their books first.`;
}

// ------------------------------------------------------------------ word of mouth
/**
 * Everybody who was actually there. A block's owners and their regulars: the people who saw
 * it, or who heard the glass from the next door down.
 */
export function witnessesAt(w: World, blockId: Id): Npc[] {
  const b = w.blocks[blockId]; if (!b) return [];
  const out: Npc[] = [];
  for (const bid of b.businessIds) {
    const biz = w.businesses[bid]; if (!biz) continue;
    for (const id of [biz.ownerId, ...biz.patronIds]) { const n = w.npcs[id]; if (n?.alive) out.push(n); }
  }
  return out;
}

/**
 * Walk out from the witnesses along the connections graph, handing each ring a weaker share.
 * Deterministic: the graph is walked in `connections` order, which is the order it was built
 * in, so two runs of the same seed reach the same people.
 *
 * Somebody with no path back to anyone who was there hears nothing — which is the whole change.
 * Expanding into new ground means starting cold there, socially, every time.
 */
export function propagation(w: World, seeds: Npc[], degrees = REPUTATION.degrees.length - 1): { npc: Npc; weight: number }[] {
  const maxDeg = Math.min(degrees, REPUTATION.degrees.length - 1);
  const seen = new Map<Id, number>();
  let ring = seeds.filter(n => n?.alive);
  for (const n of ring) if (!seen.has(n.id)) seen.set(n.id, 0);
  for (let deg = 1; deg <= maxDeg; deg++) {
    const next: Npc[] = [];
    for (const n of ring) {
      // word reaches the people closest to them, not their whole address book at once
      for (const c of connectionsOf(w, n).slice(0, REPUTATION.fanout)) {
        if (seen.has(c.npc.id)) continue;
        seen.set(c.npc.id, deg);
        next.push(c.npc);
      }
    }
    ring = next;
    if (!ring.length) break;
  }
  const out: { npc: Npc; weight: number }[] = [];
  for (const [id, deg] of seen) { const n = w.npcs[id]; if (n?.alive) out.push({ npc: n, weight: REPUTATION.degrees[deg] }); }
  return out;
}

// ------------------------------------------------------------------ the same idea, one size up
/**
 * A faction's version of leverage. A sit-down is a concession too — an alliance, or a block
 * handed over — and "we have been getting along" is no more a reason for an outfit than it is
 * for a shopkeeper. `f.owed` is the reciprocity half and already existed; the rest is the
 * ground-and-dirt half, measured against the blocks and the people they actually have.
 */
export function factionLeverage(w: World, f: { id: Id; owed?: number; bossId: Id; lieutenantIds: Id[] }): Leverage | undefined {
  if ((f.owed ?? 0) > 0) return { kind: 'held', why: 'They owe you a favour.' };
  const theirs = Object.values(w.blocks).filter(b => (b.influence[f.id] ?? 0) > 0);
  const contested = theirs.filter(b => (b.influence[PLAYER] ?? 0) >= CONCESSION.groundInfluence);
  if (contested.length >= 2 || (theirs.length > 0 && contested.length / theirs.length >= 0.25)) {
    return { kind: 'ground', why: `You already hold ${contested.length} of the ${theirs.length} blocks they claim.` };
  }
  for (const id of [f.bossId, ...f.lieutenantIds]) {
    const n = w.npcs[id];
    if (n?.tap || (n?.ratted !== undefined && w.day - n.ratted <= CONCESSION.dirtDays)) return { kind: 'dirt', why: `You have something on ${n.name}.` };
  }
  return undefined;
}
