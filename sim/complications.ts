/**
 * A big job stops halfway and asks you a question.
 *
 * This adds no pending-action machinery of its own. A complication *is* a `Confrontation`, with
 * `kind: 'op'`, queued by `queueConfrontation`, answered through `resolve_confrontation`, shown
 * by the same modal, priced by the same `kitSkillBoost`/`kitApproachBias` the fight at your door
 * uses, and swept up by the same "unanswered lands at End Day" line in the tick. The only new
 * thing is what the three answers mean on a job instead of on a doorstep, and what the answer
 * does to the op's own roll.
 *
 * Tier gating is deliberate and load-bearing: a tier-0/1 street job stays a single fast roll,
 * because the difference between a stick-up and a bank job should be felt and not just costed.
 */
import { COMPLICATION, COMPLICATIONS, COMPLICATION_KINDS, type ComplicationKind } from '@content/complications';
import { OP_DEFS } from '@content/rackets';
import { queueConfrontation } from './combat';
import type { Rng } from './rng';
import { PLAYER, type Confrontation, type ConfrontApproach, type Op, type World } from './types';

/** Ops big enough to go wrong in an interesting way. Tier 0 and 1 never qualify. */
export function canComplicate(kind: Op['kind']): boolean {
  return (OP_DEFS[kind].tier ?? 0) >= COMPLICATION.minTier;
}

/** How likely this particular job is to raise one, climbing with tier. */
export function complicationChance(kind: Op['kind']): number {
  if (!canComplicate(kind)) return 0;
  const tier = OP_DEFS[kind].tier ?? 0;
  return Math.min(0.75, COMPLICATION.chance + (tier - COMPLICATION.minTier) * COMPLICATION.chancePerTier);
}

/** Which problems make sense on this job. `only` lets a def restrict itself; most do not. */
export function eligible(kind: Op['kind']): ComplicationKind[] {
  const out = COMPLICATION_KINDS.filter(k => {
    const only = COMPLICATIONS[k].only;
    return !only || only.includes(kind);
  });
  // an inside man can only wobble if there is one
  return out;
}

/**
 * Raise one, if this job is the kind that can and the dice say so. Returns the complication
 * kind when the op should now *wait* for an answer, or undefined to resolve as normal.
 */
export function maybeComplicate(w: World, o: Op, rng: Rng): ComplicationKind | undefined {
  if (o.complication) return undefined;            // already had its moment
  if (!canComplicate(o.kind)) return undefined;
  if (!rng.chance(complicationChance(o.kind))) return undefined;

  let pool = eligible(o.kind);
  if (!o.insideId) pool = pool.filter(k => k !== 'inside_wobble');   // nobody in there to lose their nerve
  if (!pool.length) return undefined;
  const kind = rng.pick(pool);

  const def = COMPLICATIONS[kind];
  const target = o.targetBusinessId ? w.businesses[o.targetBusinessId] : undefined;
  const where = target?.name ?? (o.targetNpcId ? w.npcs[o.targetNpcId]?.name : undefined) ?? 'the place';
  const blockId = target?.blockId ?? o.targetBlockId ?? (o.targetNpcId ? w.npcs[o.targetNpcId]?.homeBlockId : undefined);

  o.complication = { kind };
  // PLAYER as the faction id: a complication has no faction behind it, and `confrontChance`
  // falls back to a neutral soldier count when it cannot find one.
  queueConfrontation(w, {
    factionId: target?.protection?.factionId ?? PLAYER,
    kind: 'op',
    war: false,
    text: `${OP_DEFS[o.kind].label}, halfway through: ${def.text.replace('%s', where)}`,
    opId: o.id,
    complication: kind,
    businessId: target?.id,
    npcId: o.targetNpcId,
    blockId,
  });
  return kind;
}

/** The option text for a complication: the same three ids, meaning something job-specific. */
export function complicationOptions(c: Confrontation) {
  const def = COMPLICATIONS[c.complication!];
  return def.options;
}
/** Odds nudge for one answer on this particular problem. */
export function complicationBias(c: Confrontation, approach: ConfrontApproach): number {
  return c.complication ? COMPLICATIONS[c.complication].bias[approach] : 0;
}

/**
 * What the answer does to the job. A well-handled complication is worth roughly one more
 * competent crew member; never turning up is worse than handling it badly, which is the whole
 * reason the modal blocks the rest of your day.
 */
export function complicationSwing(o: Op, won: boolean, approach: ConfrontApproach | 'absent'): number {
  if (!o.complication?.answered) return 0;   // no complication, or one not yet answered
  if (approach === 'absent') return -COMPLICATION.absentPenalty;
  return won ? COMPLICATION.handledBonus : -COMPLICATION.fumbledPenalty;
}
/** Heat multiplier from how it was answered: going through people is louder than talking. */
export function complicationHeat(o: Op): number {
  const a = o.complication?.answered;
  return a && a !== 'absent' ? COMPLICATION.heatBy[a] : a === 'absent' ? 1.2 : 1;
}
