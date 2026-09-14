/**
 * Pushing back on the law, rather than only outrunning it.
 *
 * Before this, an `Authority` only ever escalated. Heat cooled on its own and a captain's
 * retainer slowed a file down, but nothing a player could do reached `Authority.attention` —
 * `bribe_official` moves an official's trust and buries paper, and never touches the number the
 * building actually decides its posture from. So a crackdown was weather: you waited it out.
 *
 * Three jobs change that, and all three are ordinary ops in `OP_DEFS` with `requires` and a
 * tier, so they sit in the same tree as everything else. What makes them a set is that all
 * three read the *target Authority's posture* as difficulty — leaning on a routine precinct and
 * leaning on one in a crackdown are different jobs — and the two that cost money scale that
 * cost the same way, so pushing back late is punishing rather than merely expensive.
 */
import { AUTHORITY, POSTURES, POSTURE_ORDER } from '@content/authority';
import { authorities, authorityOf, effectivePolice, topPosture } from './authority';
import { openCases } from './cases';
import { clamp, log, money } from './util';
import type { Rng } from './rng';
import type { Authority, CaseFile, Id, Npc, World } from './types';

/** How far up the ladder a posture sits, 0..4. The scaling term for cost and difficulty. */
export function rungOf(posture: Authority['posture']): number { return POSTURE_ORDER.indexOf(posture); }

/** The building a job is aimed at: the target's own, or the hardest-looking one in the city. */
export function targetAuthority(w: World, t: { npcId?: Id; caseId?: Id }): Authority | undefined {
  const n = t.npcId ? w.npcs[t.npcId] : undefined;
  const theirs = n ? authorityOf(w, n) : undefined;
  if (theirs) return theirs;
  // a file or a cell belongs to whoever is looking hardest: that is who has to be reached
  return authorities(w).slice().sort((a, b) => rungOf(b.posture) - rungOf(a.posture))[0];
}

/**
 * Added to an op's difficulty for law-facing work. Posture is most of it; the ground the
 * building stands on is the rest, so a precinct in a quiet corner is easier to reach into than
 * one surrounded by patrols.
 */
export function authorityDifficulty(w: World, t: { npcId?: Id; caseId?: Id }): number {
  const a = targetAuthority(w, t);
  if (!a) return 0;
  const rung = rungOf(a.posture) * 9;              // 0 at routine, 36 at crackdown
  const ground = (effectivePolice(w, a.blockId) - 50) * 0.12;
  const attention = a.attention * 0.08;
  return Math.round(rung + ground + attention);
}

// ---------------------------------------------------------------- buying down attention
/**
 * What it costs to buy an Authority's attention down, before the roll. Deliberately brutal at
 * the top: a routine precinct is a few thousand, a crackdown is an order of magnitude more,
 * because the whole point is that letting it climb should hurt.
 */
export const BUY_DOWN = {
  base: 2200,
  perRung: 2.35,          // multiplied per rung up the ladder
  perAttention: 90,
  /** Attention knocked off on a success, before the official's own corruption. */
  drop: 26,
  /** A clean failure still buys something; a bad one buys nothing and is noticed. */
  fumbleDrop: 4,
};

export function buyDownCost(w: World, npcId?: Id): number {
  const a = targetAuthority(w, { npcId });
  if (!a) return BUY_DOWN.base;
  const rung = rungOf(a.posture);
  return Math.round((BUY_DOWN.base + a.attention * BUY_DOWN.perAttention) * Math.pow(BUY_DOWN.perRung, rung));
}

/** What one success actually takes off, given who you went through. */
export function buyDownAmount(n: Npc): number {
  const o = n.official;
  const corrupt = 0.6 + (o ? o.corruption / 100 : 0.4) * 0.8;   // a bent official moves more
  return Math.round(BUY_DOWN.drop * corrupt);
}

export function buyDownAttention(w: World, n: Npc, success: boolean): number {
  const a = authorityOf(w, n) ?? targetAuthority(w, { npcId: n.id });
  if (!a) return 0;
  const drop = success ? buyDownAmount(n) : BUY_DOWN.fumbleDrop;
  const before = a.attention;
  a.attention = clamp(a.attention - drop, 0, 100);
  // the posture follows the number down straight away, rather than waiting for the next tick
  const rung = POSTURE_ORDER.slice().reverse().find(k => a.attention >= POSTURES[k].at) ?? 'routine';
  if (rung !== a.posture) { a.posture = rung; a.postureSince = w.day; }
  return Math.round(before - a.attention);
}

// ---------------------------------------------------------------- springing somebody
/** Your people currently in a cell — the only valid marks for a spring. */
export function jailedCrew(w: World): Npc[] {
  return w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.crew?.status === 'jailed');
}
export function isJailedCrew(w: World, npcId?: Id): boolean {
  return !!npcId && w.npcs[npcId]?.crew?.status === 'jailed';
}
/** Out, on their feet, and they remember who came for them. */
export function springFrom(n: Npc): number {
  const c = n.crew; if (!c) return 0;
  const owed = c.statusDays;
  c.status = 'idle'; c.statusDays = 0; c.assignment = undefined;
  c.loyalty = clamp(c.loyalty + 18);
  n.notes.push('You got them out.');
  return owed;
}

// ---------------------------------------------------------------- killing a file
export const BUY_CASE = {
  base: 3000,
  perRung: 2.1,
  /** Cost also scales with how far along the file already is: late is expensive. */
  perEvidence: 120,
  /** Evidence taken off by a failure that still cost you the money. */
  fumbleDrop: 8,
};
export function buyCaseCost(w: World, caseId?: Id): number {
  const c = caseId ? (w.cases ?? []).find(x => x.id === caseId) : undefined;
  const rung = rungOf(topPosture(w));
  return Math.round((BUY_CASE.base + (c?.evidence ?? 20) * BUY_CASE.perEvidence) * Math.pow(BUY_CASE.perRung, rung));
}
export function openCaseById(w: World, caseId?: Id): CaseFile | undefined {
  return caseId ? openCases(w).find(c => c.id === caseId) : undefined;
}
/**
 * Kill it outright. Distinct from silencing a witness, which only stops the file *growing* —
 * this closes it, and a failed attempt leaves fingerprints on the attempt itself.
 */
export function killCase(w: World, c: CaseFile, success: boolean, rng: Rng): boolean {
  if (success) {
    c.status = 'cold'; c.closedDay = w.day; c.evidence = clamp(c.evidence - 45);
    log(w, `The ${c.title} file goes into a drawer nobody opens. Whatever was in it is somebody else's problem now.`, 'good', c.refs);
    return true;
  }
  c.evidence = clamp(c.evidence - BUY_CASE.fumbleDrop);
  // reaching for a file and missing is itself a thing detectives notice
  const noticed = rng.chance(0.4);
  if (noticed) c.evidence = clamp(c.evidence + 12);
  log(w, `Somebody says no, and says it to the wrong person. The ${c.title} file is still open${noticed ? ', and now it has a note in it about you' : ''}.`, 'bad', c.refs);
  return false;
}

/** A line for the ops planner: what this is going to cost before anybody rolls anything. */
export function lawJobPrice(w: World, kind: 'buy_down' | 'buy_case', t: { npcId?: Id; caseId?: Id }): { cost: number; posture: string; why: string } {
  const a = targetAuthority(w, t);
  const cost = kind === 'buy_down' ? buyDownCost(w, t.npcId) : buyCaseCost(w, t.caseId);
  const rung = a ? POSTURES[a.posture] : POSTURES.routine;
  return {
    cost,
    posture: rung.label,
    why: a && rungOf(a.posture) > 0
      ? `${a.name} is ${rung.label.toLowerCase()}. That is what makes this ${money(cost)} instead of ${money(kind === 'buy_down' ? BUY_DOWN.base : BUY_CASE.base)}.`
      : 'Nobody is looking very hard yet, which is exactly why this is cheap.',
  };
}

/** Relief a bought official gives their building, re-exported so the ops UI can explain it. */
export const BOUGHT_RELIEF = AUTHORITY.boughtRelief;
