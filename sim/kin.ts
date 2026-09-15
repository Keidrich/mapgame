/**
 * The web, arriving at your door before a job goes out.
 *
 * `Npc.connections` has held the family and friend ties since generation and a hit has always been
 * allowed to land on anybody. What was missing is that the two never met: you put a job on a man,
 * and found out afterwards — from a loyalty number, silently — that he was somebody's brother.
 *
 * This is the meeting. When a job that ends somebody is planned against a person one of your own
 * people is close to, that crew member is standing there before it goes out, and you answer for it.
 * Everything below reads the existing graph and moves existing numbers: no new state, nothing
 * tracked that was not tracked before.
 */
import { KIN, KIN_ANSWERS, type KinAnswer } from '@content/kin';
import { connectionsOf } from './connections';
import { queueConfrontation, alreadyAtTheDoor } from './combat';
import { remember } from './ledger';
import { doFavour } from './standing';
import { nemesisName } from './nemesis';
import type { Rng } from './rng';
import { PLAYER, type Confrontation, type Npc, type Op, type World } from './types';
import { addHeat, bumpLoyalty, clamp, heatNote, log, loyaltyNote, spreadRep } from './util';

/** Jobs that end with the target gone. Only these are worth anybody's brother turning up over. */
const ENDS_THEM = new Set(['hit', 'no_loose_ends']);

export { KIN, KIN_ANSWERS, type KinAnswer };

/**
 * Whose is he, and who of yours cares?
 *
 * Returns the closest thing you have to a reason not to: the most loyal crew member tied to the
 * target, and what the target is to them. Undefined when nobody of yours knows him — which is most
 * of the time, and is why this stays rare enough to mean something.
 */
export function kinOnTheJob(w: World, opKind: string, targetNpcId?: string): { crew: Npc; tie: string } | undefined {
  if (!ENDS_THEM.has(opKind) || !targetNpcId) return undefined;
  const mark = w.npcs[targetNpcId]; if (!mark?.alive) return undefined;
  const found = connectionsOf(w, mark)
    .filter(c => c.npc.crew && c.npc.alive && c.npc.crew.status !== 'dead' && (c.npc.crew.loyalty ?? 0) >= KIN.loyal)
    .sort((a, b) => (b.npc.crew!.loyalty ?? 0) - (a.npc.crew!.loyalty ?? 0))[0];
  return found ? { crew: found.npc, tie: found.label } : undefined;
}

/** Put them in front of the player, before the job goes out. Called when an op is planned. */
export function raiseKin(w: World, o: Op, rng: Rng): boolean {
  const found = kinOnTheJob(w, o.kind, o.targetNpcId); if (!found) return false;
  if (alreadyAtTheDoor(w, { npcId: found.crew.id })) return false;
  const mark = w.npcs[o.targetNpcId!];
  void rng;
  queueConfrontation(w, {
    factionId: PLAYER, kind: 'kin', war: false, npcId: found.crew.id, opId: o.id,
    blockId: found.crew.homeBlockId,
    text: `${found.crew.name} is waiting where you park. They already know: "${mark.name}. That is my ${found.tie}." They are not shouting. That is somehow worse.`,
  });
  return true;
}

/** What each answer is worth, before the roll. Read by the UI so the odds shown are the odds used. */
export function kinChance(w: World, c: Confrontation, answer: KinAnswer): number {
  const n = c.npcId ? w.npcs[c.npcId] : undefined;
  const loyalty = n?.crew?.loyalty ?? 0;
  if (answer === 'straight') return clamp(Math.round(34 + w.player.skills.charm * 3 + loyalty * 0.35), 3, 97);
  // Whether they can actually do it. Nerve is the whole of it: this is not something you can talk
  // somebody into being able to do, which is the point of offering it rather than ordering it.
  if (answer === 'theirs') return clamp(Math.round((1 - KIN.theirsFlinch) * 100 + (n?.nerve ?? 50) * 0.3 - 20), 3, 97);
  return 100;  // calling it off and saying nothing are decisions, not contests
}

/**
 * Answer for it.
 *
 * Returns the op's fate, because the caller owns the op: 'go' leaves it running, 'abort' stops it,
 * and 'done' means the job happened without you — somebody else did it, which is the whole of what
 * "let them handle it" buys.
 */
export function resolveKin(w: World, c: Confrontation, answer: KinAnswer, rng: Rng): 'go' | 'abort' | 'done' {
  const n = c.npcId ? w.npcs[c.npcId] : undefined;
  const o = c.opId ? w.ops[c.opId] : undefined;
  const mark = o?.targetNpcId ? w.npcs[o.targetNpcId] : undefined;
  if (!n || !mark) return 'go';
  const first = n.name.split(' ')[0];
  const rolled = rng.int(1, 100) <= kinChance(w, c, answer);

  if (answer === 'call_off') {
    const ly = bumpLoyalty(n, KIN.callOffLoyalty);
    doFavour(w, n, `you called off a job on their ${tieOf(w, mark, n)}`);
    remember(w, n, 'favour', `You had ${mark.name} on a list and took them off it because of ${first}.`);
    log(w, `You tell ${first} it is not happening. They do not thank you — there is nothing to thank you for yet — but they will not forget it, and neither will you.${loyaltyNote(ly)}`, 'good', { npcId: n.id });
    return 'abort';
  }

  if (answer === 'theirs') {
    const ly = bumpLoyalty(n, KIN.theirsLoyalty);
    if (rolled) {
      mark.alive = false;
      const h = addHeat(w, KIN.theirsHeat, mark.homeBlockId);
      // A killing inside a family is not a thing the street reads as strength. It is read as
      // whatever you are, and everybody hears about it: `grave` is the same stake a hit uses.
      spreadRep(w, mark.homeBlockId, { fear: 7, trust: -6 }, 2, 'grave');
      remember(w, n, 'harm', `They did ${mark.name} themselves, because you let them.`);
      n.notes.push(`Did their own ${tieOf(w, mark, n)}, for you.`);
      log(w, `You do not ask how. ${first} is back the next day and does not mention it, and never will. ${mark.name} is not anywhere.${loyaltyNote(ly)}${heatNote(h)}`, 'warn', { npcId: n.id });
      return 'done';
    }
    // They could not. Now the mark knows, and the person you sent is the reason he knows.
    mark.grudge = { since: w.day, reason: `you sent their own family after them`, spread: 0 };
    remember(w, n, 'harm', `You asked them to do ${mark.name}. They could not, and both of you know it.`);
    log(w, `${first} could not do it. ${mark.name} is alive, he knows exactly who came, and he knows who sent them. ${first} will not look at you for a while.${loyaltyNote(ly)}`, 'bad', { npcId: n.id });
    return 'abort';
  }

  if (answer === 'straight') {
    if (rolled) {
      const ly = bumpLoyalty(n, KIN.straightOk);
      remember(w, n, 'talk', `You told them to their face what was going to happen to ${mark.name}.`);
      log(w, `${first} listens to all of it, says "alright", and goes back to work. Something between you is different now and neither of you says what.${loyaltyNote(ly)}`, 'warn', { npcId: n.id });
      return 'go';
    }
    const ly = bumpLoyalty(n, KIN.straightFail);
    n.grudge = { since: w.day, reason: `you told them you were going to kill their ${tieOf(w, mark, n)}`, spread: 0 };
    remember(w, n, 'harm', `You told them what you were going to do to ${mark.name}, and they never got past it.`);
    log(w, `${first} hears you out and you watch it happen — whatever they were to you, they are not that any more.${loyaltyNote(ly)}`, 'bad', { npcId: n.id });
    return 'go';
  }

  // 'nothing': the job runs, and they find out the way everybody finds out.
  const ly = bumpLoyalty(n, KIN.silentLoyalty);
  n.grudge = { since: w.day, reason: `you had their ${tieOf(w, mark, n)} killed and let them hear it from somebody else`, spread: 0 };
  remember(w, n, 'harm', `You did ${mark.name} and did not tell them. They found out anyway.`);
  log(w, `You say nothing. ${nemesisName(n)} finds out the way everybody finds out, which is the worst way there is.${loyaltyNote(ly)}`, 'bad', { npcId: n.id });
  return 'go';
}

/** What the mark is to this crew member, in their own words. */
function tieOf(w: World, mark: Npc, crew: Npc): string {
  return connectionsOf(w, mark).find(c => c.npc.id === crew.id)?.label ?? 'family';
}
