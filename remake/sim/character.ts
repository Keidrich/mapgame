/**
 * Your character (`content/character.ts`): training and study, boosts and the habit they leave,
 * and the name fear and respect add up to.
 *
 * Training is hours and a little money for experience in one skill, at a place of the right kind in
 * the right half, once a skill a day, more for keeping at it day after day. A boost buys hours or an
 * edge today and puts a point of habit on you; past a line, a day without one costs hours in the
 * morning. Reputation is read, never stored: it follows fear and respect wherever they go.
 */
import { BOOSTS, HABIT, HARD_SCENES, REP_AT, REPUTATION, SOFT_SCENES, TRAIN, TRAINING, type BoostKind, type Reputation } from '@r/content/character';
import { half } from './clock';
import type { Business, Skill, World } from './types';
import { PLAYER } from './types';
import { log } from './util';
import { practise } from './people';

// ------------------------------------------------------------------------------------ reputation
export function reputation(w: World): Reputation {
  const { fear, respect } = w.player;
  if (fear >= REP_AT.high && respect >= REP_AT.high) return 'honoured';
  if (fear >= REP_AT.high && fear >= respect + REP_AT.lead) return 'feared';
  if (respect >= REP_AT.high && respect >= fear + REP_AT.lead) return 'respected';
  return fear + respect >= REP_AT.rising * 2 ? 'rising' : 'nobody';
}

/** The lines your character adds to the odds of a conversation: your name, and what you are on. */
export function characterFactors(w: World, kind: string): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  const r = REPUTATION[reputation(w)];
  const rep = HARD_SCENES.includes(kind) ? r.hard : SOFT_SCENES.includes(kind) ? r.soft : 0;
  if (rep) out.push({ label: `Your reputation: ${r.label.toLowerCase()}`, n: rep });
  if (boostedWith(w, 'nerve')) out.push({ label: 'A bump, and it shows', n: HABIT.nerveOdds });
  else if (shaking(w)) out.push({ label: 'Your hands are shaking', n: HABIT.shaking });
  return out;
}

// -------------------------------------------------------------------------------------- training
/** Why you cannot train this skill here and now, or undefined if you can. `at` is a business or 'books'. */
export function trainBlock(w: World, skill: Skill, at: string): string | undefined {
  const t = TRAINING[skill]; const p = w.player;
  if (half(w) !== t.half) return t.half === 'day' ? `${t.verb} by day.` : `${t.verb} after dark.`;
  if (p.trained?.day === w.day && p.trained.skills.includes(skill)) return `You have had your ${skill} session today. Tomorrow.`;
  if (p.skills[skill] >= 10) return 'As good as anybody gets.';
  if (t.at === 'books') return at === 'books' ? undefined : 'Study with the books.';
  const b = w.businesses[at];
  if (!b || !t.at.includes(b.type)) return `Not somewhere to ${t.verb.toLowerCase()}.`;
  if (b.closed > 0) return `${b.name} is shut.`;
  if (b.blockId !== p.blockId) return `Go to ${w.blocks[b.blockId].name} first.`;
  return undefined;
}
const yours = (b: Business) => b.ownedBy === PLAYER || b.protection?.by === PLAYER;
export function trainFee(w: World, at: string): number {
  const b = w.businesses[at];
  return !b || yours(b) ? 0 : TRAIN.fee * b.tier;
}
/** Today's streak: days in a row you have trained, counting today if you train now. */
export function streakNow(w: World): number {
  const s = w.player.streak;
  if (!s) return 1;
  return s.last === w.day ? s.n : s.last === w.day - 1 ? s.n + 1 : 1;
}
export function trainXp(w: World, at: string): number {
  const b = w.businesses[at];
  const tier = b ? b.tier : 1;
  return TRAIN.xp + (tier - 1) * TRAIN.perTier + Math.min(TRAIN.streakCap, (streakNow(w) - 1) * TRAIN.streak);
}
export function train(w: World, skill: Skill, at: string) {
  const p = w.player;
  const xp = trainXp(w, at);
  const n = streakNow(w);
  p.streak = { last: w.day, n };
  p.trained = p.trained?.day === w.day ? { day: w.day, skills: [...p.trained.skills, skill] } : { day: w.day, skills: [skill] };
  const before = p.skills[skill];
  practise(w, skill, xp);
  if (p.skills[skill] === before) log(w, `${TRAINING[skill].verb}: ${skill} +${xp} experience${n > 1 ? `, ${n} days running` : ''}.`, 'info');
}

// ---------------------------------------------------------------------------------------- boosts
export const boostedWith = (w: World, k: BoostKind) => w.player.boost?.day === w.day && w.player.boost.kinds.includes(k);
export const boostedToday = (w: World) => w.player.boost?.day === w.day;
/** In withdrawal: a habit past the line, and nothing yet today. */
export const shaking = (w: World) => (w.player.habit ?? 0) >= HABIT.withdrawal && !boostedToday(w);
/** Hours a benny gives you now. */
export const pepHours = (w: World) => ((w.player.habit ?? 0) >= HABIT.tolerance ? 1 : 2);
/** Bonus to a skill from a bump today: read by `skillOf`, so fights and jobs feel it too. */
export const nerveBonus = (w: World, skill: Skill) => (boostedWith(w, 'nerve') && (skill === 'muscle' || skill === 'charm') ? HABIT.nerveSkill : 0);

export function boostBlock(w: World, kind: BoostKind, at: string): string | undefined {
  if (at === 'fixer') { const fx = w.fixerId ? w.npcs[w.fixerId] : undefined; return fx?.alive && fx.rel.met ? undefined : 'Find the fixer first.'; }
  const b = w.businesses[at];
  if (!b || !BOOSTS[kind].at.includes(b.type)) return 'Nobody here sells that.';
  if (b.type === 'pharmacy' && half(w) !== 'day') return 'The pharmacy is shut for the night.';
  if (b.type === 'nightclub' && half(w) !== 'night') return 'The club opens after dark.';
  if (b.closed > 0) return `${b.name} is shut.`;
  if (b.blockId !== w.player.blockId) return `Go to ${w.blocks[b.blockId].name} first.`;
  return undefined;
}
export function takeBoost(w: World, kind: BoostKind) {
  const p = w.player;
  p.boost = boostedToday(w) ? { day: w.day, kinds: [...new Set([...p.boost!.kinds, kind])] } : { day: w.day, kinds: [kind] };
  p.habit = Math.min(100, (p.habit ?? 0) + BOOSTS[kind].habit);
  if (kind === 'pep') { const h = pepHours(w); p.ap += h; log(w, `${BOOSTS.pep.label}: ${h} more hour${h > 1 ? 's' : ''} today.`, 'info'); }
  else log(w, `${BOOSTS.nerve.label}. The world is sharp at the edges for the rest of the day.`, 'info');
}

/**
 * The morning after: a habit fades by itself on a day without a boost; past the line, a day
 * without one costs hours. Called from `endDay` with the new day's hours; returns them.
 */
export function habitMorning(w: World, hours: number, day: number): number {
  const p = w.player;
  if (!p.habit) return hours;
  const used = p.boost?.day === day;
  if (!used) p.habit = Math.max(0, p.habit - HABIT.fade);
  if (used || p.habit < HABIT.withdrawal) return hours;
  const lost = Math.min(HABIT.maxLost, 1 + Math.floor((p.habit - HABIT.withdrawal) / HABIT.perHour));
  log(w, `A bad morning: sweats, and ${lost} hour${lost > 1 ? 's' : ''} lost before you can face anybody. (Habit ${Math.round(p.habit)}.)`, 'bad');
  return Math.max(1, hours - lost);
}

export function dryOut(w: World) {
  const p = w.player;
  p.habit = Math.max(0, (p.habit ?? 0) - HABIT.dryOut.cut);
  log(w, `Three hours in the doctor's back room, and something in a drip. The habit is ${Math.round(p.habit)} now.`, 'good');
}
