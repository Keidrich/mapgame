/**
 * Doing something about what somebody wants.
 *
 * Agendas have advanced quietly in the background since the people pass: a debt gets worse, a
 * shopkeeper edges closer to selling up and leaving, somebody's ambition finds another outfit if
 * it does not find yours. The player could read all of it on an NPC's sheet and had no move to
 * make with any of it. Milestones fired events *at* them; there was nothing to do *with* them.
 *
 * These are the moves. They are ordinary actions — validated in `can()`, dispatched, seeded — and
 * the whole point of them is the last line of `resolveAgenda`: `doFavour(w, n, kind)`. That is the
 * hook into `sim/standing.ts`, and with it a settled agenda is the thing that unblocks protection,
 * a place in the crew, or a friendly price on somebody's business. Before this, reciprocity could
 * only come from the handful of events that happened to offer it.
 *
 * Knowing the agenda is itself gated: you have to have sized somebody up, been through their
 * books, or be listening to them. You cannot settle a problem you were never told about.
 */
import { AGENDA_MOVES, AGENDA_REWARD, DEBT, TRAP_REWARD, type AgendaMode, type AgendaMove } from '@content/agendas';
import { AGENDA_LABEL, addGrudge, addMemory } from './people';
import { connectionsOf, familyOf } from './connections';
import { doFavour } from './standing';
import { remember } from './ledger';
import type { Rng } from './rng';
import { PLAYER, type AgendaKind, type Npc, type World } from './types';
import { addHeat, adjustRel, clamp, log, money, spreadFrom, takeCash } from './util';

/**
 * Do you know what they want? Three ways in, all of which cost something to get: a size-up in
 * front of them, a look through their books, or a tap left running. Trust alone is not one of
 * them — people do not volunteer this.
 */
export function agendaKnown(_w: World, n: Npc): boolean {
  const a = n.agenda;
  if (!a || a.done) return false;
  return !!n.known || n.ratted !== undefined || !!n.tap;
}

export function agendaMoves(w: World, n: Npc): AgendaMove[] {
  return agendaKnown(w, n) ? AGENDA_MOVES[n.agenda!.kind] : [];
}
export function agendaMove(w: World, n: Npc, mode: AgendaMode): AgendaMove | undefined {
  return agendaMoves(w, n).find(m => m.mode === mode);
}

/** What settling their problem costs in cash, today. Scaled moves read the agenda's own state. */
export function agendaCost(w: World, n: Npc, mode: AgendaMode): number {
  const m = agendaMove(w, n, mode); if (!m) return 0;
  if (!m.scaled) return m.cash ?? 0;
  // a debt left to rot is a bigger debt: the longer they have been sinking, the more it takes
  return Math.round(DEBT.base + DEBT.perProgress * (n.agenda?.progress ?? 0));
}

/**
 * The odds, shown and rolled. Reads the same inputs a scene does so the number means the same
 * thing everywhere — your skill, how they feel about you, and how hard they are to move.
 */
export function agendaChance(w: World, n: Npc, mode: AgendaMode): number {
  const m = agendaMove(w, n, mode); if (!m) return 0;
  const p = w.player;
  const rel = mode === 'trap' ? n.rel.fear * 0.2 - n.nerve * 0.25 : n.rel.trust * 0.25 + n.rel.respect * 0.15;
  return Math.max(3, Math.min(97, Math.round(m.base + p.skills[m.skill] * 3 + rel)));
}

/** Why they cannot be helped right now, in their words. Undefined when the move is available. */
export function agendaReason(w: World, n: Npc, mode: AgendaMode): string | undefined {
  if (!n.alive) return 'They are gone.';
  if (n.crew) return 'They work for you now. Whatever that was, it is your problem too.';
  if (!n.agenda || n.agenda.done) return `${n.name} has nothing you can help with.`;
  if (!agendaKnown(w, n)) return `You do not know what ${n.name} is carrying. Size them up, get inside their books, or listen to them for a while.`;
  if (!agendaMove(w, n, mode)) return 'Not something you can do about this one.';
  if (n.agenda.kind === 'family' && !familyOf(w, n).length) return `${n.name} has nobody left to be frightened for.`;
  // you cannot keep shutting the same door: they are already watching it
  if (mode === 'trap' && n.agenda.blocked !== undefined && w.day - n.agenda.blocked < TRAP_REWARD.again) {
    return `You closed that door on ${n.name} ${w.day - n.agenda.blocked} day${w.day - n.agenda.blocked === 1 ? '' : 's'} ago. They are watching for it now — give it ${TRAP_REWARD.again}.`;
  }
  return undefined;
}

export interface AgendaOutcome { won: boolean; text: string }

/**
 * Settle it, or use it. The one branch that matters is at the end: `settle` calls `doFavour`,
 * which raises what this person will do for you from here on; `trap` deliberately does not, and
 * takes fear instead of a friend.
 */
export function resolveAgenda(w: World, n: Npc, mode: AgendaMode, rng: Rng): AgendaOutcome {
  const a = n.agenda!;
  const kind: AgendaKind = a.kind;
  const won = rng.int(1, 100) <= agendaChance(w, n, mode);

  if (mode === 'trap') return trap(w, n, won);

  if (!won) {
    adjustRel(w, n, { trust: -6 });
    remember(w, n, 'talk', `You tried to do something about their ${AGENDA_LABEL[kind].replace(/^(wants|is) /, '')} and it did not come off.`);
    const text = failLine(n, kind);
    log(w, text, 'bad', { npcId: n.id });
    return { won: false, text };
  }

  // it worked. The agenda is closed out, not merely nudged: this is the player finishing it.
  a.done = true; a.progress = 100;
  adjustRel(w, n, { trust: AGENDA_REWARD.trust, respect: AGENDA_REWARD.respect });
  doFavour(w, n, kind);
  spreadFrom(w, [n], { respect: AGENDA_REWARD.spreadRespect }, AGENDA_REWARD.spreadDegrees);
  const text = settleLine(w, n, kind);
  remember(w, n, 'favour', text);
  addMemory(w, n.homeBlockId, 'favour', text);
  log(w, text, 'good', { npcId: n.id });
  return { won: true, text };
}

function trap(w: World, n: Npc, won: boolean): AgendaOutcome {
  if (!won) {
    // they work out who closed the door, which is the worst outcome in the game short of a body
    addGrudge(w, n, `you shut the door on them getting out`);
    adjustRel(w, n, { trust: -35, fear: 8 }, 'backed');
    const text = `${n.name} finds out who has been talking to people about them. They will not forget it.`;
    remember(w, n, 'harm', text);
    log(w, text, 'bad', { npcId: n.id });
    return { won: false, text };
  }
  // the way out is closed, and it is closed by you. They stay, and they know it
  if (n.agenda) { n.agenda.progress = 0; n.agenda.milestone50 = false; n.agenda.blocked = w.day; }
  adjustRel(w, n, { fear: TRAP_REWARD.fear, trust: TRAP_REWARD.trust }, 'property');
  spreadFrom(w, [n], { fear: TRAP_REWARD.spreadFear }, TRAP_REWARD.spreadDegrees, 'property');
  addHeat(w, 2, n.homeBlockId);
  const text = `Every door ${n.name} was going to walk through is shut, and they know whose hand did it. They are not going anywhere.`;
  remember(w, n, 'harm', text);
  addMemory(w, n.homeBlockId, 'trap', `${n.name} was going to leave. Now they are not.`);
  log(w, text, 'warn', { npcId: n.id });
  return { won: true, text };
}

function settleLine(w: World, n: Npc, kind: AgendaKind): string {
  const f = n.agenda?.target ? w.factions[n.agenda.target] : undefined;
  switch (kind) {
    case 'debt': return `${n.name}'s book with ${f?.short ?? 'the shark'} is clear. They did not ask how, and they will not forget who.`;
    case 'leave': return `${n.name} gets out. A bus, a name to ask for, and a month covered — and they know exactly who arranged it.`;
    case 'revenge': return `Whatever ${f?.short ?? 'they'} did to ${n.name} is answered. ${n.name} did not have to lift a hand, and that is the part they will remember.`;
    case 'ambition': return `Your word gets ${n.name} through a door that was shut. They know what that was worth.`;
    case 'family': {
      const kin = n.agenda?.target ? w.npcs[n.agenda.target] : familyOf(w, n)[0];
      const tie = kin ? (n.connections.find(c => c.npcId === kin.id)?.label ?? 'family') : 'family';
      return `Word goes round that ${kin ? `${kin.name}, ${n.name}'s ${tie},` : `${n.name}'s family`} is not to be touched. ${n.name} sleeps for the first time in weeks.`;
    }
  }
}
function failLine(n: Npc, kind: AgendaKind): string {
  switch (kind) {
    case 'debt': return `The money goes somewhere and the book is still open. ${n.name} is no better off and knows you tried.`;
    case 'leave': return `The arrangement falls through. ${n.name} is still here, and still looking at the door.`;
    case 'revenge': return `You go and have the conversation. It does not go the way it was supposed to, and ${n.name} is no squarer than they were.`;
    case 'ambition': return `You put your name behind ${n.name} and it does not carry. That is a thing people noticed.`;
    case 'family': return `You put the word out and it does not stick. ${n.name} can tell.`;
  }
}

/**
 * A revenge agenda names a faction, which is who the player goes to see. Exported so the
 * conversation menu and the NPC sheet can both name them without duplicating the lookup.
 */
export function agendaTargetName(w: World, n: Npc): string | undefined {
  const t = n.agenda?.target; if (!t) return undefined;
  return w.factions[t]?.short ?? w.npcs[t]?.name;
}

/** Somebody you both know: the player's crew and anyone they are close to, among their ties. */
export function sharedConnections(w: World, n: Npc): Npc[] {
  return connectionsOf(w, n)
    .map(c => c.npc)
    .filter(o => o.alive && (o.crew !== undefined || o.rel.trust >= 30 || o.faction === PLAYER));
}

export { AGENDA_LABEL, clamp, money, takeCash };
