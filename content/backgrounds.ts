/**
 * Where you came from: the five presets, and what a character built by hand may spend.
 * Balance numbers live here; `sim/generate.ts` applies them.
 */
import type { Player, Skills, StartTraitId } from '@sim/types';

export type BackgroundId = Player['background'];

export interface BackgroundDef {
  id: BackgroundId;
  label: string;
  ico: string;
  blurb: string;   // one line, on the button
  detail: string;  // what it actually does, shown when selected
  skills: Skills;
}

/** Wheels: legwork a day on top of what the skill itself gives. */
export const WHEELS_BONUS_LEGWORK = 2;
/** Tech: one of these is already in your head. Both are early productions, so it pays from day one. */
export const TECH_START_RECIPES = ['aged', 'sugar_shine', 'hydro', 'import_cut'];

/** The base everybody starts from before their background is stamped on it. */
export const BASE_SKILLS: Skills = { muscle: 4, brains: 4, charm: 4, wheels: 3, tech: 2 };

export const BACKGROUND_DEFS: BackgroundDef[] = [
  {
    id: 'muscle', label: 'Muscle', ico: '💪', blurb: 'You came up on the door. People pay when you ask.',
    detail: 'Muscle 8. Threats, strongarm shakedowns and loud ops land far more often. The fast, noisy opening: take a block by frightening it.',
    skills: { ...BASE_SKILLS, muscle: 8 },
  },
  {
    id: 'brains', label: 'Brains', ico: '🧠', blurb: 'Numbers, paper, plans. You see the angles.',
    detail: 'Brains 8, tech 4. Numbers, bookmaking and laundering earn more, quiet ops go cleaner, and you spot a lieutenant skimming. The patient opening: build a machine.',
    skills: { ...BASE_SKILLS, brains: 8, tech: 4 },
  },
  {
    id: 'charm', label: 'Charm', ico: '🎩', blurb: 'Everybody likes you. That is the whole trick.',
    detail: 'Charm 8. Visits, recruiting, sit-downs and brokering all go your way, and product sells for more. The social opening: own people before you own blocks.',
    skills: { ...BASE_SKILLS, charm: 8 },
  },
  {
    id: 'wheels', label: 'Wheels', ico: '🚗', blurb: 'You drove for other people. Now you drive for yourself.',
    detail: `Wheels 8, and ${WHEELS_BONUS_LEGWORK} extra legwork a day on top of it — nine hops where most people get three. You cover the whole neighbourhood before lunch: collect further out, get to a threatened owner the same day, and run smuggling and chop shops better. The mobile opening: be everywhere.`,
    skills: { ...BASE_SKILLS, wheels: 8 },
  },
  {
    id: 'tech', label: 'Tech', ico: '🔌', blurb: 'Locks, wires, stills and presses. You make things work.',
    detail: 'Tech 8, and you already know one recipe — a still or a grow op runs at quality from day one, years before anyone else steals a formula. Inside jobs and quiet ops go better. The maker\'s opening: sell what nobody else can make.',
    skills: { ...BASE_SKILLS, tech: 8 },
  },
];

export const BACKGROUND_BY_ID = Object.fromEntries(BACKGROUND_DEFS.map(b => [b.id, b])) as Record<string, BackgroundDef>;

// ---------------------------------------------------------------- building your own
/**
 * Point-buy. Deliberately under every preset's total (21 to 23) and capped below their
 * spike of 8: a hand-built character is broader and picks an edge, a preset is sharper
 * and comes with a perk. Neither is strictly better.
 */
export const CUSTOM_BUDGET = 19;
export const CUSTOM_SKILL_MIN = 1;
export const CUSTOM_SKILL_MAX = 7;
export const SKILL_ORDER: (keyof Skills)[] = ['muscle', 'brains', 'charm', 'wheels', 'tech'];
export const SKILL_LABELS: Record<keyof Skills, string> = { muscle: 'Muscle', brains: 'Brains', charm: 'Charm', wheels: 'Wheels', tech: 'Tech' };
export const SKILL_BLURBS: Record<keyof Skills, string> = {
  muscle: 'Threats, strongarm shakedowns, loud ops, holding a block when it turns.',
  brains: 'Numbers, bookmaking and laundering income, quiet ops, catching a lieutenant skimming.',
  charm: 'Visits, recruiting, sit-downs, brokering, and what product sells for.',
  wheels: 'Legwork a day: how much of the city you can cross before you run out of shoe leather.',
  tech: 'Production quality, recipes, alarms and locks on an inside job.',
};

export const START_TRAITS: { id: StartTraitId; label: string; ico: string; blurb: string; detail: string }[] = [
  { id: 'connected', label: 'Connected', ico: '🤝', blurb: 'You did not arrive a stranger.', detail: 'Two more people on your block already know and trust you — warm from day one, and the shortest path to a first crew member.' },
  { id: 'earner', label: 'Earner', ico: '💵', blurb: 'You came with a roll.', detail: '$2,500 more clean cash to open with: a safehouse and a racket on day one instead of day six.' },
  { id: 'local', label: 'Local', ico: '🏠', blurb: 'You grew up on this street.', detail: 'Your home block starts with much more of your influence on it, and a little respect on the street. You run your first block far sooner.' },
  { id: 'feared', label: 'Feared', ico: '😨', blurb: 'Something about you they heard before you arrived.', detail: 'You start with a reputation, and every owner on your block is already afraid of you. First shakedowns fold; nobody warms to you quickly.' },
];
export const START_TRAIT_BY_ID = Object.fromEntries(START_TRAITS.map(t => [t.id, t])) as Record<StartTraitId, typeof START_TRAITS[number]>;

/** Clamp a hand-built spread into the rules, whatever the UI sent. Pure and total. */
export function legalCustomSkills(input: Partial<Skills> | undefined): Skills {
  const out = {} as Skills;
  for (const k of SKILL_ORDER) out[k] = Math.max(CUSTOM_SKILL_MIN, Math.min(CUSTOM_SKILL_MAX, Math.round(input?.[k] ?? CUSTOM_SKILL_MIN)));
  // spend down to the budget, taking from the highest first so a legal spread is never reshaped
  let guard = 0;
  while (spent(out) > CUSTOM_BUDGET && guard++ < 100) {
    const k = SKILL_ORDER.slice().sort((a, b) => out[b] - out[a])[0];
    if (out[k] <= CUSTOM_SKILL_MIN) break;
    out[k]--;
  }
  return out;
}
export const spent = (s: Skills) => SKILL_ORDER.reduce((t, k) => t + s[k], 0);
export const remaining = (s: Skills) => CUSTOM_BUDGET - spent(s);
