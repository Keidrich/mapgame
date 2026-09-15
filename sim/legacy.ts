/**
 * What you have to lose, and what happens to the empire when you are not there.
 *
 * Four things that only make sense together, which is why they are one file:
 *
 *  - **Somebody outside all of it.** A person with no role in the business, who exists so that
 *    the answer to "what would it cost me" is not always territory and cash flow.
 *  - **Real risk to you.** A nemesis who has got far enough can come for the player the way the
 *    player comes for everybody else, through the confrontation machinery pointed inward.
 *  - **Succession.** What happens when one of those lands.
 *  - **Going straight.** The other way out, and the only one you choose.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SUCCESSION DECISION, MADE UP FRONT AND WRITTEN DOWN
 *
 * **Control genuinely passes.** Same save, same world, new protagonist — not an epilogue.
 *
 * Why: `w.player` is a plain data object holding a name, a background, five skills and lists of
 * ids. Everything that makes the *city* — blocks, businesses, rackets, factions, the ledger every
 * NPC carries, the nemesis who has been at your door nine times — lives outside it and does not
 * care who is holding the controls. A successor becomes the player by moving their identity into
 * that object. An epilogue version would have been a `gameOver` string, which the game already
 * has, and would not have been worth any machinery at all.
 *
 * What that costs, precisely, because a succession that costs nothing is a respawn:
 *
 *  - **Their skills, not yours.** The permanent one. Your spread is gone; you play out the rest
 *    with theirs, and they are a crew member, so they are worse.
 *  - **Respect and fear are inherited at `SUCCESSION.inherits`.** The name carries; the person
 *    does not. The city knows the outfit, not them.
 *  - **Your street name goes.** They have to earn their own.
 *  - **Legitimacy goes to zero.** That was *your* reputation for being respectable, and it was
 *    always the most personal thing on the sheet.
 *  - **The estate stays.** Money, businesses, rackets, safehouses, the house, the cars, the crew.
 *    That is the whole point: the thing you built outlives you.
 *
 * And the old player becomes an ordinary dead NPC in the world, with their ledger intact, so
 * everybody who remembers dealing with them still does.
 */
import { LIFESTYLE } from '@content/fortune';
import { MILESTONES, NEMESIS } from '@content/nemesis';
import { securityCover } from './fortune';
import { kitCover } from './items';
import { notoriety } from './nemesis';
import { remember } from './ledger';
import { connectionsOf } from './connections';
import type { Rng } from './rng';
import { PLAYER, type Id, type Npc, type World } from './types';
import { clamp, log, money } from './util';

// ---------------------------------------------------------------- somebody outside all of it
export const LOVED = {
  /** Trust they start at. They are not a contact you cultivated; they are already yours. */
  trust: 85,
  /** What losing them does. Deliberately the largest single reputation swing in the game. */
  griefFear: 12,
  griefRespect: -8,
};

/** The person the player has outside the business, if they have one. */
export function lovedOne(w: World): Npc | undefined {
  const id = w.player.lovedId;
  const n = id ? w.npcs[id] : undefined;
  return n?.alive ? n : undefined;
}

/**
 * Whether somebody can be used against the player. True only for the person outside it all —
 * crew know what they signed up for, and a rival leaning on your bookkeeper is just Tuesday.
 *
 * This is what makes them a real target rather than another NPC with a label: `sim/player-risk.ts`
 * reads it to decide whether a kidnap is on the table at all, and it is the only thing in the
 * game that answers true.
 */
export function isLoved(w: World, n: Npc | undefined): boolean {
  return !!n && n.id === w.player.lovedId;
}

/** Where they are and what they are doing, for the screens that ask after them. */
export function lovedStatus(w: World): string | undefined {
  const n = lovedOne(w); if (!n) return undefined;
  if (n.taken) return `Somebody has them. They have been gone ${w.day - n.taken} day${w.day - n.taken === 1 ? '' : 's'}.`;
  if (w.player.heat >= 70) return `${n.name} has started asking what you do all day.`;
  return `${n.name} is at home and knows none of it.`;
}

// ---------------------------------------------------------------- succession
export const SUCCESSION = {
  /** Share of respect and fear the successor inherits. The name carries; the person does not. */
  inherits: 0.45,
  /** Loyalty below which somebody will not step up at all — they take their cut and go. */
  minLoyalty: 40,
};

/**
 * Who would actually take over, best first.
 *
 * The same shape as `candidatesFor` does for a faction — rank the people who could plausibly hold
 * it, by the case they can make — with the player's own vocabulary substituted: loyalty and time
 * served instead of a record against the player, because that is what an outfit's own people are
 * judged on. Anybody dead, jailed or barely committed is not a candidate.
 */
export function heirs(w: World): Npc[] {
  return w.player.crewIds
    .map(id => w.npcs[id])
    .filter(n => n?.alive && n.crew && n.crew.status !== 'dead' && n.crew.status !== 'jailed' && n.crew.loyalty >= SUCCESSION.minLoyalty)
    .sort((a, b) => weight(w, b) - weight(w, a));
}
function weight(w: World, n: Npc): number {
  const c = n.crew!;
  return c.loyalty / 4 + n.skills.muscle + n.skills.charm + n.skills.brains / 2
    + Math.min(12, (w.day - c.joinedDay) / 8)                 // time served
    + (n.traits.includes('ambitious') ? 3 : 0)
    + connectionsOf(w, n).length;                              // people who would follow them
}

/**
 * Hand the outfit over. See the decision at the top of this file: control genuinely passes.
 *
 * Returns the successor, or undefined when there is nobody — in which case the caller ends the
 * game, because an outfit with nobody left to run it is simply over.
 */
export function succeed(w: World, how: string): Npc | undefined {
  const heir = heirs(w)[0];
  const p = w.player;
  const goneName = p.street ? `${p.name.split(' ')[0]} "${p.street}"` : p.name;

  // the old player becomes an ordinary NPC of the world: dead, remembered, on everybody's page
  const ghost: Npc = {
    ...(w.npcs[p.ghostId ?? ''] ?? ({} as Npc)),
    id: p.ghostId ?? `n-${p.name.replace(/\W+/g, '')}-${w.day}`,
    name: goneName, alive: false, role: 'patron', known: true,
    homeBlockId: p.homeBlockId, favouriteBusinessIds: [], patronOf: undefined,
    skills: { ...p.skills }, traits: [], nerve: 60, connections: [], notes: [how],
    rel: { trust: 0, fear: 0, respect: Math.round(p.respect), metDay: 1, contacts: 0 },
  } as Npc;
  w.npcs[ghost.id] = ghost;

  if (!heir) {
    w.gameOver = { reason: 'gone', text: `${how} There was nobody left who could hold it together, and by the end of the week there was nothing to hold.` };
    return undefined;
  }

  // Everything the city is stays exactly as it is. What changes is who is holding it.
  p.crewIds = p.crewIds.filter(id => id !== heir.id);
  const skills = { ...heir.skills };
  heir.crew = undefined; heir.role = 'patron'; heir.notes.push('Took over when the boss went.');

  p.name = heir.name;
  p.skills = skills;
  p.respect = clamp(Math.round(p.respect * SUCCESSION.inherits));
  p.fear = clamp(Math.round(p.fear * SUCCESSION.inherits));
  p.street = undefined;         // they earn their own
  p.legitimacy = 0;             // that was your reputation, not the outfit's
  p.crewEver = Math.max(0, p.crewEver - 1);
  p.succeededFrom = [...(p.succeededFrom ?? []), goneName];

  remember(w, heir, 'deal', `They took over from ${goneName}.`);
  log(w, `${how} ${heir.name} is what is left, and by the end of the week nobody is arguing about it. The blocks are still yours. The name on them is not.`, 'warn', { npcId: heir.id });
  return heir;
}

// ---------------------------------------------------------------- going straight
export const GO_STRAIGHT = {
  /** Clean money that has to be sitting there. The whole point is that it is *clean*. */
  cash: 750_000,
  /** And nothing dirty left on the books. You cannot walk away holding it. */
  maxDirty: 2_000,
  /** Nobody is looking at you. */
  maxHeat: 15,
  /** You have to look like somebody who was never in it. */
  legitimacy: 45,
  /** And there has to be something to walk away *to*. */
  needsLoved: true,
  /** Days of all of the above at once. A quiet fortnight, not a lucky morning. */
  days: 14,
};

/** Why you cannot walk away yet, in the words the screen should use. Undefined when you can. */
export function goStraightReason(w: World): string | undefined {
  const p = w.player;
  if (p.cash < GO_STRAIGHT.cash) return `Needs ${money(GO_STRAIGHT.cash)} clean, sitting there. You have ${money(p.cash)}.`;
  if (p.dirty > GO_STRAIGHT.maxDirty) return `You are still holding ${money(p.dirty)} you cannot explain. Wash it or spend it.`;
  if (p.heat > GO_STRAIGHT.maxHeat) return `Somebody is still looking at you. Heat has to be under ${GO_STRAIGHT.maxHeat}; it is ${Math.round(p.heat)}.`;
  if ((p.legitimacy ?? 0) < GO_STRAIGHT.legitimacy) return `Nobody would believe it. You need to look respectable — ${GO_STRAIGHT.legitimacy} of it, and you have ${Math.round(p.legitimacy ?? 0)}.`;
  if (GO_STRAIGHT.needsLoved && !lovedOne(w)) return 'There is nobody to go straight for.';
  return undefined;
}

/** Days of holding it together so far. Read by the UI; advanced by the tick. */
export const goStraightDays = (w: World): number => w.player.cleanSince ? w.player.cleanSince : 0;

/**
 * Once a day: is the player still clean, and have they been for long enough?
 *
 * A counter rather than a button because the threshold has to be *held*. Meeting all of it for
 * one morning is a good day's laundering; meeting it for a fortnight is a decision, and the
 * difference is the entire distinction between this ending and a stat crossing a line.
 */
export function tickGoStraight(w: World): void {
  const p = w.player;
  if (w.gameOver) return;
  if (goStraightReason(w)) { p.cleanSince = 0; return; }
  p.cleanSince = (p.cleanSince ?? 0) + 1;
  if (p.cleanSince === Math.floor(GO_STRAIGHT.days / 2)) {
    log(w, 'Another quiet week. Nobody has asked you for anything, and you have not asked anybody. It is starting to feel like it might hold.', 'good');
  }
  if (p.cleanSince >= GO_STRAIGHT.days) {
    const loved = lovedOne(w);
    w.gameOver = {
      reason: 'straight',
      text: `You got out. ${money(p.cash)} clean, nothing owing, nobody looking, and a name on a building that people say without lowering their voice. ${loved ? `${loved.name} never had to find out the half of it.` : 'Nobody had to find out the half of it.'} Somebody else runs those blocks now, and in a year nobody will remember it was ever you.`,
    };
    log(w, 'You are out. Whatever this was, it is somebody else\'s now.', 'good');
  }
}

// ---------------------------------------------------------------- what a nemesis can reach
/** Milestones past which a lieutenant stops waiting for the player to come to them. */
export const COMES_FOR_YOU = ['named', 'connected'];

/** Is this somebody who would come for the player personally? */
export function willComeForYou(n: Npc | undefined): boolean {
  if (!n?.alive || !n.nemesis) return false;
  return n.nemesis.earned.some(id => COMES_FOR_YOU.includes(id));
}

/** Everybody who has got far enough to try, worst first. */
export function hunters(w: World): Npc[] {
  return Object.values(w.npcs).filter(n => willComeForYou(n)).sort((a, b) => notoriety(b) - notoriety(a));
}

/**
 * How hard the player is to reach personally. Men who are awake, people who would get in the way,
 * a house with a gate, and what you happen to have on — which is what stops the lifestyle ladder
 * being a respect vending machine and makes it something you are glad you bought on one specific
 * night.
 *
 * `kitCover` is the armour term and it is the only defence you can put on and take off in a day.
 * Everything else here is something you bought weeks ago; a vest is the one that answers "somebody
 * is coming for me *this week*", which is why it is worth a carry slot against a gun.
 */
export function personalCover(w: World): number {
  const crew = w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.crew && (n.crew.status === 'idle' || n.crew.status === 'assigned'));
  const home = (w.player.lifestyle?.home ?? 0) * 4;
  return securityCover(w) + Math.min(18, crew.length * 3) + home + kitCover(w);
}

/** The milestone table is content; this asserts the two ids above still exist in it. */
export const COMES_FOR_YOU_VALID = COMES_FOR_YOU.every(id => MILESTONES.some(m => m.id === id));
void NEMESIS; void LIFESTYLE; void PLAYER;
export type { Id, Rng };
