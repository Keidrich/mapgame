/**
 * The family (`content/family.ts`): who is made, who holds the posts, and what the family does to
 * you at night — rats who talk and capos who reach for more. Everything that reads a post asks here,
 * so a consigliere who is jailed or dead simply stops counting.
 */
import { CONSIGLIERE, COUP, MADE_FLOOR, MAKING, RAT, UNDERBOSS, type FamilyRank, type Post } from '@r/content/family';
import { openCase } from './law';
import type { Rng } from './rng';
import type { Npc, World } from './types';
import { PLAYER } from './types';
import { clamp, fullName, log } from './util';

const active = (n: Npc | undefined): n is Npc => !!n?.alive && !!n.crew && n.crew.status !== 'jailed' && n.crew.status !== 'held';

/** The consigliere, if there is one who can sit at a table today. */
export function consigliere(w: World): Npc | undefined { const n = w.npcs[w.player.family?.consigliere ?? '']; return active(n) ? n : undefined; }
/** The underboss, if there is one on their feet. */
export function underboss(w: World): Npc | undefined { const n = w.npcs[w.player.family?.underboss ?? '']; return active(n) ? n : undefined; }

/** Where somebody stands in the family. */
export function familyRank(w: World, n: Npc): FamilyRank {
  const f = w.player.family;
  if (f?.underboss === n.id) return 'underboss';
  if (f?.consigliere === n.id) return 'consigliere';
  if (n.crew?.made && n.crew.assignment?.kind === 'district') return 'capo';
  return n.crew?.made ? 'soldier' : 'associate';
}

/** Why somebody cannot be made yet, or nothing. */
export function makeBlock(n: Npc): string | undefined {
  const c = n.crew; if (!c || !n.alive) return 'Not one of yours.';
  if (c.made) return `${n.first} is already made.`;
  if (c.status !== 'ready') return `${n.first} is ${c.status}.`;
  if (c.level < MAKING.level) return `Level ${MAKING.level} first: they have not done enough yet.`;
  if (c.loyalty < MAKING.loyalty) return `Loyalty ${MAKING.loyalty} first: you do not make somebody you are not sure of.`;
  return undefined;
}

export function makeMember(w: World, n: Npc) {
  const c = n.crew!;
  c.made = true;
  c.loyalty = clamp(c.loyalty + MAKING.loyaltyGain);
  c.cut = Math.round(c.cut * MAKING.cutRise);
  w.player.respect = clamp(w.player.respect + MAKING.respect, 0, 100);
  log(w, `In a back room, over a card and a drop of blood, ${fullName(n)} is made. ${n.first} is one of you now.`, 'good', { npcId: n.id });
}

export function appoint(w: World, post: Post, n: Npc | undefined) {
  const f = (w.player.family ??= {});
  // one person, one post: whoever takes a post leaves any other
  if (n) for (const k of ['consigliere', 'underboss'] as Post[]) if (f[k] === n.id) f[k] = undefined;
  f[post] = n?.id;
  log(w, n ? `${fullName(n)} is your ${post} now.` : `You leave the ${post}'s chair empty.`, 'info', n ? { npcId: n.id } : {});
}

// ------------------------------------------------------------------------------------ what posts do
export const sitDownBonus = (w: World) => { const c = consigliere(w); return c ? CONSIGLIERE.sitDown + c.skills.charm : 0; };
export const tributeMult = (w: World) => (consigliere(w) ? CONSIGLIERE.tribute : 1);
export const lobbyMult = (w: World) => (consigliere(w) ? CONSIGLIERE.lobby : 1);
export const auditBonus = (w: World) => { const c = consigliere(w); return c ? c.skills.brains * CONSIGLIERE.auditPerBrains : 0; };
/** What a racket nobody minds earns with the underboss keeping an eye on it. */
export const unmindedFloor = (w: World) => (underboss(w) ? UNDERBOSS.unminded : 0);

// ------------------------------------------------------------------------------------ at night
/**
 * Every night: made men do not drift below their floor; an unhappy associate with a file open may
 * start talking; a rat talks, or is found; an ambitious capo who has stopped caring may move.
 * Findings and moves come to you as cards (`events.ts`: `rat_found`, `coup`), scheduled for today.
 */
export function tickFamily(w: World, rng: Rng) {
  const p = w.player;
  const f = p.family;
  // a post held by somebody gone is empty
  if (f) for (const k of ['consigliere', 'underboss'] as Post[]) { const n = w.npcs[f[k] ?? '']; if (f[k] && (!n?.alive || !n.crew)) f[k] = undefined; }
  const files = Object.values(w.cases).filter(c => c.status === 'open' && (c.suspectId === PLAYER || p.crewIds.includes(c.suspectId)));
  for (const id of p.crewIds) {
    const n = w.npcs[id]; const c = n?.crew; if (!n?.alive || !c) continue;
    if (c.made && c.loyalty < MADE_FLOOR) c.loyalty = MADE_FLOOR;
    // turning: an unhappy associate, with something to trade
    if (!c.rat && files.length && c.loyalty < RAT.loyaltyUnder && c.status !== 'jailed') {
      const chance = (RAT.base + (RAT.loyaltyUnder - c.loyalty) * RAT.perPoint) * (c.made ? RAT.madeMult : 1);
      if (rng.chance(chance)) c.rat = { since: w.day };
    }
    if (c.rat) {
      // talking: the worst file against you gets thicker, or thinner if you are feeding them lies
      const worst = files.filter(x => x.suspectId === PLAYER).sort((a, b) => b.evidence - a.evidence)[0];
      if (c.rat.fed) { if (worst) worst.evidence = clamp(worst.evidence - 1); }
      else if (worst) worst.evidence = clamp(worst.evidence + RAT.evidence);
      else openCase(w, 'racketeering', PLAYER, undefined, `Racketeering: what somebody inside is telling them.`, 10);
      if (!c.rat.found && rng.chance(consigliere(w) ? CONSIGLIERE.ratSpot : RAT.luck)) {
        c.rat.found = true;
        w.scheduled.push({ day: w.day, template: 'rat_found', npcId: n.id });
      }
    }
    // a capo reaching for more
    if (c.assignment?.kind === 'district' && c.loyalty < COUP.loyaltyUnder && (n.traits.includes('ambitious') || n.traits.includes('greedy')) && !w.scheduled.some(s => s.template === 'coup') && rng.chance(COUP.chance)) {
      w.scheduled.push({ day: w.day, template: 'coup', npcId: n.id });
    }
  }
}
