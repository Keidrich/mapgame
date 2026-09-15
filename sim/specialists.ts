/**
 * Hiring somebody for one job. See `content/specialists.ts` for what the roles are and why.
 *
 * Everything here goes through machinery that already exists: `concessionReason` and
 * `leverageOver` decide whether somebody will take the job at all and what it costs, exactly as
 * they decide whether an owner will hand over protection. A specialist is not a new kind of
 * relationship — it is an ordinary person you are paying for one night.
 */
import { JOB_ROLES, RELIABILITY, SPECIALISTS, SPECIALIST_FEE, type SpecialistRole } from '@content/specialists';
import { OP_DEFS } from '@content/rackets';
import { leverageOver } from './standing';
import type { Rng } from './rng';
import type { Id, Npc, Op, OpKind, World } from './types';

/** The parts this job has, if it is the kind of job that has parts. */
export const rolesFor = (kind: OpKind): SpecialistRole[] => JOB_ROLES[kind] ?? [];
export const isSetPiece = (kind: OpKind): boolean => rolesFor(kind).length > 0;

/**
 * Who in the city could actually do this. Anybody the player has met who is not already crew and
 * is good enough at the thing — best first, so the planner offers the ones worth paying.
 */
export function candidatesFor(w: World, role: SpecialistRole): Npc[] {
  const def = SPECIALISTS[role];
  return Object.values(w.npcs)
    .filter(n => n.alive && !n.crew && !n.official && (n.known || n.rel.trust >= 20) && n.skills[def.skill] >= 5)
    .sort((a, b) => b.skills[def.skill] - a.skills[def.skill] || a.id.localeCompare(b.id))
    .slice(0, 6);
}

/** What this person charges for this part of this job. */
export function specialistFee(w: World, kind: OpKind, role: SpecialistRole, n: Npc): number {
  const def = SPECIALISTS[role];
  const payout = OP_DEFS[kind].payout[1];
  const base = def.fee + payout * SPECIALIST_FEE.perPayout;
  const liked = Math.max(SPECIALIST_FEE.minShare, 1 - Math.max(0, n.rel.trust) * SPECIALIST_FEE.trustDiscount);
  const held = leverageOver(w, n) ? SPECIALIST_FEE.leverageShare : 1;
  return Math.round(base * liked * held);
}

/**
 * How likely they are to come through on the night. The whole reason a cheap specialist is cheap.
 * Skill and how well they know you; nothing else, and no hidden roll before the job.
 */
export function reliability(role: SpecialistRole, n: Npc): number {
  const def = SPECIALISTS[role];
  const r = RELIABILITY.base + n.skills[def.skill] * RELIABILITY.perSkill + Math.max(0, n.rel.trust) * RELIABILITY.perTrust;
  return Math.min(RELIABILITY.max, Math.round(r * 100) / 100);
}

/** Why they will not take the job. Undefined when they will. */
export function hireReason(w: World, role: SpecialistRole, n: Npc): string | undefined {
  if (!n.alive) return 'They are gone.';
  if (n.crew) return 'They already work for you.';
  if (n.skills[SPECIALISTS[role].skill] < 5) return `${n.name} does not do that kind of work.`;
  if (n.rel.trust < -20 && !leverageOver(w, n)) return `${n.name} would not get in a car with you.`;
  return undefined;
}

/** Everybody hired onto this job, as roles. */
export function hiredOn(o: Op): { role: SpecialistRole; npcId: Id }[] { return (o.specialists ?? []) as { role: SpecialistRole; npcId: Id }[]; }

/**
 * What the hired help is worth to the odds, before the night decides who actually turned up.
 * Read by `opChance` so the planner's number is the number, and by the resolver so it is not
 * computed twice from two different places.
 */
export function specialistWorth(w: World, o: Pick<Op, 'kind' | 'specialists'>): number {
  return hiredOn(o as Op).reduce((t, h) => {
    const n = w.npcs[h.npcId];
    return t + (n ? SPECIALISTS[h.role].worth * reliability(h.role, n) : 0);
  }, 0);
}

/**
 * The night itself: who came through and who did not, rolled once, per person.
 *
 * Returns the lines to put in front of the player — a set-piece that half worked should read as a
 * set-piece that half worked, naming which part went, rather than as a number that came out low.
 */
export function rollSpecialists(w: World, o: Op, rng: Rng): { bonus: number; lines: string[] } {
  let bonus = 0; const lines: string[] = [];
  for (const h of hiredOn(o)) {
    const n = w.npcs[h.npcId]; if (!n) continue;
    const def = SPECIALISTS[h.role];
    if (rng.float() <= reliability(h.role, n)) { bonus += def.worth; lines.push(`${n.name} did exactly what ${n.name.split(' ')[0]} was paid to do.`); }
    else lines.push(`${def.failLine}`);
  }
  return { bonus, lines };
}
